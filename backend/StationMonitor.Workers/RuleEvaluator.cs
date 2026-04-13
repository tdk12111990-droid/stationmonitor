// ============================================================
// RuleEvaluator — Logic đánh giá điều kiện rule (tách ra để test)
// ============================================================
using System.Text.Json;

namespace StationMonitor.Workers;

public static class RuleEvaluator
{
    public static bool Evaluate(double value, string op, double threshold) =>
        op switch
        {
            ">"  => value > threshold,
            "<"  => value < threshold,
            ">=" => value >= threshold,
            "<=" => value <= threshold,
            "==" => Math.Abs(value - threshold) < 0.001,
            _    => false
        };

    /// <summary>
    /// Ngưỡng phục hồi (hysteresis): ngược chiều so với trigger.
    /// Ví dụ trigger ">80" → clear khi "<= clearValue (77)"
    /// </summary>
    public static bool EvaluateClear(double value, string op, double clearValue) =>
        op switch
        {
            ">"  or ">=" => value <= clearValue,
            "<"  or "<=" => value >= clearValue,
            "==" => Math.Abs(value - clearValue) > 1.0,
            _    => false
        };

    /// <summary>Parse condition cơ bản → (pointId, op, threshold)</summary>
    public static (string point, string op, double value)? ParseCondition(string json)
    {
        try
        {
            var doc   = JsonDocument.Parse(json);
            var root  = doc.RootElement;
            var point = root.GetProperty("point").GetString() ?? "";
            var op    = root.GetProperty("op").GetString() ?? ">";
            var value = root.GetProperty("value").GetDouble();
            return (point, op, value);
        }
        catch { return null; }
    }

    /// <summary>
    /// Parse condition mở rộng gồm: clearValue, cooldownMin, confirmReadings
    /// Trả về null nếu JSON không hợp lệ.
    /// </summary>
    public static (string point, string op, double value,
                   double clearValue, int cooldownMin, int confirmReadings)?
        ParseConditionExtended(string json)
    {
        try
        {
            var doc  = JsonDocument.Parse(json);
            var root = doc.RootElement;

            var point   = root.GetProperty("point").GetString() ?? "";
            var op      = root.GetProperty("op").GetString() ?? ">";
            var value   = root.GetProperty("value").GetDouble();

            // Hysteresis: mặc định clearValue = value - 3% (hoặc -3°C với nhiệt)
            var clearValue = root.TryGetProperty("clearValue", out var cvEl)
                ? cvEl.GetDouble()
                : (op is ">" or ">=" ? value - 3.0 : value + 3.0);

            var cooldownMin = root.TryGetProperty("cooldownMin", out var cmEl)
                ? cmEl.GetInt32() : 5;

            var confirmReadings = root.TryGetProperty("confirmReadings", out var crEl)
                ? crEl.GetInt32() : 1;

            return (point, op, value, clearValue, cooldownMin, confirmReadings);
        }
        catch { return null; }
    }

    /// <summary>Parse JSON actions → level (warning | alarm)</summary>
    public static string ParseAlertLevel(string actionsJson)
    {
        try
        {
            var arr = JsonDocument.Parse(actionsJson).RootElement;
            foreach (var action in arr.EnumerateArray())
                if (action.TryGetProperty("level", out var lvl))
                    return lvl.GetString() ?? "warning";
        }
        catch { }
        return "warning";
    }

    /// <summary>
    /// Kiểm tra actions có chứa action type=alert không.
    /// Backward compat: action không có field "type" → coi như alert (rule cũ).
    /// </summary>
    public static bool HasAlertAction(string actionsJson)
    {
        try
        {
            var arr = JsonDocument.Parse(actionsJson).RootElement;
            foreach (var action in arr.EnumerateArray())
            {
                if (!action.TryGetProperty("type", out var t))
                    return true; // rule cũ, không có type → là alert
                if (t.GetString() == "alert")
                    return true;
            }
        }
        catch { }
        return false;
    }

    /// <summary>
    /// Lấy tổng health penalty từ actions có type=health.
    /// Trả về 0 nếu không có health action nào.
    /// </summary>
    public static double ParseHealthPenalty(string actionsJson)
    {
        try
        {
            var arr = JsonDocument.Parse(actionsJson).RootElement;
            double total = 0;
            foreach (var action in arr.EnumerateArray())
            {
                if (action.TryGetProperty("type", out var t) && t.GetString() == "health"
                    && action.TryGetProperty("penalty", out var p))
                    total += p.GetDouble();
            }
            return total;
        }
        catch { return 0; }
    }

    /// <summary>Kiểm tra actions có chứa action type=maintenance không.</summary>
    public static bool HasMaintenanceAction(string actionsJson)
    {
        try
        {
            var arr = JsonDocument.Parse(actionsJson).RootElement;
            foreach (var action in arr.EnumerateArray())
                if (action.TryGetProperty("type", out var t) && t.GetString() == "maintenance")
                    return true;
        }
        catch { }
        return false;
    }

    /// <summary>
    /// Parse maintenance action → (taskType, scheduledInDays).
    /// taskType: inspection | repair | cleaning | calibration
    /// scheduledInDays: số ngày từ hôm nay đến ngày lên lịch
    /// </summary>
    public static (string taskType, int scheduledInDays)? ParseMaintenanceAction(string actionsJson)
    {
        try
        {
            var arr = JsonDocument.Parse(actionsJson).RootElement;
            foreach (var action in arr.EnumerateArray())
            {
                if (!action.TryGetProperty("type", out var t) || t.GetString() != "maintenance") continue;
                var taskType = action.TryGetProperty("taskType", out var tt)
                    ? (tt.GetString() ?? "inspection") : "inspection";
                var days = action.TryGetProperty("scheduledInDays", out var d)
                    ? d.GetInt32() : 30;
                return (taskType, days);
            }
        }
        catch { }
        return null;
    }
}
