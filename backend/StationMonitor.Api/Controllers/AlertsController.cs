// ============================================================
// AlertsController — Danh sách + ACK + Close alert
// GET /api/v1/alerts
// POST /api/v1/alerts/{id}/ack
// POST /api/v1/alerts/{id}/close
// ============================================================

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using StationMonitor.Data;
using StationMonitor.Data.Entities;
using System.Security.Claims;

namespace StationMonitor.Api.Controllers;

[ApiController]
[Route("api/v1/alerts")]
[Authorize]
public class AlertsController : ControllerBase
{
    private readonly AppDbContext _db;

    public AlertsController(AppDbContext db) => _db = db;

    // GET /api/v1/alerts?status=open&limit=50
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] string? status, [FromQuery] int limit = 100)
    {
        var q = _db.Alerts.AsQueryable();

        if (!string.IsNullOrEmpty(status))
            q = q.Where(a => a.Status == status);

        var alerts = await q
            .OrderByDescending(a => a.TriggeredAt)
            .Take(limit)
            .Select(a => new {
                a.Id, a.Source, a.Level, a.Status,
                a.Message, a.Value,
                a.DeviceId, a.RuleId,
                a.TriggeredAt, a.AckedAt, a.ClosedAt,
                a.AckNote
            })
            .ToListAsync();

        return Ok(alerts);
    }

    // POST /api/v1/alerts/{id}/ack
    [HttpPost("{id:guid}/ack")]
    public async Task<IActionResult> Ack(Guid id, [FromBody] AckRequest? req)
    {
        var alert = await _db.Alerts.FindAsync(id);
        if (alert == null) return NotFound();
        if (alert.Status != "open") return BadRequest("Alert không ở trạng thái open");

        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);

        alert.Status  = "acked";
        alert.AckedAt = DateTime.UtcNow;
        alert.AckNote = req?.Note;
        if (Guid.TryParse(userId, out var uid)) alert.AckedBy = uid;

        await _db.SaveChangesAsync();
        return Ok(new { alert.Id, alert.Status, alert.AckedAt });
    }

    // POST /api/v1/alerts/{id}/close
    [HttpPost("{id:guid}/close")]
    [Authorize(Roles = "admin,manager")]
    public async Task<IActionResult> Close(Guid id)
    {
        var alert = await _db.Alerts.FindAsync(id);
        if (alert == null) return NotFound();

        alert.Status   = "closed";
        alert.ClosedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        return Ok(new { alert.Id, alert.Status, alert.ClosedAt });
    }
}

public class AckRequest
{
    public string? Note { get; set; }
}
