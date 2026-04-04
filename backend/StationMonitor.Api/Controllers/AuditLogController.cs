// ============================================================
// AuditLogController — Nhật ký hành động hệ thống
// GET /api/v1/logs/audit   — Danh sách audit log (Admin)
// GET /api/v1/logs/login   — Danh sách login log (Admin)
// ============================================================

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using StationMonitor.Data;

namespace StationMonitor.Api.Controllers;

[ApiController]
[Route("api/v1/logs")]
[Authorize]
public class AuditLogController : ControllerBase
{
    private readonly AppDbContext _db;
    public AuditLogController(AppDbContext db) => _db = db;

    // GET /api/v1/logs/audit?action=&entityType=&limit=100
    [HttpGet("audit")]
    public async Task<IActionResult> GetAudit(
        [FromQuery] string? action,
        [FromQuery] string? entityType,
        [FromQuery] int limit = 100)
    {
        var q = _db.AuditLogs.AsQueryable();

        if (!string.IsNullOrEmpty(action))
            q = q.Where(a => a.Action == action);

        if (!string.IsNullOrEmpty(entityType))
            q = q.Where(a => a.EntityType == entityType);

        var logs = await q
            .OrderByDescending(a => a.Ts)
            .Take(limit)
            .Select(a => new {
                a.Id, a.Action, a.EntityType, a.EntityId,
                a.IpAddress, a.Ts, a.UserId
            })
            .ToListAsync();

        return Ok(logs);
    }

    // GET /api/v1/logs/login?limit=100
    [HttpGet("login")]
    public async Task<IActionResult> GetLogin([FromQuery] int limit = 100)
    {
        var logs = await _db.LoginLogs
            .OrderByDescending(l => l.Ts)
            .Take(limit)
            .Select(l => new {
                l.Id, l.Username, l.Action,
                l.IpAddress, l.Ts
            })
            .ToListAsync();

        return Ok(logs);
    }
}
