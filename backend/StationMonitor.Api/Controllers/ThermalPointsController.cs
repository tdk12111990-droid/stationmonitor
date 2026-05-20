// ============================================================
// ThermalPointsController — Quản lý điểm đo nhiệt độ
// GET    /api/v1/thermal-points          — Lấy danh sách
// POST   /api/v1/thermal-points          — Thêm điểm mới
// PUT    /api/v1/thermal-points/{id}     — Cập nhật điểm
// DELETE /api/v1/thermal-points/{id}     — Xóa điểm
// POST   /api/v1/thermal-points/reload   — Reload relay config
// ============================================================

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace StationMonitor.Api.Controllers;

[ApiController]
[Route("api/v1/thermal-points")]
[Authorize]
public class ThermalPointsController : ControllerBase
{
    private static readonly string[] PossibleRelayDirs = new[]
    {
        "/home/admin-/Desktop/stationmonitor/sdk-relay",
        Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..", "sdk-relay"),
        Path.Combine(Directory.GetCurrentDirectory(), "..", "sdk-relay"),
        Path.Combine(AppContext.BaseDirectory, "sdk-relay"),
    };

    private static string GetPointsFilePath()
    {
        foreach (var dir in PossibleRelayDirs)
        {
            try
            {
                var normalized = Path.GetFullPath(dir);
                var path = Path.Combine(normalized, "points_local.json");
                if (System.IO.File.Exists(path)) return path;
            }
            catch { }
        }
        // Tạo file mới trong thư mục relay đầu tiên tồn tại
        foreach (var dir in PossibleRelayDirs)
        {
            try
            {
                var normalized = Path.GetFullPath(dir);
                if (Directory.Exists(normalized))
                    return Path.Combine(normalized, "points_local.json");
            }
            catch { }
        }
        return Path.Combine(AppContext.BaseDirectory, "points_local.json");
    }

    private static Dictionary<string, ThermalPointData> ReadPoints()
    {
        var path = GetPointsFilePath();
        if (!System.IO.File.Exists(path))
            return new Dictionary<string, ThermalPointData>();

        var json = System.IO.File.ReadAllText(path);
        var opts = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
        return JsonSerializer.Deserialize<Dictionary<string, ThermalPointData>>(json, opts)
               ?? new Dictionary<string, ThermalPointData>();
    }

    private static void SavePoints(Dictionary<string, ThermalPointData> points)
    {
        var path = GetPointsFilePath();
        var opts = new JsonSerializerOptions
        {
            WriteIndented = true,
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        };
        System.IO.File.WriteAllText(path, JsonSerializer.Serialize(points, opts));
    }

    // ── GET /api/v1/thermal-points ─────────────────────────
    [HttpGet]
    public IActionResult GetAll()
    {
        var points = ReadPoints();
        var result = points.Select(kv => new ThermalPointDto
        {
            Id   = kv.Key,
            Tx   = kv.Value.Tx,
            Ty   = kv.Value.Ty,
            Ox   = kv.Value.Ox,
            Oy   = kv.Value.Oy,
            Name = kv.Value.Name ?? $"P{kv.Key}",
        }).OrderBy(p =>
        {
            int.TryParse(p.Id, out var n);
            return n;
        });
        return Ok(result);
    }

    // ── POST /api/v1/thermal-points ────────────────────────
    [HttpPost]
    public IActionResult Create([FromBody] CreateThermalPointDto dto)
    {
        var points = ReadPoints();

        var maxId = points.Keys
            .Select(k => { int.TryParse(k, out var n); return n; })
            .DefaultIfEmpty(0).Max();
        var newId = dto.Id ?? (maxId + 1).ToString();

        if (points.ContainsKey(newId))
            return Conflict(new { error = $"Điểm ID '{newId}' đã tồn tại" });

        points[newId] = new ThermalPointData
        {
            Tx   = dto.Tx,
            Ty   = dto.Ty,
            Ox   = dto.Ox ?? dto.Tx,
            Oy   = dto.Oy ?? dto.Ty,
            Name = dto.Name ?? $"P{newId}",
        };
        SavePoints(points);

        return Ok(new ThermalPointDto
        {
            Id   = newId,
            Tx   = points[newId].Tx,
            Ty   = points[newId].Ty,
            Ox   = points[newId].Ox,
            Oy   = points[newId].Oy,
            Name = points[newId].Name!,
        });
    }

    // ── PUT /api/v1/thermal-points/{id} ────────────────────
    [HttpPut("{id}")]
    public IActionResult Update(string id, [FromBody] CreateThermalPointDto dto)
    {
        var points = ReadPoints();
        if (!points.ContainsKey(id))
            return NotFound(new { error = $"Không tìm thấy điểm '{id}'" });

        var oldName = points[id].Name;
        points[id] = new ThermalPointData
        {
            Tx   = dto.Tx,
            Ty   = dto.Ty,
            Ox   = dto.Ox ?? dto.Tx,
            Oy   = dto.Oy ?? dto.Ty,
            Name = dto.Name ?? oldName ?? $"P{id}",
        };
        SavePoints(points);
        return Ok(new ThermalPointDto
        {
            Id   = id,
            Tx   = points[id].Tx,
            Ty   = points[id].Ty,
            Ox   = points[id].Ox,
            Oy   = points[id].Oy,
            Name = points[id].Name!
        });
    }

    // ── DELETE /api/v1/thermal-points/{id} ─────────────────
    [HttpDelete("{id}")]
    public IActionResult Delete(string id)
    {
        var points = ReadPoints();
        if (!points.ContainsKey(id))
            return NotFound(new { error = $"Không tìm thấy điểm '{id}'" });

        points.Remove(id);
        SavePoints(points);
        return Ok(new { success = true, message = $"Đã xóa điểm P{id}" });
    }

    // ── POST /api/v1/thermal-points/reload ─────────────────
    [HttpPost("reload")]
    public IActionResult Reload()
    {
        try
        {
            foreach (var dir in PossibleRelayDirs)
            {
                try
                {
                    var normalized = Path.GetFullPath(dir);
                    if (Directory.Exists(normalized))
                    {
                        System.IO.File.WriteAllText(
                            Path.Combine(normalized, ".reload_points"),
                            DateTime.UtcNow.ToString("O"));
                        break;
                    }
                }
                catch { }
            }
            return Ok(new { success = true, message = "Đã gửi lệnh reload cho relay" });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = ex.Message });
        }
    }
}

// ── DTOs ────────────────────────────────────────────────────
public class ThermalPointData
{
    [JsonPropertyName("tx")] public double Tx { get; set; }
    [JsonPropertyName("ty")] public double Ty { get; set; }
    [JsonPropertyName("ox")] public double Ox { get; set; }
    [JsonPropertyName("oy")] public double Oy { get; set; }
    [JsonPropertyName("name")] public string? Name { get; set; }
}

public class ThermalPointDto
{
    public string Id { get; set; } = string.Empty;
    public double Tx { get; set; }
    public double Ty { get; set; }
    public double Ox { get; set; }
    public double Oy { get; set; }
    public string Name { get; set; } = string.Empty;
}

public class CreateThermalPointDto
{
    public string? Id { get; set; }
    public double Tx { get; set; }
    public double Ty { get; set; }
    public double? Ox { get; set; }
    public double? Oy { get; set; }
    public string? Name { get; set; }
}
