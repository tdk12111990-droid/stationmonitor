// ============================================================
// EarlyWarningTests — Kiểm tra logic phát hiện xu hướng tăng
// (Linear regression OLS slope)
// ============================================================
using Xunit;

namespace StationMonitor.Tests;

public class EarlyWarningTests
{
    // Hàm tính slope OLS — trích từ EarlyWarningWorker
    private static double ComputeSlope(List<(DateTime t, double v)> data)
    {
        if (data.Count < 2) return 0;
        var t0 = data[0].t;
        var xs = data.Select(d => (d.t - t0).TotalDays).ToArray();
        var ys = data.Select(d => d.v).ToArray();
        int n  = xs.Length;
        double sumX = xs.Sum(), sumY = ys.Sum();
        double sumXY = xs.Zip(ys, (x, y) => x * y).Sum();
        double sumX2 = xs.Sum(x => x * x);
        double denom = n * sumX2 - sumX * sumX;
        return denom == 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
    }

    [Fact]
    public void Slope_SteadyIncrease_DetectsRisingTrend()
    {
        // Nhiệt độ tăng 1°C mỗi ngày trong 7 ngày
        var data = Enumerable.Range(0, 7).Select(i =>
            (DateTime.UtcNow.AddDays(i), (double)(70 + i))
        ).ToList();

        var slope = ComputeSlope(data);
        Assert.True(slope > 0.5, $"Slope should be ~1°C/day but was {slope:F3}");
    }

    [Fact]
    public void Slope_StableData_NearZeroSlope()
    {
        // Nhiệt độ ổn định ~70°C
        var rng  = new Random(42);
        var data = Enumerable.Range(0, 7).Select(i =>
            (DateTime.UtcNow.AddDays(i), 70.0 + rng.NextDouble() * 0.2 - 0.1) // ±0.1°C noise
        ).ToList();

        var slope = ComputeSlope(data);
        Assert.True(Math.Abs(slope) < 0.1, $"Stable data slope should be ~0 but was {slope:F3}");
    }

    [Fact]
    public void Slope_DecreasingTemp_NegativeSlope()
    {
        // Nhiệt độ giảm sau khi sửa chữa
        var data = Enumerable.Range(0, 7).Select(i =>
            (DateTime.UtcNow.AddDays(i), (double)(85 - i * 2))
        ).ToList();

        var slope = ComputeSlope(data);
        Assert.True(slope < -0.5, $"Decreasing slope should be negative but was {slope:F3}");
    }

    [Fact]
    public void Slope_TwoPoints_CalculatesCorrectly()
    {
        // 2 điểm: 0°C → 10°C trong 10 ngày = slope 1°C/ngày
        var data = new List<(DateTime, double)>
        {
            (DateTime.UtcNow,             0.0),
            (DateTime.UtcNow.AddDays(10), 10.0),
        };
        var slope = ComputeSlope(data);
        Assert.Equal(1.0, slope, precision: 3);
    }

    [Fact]
    public void Slope_SinglePoint_ReturnsZero()
    {
        var data = new List<(DateTime, double)>
        {
            (DateTime.UtcNow, 75.0)
        };
        Assert.Equal(0.0, ComputeSlope(data));
    }

    [Theory]
    [InlineData(0.6,   "temp",  true)]   // > 0.5°C/day → trigger warning
    [InlineData(0.4,   "temp",  false)]  // <= 0.5°C/day → không trigger
    [InlineData(0.35,  "pd",    true)]   // > 0.3 dB/day → trigger
    [InlineData(0.25,  "pd",    false)]  // <= 0.3 dB/day → không trigger
    public void EarlyWarningThreshold_TriggerCondition(double slope, string type, bool expected)
    {
        bool triggered = type == "temp" ? slope > 0.5 : slope > 0.3;
        Assert.Equal(expected, triggered);
    }
}
