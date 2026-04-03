// ============================================================
// RuleEvaluationWorker — Đánh giá Rules sau mỗi PLC poll
// Chạy nền, kiểm tra mỗi 5 giây
//
// Condition JSONB format:
//   { "point": "nhiet_do_pha_1", "op": ">", "value": 80 }
//   Operators: > < >= <= ==
//
// Actions JSONB format:
//   [{ "type": "alert", "level": "warning" }]
//   [{ "type": "alert", "level": "alarm" }]
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

public class RuleEvaluationWorker : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IRealtimeNotifier _notifier;
    private readonly ILogger<RuleEvaluationWorker> _logger;

    private const int CheckIntervalMs = 5000;

    public RuleEvaluationWorker(
        IServiceScopeFactory scopeFactory,
        IRealtimeNotifier notifier,
        ILogger<RuleEvaluationWorker> logger)
    {
        _scopeFactory = scopeFactory;
        _notifier = notifier;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("[Rules] Worker khởi động");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await EvaluateAllRulesAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[Rules] Lỗi đánh giá rules");
            }

            await Task.Delay(CheckIntervalMs, stoppingToken);
        }
    }

    private async Task EvaluateAllRulesAsync(CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        // Lấy tất cả rules đang bật
        var rules = await db.Rules
            .Where(r => r.Enabled)
            .ToListAsync(ct);

        if (rules.Count == 0) return;

        // Lấy giá trị sensor mới nhất từ DB (DISTINCT ON)
        var latestReadings = await db.SensorReadings
            .FromSqlRaw(@"
                SELECT DISTINCT ON (""PointId"") *
                FROM ""SensorReadings""
                ORDER BY ""PointId"", ""Time"" DESC")
            .ToDictionaryAsync(r => r.PointId, r => r, ct);

        foreach (var rule in rules)
        {
            await EvaluateRuleAsync(db, rule, latestReadings, ct);
        }
    }

    private async Task EvaluateRuleAsync(
        AppDbContext db,
        Rule rule,
        Dictionary<string, SensorReading> latestReadings,
        CancellationToken ct)
    {
        // Parse condition
        var condition = ParseCondition(rule.Condition);
        if (condition == null) return;

        var pointId = condition.Value.point;
        var op      = condition.Value.op;
        var threshold = condition.Value.value;

        if (!latestReadings.TryGetValue(pointId, out var reading)) return;
        if (reading.Value == null) return;

        var currentValue = reading.Value.Value;
        var triggered = op switch
        {
            ">"  => currentValue > threshold,
            "<"  => currentValue < threshold,
            ">=" => currentValue >= threshold,
            "<=" => currentValue <= threshold,
            "==" => Math.Abs(currentValue - threshold) < 0.001,
            _    => false
        };

        if (!triggered) return;

        // Kiểm tra xem đã có alert open cho rule này chưa (tránh spam)
        var existingOpen = await db.Alerts.AnyAsync(
            a => a.RuleId == rule.Id && a.Status == "open", ct);

        if (existingOpen) return;

        // Parse actions để lấy level
        var level = ParseAlertLevel(rule.Actions);

        // Tạo alert mới
        var alert = new Alert
        {
            StationId   = rule.StationId,
            DeviceId    = rule.DeviceId,
            RuleId      = rule.Id,
            Source      = "rule_engine",
            Level       = level,
            Status      = "open",
            Message     = $"[{rule.Name}] {pointId} = {currentValue:F1} {op} {threshold}",
            Value       = currentValue,
            TriggeredAt = DateTime.UtcNow,
        };

        db.Alerts.Add(alert);
        await db.SaveChangesAsync(ct);

        _logger.LogWarning("[Rules] Alert [{Level}]: {Msg}", level, alert.Message);

        // Push realtime về frontend
        await _notifier.SendAlertAsync(new {
            id          = alert.Id,
            level       = alert.Level,
            status      = alert.Status,
            message     = alert.Message,
            value       = alert.Value,
            triggeredAt = alert.TriggeredAt,
            ruleId      = alert.RuleId,
            deviceId    = alert.DeviceId,
        });
    }

    // ── Helpers ───────────────────────────────────────────

    private static (string point, string op, double value)? ParseCondition(string json)
    {
        try
        {
            var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            var point = root.GetProperty("point").GetString() ?? "";
            var op    = root.GetProperty("op").GetString() ?? ">";
            var value = root.GetProperty("value").GetDouble();
            return (point, op, value);
        }
        catch { return null; }
    }

    private static string ParseAlertLevel(string actionsJson)
    {
        try
        {
            var arr = JsonDocument.Parse(actionsJson).RootElement;
            foreach (var action in arr.EnumerateArray())
            {
                if (action.TryGetProperty("level", out var lvl))
                    return lvl.GetString() ?? "warning";
            }
        }
        catch { }
        return "warning";
    }
}
