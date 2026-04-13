// ============================================================
// EarlyWarningWorker — Phát hiện xu hướng + bất thường nâng cao
// Chạy mỗi 30 phút, phân tích dữ liệu 7-30 ngày
//
// Phân tích 1: Linear trend (slope/day) — cảnh báo tăng đều
// Phân tích 2: Delta-T 3 pha — chênh lệch nhiệt Pha A/B/C bất thường
// Phân tích 3: PD Frequency — tần suất phóng điện tăng vọt
// ============================================================

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using StationMonitor.Data;
using StationMonitor.Data.Entities;
using StationMonitor.Services;

namespace StationMonitor.Workers.Polling;

public class EarlyWarningWorker : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IRealtimeNotifier    _notifier;
    private readonly ILogger<EarlyWarningWorker> _logger;

    // ── Ngưỡng Linear Trend ────────────────────────────────
    private const double TempSlopeThresholdPerDay = 0.5;  // °C/ngày
    private const double PdSlopeThresholdPerDay   = 0.3;  // dB/ngày

    // ── Ngưỡng Delta-T (chênh lệch nhiệt giữa các pha) ────
    private const double DeltaTWarnThreshold  = 10.0;   // °C — early warning
    private const double DeltaTAlarmThreshold = 15.0;   // °C — alarm (tiếp điểm hỏng)

    // ── Ngưỡng PD Frequency ────────────────────────────────
    private const double PdFreqRatioWarn  = 3.0;   // tăng 3x → warning
    private const double PdFreqRatioAlarm = 5.0;   // tăng 5x → alarm
    private const double PdEventThreshold = 2.0;   // dB: ngưỡng coi là "sự kiện PD"

    public EarlyWarningWorker(
        IServiceScopeFactory scopeFactory,
        IRealtimeNotifier notifier,
        ILogger<EarlyWarningWorker> logger)
    {
        _scopeFactory = scopeFactory;
        _notifier     = notifier;
        _logger       = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("[EarlyWarning] Worker khởi động");
        await Task.Delay(TimeSpan.FromMinutes(3), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await AnalyzeTrendsAsync(stoppingToken);
                await AnalyzeDeltaTAsync(stoppingToken);
                await AnalyzePdFrequencyAsync(stoppingToken);
            }
            catch (Exception ex) { _logger.LogError(ex, "[EarlyWarning] Lỗi phân tích"); }

            await Task.Delay(TimeSpan.FromMinutes(30), stoppingToken);
        }
    }

    // ══════════════════════════════════════════════════════
    // PHÂN TÍCH 1 — Linear trend (slope/day)
    // ══════════════════════════════════════════════════════
    private async Task AnalyzeTrendsAsync(CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var since    = DateTime.UtcNow.AddDays(-7);
        var pointIds = new[] { "nhiet_do_pha_1", "nhiet_do_pha_2", "nhiet_do_pha_3", "phong_dien" };

        var readings = await db.SensorReadings
            .Where(r => r.Time >= since && pointIds.Contains(r.PointId))
            .OrderBy(r => r.DeviceId).ThenBy(r => r.PointId).ThenBy(r => r.Time)
            .Select(r => new { r.StationId, r.DeviceId, r.PointId, r.Time, r.Value })
            .ToListAsync(ct);

        var groups = readings.GroupBy(r => new { r.DeviceId, r.PointId, r.StationId });

        foreach (var g in groups)
        {
            var items = g.Where(x => x.Value.HasValue).ToList();
            if (items.Count < 20) continue;

            var t0  = items[0].Time;
            var xs  = items.Select(x => (x.Time - t0).TotalHours).ToArray();
            var ys  = items.Select(x => x.Value!.Value).ToArray();
            var slopePerDay = LinearSlope(xs, ys) * 24;

            var isTemp    = g.Key.PointId.StartsWith("nhiet");
            var threshold = isTemp ? TempSlopeThresholdPerDay : PdSlopeThresholdPerDay;
            if (slopePerDay <= threshold) continue;

            var marker = $"[EW:TREND:{g.Key.PointId}:{g.Key.DeviceId}]";
            if (await AlreadyAlertedAsync(db, marker, 12, ct)) continue;

            var label = PointLabel(g.Key.PointId);
            var unit  = isTemp ? "°C" : "dB";
            var msg   = $"Xu hướng tăng: {label} +{slopePerDay:0.00}{unit}/ngày liên tục 7 ngày {marker}";

            await CreateAlertAsync(db, g.Key.StationId, g.Key.DeviceId, "early_warning",
                "warning", msg, slopePerDay, ct);
        }
    }

    // ══════════════════════════════════════════════════════
    // PHÂN TÍCH 2 — Delta-T: chênh lệch nhiệt giữa 3 pha
    // ══════════════════════════════════════════════════════
    private async Task AnalyzeDeltaTAsync(CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var tempPoints = new[] { "nhiet_do_pha_1", "nhiet_do_pha_2", "nhiet_do_pha_3" };

        // Lấy giá trị mới nhất của 3 pha, group by DeviceId (LINQ thay vì raw SQL)
        var latest = await db.SensorReadings
            .FromSqlRaw(@"
                SELECT DISTINCT ON (""DeviceId"", ""PointId"") *
                FROM ""SensorReadings""
                WHERE ""PointId"" IN ('nhiet_do_pha_1','nhiet_do_pha_2','nhiet_do_pha_3')
                ORDER BY ""DeviceId"", ""PointId"", ""Time"" DESC")
            .ToListAsync(ct);

        var byDevice = latest.GroupBy(r => new { r.DeviceId, r.StationId });

        foreach (var g in byDevice)
        {
            var vals = g.Where(r => r.Value.HasValue).Select(r => r.Value!.Value).ToList();
            if (vals.Count < 2) continue; // cần ít nhất 2 pha để so sánh

            var deltaT = vals.Max() - vals.Min();
            if (deltaT < DeltaTWarnThreshold) continue;

            var level  = deltaT >= DeltaTAlarmThreshold ? "alarm" : "warning";
            var marker = $"[EW:DELTAT:{g.Key.DeviceId}]";
            if (await AlreadyAlertedAsync(db, marker, 6, ct)) continue;

            var phaseVals = g.Where(r => r.Value.HasValue)
                .Select(r => $"{PointLabel(r.PointId)}={r.Value:F1}°C")
                .ToList();
            var msg = $"Chênh lệch nhiệt bất thường giữa các pha: ΔT={deltaT:F1}°C " +
                      $"({string.Join(", ", phaseVals)}) {marker}";

            await CreateAlertAsync(db, g.Key.StationId, g.Key.DeviceId, "early_warning",
                level, msg, deltaT, ct);
            _logger.LogWarning("[EarlyWarning] Delta-T {level}: {msg}", level, msg);
        }
    }

    // ══════════════════════════════════════════════════════
    // PHÂN TÍCH 3 — PD Frequency: tần suất phóng điện
    // ══════════════════════════════════════════════════════
    private async Task AnalyzePdFrequencyAsync(CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var now       = DateTime.UtcNow;
        var weekStart = now.AddDays(-7);
        var prevStart = now.AddDays(-14);

        // Đếm số readings PD vượt ngưỡng theo từng tuần
        var pdReadings = await db.SensorReadings
            .Where(r => r.PointId == "phong_dien" && r.Time >= prevStart && r.Value.HasValue)
            .Select(r => new { r.DeviceId, r.StationId, r.Time, r.Value })
            .ToListAsync(ct);

        var byDevice = pdReadings.GroupBy(r => new { r.DeviceId, r.StationId });

        foreach (var g in byDevice)
        {
            var thisWeek = g.Count(r => r.Time >= weekStart && r.Value!.Value > PdEventThreshold);
            var lastWeek = g.Count(r => r.Time < weekStart  && r.Value!.Value > PdEventThreshold);

            if (lastWeek < 2) continue; // cần đủ baseline

            var ratio = (double)thisWeek / lastWeek;
            if (ratio < PdFreqRatioWarn) continue;

            var level  = ratio >= PdFreqRatioAlarm ? "alarm" : "warning";
            var marker = $"[EW:PDFREQ:{g.Key.DeviceId}]";
            if (await AlreadyAlertedAsync(db, marker, 12, ct)) continue;

            var msg = $"Tần suất phóng điện tăng {ratio:F1}x: " +
                      $"tuần này {thisWeek} sự kiện, tuần trước {lastWeek} sự kiện " +
                      $"(ngưỡng >{PdEventThreshold}dB) {marker}";

            await CreateAlertAsync(db, g.Key.StationId, g.Key.DeviceId, "early_warning",
                level, msg, ratio, ct);
            _logger.LogWarning("[EarlyWarning] PD Frequency {level}: {msg}", level, msg);
        }
    }

    // ── Helpers ───────────────────────────────────────────

    private static async Task<bool> AlreadyAlertedAsync(
        AppDbContext db, string marker, int withinHours, CancellationToken ct)
    {
        var cutoff = DateTime.UtcNow.AddHours(-withinHours);
        return await db.Alerts.AnyAsync(a =>
            a.Source == "early_warning" &&
            a.Message != null && a.Message.Contains(marker) &&
            a.TriggeredAt >= cutoff &&
            (a.Status == "open" || a.Status == "acked"), ct);
    }

    private async Task CreateAlertAsync(
        AppDbContext db, Guid stationId, Guid? deviceId,
        string source, string level, string msg, double value, CancellationToken ct)
    {
        var alert = new Alert
        {
            StationId   = stationId,
            DeviceId    = deviceId,
            Source      = source,
            Level       = level,
            Status      = "open",
            Message     = msg,
            Value       = Math.Round(value, 3),
            TriggeredAt = DateTime.UtcNow,
        };
        db.Alerts.Add(alert);
        db.AlertHistories.Add(new AlertHistory
        {
            AlertId = alert.Id,
            Status  = "triggered",
            Note    = msg,
        });
        await db.SaveChangesAsync(ct);
        await _notifier.SendAlertAsync(new
        {
            id = alert.Id, level = alert.Level, message = msg,
            source = alert.Source, triggeredAt = alert.TriggeredAt,
        });
    }

    private static string PointLabel(string pointId) => pointId switch
    {
        "nhiet_do_pha_1" => "Nhiệt độ Pha 1",
        "nhiet_do_pha_2" => "Nhiệt độ Pha 2",
        "nhiet_do_pha_3" => "Nhiệt độ Pha 3",
        "phong_dien"     => "Phóng điện (PD)",
        _                => pointId,
    };

    private static double LinearSlope(double[] xs, double[] ys)
    {
        int n = xs.Length;
        double sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
        for (int i = 0; i < n; i++)
        {
            sumX  += xs[i]; sumY  += ys[i];
            sumXY += xs[i] * ys[i];
            sumX2 += xs[i] * xs[i];
        }
        var denom = n * sumX2 - sumX * sumX;
        return denom == 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
    }
}
