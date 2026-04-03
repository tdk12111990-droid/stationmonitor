// ============================================================
// StationsController — CRUD trạm biến áp
// GET  /api/v1/stations        — Danh sách trạm
// GET  /api/v1/stations/{id}   — Chi tiết 1 trạm
// POST /api/v1/stations        — Tạo trạm mới (Admin)
// ============================================================

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using StationMonitor.Data;
using StationMonitor.Data.Entities;

namespace StationMonitor.Api.Controllers;

[ApiController]
[Route("api/v1/stations")]
[Authorize]
public class StationsController : ControllerBase
{
    private readonly AppDbContext _db;
    public StationsController(AppDbContext db) => _db = db;

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var stations = await _db.Stations
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
    public async Task<IActionResult> Create([FromBody] CreateStationRequest req)
    {
        var station = new Station
        {
            Name = req.Name,
            Code = req.Code,
            Location = req.Location,
            Status = "active"
        };
        _db.Stations.Add(station);
        await _db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetById), new { id = station.Id }, station);
    }
}

public record CreateStationRequest(string Name, string? Code, string? Location);
