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

    // GET /api/v1/alerts/{id}
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var alert = await _db.Alerts.FindAsync(id);
        if (alert == null) return NotFound();

        var history = await _db.AlertHistories
            .Where(h => h.AlertId == id)
            .OrderBy(h => h.ChangedAt)
            .Select(h => new { h.Status, h.ChangedAt, h.Note, h.ChangedBy })
            .ToListAsync();

        return Ok(new {
            alert.Id, alert.Source, alert.Level, alert.Status,
            alert.Message, alert.Value,
            alert.DeviceId, alert.RuleId,
            alert.TriggeredAt, alert.AckedAt, alert.ClosedAt, alert.AckNote,
            History = history
        });
    }

    // POST /api/v1/alerts/{id}/ack
    [HttpPost("{id:guid}/ack")]
    public async Task<IActionResult> Ack(Guid id, [FromBody] AckRequest? req)
    {
        var alert = await _db.Alerts.FindAsync(id);
        if (alert == null) return NotFound();
        if (alert.Status != "open") return BadRequest("Alert không ở trạng thái open");

        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        Guid? uid = Guid.TryParse(userId, out var parsed) ? parsed : null;

        alert.Status  = "acked";
        alert.AckedAt = DateTime.UtcNow;
        alert.AckNote = req?.Note;
        alert.AckedBy = uid;

        // Ghi AlertHistory
        _db.AlertHistories.Add(new AlertHistory
        {
            AlertId   = alert.Id,
            Status    = "acked",
            ChangedBy = uid,
            Note      = req?.Note,
        });

        await _db.SaveChangesAsync();
        return Ok(new { alert.Id, alert.Status, alert.AckedAt });
    }

    // POST /api/v1/alerts/{id}/close
    [HttpPost("{id:guid}/close")]
    public async Task<IActionResult> Close(Guid id)
    {
        var alert = await _db.Alerts.FindAsync(id);
        if (alert == null) return NotFound();

        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        Guid? uid = Guid.TryParse(userId, out var parsed) ? parsed : null;

        alert.Status   = "closed";
        alert.ClosedAt = DateTime.UtcNow;

        // Ghi AlertHistory
        _db.AlertHistories.Add(new AlertHistory
        {
            AlertId   = alert.Id,
            Status    = "closed",
            ChangedBy = uid,
        });

        await _db.SaveChangesAsync();
        return Ok(new { alert.Id, alert.Status, alert.ClosedAt });
    }
}

public class AckRequest
{
    public string? Note { get; set; }
}
