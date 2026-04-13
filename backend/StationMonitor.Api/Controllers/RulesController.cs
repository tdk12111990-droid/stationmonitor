// ============================================================
// RulesController — CRUD cho Rule Engine
// GET/POST/PUT/DELETE /api/v1/rules
// ============================================================

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using StationMonitor.Data;
using StationMonitor.Data.Entities;
using StationMonitor.Services;

namespace StationMonitor.Api.Controllers;

[ApiController]
[Route("api/v1/rules")]
[Authorize]
public class RulesController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly PermissionService _permissions;

    public RulesController(AppDbContext db, PermissionService permissions)
    {
        _db = db;
        _permissions = permissions;
    }

    // GET /api/v1/rules
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var allowed = await _permissions.GetAllowedStationIdsAsync();
        var q = _db.Rules.AsQueryable();
        if (allowed != null) q = q.Where(r => allowed.Contains(r.StationId));

        var rules = await q
            .Include(r => r.Device)
            .OrderByDescending(r => r.CreatedAt)
            .Select(r => new {
                r.Id, r.Name, r.Enabled,
                r.Condition, r.Actions,
                r.StationId, r.DeviceId,
                deviceName = r.Device != null ? r.Device.Name : null,
                r.CreatedAt
            })
            .ToListAsync();

        return Ok(rules);
    }

    // GET /api/v1/rules/{id}
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var rule = await _db.Rules.FindAsync(id);
        if (rule == null) return NotFound();
        return Ok(rule);
    }

    // POST /api/v1/rules
    [HttpPost]
    [Authorize(Roles = "admin,manager")]
    public async Task<IActionResult> Create([FromBody] RuleRequest req)
    {
        var station = await _db.Stations.FirstOrDefaultAsync();
        if (station == null) return BadRequest("Chưa có trạm nào trong hệ thống");

        var rule = new Rule
        {
            StationId = req.StationId ?? station.Id,
            DeviceId  = req.DeviceId,
            Name      = req.Name ?? "Tên quy tắc mới",
            Condition = req.Condition ?? "{}",
            Actions   = req.Actions ?? "[]",
            Enabled   = req.Enabled ?? true,
        };

        _db.Rules.Add(rule);
        await _db.SaveChangesAsync();
        return Ok(rule);
    }

    // PUT /api/v1/rules/{id}
    [HttpPut("{id:guid}")]
    [Authorize(Roles = "admin,manager")]
    public async Task<IActionResult> Update(Guid id, [FromBody] RuleRequest req)
    {
        var rule = await _db.Rules.FindAsync(id);
        if (rule == null) return NotFound();

        if (req.Name      != null) rule.Name      = req.Name;
        if (req.Condition != null) rule.Condition  = req.Condition;
        if (req.Actions   != null) rule.Actions    = req.Actions;
        if (req.Enabled   != null) rule.Enabled    = req.Enabled.Value;
        if (req.DeviceId  != null) rule.DeviceId   = req.DeviceId;

        await _db.SaveChangesAsync();
        return Ok(rule);
    }

    // DELETE /api/v1/rules/{id}
    [HttpDelete("{id:guid}")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var rule = await _db.Rules.FindAsync(id);
        if (rule == null) return NotFound();
        _db.Rules.Remove(rule);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // PATCH /api/v1/rules/{id}/toggle — bật/tắt rule nhanh
    [HttpPatch("{id}/toggle")]
    [Authorize(Roles = "admin,manager")]
    public async Task<IActionResult> Toggle(Guid id)
    {
        var rule = await _db.Rules.FindAsync(id);
        if (rule == null) return NotFound();
        rule.Enabled = !rule.Enabled;
        await _db.SaveChangesAsync();
        return Ok(new { rule.Id, rule.Enabled });
    }
}

public class RuleRequest
{
    public string? Name      { get; set; }
    public string? Condition { get; set; }
    public string? Actions   { get; set; }
    public bool?   Enabled   { get; set; }
    public Guid?   StationId { get; set; }
    public Guid?   DeviceId  { get; set; }
}
