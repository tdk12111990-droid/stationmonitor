// ============================================================
// EarlyWarningWorker — Phát hiện xu hướng tăng bất thường
// Chạy mỗi 30 phút, phân tích dữ liệu 7 ngày qua
// Linear regression → slope/day → cảnh báo sớm nếu vượt ngưỡng
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

    // Ngưỡng slope mỗi ngày để kích hoạt cảnh báo
    private const double TempSlopeThresholdPerDay = 0.5;   // °C/ngày
    private const double PdSlopeThresholdPerDay   = 0.3;   // dB/ngày

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
        // Delay 3 phút để DB sẵn sàng và có dữ liệu
        await Task.Delay(TimeSpan.FromMinutes(3), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try   { await AnalyzeTrendsAsync(stoppingToken); }
            catch (Exception ex) { _logger.LogError(ex, "[EarlyWarning] Lỗi phân tích xu hướng"); }

            await Task.Delay(TimeSpan.FromMinutes(30), stoppingToken);
        }
    }

    private async Task AnalyzeTrendsAsync(CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var since = DateTime.UtcNow.AddDays(-7);
        var pointIds = new[] { "nhiet_do_pha_1", "nhiet_do_pha_2", "nhiet_do_pha_3", "phong_dien" };

        // Load toàn bộ readings 7 ngày một lần (tiết kiệm round-trip)
        var readings = await db.SensorReadings
            .Where(r => r.Time >= since && pointIds.Contains(r.PointId))
            .OrderBy(r => r.DeviceId).ThenBy(r => r.PointId).ThenBy(r => r.Time)
            .Select(r => new { r.StationId, r.DeviceId, r.PointId, r.Time, r.Value })
            .ToListAsync(ct);

        var groups = readings.GroupBy(r => new { r.DeviceId, r.PointId, r.StationId });

        foreach (var g in groups)
        {
            var items = g.Where(x => x.Value.HasValue).ToList();
            if (items.Count < 20) continue; // cần đủ mẫu để hồi quy có nghĩa

            var t0   = items[0].Time;
            var xs   = items.Select(x => (x.Time - t0).TotalHours).ToArray();
            var ys   = items.Select(x => x.Value!.Value).ToArray();
            var slopePerDay = LinearSlope(xs, ys) * 24;

            var isTemp    = g.Key.PointId.StartsWith("nhiet");
            var threshold = isTemp ? TempSlopeThresholdPerDay : PdSlopeThresholdPerDay;
            if (slopePerDay <= threshold) continue;

            // Dedup: không tạo alert cùng loại trong 12 giờ
            var marker = $"[EW:{g.Key.PointId}:{g.Key.DeviceId}]";
            var cutoff = DateTime.UtcNow.AddHours(-12);
            var exists = await db.Alerts.AnyAsync(a =>
                a.Source == "early_warning" &&
                a.Message != null && a.Message.Contains(marker) &&
                a.TriggeredAt >= cutoff &&
                (a.Status == "open" || a.Status == "acked"), ct);
            if (exists) continue;

            var label = g.Key.PointId switch
            {
                "nhiet_do_pha_1" => "Nhiệt độ Pha 1",
                "nhiet_do_pha_2" => "Nhiệt độ Pha 2",
                "nhiet_do_pha_3" => "Nhiệt độ Pha 3",
                "phong_dien"     => "Phóng điện (PD)",
                _                => g.Key.PointId,
            };
            var unit = isTemp ? "°C" : "dB";
            var msg  = $"Xu hướng tăng: {label} tăng {slopePerDay:+0.00;-0.00}{unit}/ngày (phân tích 7 ngày) {marker}";

            var alert = new Alert
            {
                StationId   = g.Key.StationId,
                DeviceId    = g.Key.DeviceId,
                Source      = "early_warning",
                Level       = "warning",
                Status      = "open",
                Message     = msg,
                Value       = Math.Round(slopePerDay, 3),
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

            _logger.LogWarning("[EarlyWarning] {msg}", msg);
        }
    }

    /// <summary>Tính slope (hệ số góc) bằng linear regression (OLS)</summary>
    private static double LinearSlope(double[] xs, double[] ys)
    {
        int n = xs.Length;
        double sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
        for (int i = 0; i < n; i++)
        {
            sumX  += xs[i];  sumY  += ys[i];
            sumXY += xs[i] * ys[i];
            sumX2 += xs[i] * xs[i];
        }
        var denom = n * sumX2 - sumX * sumX;
        return denom == 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
    }
}
