// ============================================================
// HealthScoreWorker — Tính điểm sức khỏe 0-100 cho mỗi thiết bị
// Chạy mỗi 1 giờ, lưu vào SystemSettings key: health_{deviceId}
//
// CÔNG THỨC (dựa hoàn toàn vào rule người dùng cấu hình):
//
//   Bắt đầu: 100 điểm
//   Với mỗi rule đang kích hoạt (giá trị hiện tại vượt ngưỡng):
//     - Có health_penalty tùy chỉnh → trừ đúng số đó
//     - Alarm level → -20
//     - Warning level → -5
//   Thiết bị offline → -20
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
using StationMonitor.Services;

namespace StationMonitor.Workers.Polling;

public class HealthScoreWorker : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IRealtimeNotifier _notifier;
    private readonly ILogger<HealthScoreWorker> _logger;
    private readonly LoadCorrelationAnalyzer _loadCorr;

    public HealthScoreWorker(
        IServiceScopeFactory scopeFactory,
        IRealtimeNotifier notifier,
        ILogger<HealthScoreWorker> logger,
        LoadCorrelationAnalyzer loadCorr)
    {
        _scopeFactory = scopeFactory;
        _notifier = notifier;
        _logger = logger;
        _loadCorr = loadCorr;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("[HealthScore] Worker khởi động");
        await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try { await ComputeScoresAsync(stoppingToken); }
            catch (Exception ex) { _logger.LogError(ex, "[HealthScore] Lỗi"); }

            await Task.Delay(TimeSpan.FromHours(1), stoppingToken);
        }
    }

    /// <summary>Tính lại ngay điểm sức khỏe (gọi từ API endpoint)</summary>
    public async Task RecalculateNowAsync(CancellationToken ct = default)
    {
        _logger.LogInformation("[HealthScore] Tính lại theo yêu cầu thủ công");
        await ComputeScoresAsync(ct);
    }

    // ══════════════════════════════════════════════════════════
    private async Task ComputeScoresAsync(CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var devices = await db.Devices.ToListAsync(ct);
        var rules = await db.Rules.Where(r => r.Enabled).ToListAsync(ct);
        var now = DateTime.UtcNow;
        var since24h = now.AddHours(-24);

        // Giá trị mới nhất của từng điểm đo trong 24h
        var latestReadings = await db.SensorReadings
            .FromSqlInterpolated($@"
                SELECT DISTINCT ON (""DeviceId"", ""PointId"") *
                FROM ""SensorReadings""
                WHERE ""Time"" >= {since24h}
                ORDER BY ""DeviceId"", ""PointId"", ""Time"" DESC")
            .ToListAsync(ct);

        foreach (var device in devices)
        {
            double score = 100;

            var deviceReadings = latestReadings
                .Where(r => r.DeviceId == device.Id).ToList();

            // Kiểm tra từng rule đang bật
            foreach (var rule in rules)
            {
                var cond = RuleEvaluator.ParseCondition(rule.Condition);
                if (cond is null) continue;

                var reading = deviceReadings.FirstOrDefault(r => r.PointId == cond.Value.point);
                if (reading?.Value is null) continue;

                if (!RuleEvaluator.Evaluate(reading.Value.Value, cond.Value.op, cond.Value.value))
                    continue;

                // Rule đang kích hoạt → trừ điểm
                var penalty = RuleEvaluator.ParseHealthPenalty(rule.Actions);
                if (penalty <= 0)
                {
                    var level = RuleEvaluator.ParseAlertLevel(rule.Actions);
                    penalty = level == "alarm" ? 20.0 : 5.0;
                }
                score -= penalty;
            }

            // Thiết bị offline → trừ thêm
            if (device.Status == "offline") score -= 20;

            score = Math.Clamp(score, 0, 100);
            var risk = score >= 80 ? "good"
                     : score >= 60 ? "fair"
                     : score >= 40 ? "poor"
                     : "critical";

            var settingKey = $"health_{device.Id}";
            var settingVal = JsonSerializer.Serialize(new
            {
                score = (int)Math.Round(score),
                risk,
                deviceName = device.Name,
                deviceType = device.Type,
                ts = now,
            });

            var existing = await db.SystemSettings.FirstOrDefaultAsync(
                s => s.StationId == device.StationId && s.Key == settingKey, ct);
            if (existing is not null)
            {
                existing.Value = settingVal;
                existing.UpdatedAt = now;
            }
            else
            {
                db.SystemSettings.Add(new SystemSettings
                {
                    StationId = device.StationId,
                    Key = settingKey,
                    Value = settingVal,
                });
            }
        }

        // Xóa zone states cũ (không còn dùng)
        var zoneKeys = await db.SystemSettings
            .Where(s => s.Key.StartsWith("zonest_"))
            .ToListAsync(ct);
        if (zoneKeys.Count > 0)
            db.SystemSettings.RemoveRange(zoneKeys);

        await db.SaveChangesAsync(ct);
        _logger.LogInformation("[HealthScore] Đã tính điểm {count} thiết bị (rule-based)", devices.Count);
    }
}
