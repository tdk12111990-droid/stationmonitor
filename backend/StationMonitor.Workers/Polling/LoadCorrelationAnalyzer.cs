// ============================================================
// LoadCorrelationAnalyzer — Đối chiếu dòng tải với nhiệt độ (CBM)
// Chạy mỗi 1 giờ (gọi từ HealthScoreWorker)
//
// Nguyên lý CBM:
//   - Tải tăng 50% → nhiệt tăng theo đường cong vật lý → bình thường
//   - Tải giữ nguyên → nhiệt tự nhiên tăng vọt → BẤT THƯỜNG → cảnh báo
//
// Công thức:
//   thermal_efficiency = temperature / (current_load + 0.001)
//   baseline = mean(30 ngày trước) ± 2σ
//   Alert nếu: efficiency > baseline + 2σ liên tục N readings
//
// Lưu ý: Cần PointId dòng điện (ampere) trong SystemSettings key "current_point_id"
//        Nếu chưa cấu hình → bỏ qua phân tích này
// ============================================================

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using StationMonitor.Data;
using StationMonitor.Data.Entities;
using StationMonitor.Services;

namespace StationMonitor.Workers.Polling;

public class LoadCorrelationAnalyzer
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IRealtimeNotifier    _notifier;
    private readonly ILogger<LoadCorrelationAnalyzer> _logger;

    // Ngưỡng: efficiency vượt baseline + N*sigma → cảnh báo
    private const double SigmaMultiplier    = 2.0;
    private const int    DeduplicationHours = 6;

    public LoadCorrelationAnalyzer(
        IServiceScopeFactory scopeFactory,
        IRealtimeNotifier notifier,
        ILogger<LoadCorrelationAnalyzer> logger)
    {
        _scopeFactory = scopeFactory;
        _notifier     = notifier;
        _logger       = logger;
    }

    public async Task AnalyzeAsync(CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        // Đọc PointId dòng điện từ Settings (admin cấu hình)
        var currentPointSetting = await db.SystemSettings
            .FirstOrDefaultAsync(s => s.Key == "current_point_id", ct);
        var currentPointId = currentPointSetting?.Value?.Trim('"');

        if (string.IsNullOrWhiteSpace(currentPointId))
        {
            _logger.LogDebug("[LoadCorr] Chưa cấu hình current_point_id → bỏ qua");
            return;
        }

        var tempPoints = new[] { "nhiet_do_pha_1", "nhiet_do_pha_2", "nhiet_do_pha_3" };
        var now        = DateTime.UtcNow;
        var since30d   = now.AddDays(-30);
        var since1h    = now.AddHours(-1);

        // Load 30 ngày lịch sử nhiệt độ + dòng điện — dùng ReadingPoint record
        var allReadings = await db.SensorReadings
            .Where(r => r.Time >= since30d &&
                        (tempPoints.Contains(r.PointId) || r.PointId == currentPointId) &&
                        r.Value.HasValue)
            .OrderBy(r => r.DeviceId).ThenBy(r => r.Time)
            .Select(r => new SensorRow(r.DeviceId, r.StationId, r.PointId, r.Time, r.Value!.Value))
            .ToListAsync(ct);

        var byDevice = allReadings.GroupBy(r => new { r.DeviceId, r.StationId });

        foreach (var g in byDevice)
        {
            var tempReadings    = g.Where(r => tempPoints.Contains(r.PointId)).ToList();
            var currentReadings = g.Where(r => r.PointId == currentPointId).ToList();

            if (tempReadings.Count < 50 || currentReadings.Count < 50) continue;

            // Tính efficiency baseline (30 ngày trước, bỏ 1 giờ gần nhất)
            var baselinePairs = JoinByTime(
                tempReadings.Where(r => r.Time < since1h).Select(r => new ReadingPoint(r.Time, r.Value)).ToList(),
                currentReadings.Where(r => r.Time < since1h).Select(r => new ReadingPoint(r.Time, r.Value)).ToList(),
                windowMinutes: 5);

            if (baselinePairs.Count < 30) continue;

            var baselineEfficiencies = baselinePairs.Select(p => p.temp / (p.current + 0.001)).ToList();
            var mean  = baselineEfficiencies.Average();
            var sigma = StdDev(baselineEfficiencies);
            var upper = mean + SigmaMultiplier * sigma;

            // Tính efficiency hiện tại (1 giờ gần nhất)
            var recentPairs = JoinByTime(
                tempReadings.Where(r => r.Time >= since1h).Select(r => new ReadingPoint(r.Time, r.Value)).ToList(),
                currentReadings.Where(r => r.Time >= since1h).Select(r => new ReadingPoint(r.Time, r.Value)).ToList(),
                windowMinutes: 5);

            if (recentPairs.Count < 3) continue;

            var recentEfficiency = recentPairs.Average(p => p.temp / (p.current + 0.001));
            if (recentEfficiency <= upper) continue;

            // Cảnh báo
            var marker = $"[EW:LOADCORR:{g.Key.DeviceId}]";
            var cutoff = now.AddHours(-DeduplicationHours);
            var exists = await db.Alerts.AnyAsync(a =>
                a.Source == "early_warning" &&
                a.Message != null && a.Message.Contains(marker) &&
                a.TriggeredAt >= cutoff && (a.Status == "open" || a.Status == "acked"), ct);
            if (exists) continue;

            var excessPct = (recentEfficiency / mean - 1) * 100;
            var level = excessPct > 40 ? "alarm" : "warning";
            var msg   = $"Hiệu suất nhiệt bất thường: nhiệt cao hơn {excessPct:F0}% so với baseline " +
                        $"(tải không thay đổi đáng kể) {marker}";

            var alert = new Alert
            {
                StationId   = g.Key.StationId,
                DeviceId    = g.Key.DeviceId,
                Source      = "early_warning",
                Level       = level,
                Status      = "open",
                Message     = msg,
                Value       = Math.Round(excessPct, 1),
                TriggeredAt = now,
            };
            db.Alerts.Add(alert);
            db.AlertHistories.Add(new AlertHistory
            {
                AlertId = alert.Id, Status = "triggered", Note = msg,
            });
            await db.SaveChangesAsync(ct);
            await _notifier.SendAlertAsync(new
            {
                id = alert.Id, level, message = msg, source = "early_warning",
                triggeredAt = alert.TriggeredAt,
            });
            _logger.LogWarning("[LoadCorr] {level}: {msg}", level, msg);
        }
    }

    private record SensorRow(Guid DeviceId, Guid StationId, string PointId, DateTime Time, double Value);
    private record ReadingPoint(DateTime Time, double Value);

    // Ghép cặp (temp, current) theo thời gian gần nhau (window phút)
    private static List<(double temp, double current)> JoinByTime(
        IList<ReadingPoint> temps, IList<ReadingPoint> currents, int windowMinutes)
    {
        var result = new List<(double, double)>();
        foreach (var t in temps)
        {
            var nearest = currents
                .Where(c => Math.Abs((c.Time - t.Time).TotalMinutes) <= windowMinutes)
                .MinBy(c => Math.Abs((c.Time - t.Time).TotalMinutes));
            if (nearest != null)
                result.Add((t.Value, nearest.Value));
        }
        return result;
    }

    private static double StdDev(List<double> values)
    {
        var mean = values.Average();
        var variance = values.Average(v => Math.Pow(v - mean, 2));
        return Math.Sqrt(variance);
    }
}
