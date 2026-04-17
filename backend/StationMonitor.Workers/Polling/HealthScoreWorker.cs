// ============================================================
// HealthScoreWorker — Tính điểm sức khỏe 0-100 cho mỗi thiết bị
// Chạy mỗi 1 giờ, lưu vào SystemSettings key: health_{deviceId}
//
// CÔNG THỨC (3 lớp):
//
// Lớp 1 — Vùng tức thời:
//   PD (NETA MTS 2023, UHF 50Ω dBmW):
//     Zone 1: ≤ -37 → 0         (bình thường, theo dõi 6 tháng)
//     Zone 2: -37→-27 → -5      (sửa trong 1-2 tháng)
//     Zone 3: > -27 → -15       (sửa ngay)
//   Nhiệt (mỗi pha):
//     Zone 1: < 40°C → 0
//     Zone 2: 40-50°C → -5      (stress nhẹ)
//     Zone 3: 50-65°C → -10     (cần kiểm tra)
//     Zone 4: ≥65°C → -20       (nguy hiểm)
//
// Lớp 2 — Thời gian trong vùng (zone × time):
//   PD zone 2 > 30 ngày → penalty ×2  | > 60 ngày → -20 (quá hạn)
//   PD zone 3 > 7  ngày → -25 (critical, sửa ngay mà không làm)
//   Nhiệt zone 2 > 14 ngày → ×1.5 | > 30 ngày → ×2
//   Nhiệt zone 3 > 30 ngày → ×1.5
//   → Trạng thái vùng lưu trong SystemSettings key "zonest_{type}_{deviceId}"
//   → Tạo MaintenanceTask tự động khi quá cửa sổ hành động NETA
//
// Lớp 3 — Tương quan PD + Nhiệt:
//   PD > -20 & nhiệt ≥50°C → -15 (nguy hiểm kết hợp)
//   PD > -27 & nhiệt ≥45°C → -8  (theo dõi chặt)
//
// Các bước khác:
//   Step 1: Alert penalty rule_engine (không tính early_warning — chỉ thông báo)
//           decay e^(-0.1×age_days), alarm cap -40, warning cap -20
//   Step 3: Delta-T ≥10°C → -10 | ≥15°C → -20
//   Step 5: Load correlation anomaly → -10
//   Step 6: Offline → -20
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

    // ── NETA MTS 2023 PD Zones (dBmW, 50Ω UHF) ──────────────
    private const double PdZone2Entry = -37.0;  // Vào zone theo dõi
    private const double PdZone3Entry = -27.0;  // Vào zone sửa ngay

    // Cửa sổ hành động NETA (ngày)
    private const int PdZone2WindowDays = 45;  // Trung bình 1-2 tháng
    private const int PdZone3OverdueDays = 7;  // Coi là quá hạn sau 7 ngày

    // ── Temperature Zones ─────────────────────────────────────
    private const double TempZone2Entry = 40.0;  // Stress
    private const double TempZone3Entry = 50.0;  // Warning
    private const double TempZone4Entry = 65.0;  // Alarm

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
        await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken); // Tính ngay sau 30 giây

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
        var since30d = now.AddDays(-30);
        var since24h = now.AddHours(-24);

        // Latest readings trong 24h (tránh đọc giá trị cũ khi PLC offline)
        var latestReadings = await db.SensorReadings
            .FromSqlInterpolated($@"
                SELECT DISTINCT ON (""DeviceId"", ""PointId"") *
                FROM ""SensorReadings""
                WHERE ""Time"" >= {since24h}
                ORDER BY ""DeviceId"", ""PointId"", ""Time"" DESC")
            .ToListAsync(ct);

        // Tất cả alerts 30 ngày — lọc theo source khi dùng
        var recentAlerts = await db.Alerts
            .Where(a => a.TriggeredAt >= since30d && a.DeviceId.HasValue)
            .Select(a => new { a.DeviceId, a.Level, a.TriggeredAt, a.Source, a.Message })
            .ToListAsync(ct);

        var tempPoints = new[] { "nhiet_do_pha_1", "nhiet_do_pha_2", "nhiet_do_pha_3" };
        var latestTemps = latestReadings.Where(r => tempPoints.Contains(r.PointId)).ToList();

        // Load tất cả zone states từ SystemSettings
        var zoneSettings = await db.SystemSettings
            .Where(s => s.Key.StartsWith("zonest_"))
            .ToListAsync(ct);

        var zoneDict = zoneSettings.ToDictionary(s => s.Key, s => s);
        var zoneUpdates = new List<(string Key, Guid StationId, string Value)>();

        // ── Tính điểm từng thiết bị ───────────────────────────
        foreach (var device in devices)
        {
            double score = 100;

            var deviceReadings = latestReadings
                .Where(r => r.DeviceId == device.Id).ToList();

            var allDeviceAlerts = recentAlerts.Where(a => a.DeviceId == device.Id).ToList();
            // Chỉ rule_engine alerts mới ảnh hưởng đến health penalty
            // early_warning chỉ là thông báo — không double-count với zone penalties
            var ruleEngineAlerts = allDeviceAlerts.Where(a => a.Source == "rule_engine").ToList();

            // ── Step 1: Alert penalty (rule_engine only, weighted exponential decay) ──
            double totalAlertPenalty = 0;
            foreach (var a in ruleEngineAlerts)
            {
                var ageDays = (now - a.TriggeredAt).TotalDays;
                // Decay constant: 0.1 means ~50% impact after 7 days
                var decay = Math.Exp(-0.1 * ageDays);

                double weight = a.Level switch
                {
                    "alarm" => 20.0,
                    "warning" => 5.0,
                    _ => 2.0
                };

                totalAlertPenalty += weight * decay;
            }
            score -= Math.Min(60, totalAlertPenalty); // Cap total alert impact at 60 points

            // ── Step 2a: Nhiệt độ — vùng cố định × thời gian ─
            var deviceTemps = new List<double>();
            foreach (var pId in tempPoints)
            {
                var rd = deviceReadings.FirstOrDefault(x => x.PointId == pId);
                if (rd is null || !rd.Value.HasValue) continue;

                var t = rd.Value.GetValueOrDefault();
                int zone = t >= TempZone4Entry ? 4
                         : t >= TempZone3Entry ? 3
                         : t >= TempZone2Entry ? 2
                         : 1;
                deviceTemps.Add(t);

                var zKey = $"zonest_temp_{pId}_{device.Id}";
                var daysInZone = TrackZone(zKey, zone, device.StationId, now, zoneDict, zoneUpdates);

                double penalty = zone switch
                {
                    4 => 20.0,  // ≥65°C
                    3 => 10.0,  // 50-65°C
                    2 => 5.0,   // 40-50°C
                    _ => 0.0,
                };

                // Nhân hệ số thời gian: ở vùng stress lâu → escalate
                penalty = zone switch
                {
                    2 when daysInZone > 30 => penalty * 2.0,   // stress > 1 tháng
                    2 when daysInZone > 14 => penalty * 1.5,   // stress > 2 tuần
                    3 when daysInZone > 30 => penalty * 1.5,   // warning > 1 tháng
                    4 when daysInZone > 3 => penalty * 1.2,   // alarm > 3 ngày
                    _ => penalty,
                };

                // Residual Penalty: If the device was in a higher zone recently, 
                // it doesn't recover instantly. (Simplified as a small additive penalty 
                // if the current zone is lower than the historical peak in the last 30 days)
                // This is handled by the fact that we track zone transitions in TrackZone,
                // but for now, we focus on the active penalty.

                score -= penalty;

                // Auto task: stress 40-50°C kéo dài > 60 ngày
                if (zone == 2 && daysInZone > 60)
                    await EnsureMaintenanceTaskAsync(db, device, pId, t, "inspection", 14,
                        $"Nhiệt {pId} = {t:F1}°C duy trì vùng stress (40-50°C) đã {daysInZone:F0} ngày", ct);
            }

            // ── Step 2b: PD — vùng NETA MTS 2023 × thời gian ─
            var pdRd = deviceReadings.FirstOrDefault(r => r.PointId == "phong_dien");
            if (pdRd?.Value.HasValue == true)
            {
                var pdVal = pdRd.Value.Value;
                int pdZone = pdVal > PdZone3Entry ? 3
                           : pdVal > PdZone2Entry ? 2
                           : 1;

                var pdDaysInZone = TrackZone(
                    $"zonest_pd_{device.Id}", pdZone,
                    device.StationId, now, zoneDict, zoneUpdates);

                // Penalty cơ bản theo vùng NETA
                double pdPenalty = pdZone switch
                {
                    3 => 15.0,  // > -27 dBm: sửa ngay → -15
                    2 => 5.0,   // -37→-27 dBm: theo dõi → -5
                    _ => 0.0,
                };

                // Escalation theo cửa sổ hành động NETA
                if (pdZone == 2)
                {
                    if (pdDaysInZone > 60)
                        pdPenalty = 20;  // > 2 tháng: quá hạn tối đa
                    else if (pdDaysInZone > PdZone2WindowDays)
                        pdPenalty = 12;  // > 45 ngày: đã qua cửa sổ
                    else if (pdDaysInZone > 30)
                        pdPenalty = 10;  // > 1 tháng: trong cửa sổ 1-2 tháng
                }
                else if (pdZone == 3 && pdDaysInZone > PdZone3OverdueDays)
                {
                    pdPenalty = 25;  // Vùng "sửa ngay" nhưng > 7 ngày chưa xử lý
                }

                score -= pdPenalty;

                // Auto task: PD zone 2 quá 45 ngày (quá 1/2 cửa sổ 1-2 tháng)
                if (pdZone == 2 && pdDaysInZone > 45)
                    await EnsureMaintenanceTaskAsync(db, device, "phong_dien", pdVal,
                        "inspection", 30,
                        $"PD = {pdVal:F1}dBm (vùng -37→-27) đã {pdDaysInZone:F0} ngày — cửa sổ NETA {PdZone2WindowDays}d", ct);

                // Auto task: PD zone 3 không xử lý quá 7 ngày
                if (pdZone == 3 && pdDaysInZone > PdZone3OverdueDays)
                    await EnsureMaintenanceTaskAsync(db, device, "phong_dien", pdVal,
                        "repair", 3,
                        $"PD = {pdVal:F1}dBm (vùng >-27 dBm) đã {pdDaysInZone:F0} ngày chưa xử lý — NETA: sửa ngay", ct);
            }

            // ── Step 2c: Rule penalty cho các điểm khác (không phải nhiệt & PD) ──
            // Giữ để xử lý sensor tùy chỉnh người dùng thêm vào rule engine
            var otherPoints = deviceReadings
                .Where(x => !tempPoints.Contains(x.PointId) && x.PointId != "phong_dien")
                .ToList();
            foreach (var rd in otherPoints)
            {
                if (!rd.Value.HasValue) continue;
                foreach (var rule in rules)
                    score -= CheckRulePenalty(rule, rd.PointId, rd.Value.Value);
            }

            // ── Step 3: Delta-T giữa 3 pha nhiệt ─────────────
            if (deviceTemps.Count >= 2)
            {
                var deltaT = deviceTemps.Max() - deviceTemps.Min();
                if (deltaT >= 15.0) score -= 20;
                else if (deltaT >= 10.0) score -= 10;
            }

            // ── Step 5: Load Correlation anomaly (early_warning OK ở đây) ──
            var loadCorrMarker = $"[EW:LOADCORR:{device.Id}]";
            if (allDeviceAlerts.Any(a =>
                a.Source == "early_warning" &&
                a.Message != null && a.Message.Contains(loadCorrMarker)))
                score -= 10;

            // ── Step 6: Offline penalty ───────────────────────
            if (device.Status == "offline") score -= 20;

            // ── Step 7: Tương quan kết hợp PD + Nhiệt độ ─────
            // Vật lý: PD cao → sinh nhiệt cục bộ → gia tốc lão hóa cách điện (vòng phản hồi dương)
            if (pdRd?.Value.HasValue == true && deviceTemps.Count > 0)
            {
                var pdV = pdRd.Value.Value;
                var maxT = deviceTemps.Max();
                if (pdV > -20 && maxT >= 50.0) score -= 15;  // cả 2 đều alarm
                else if (pdV > -27 && maxT >= 45.0) score -= 8;   // cả 2 đều warning
            }

            // ── Lưu kết quả ──────────────────────────────────
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
                alarmCount = allDeviceAlerts.Count(a => a.Level == "alarm"),
                warningCount = allDeviceAlerts.Count(a => a.Level == "warning"),
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

        // ── Persist zone state updates ────────────────────────
        foreach (var (key, stationId, value) in zoneUpdates)
        {
            var s = zoneSettings.FirstOrDefault(x => x.Key == key);
            if (s is not null)
            {
                s.Value = value;
                s.UpdatedAt = now;
            }
            else
            {
                db.SystemSettings.Add(new SystemSettings
                {
                    StationId = stationId,
                    Key = key,
                    Value = value,
                });
            }
        }

        await db.SaveChangesAsync(ct);
        _logger.LogInformation(
            "[HealthScore] Đã tính điểm {count} thiết bị (zone×time NETA 2023, no EW penalty)",
            devices.Count);
    }

    // ══════════════════════════════════════════════════════════
    // TrackZone — Theo dõi thời gian ở trong vùng
    //   - Nếu vẫn cùng zone → trả về số ngày đã ở (tích lũy)
    //   - Nếu zone thay đổi → reset timer, trả về 0
    //   - Ghi update vào zoneUpdates để persist sau
    // ══════════════════════════════════════════════════════════
    private static double TrackZone(
        string key, int currentZone, Guid stationId, DateTime now,
        Dictionary<string, SystemSettings> zoneDict,
        List<(string Key, Guid StationId, string Value)> zoneUpdates)
    {
        if (zoneDict.TryGetValue(key, out var existing))
        {
            try
            {
                var prev = JsonSerializer.Deserialize<ZoneStateDto>(existing.Value!);
                if (prev is not null && prev.Zone == currentZone)
                    return (now - prev.Since).TotalDays;  // Cùng zone → tích lũy thời gian
            }
            catch { }
        }

        // Zone đổi hoặc lần đầu tiên → reset timer
        var newState = JsonSerializer.Serialize(new ZoneStateDto(currentZone, now));
        zoneUpdates.Add((key, stationId, newState));
        return 0.0;
    }

    // ══════════════════════════════════════════════════════════
    // EnsureMaintenanceTask — Tạo task bảo trì nếu chưa có
    // ══════════════════════════════════════════════════════════
    private static async Task EnsureMaintenanceTaskAsync(
        AppDbContext db, Device device, string pointId, double value,
        string taskType, int daysUntil, string reason, CancellationToken ct)
    {
        var marker = $"[HEALTH_ZONE:{device.Id}:{pointId}]";
        var exists = await db.MaintenanceTasks.AnyAsync(t =>
            t.Notes != null && t.Notes.Contains(marker) &&
            (t.Status == "pending" || t.Status == "in_progress"), ct);
        if (exists) return;

        db.MaintenanceTasks.Add(new MaintenanceTask
        {
            StationId = device.StationId,
            DeviceId = device.Id,
            Title = $"[Sức khỏe] {device.Name} — {pointId} = {value:F1} kéo dài",
            Type = taskType,
            ScheduledDate = DateTime.UtcNow.AddDays(daysUntil),
            Status = "pending",
            Notes = $"Tự động tạo bởi HealthScoreWorker.\n{reason}\n{marker}",
        });
    }

    // ══════════════════════════════════════════════════════════
    // CheckRulePenalty — Cho các sensor không phải nhiệt & PD
    // ══════════════════════════════════════════════════════════
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
                ">" => currentValue > threshold,
                ">=" => currentValue >= threshold,
                "<" => currentValue < threshold,
                "<=" => currentValue <= threshold,
                "==" => Math.Abs(currentValue - threshold) < 0.001,
                _ => false,
            };
            if (!exceeded) return 0;

            var penalty = RuleEvaluator.ParseHealthPenalty(rule.Actions);
            if (penalty > 0) return penalty;

            if (!RuleEvaluator.HasAlertAction(rule.Actions)) return 0;
            var level = RuleEvaluator.ParseAlertLevel(rule.Actions);
            return level == "alarm" ? 25 : 10;
        }
        catch { return 0; }
    }

    // ── DTO để lưu zone state trong SystemSettings ────────────
    private record ZoneStateDto(int Zone, DateTime Since);
}
