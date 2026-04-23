// ============================================================
// DevicesController — Quản lý thiết bị (PLC, Camera, Sensor...)
// Hỗ trợ nhiều loại thiết bị, config lưu dạng JSONB
//
// Device Types:
//   plc_s7        → PLC Siemens S7-1200/1500 (snap7)
//   camera_cctv   → Camera quan sát thường (RTSP → go2rtc)
//   camera_thermal→ Camera nhiệt (RTSP → go2rtc)
//   camera_pd     → Camera phóng điện (RTSP → go2rtc)
//   modbus_tcp    → Cảm biến Modbus TCP (tương lai)
//
// Config JSONB theo từng loại:
//   plc_s7:     { ip, rack, slot, db, offset, length }
//   camera_*:   { ip, rtsp_path, go2rtc_id }
//   modbus_tcp: { ip, port, unit_id }
// ============================================================

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using StationMonitor.Data;
using StationMonitor.Data.Entities;
using StationMonitor.Services;
using StationMonitor.Services.Devices;

namespace StationMonitor.Api.Controllers;

[ApiController]
[Route("api/v1")]
[Authorize]
public class DevicesController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly DeviceService _deviceService;
    private readonly PermissionService _permissions;
    private readonly IConfiguration _config;

    public DevicesController(AppDbContext db, DeviceService deviceService, PermissionService permissions, IConfiguration config)
    {
        _db = db;
        _deviceService = deviceService;
        _permissions = permissions;
        _config = config;
    }

    private bool IsTrustedInternal(string? ip)
    {
        if (ip == null) return false;
        if (ip == "127.0.0.1" || ip == "::1" || ip.Contains("127.0.0.1")) return true;
        var extra = _config["Security:TrustedNetworks"] ?? "172.,100.,192.168.";
        return extra.Split(',').Any(p => ip.Contains(p.Trim()));
    }

    /// <summary>
    /// Lấy danh sách toàn bộ thiết bị (Hỗ trợ AI Engine tự nhận diện ID)
    /// </summary>
    [HttpGet("devices")]
    [AllowAnonymous]
    public async Task<IActionResult> GetAll()
    {
        var remoteIp = Request.HttpContext.Connection.RemoteIpAddress?.ToString();
        if (!IsTrustedInternal(remoteIp) && !User.Identity!.IsAuthenticated)
            return Unauthorized();

        var devices = await _db.Devices
            .Select(d => new { d.Id, d.Name, d.Type, d.Config, d.Status })
            .ToListAsync();
        return Ok(devices);
    }

    /// <summary>
    /// Lấy danh sách thiết bị theo trạm
    /// Query: ?type=camera để lọc theo loại
    /// </summary>
    [HttpGet("stations/{stationId}/devices")]
    public async Task<IActionResult> GetByStation(Guid stationId, [FromQuery] string? type)
    {
        // Kiểm tra operator có được xem trạm này không
        var allowed = await _permissions.GetAllowedStationIdsAsync();
        if (allowed != null && !allowed.Contains(stationId))
            return Forbid();

        var query = _db.Devices.Where(d => d.StationId == stationId);
        if (!string.IsNullOrEmpty(type))
            query = query.Where(d => d.Type.Contains(type));

        var devices = await query
            .OrderBy(d => d.Type).ThenBy(d => d.Name)
            .Select(d => new {
                d.Id, d.Name, d.Type, d.Protocol,
                d.Config, d.Status, d.CreatedAt
            }).ToListAsync();

        return Ok(devices);
    }

    /// <summary>
    /// Thêm thiết bị mới vào trạm
    /// Hỗ trợ: PLC S7, Camera RTSP, Modbus TCP, ...
    /// </summary>
    [HttpPost("devices")]
    public async Task<IActionResult> Create([FromBody] CreateDeviceRequest req)
    {
        var device = new Device
        {
            StationId = req.StationId,
            Name = req.Name,
            Type = req.Type,
            Protocol = req.Protocol,
            Config = req.Config,
            Status = "online"
        };
        _db.Devices.Add(device);
        await _db.SaveChangesAsync();

        // Nếu là camera → tự động đăng ký stream với go2rtc
        if (device.Type.StartsWith("camera") && req.Config != null)
            await _deviceService.RegisterCameraStreamAsync(device);

        return CreatedAtAction(nameof(GetById), new { id = device.Id }, device);
    }

    [HttpGet("devices/{id}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var d = await _db.Devices.FindAsync(id);
        if (d == null) return NotFound();
        return Ok(d);
    }

    /// <summary>
    /// Sửa cấu hình thiết bị (IP, tên, config...)
    /// </summary>
    [HttpPut("devices/{id}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateDeviceRequest req)
    {
        var device = await _db.Devices.FindAsync(id);
        if (device == null) return NotFound();

        device.Name = req.Name ?? device.Name;
        device.Config = req.Config ?? device.Config;
        device.Status = req.Status ?? device.Status;
        await _db.SaveChangesAsync();

        // Nếu là camera → re-register stream với go2rtc sau khi cập nhật config
        if (device.Type.StartsWith("camera"))
            await _deviceService.RegisterCameraStreamAsync(device);

        return Ok(device);
    }

    /// <summary>
    /// Xóa thiết bị — nếu là camera thì xóa stream khỏi go2rtc
    /// </summary>
    [HttpDelete("devices/{id}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var device = await _db.Devices.FindAsync(id);
        if (device == null) return NotFound();

        if (device.Type.StartsWith("camera"))
            await _deviceService.UnregisterCameraStreamAsync(device);

        _db.Devices.Remove(device);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    /// <summary>
    /// Test kết nối thiết bị — kiểm tra có ping được không
    /// </summary>
    [HttpPost("devices/{id}/test")]
    public async Task<IActionResult> TestConnection(Guid id)
    {
        var device = await _db.Devices.FindAsync(id);
        if (device == null) return NotFound();

        var result = await _deviceService.TestConnectionAsync(device);
        return Ok(new { success = result.Success, message = result.Message, latencyMs = result.LatencyMs });
    }

    /// <summary>
    /// Quét LAN để tìm thiết bị mới (camera, PLC...)
    /// Query: ?subnet=192.168.10 để quét subnet cụ thể
    /// </summary>
    [HttpGet("devices/scan")]
    public async Task<IActionResult> ScanLan([FromQuery] string subnet = "192.168.10")
    {
        var found = await _deviceService.ScanLanAsync(subnet);
        return Ok(found);
    }
}

public record CreateDeviceRequest(
    Guid StationId,
    string Name,
    string Type,
    string? Protocol,
    string? Config  // JSONB string
);

public record UpdateDeviceRequest(
    string? Name,
    string? Config,
    string? Status
);
