// ============================================================
// RuleEvaluator — Logic đánh giá điều kiện rule (tách ra để test)
// ============================================================
using System.Text.Json;

namespace StationMonitor.Workers;

public static class RuleEvaluator
{
    /// <summary>
    /// Kiểm tra giá trị có thoả điều kiện không.
    /// </summary>
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
    /// Parse JSON condition → (pointId, operator, threshold).
    /// Trả về null nếu JSON không hợp lệ.
    /// </summary>
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
    /// Parse JSON actions → level (warning | alarm).
    /// </summary>
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
}
