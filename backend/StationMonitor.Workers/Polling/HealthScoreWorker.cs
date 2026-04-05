// ============================================================
// HealthScoreWorker — Tính điểm sức khỏe 0-100 cho mỗi thiết bị
// Chạy mỗi 1 giờ, lưu vào SystemSettings key: health_{deviceId}
//
// Công thức điểm:
//   Base: 100
//   - alarm trong 24h:   -20 mỗi cái (tối đa -40)
//   - warning trong 24h: -5  mỗi cái (tối đa -20)
//   - Giá trị vượt ngưỡng alarm rule: -25
//   - Giá trị vượt ngưỡng warning rule: -10
//   - Device offline: -20
//
// Risk: good (≥80) · fair (≥60) · poor (≥40) · critical (<40)
// ============================================================

using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using StationMonitor.Data;
using StationMonitor.Data.Entities;

namespace StationMonitor.Workers.Polling;

public class HealthScoreWorker : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<HealthScoreWorker> _logger;

    public HealthScoreWorker(IServiceScopeFactory scopeFactory, ILogger<HealthScoreWorker> logger)
    {
        _scopeFactory = scopeFactory;
        _logger       = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("[HealthScore] Worker khởi động");
        await Task.Delay(TimeSpan.FromMinutes(4), stoppingToken); // warm-up

        while (!stoppingToken.IsCancellationRequested)
        {
            try   { await ComputeScoresAsync(stoppingToken); }
            catch (Exception ex) { _logger.LogError(ex, "[HealthScore] Lỗi"); }

            await Task.Delay(TimeSpan.FromHours(1), stoppingToken);
        }
    }

    private async Task ComputeScoresAsync(CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var devices = await db.Devices.ToListAsync(ct);
        var rules   = await db.Rules.Where(r => r.Enabled).ToListAsync(ct);
        var since24 = DateTime.UtcNow.AddHours(-24);

        // Latest sensor readings (DISTINCT ON DeviceId + PointId)
        var latestReadings = await db.SensorReadings
            .FromSqlRaw(@"
                SELECT DISTINCT ON (""DeviceId"", ""PointId"") *
                FROM ""SensorReadings""
                ORDER BY ""DeviceId"", ""PointId"", ""Time"" DESC")
            .ToListAsync(ct);

        // Recent alerts per device
        var recentAlerts = await db.Alerts
            .Where(a => a.TriggeredAt >= since24 && a.DeviceId.HasValue)
            .Select(a => new { a.DeviceId, a.Level })
            .ToListAsync(ct);

        foreach (var device in devices)
        {
            int score = 100;

            // 1. Penalty từ alerts gần đây
            var deviceAlerts = recentAlerts.Where(a => a.DeviceId == device.Id).ToList();
            var alarmPenalty   = Math.Min(40, deviceAlerts.Count(a => a.Level == "alarm")   * 20);
            var warningPenalty = Math.Min(20, deviceAlerts.Count(a => a.Level == "warning") * 5);
            score -= alarmPenalty + warningPenalty;

            // 2. Penalty từ giá trị hiện tại vượt ngưỡng rules
            var deviceReadings = latestReadings.Where(r => r.DeviceId == device.Id).ToList();
            foreach (var reading in deviceReadings)
            {
                if (!reading.Value.HasValue) continue;
                foreach (var rule in rules)
                {
                    int penalty = CheckRulePenalty(rule, reading.PointId, reading.Value.Value);
                    score -= penalty;
                }
            }

            // 3. Penalty khi offline
            if (device.Status == "offline") score -= 20;

            score = Math.Clamp(score, 0, 100);
            var risk = score >= 80 ? "good" : score >= 60 ? "fair" : score >= 40 ? "poor" : "critical";

            var settingKey = $"health_{device.Id}";
            var settingVal = JsonSerializer.Serialize(new
            {
                score,
                risk,
                deviceName = device.Name,
                deviceType = device.Type,
                ts = DateTime.UtcNow,
            });

            // Upsert SystemSettings
            var existing = await db.SystemSettings.FirstOrDefaultAsync(
                s => s.StationId == device.StationId && s.Key == settingKey, ct);

            if (existing is not null)
            {
                existing.Value     = settingVal;
                existing.UpdatedAt = DateTime.UtcNow;
            }
            else
            {
                db.SystemSettings.Add(new SystemSettings
                {
                    StationId = device.StationId,
                    Key       = settingKey,
                    Value     = settingVal,
                });
            }
        }

        await db.SaveChangesAsync(ct);
        _logger.LogInformation("[HealthScore] Đã tính điểm {count} thiết bị", devices.Count);
    }

    /// <summary>Trả về penalty nếu reading vi phạm rule, 0 nếu không vi phạm</summary>
    private static int CheckRulePenalty(Rule rule, string pointId, double currentValue)
    {
        try
        {
            var cond = JsonSerializer.Deserialize<JsonElement>(rule.Condition);
            if (!cond.TryGetProperty("point", out var ptEl)) return 0;
            if (ptEl.GetString() != pointId) return 0;
            if (!cond.TryGetProperty("value", out var valEl)) return 0;
            var threshold = valEl.GetDouble();
            var op = cond.TryGetProperty("op", out var opEl) ? opEl.GetString() : ">";

            bool exceeded = op switch
            {
                ">"  => currentValue > threshold,
                ">=" => currentValue >= threshold,
                "<"  => currentValue < threshold,
                "<=" => currentValue <= threshold,
                "==" => Math.Abs(currentValue - threshold) < 0.001,
                _    => false,
            };
            if (!exceeded) return 0;

            // Lấy level từ actions
            var actions = JsonSerializer.Deserialize<JsonElement[]>(rule.Actions);
            var level = actions?.Length > 0 &&
                        actions[0].TryGetProperty("level", out var lvl)
                        ? lvl.GetString() : "warning";

            return level == "alarm" ? 25 : 10;
        }
        catch { return 0; }
    }
}
