// ============================================================
// MeasurementsController — Lấy dữ liệu cảm biến
// GET /api/v1/points              — Giá trị tức thời toàn trạm
// GET /api/v1/history?device=&from=&to= — Lịch sử time-series
// ============================================================

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using StationMonitor.Data;
using System.Collections.Generic;

namespace StationMonitor.Api.Controllers;

[ApiController]
[Route("api/v1")]
[Authorize]
public class MeasurementsController : ControllerBase
{
    private readonly AppDbContext _db;
    public MeasurementsController(AppDbContext db) => _db = db;

    /// <summary>
    /// Lấy giá trị mới nhất của tất cả điểm đo trong trạm
    /// Dùng DISTINCT ON của PostgreSQL/TimescaleDB để tránh lỗi EF Core GroupBy
    /// </summary>
    [HttpGet("points")]
    public async Task<IActionResult> GetLatestPoints([FromQuery] Guid? stationId)
    {
        // DISTINCT ON (device_id, point_id) ORDER BY time DESC
        // → lấy row mới nhất của mỗi cặp (device, point)
        var sql = stationId.HasValue
            ? $"""
               SELECT DISTINCT ON ("DeviceId", "PointId")
                 "DeviceId", "PointId", "Value", "Unit", "Quality", "Time"
               FROM "SensorReadings"
               WHERE "StationId" = '{stationId}'
               ORDER BY "DeviceId", "PointId", "Time" DESC
               """
            : """
              SELECT DISTINCT ON ("DeviceId", "PointId")
                "DeviceId", "PointId", "Value", "Unit", "Quality", "Time"
              FROM "SensorReadings"
              ORDER BY "DeviceId", "PointId", "Time" DESC
              """;

        var conn = _db.Database.GetDbConnection();
        await conn.OpenAsync();
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = sql;
        await using var reader = await cmd.ExecuteReaderAsync();

        var result = new List<object>();
        while (await reader.ReadAsync())
        {
            result.Add(new
            {
                DeviceId = reader.GetGuid(0),
                PointId  = reader.GetString(1),
                Value    = reader.GetDouble(2),
                Unit     = reader.GetString(3),
                Quality  = reader.GetInt32(4),
                Time     = reader.GetDateTime(5)
            });
        }

        return Ok(result);
    }

    /// <summary>
    /// Lịch sử time-series của 1 điểm đo
    /// Dùng cho Analytics page và Alert detail chart
    /// </summary>
    [HttpGet("history")]
    public async Task<IActionResult> GetHistory(
        [FromQuery] Guid deviceId,
        [FromQuery] string pointId,
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        [FromQuery] int limit = 500)
    {
        var fromTime = from ?? DateTime.UtcNow.AddHours(-6);
        var toTime = to ?? DateTime.UtcNow;

        var data = await _db.SensorReadings
            .Where(r => r.DeviceId == deviceId
                     && r.PointId == pointId
                     && r.Time >= fromTime
                     && r.Time <= toTime)
            .OrderBy(r => r.Time)
            .Take(limit)
            .Select(r => new { r.Time, r.Value, r.Quality })
            .ToListAsync();

        return Ok(data);
    }
}
