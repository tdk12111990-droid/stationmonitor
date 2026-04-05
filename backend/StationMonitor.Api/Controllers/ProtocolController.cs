// ============================================================
// ProtocolController — API quản lý và khám phá protocol
// GET  /api/v1/protocols/discover?subnet=192.168.10&from=1&to=50
// GET  /api/v1/protocols/discover-onvif
// GET  /api/v1/protocols/scan?ip=192.168.10.10
// ============================================================

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using StationMonitor.Services;

namespace StationMonitor.Api.Controllers;

[ApiController]
[Route("api/v1/protocols")]
[Authorize(Roles = "admin,manager")]
public class ProtocolController : ControllerBase
{
    private readonly AutoDiscoveryService _discovery;
    private readonly ILogger<ProtocolController> _logger;

    public ProtocolController(AutoDiscoveryService discovery, ILogger<ProtocolController> logger)
    {
        _discovery = discovery;
        _logger    = logger;
    }

    /// <summary>Quét toàn bộ subnet để tìm thiết bị.</summary>
    [HttpGet("discover")]
    public async Task<IActionResult> DiscoverSubnet(
        [FromQuery] string subnet = "192.168.10",
        [FromQuery] int    from   = 1,
        [FromQuery] int    to     = 50,
        CancellationToken ct     = default)
    {
        if (to - from > 254) return BadRequest("Range quá lớn (tối đa 254 host)");

        _logger.LogInformation("[Protocol] Scan subnet {Subnet}.{From}-{To}", subnet, from, to);
        var results = await _discovery.ScanSubnetAsync(subnet, from, to, ct);
        return Ok(results);
    }

    /// <summary>Phát hiện camera ONVIF qua WS-Discovery multicast.</summary>
    [HttpGet("discover-onvif")]
    public async Task<IActionResult> DiscoverOnvif(CancellationToken ct)
    {
        var results = await _discovery.DiscoverOnvifAsync(timeoutMs: 4000);
        return Ok(results);
    }

    /// <summary>Quét một địa chỉ IP cụ thể.</summary>
    [HttpGet("scan")]
    public async Task<IActionResult> ScanSingle([FromQuery] string ip, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(ip)) return BadRequest("Cần truyền ip");
        var results = await _discovery.ScanSingleAsync(ip, ct);
        return Ok(results);
    }
}
