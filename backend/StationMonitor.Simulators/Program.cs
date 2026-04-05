// ============================================================
// StationMonitor.Simulators — Chạy giả lập thiết bị
// Dùng để test khi không có phần cứng thật
//
// Usage:
//   dotnet run -- modbus          # Modbus TCP server port 502
//   dotnet run -- mqtt            # MQTT publisher (cần mosquitto broker)
//   dotnet run -- iec104          # IEC-104 server port 2404
//   dotnet run -- all             # Tất cả (background)
// ============================================================

using StationMonitor.Simulators;

if (args.Length == 0 || args[0] == "help")
{
    Console.WriteLine("Usage: dotnet run -- <modbus|mqtt|iec104|all>");
    return;
}

using var cts = new CancellationTokenSource();
Console.CancelKeyPress += (_, e) => { e.Cancel = true; cts.Cancel(); };

var mode = args[0].ToLower();
Console.WriteLine($"[Simulator] Khởi động chế độ: {mode}");

var tasks = new List<Task>();

if (mode is "modbus" or "all")
    tasks.Add(ModbusTcpSimulator.RunAsync(port: 502, ct: cts.Token));

if (mode is "mqtt" or "all")
    tasks.Add(MqttSimulator.RunAsync(broker: "localhost", port: 1883, ct: cts.Token));

if (mode is "iec104" or "all")
    tasks.Add(Iec104Simulator.RunAsync(port: 2404, ct: cts.Token));

Console.WriteLine("[Simulator] Đang chạy... nhấn Ctrl+C để dừng");
await Task.WhenAll(tasks);
Console.WriteLine("[Simulator] Đã dừng");
