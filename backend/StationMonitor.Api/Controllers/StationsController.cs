// ============================================================
// StationsController — CRUD trạm biến áp
// GET    /api/v1/stations        — Danh sách trạm
// GET    /api/v1/stations/{id}   — Chi tiết 1 trạm
// POST   /api/v1/stations        — Tạo trạm mới (Admin)
// PUT    /api/v1/stations/{id}   — Cập nhật trạm (Admin)
// DELETE /api/v1/stations/{id}   — Xóa trạm (Admin)
// ============================================================

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using StationMonitor.Data;
using StationMonitor.Data.Entities;
using StationMonitor.Services;

namespace StationMonitor.Api.Controllers;

[ApiController]
[Route("api/v1/stations")]
[AllowAnonymous]
public class StationsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly PermissionService _permissions;
    public StationsController(AppDbContext db, PermissionService permissions)
    {
        _db = db;
        _permissions = permissions;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var allowed = await _permissions.GetAllowedStationIdsAsync();
        var q = _db.Stations.AsQueryable();
        if (allowed != null) q = q.Where(s => allowed.Contains(s.Id));

        var stations = await q
            .OrderBy(s => s.Name)
            .Select(s => new {
                s.Id, s.Name, s.Code, s.Location, s.Status, s.CreatedAt
            }).ToListAsync();
        return Ok(stations);
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var s = await _db.Stations.FindAsync(id);
        if (s == null) return NotFound();
        return Ok(s);
    }

    [HttpPost]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Create([FromBody] StationRequest req)
    {
        var station = new Station
        {
            Name     = req.Name,
            Code     = req.Code,
            Location = req.Location,
            Status   = "active"
        };
        _db.Stations.Add(station);
        await _db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetById), new { id = station.Id }, station);
    }

    [HttpPut("{id}")]
    [Authorize] // Cho phép cả operator cập nhật tọa độ nếu cần, hoặc giữ admin tùy bạn
    public async Task<IActionResult> Update(Guid id, [FromBody] StationRequest req)
    {
        var station = await _db.Stations.FindAsync(id);
        if (station == null) return NotFound();

        if (req.Name != null) station.Name = req.Name;
        if (req.Code != null) station.Code = req.Code;
        if (req.Location != null) station.Location = req.Location;
        if (req.Status != null) station.Status = req.Status;

        await _db.SaveChangesAsync();
        return Ok(station);
    }

    [HttpDelete("{id}")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var station = await _db.Stations.FindAsync(id);
        if (station == null) return NotFound();

        // Kiểm tra xem có thiết bị nào thuộc trạm này không
        var hasDevices = await _db.Devices.AnyAsync(d => d.StationId == id);
        if (hasDevices)
            return BadRequest(new { message = "Không thể xóa trạm đang có thiết bị. Xóa thiết bị trước." });

        _db.Stations.Remove(station);
        await _db.SaveChangesAsync();
        return NoContent();
    }
}

public record StationRequest(string? Name, string? Code, string? Location, string? Status);
