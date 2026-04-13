// ============================================================
// HealthScoreWorker — Tính điểm sức khỏe 0-100 cho mỗi thiết bị
// Chạy mỗi 1 giờ, lưu vào SystemSettings key: health_{deviceId}
//
// Công thức điểm nâng cao:
//   Base: 100
//   - alarm:   penalty × decay(age_days)   (max -40)
//   - warning: penalty × decay(age_days)   (max -20)
//   - Giá trị vượt ngưỡng:  -25 (alarm) / -10 (warning)
//   - Device offline:        -20
//   - Delta-T > 10°C:        -10 (warning) / -20 (alarm)
//   - PD freq tăng > 3x:     -15
//   - Load correlation anom: -10
//
// Decay: e^(-0.1 × age_days) — alert 7 ngày trước còn ~50% penalty
// Risk:  good (≥80) · fair (≥60) · poor (≥40) · critical (<40)
// ============================================================

using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using StationMonitor.Data;
using StationMonitor.Data.Entities;
using StationMonitor.Services;

namespace StationMonitor.Workers.Polling;

public class HealthScoreWorker : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IRealtimeNotifier    _notifier;
    private readonly ILogger<HealthScoreWorker> _logger;
    private readonly LoadCorrelationAnalyzer _loadCorr;

    public HealthScoreWorker(
        IServiceScopeFactory scopeFactory,
        IRealtimeNotifier notifier,
        ILogger<HealthScoreWorker> logger,
        LoadCorrelationAnalyzer loadCorr)
    {
        _scopeFactory = scopeFactory;
        _notifier     = notifier;
        _logger       = logger;
        _loadCorr     = loadCorr;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("[HealthScore] Worker khởi động");
        await Task.Delay(TimeSpan.FromMinutes(4), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await _loadCorr.AnalyzeAsync(stoppingToken);
                await ComputeScoresAsync(stoppingToken);
            }
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
        var now     = DateTime.UtcNow;
        var since7d = now.AddDays(-7);
        var since30d = now.AddDays(-30);

        // Latest sensor readings
        var latestReadings = await db.SensorReadings
            .FromSqlRaw(@"
                SELECT DISTINCT ON (""DeviceId"", ""PointId"") *
                FROM ""SensorReadings""
                ORDER BY ""DeviceId"", ""PointId"", ""Time"" DESC")
            .ToListAsync(ct);

        // Alerts 30 ngày gần đây (để tính decay theo tuổi)
        var recentAlerts = await db.Alerts
            .Where(a => a.TriggeredAt >= since30d && a.DeviceId.HasValue)
            .Select(a => new { a.DeviceId, a.Level, a.TriggeredAt, a.Source, a.Message })
            .ToListAsync(ct);

        // Readings PD 14 ngày để tính PD frequency ratio
        var pdReadings = await db.SensorReadings
            .Where(r => r.PointId == "phong_dien" && r.Time >= since30d && r.Value.HasValue)
            .Select(r => new { r.DeviceId, r.Time, r.Value })
            .ToListAsync(ct);

        // Readings nhiệt độ 3 pha (mới nhất) để tính Delta-T
        var tempPoints   = new[] { "nhiet_do_pha_1", "nhiet_do_pha_2", "nhiet_do_pha_3" };
        var latestTemps  = latestReadings.Where(r => tempPoints.Contains(r.PointId)).ToList();

        foreach (var device in devices)
        {
            double score = 100;

            // ── 1. Penalty từ alerts gần đây với exponential decay ──
            var deviceAlerts = recentAlerts.Where(a => a.DeviceId == device.Id).ToList();
            double alarmPenalty   = 0;
            double warningPenalty = 0;

            foreach (var a in deviceAlerts)
            {
                var ageDays   = (now - a.TriggeredAt).TotalDays;
                var decay     = Math.Exp(-0.1 * ageDays); // 7 ngày → ~50%
                if (a.Level == "alarm")
                    alarmPenalty   += 20 * decay;
                else
                    warningPenalty += 5 * decay;
            }

            score -= Math.Min(40, alarmPenalty);
            score -= Math.Min(20, warningPenalty);

            // ── 2. Penalty từ giá trị hiện tại vượt ngưỡng rules ──
            var deviceReadings = latestReadings.Where(r => r.DeviceId == device.Id).ToList();
            foreach (var reading in deviceReadings)
            {
                if (!reading.Value.HasValue) continue;
                foreach (var rule in rules)
                    score -= CheckRulePenalty(rule, reading.PointId, reading.Value.Value);
            }

            // ── 3. Penalty Delta-T giữa 3 pha ─────────────────────
            var deviceTemps = latestTemps
                .Where(r => r.DeviceId == device.Id && r.Value.HasValue)
                .Select(r => r.Value!.Value).ToList();

            if (deviceTemps.Count >= 2)
            {
                var deltaT = deviceTemps.Max() - deviceTemps.Min();
                if (deltaT >= 15.0)      score -= 20; // alarm level
                else if (deltaT >= 10.0) score -= 10; // warning level
            }

            // ── 4. Penalty PD Frequency tăng vọt ─────────────────
            var devicePd = pdReadings.Where(r => r.DeviceId == device.Id).ToList();
            if (devicePd.Count >= 10)
            {
                var weekAgo  = now.AddDays(-7);
                var thisWeek = devicePd.Count(r => r.Time >= weekAgo && r.Value!.Value > 2.0);
                var lastWeek = devicePd.Count(r => r.Time < weekAgo  && r.Value!.Value > 2.0);
                if (lastWeek >= 2)
                {
                    var ratio = (double)thisWeek / lastWeek;
                    if (ratio >= 5.0)      score -= 15;
                    else if (ratio >= 3.0) score -= 8;
                }
            }

            // ── 5. Penalty Load Correlation (CBM) ─────────────────
            var loadCorrMarker = $"[EW:LOADCORR:{device.Id}]";
            var hasLoadCorrAnomaly = deviceAlerts.Any(a =>
                a.Source == "early_warning" &&
                a.Message != null && a.Message.Contains(loadCorrMarker));
            if (hasLoadCorrAnomaly) score -= 10;

            // ── 6. Penalty khi offline ─────────────────────────────
            if (device.Status == "offline") score -= 20;

            score = Math.Clamp(score, 0, 100);
            var risk = score >= 80 ? "good"
                     : score >= 60 ? "fair"
                     : score >= 40 ? "poor"
                     : "critical";

            var settingKey = $"health_{device.Id}";
            var settingVal = JsonSerializer.Serialize(new
            {
                score        = (int)Math.Round(score),
                risk,
                deviceName   = device.Name,
                deviceType   = device.Type,
                alarmCount   = deviceAlerts.Count(a => a.Level == "alarm"),
                warningCount = deviceAlerts.Count(a => a.Level == "warning"),
                ts           = now,
            });

            var existing = await db.SystemSettings.FirstOrDefaultAsync(
                s => s.StationId == device.StationId && s.Key == settingKey, ct);

            if (existing is not null)
            {
                existing.Value     = settingVal;
                existing.UpdatedAt = now;
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
        _logger.LogInformation("[HealthScore] Đã tính điểm {count} thiết bị (với decay + Delta-T + PD)", devices.Count);
    }

    private static double CheckRulePenalty(Rule rule, string pointId, double currentValue)
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

            // Ưu tiên penalty từ action type=health (tường minh)
            var healthPenalty = RuleEvaluator.ParseHealthPenalty(rule.Actions);
            if (healthPenalty > 0) return healthPenalty;

            // Backward compat: rule cũ không có health action
            // → dùng alert level để ước lượng penalty
            if (!RuleEvaluator.HasAlertAction(rule.Actions)) return 0;
            var level = RuleEvaluator.ParseAlertLevel(rule.Actions);
            return level == "alarm" ? 25 : 10;
        }
        catch { return 0; }
    }
}
