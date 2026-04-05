// ============================================================
// HikvisionIsapiService — Điều khiển camera Hikvision qua ISAPI
// Endpoints: snapshot, PTZ, event stream, AI events
// ============================================================

using System.Text;
using System.Xml.Linq;
using Microsoft.Extensions.Logging;

namespace StationMonitor.Services.Camera;

public class HikvisionIsapiService
{
    private readonly ILogger<HikvisionIsapiService> _logger;
    private static readonly HttpClient _http = new() { Timeout = TimeSpan.FromSeconds(10) };

    public HikvisionIsapiService(ILogger<HikvisionIsapiService> logger) => _logger = logger;

    // ── Snapshot ──────────────────────────────────────────────

    /// <summary>Lấy snapshot JPEG từ camera Hikvision.</summary>
    public async Task<byte[]?> GetSnapshotAsync(string ip, string user, string pass, int channel = 1)
    {
        var url = $"http://{ip}/ISAPI/Streaming/channels/{channel}01/picture";
        try
        {
            var req  = BuildRequest(HttpMethod.Get, url, user, pass);
            var res  = await _http.SendAsync(req);
            if (!res.IsSuccessStatusCode) return null;
            return await res.Content.ReadAsByteArrayAsync();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "[Hikvision] Snapshot lỗi — {Ip}", ip);
            return null;
        }
    }

    // ── PTZ ───────────────────────────────────────────────────

    public enum PtzCommand { Left, Right, Up, Down, ZoomIn, ZoomOut, Stop }

    /// <summary>Gửi lệnh PTZ continuous move.</summary>
    public async Task<bool> PtzContinuousMoveAsync(
        string ip, string user, string pass,
        PtzCommand cmd, int speed = 4, int channel = 1)
    {
        var url  = $"http://{ip}/ISAPI/PTZCtrl/channels/{channel}/continuous";
        var body = BuildPtzBody(cmd, speed);
        try
        {
            var req = BuildRequest(HttpMethod.Put, url, user, pass);
            req.Content = new StringContent(body, Encoding.UTF8, "application/xml");
            var res = await _http.SendAsync(req);
            return res.IsSuccessStatusCode;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "[Hikvision] PTZ lỗi — {Ip} {Cmd}", ip, cmd);
            return false;
        }
    }

    // ── Device info ───────────────────────────────────────────

    public async Task<HikvisionDeviceInfo?> GetDeviceInfoAsync(string ip, string user, string pass)
    {
        var url = $"http://{ip}/ISAPI/System/deviceInfo";
        try
        {
            var req = BuildRequest(HttpMethod.Get, url, user, pass);
            var res = await _http.SendAsync(req);
            if (!res.IsSuccessStatusCode) return null;

            var xml = await res.Content.ReadAsStringAsync();
            return ParseDeviceInfo(xml);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "[Hikvision] GetDeviceInfo lỗi — {Ip}", ip);
            return null;
        }
    }

    // ── Alert/Event stream ─────────────────────────────────────

    /// <summary>
    /// Lắng nghe event stream từ camera (multipart MIME).
    /// Callback được gọi mỗi khi có event.
    /// </summary>
    public async Task ListenEventsAsync(
        string ip, string user, string pass,
        Func<string, Task> onEvent,
        CancellationToken ct)
    {
        var url = $"http://{ip}/ISAPI/Event/notification/alertStream";
        try
        {
            var req = BuildRequest(HttpMethod.Get, url, user, pass);
            req.Headers.Add("Accept", "multipart/x-mixed-replace");

            using var res    = await _http.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, ct);
            using var stream = await res.Content.ReadAsStreamAsync(ct);
            using var reader = new StreamReader(stream);

            var eventBuffer = new StringBuilder();
            while (!ct.IsCancellationRequested)
            {
                var line = await reader.ReadLineAsync(ct);
                if (line is null) break;

                if (line.StartsWith("--boundary") || line.StartsWith("--hikdata"))
                {
                    if (eventBuffer.Length > 0)
                    {
                        await onEvent(eventBuffer.ToString());
                        eventBuffer.Clear();
                    }
                }
                else
                {
                    eventBuffer.AppendLine(line);
                }
            }
        }
        catch (OperationCanceledException) { }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "[Hikvision] Event stream lỗi — {Ip}", ip);
        }
    }

    // ── Helpers ───────────────────────────────────────────────

    private static HttpRequestMessage BuildRequest(HttpMethod method, string url, string user, string pass)
    {
        var req   = new HttpRequestMessage(method, url);
        var creds = Convert.ToBase64String(Encoding.ASCII.GetBytes($"{user}:{pass}"));
        req.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Basic", creds);
        return req;
    }

    private static string BuildPtzBody(PtzCommand cmd, int speed)
    {
        var (pan, tilt, zoom) = cmd switch
        {
            PtzCommand.Left    => (-speed, 0, 0),
            PtzCommand.Right   => (speed,  0, 0),
            PtzCommand.Up      => (0,  speed, 0),
            PtzCommand.Down    => (0, -speed, 0),
            PtzCommand.ZoomIn  => (0, 0,  speed),
            PtzCommand.ZoomOut => (0, 0, -speed),
            _                  => (0, 0, 0),
        };
        return $@"<?xml version=""1.0"" encoding=""UTF-8""?>
<PTZData>
  <pan>{pan}</pan>
  <tilt>{tilt}</tilt>
  <zoom>{zoom}</zoom>
</PTZData>";
    }

    private static HikvisionDeviceInfo? ParseDeviceInfo(string xml)
    {
        try
        {
            var doc  = XDocument.Parse(xml);
            XNamespace ns = "http://www.hikvision.com/ver20/XMLSchema";
            return new HikvisionDeviceInfo
            {
                Model        = doc.Descendants(ns + "model").FirstOrDefault()?.Value
                            ?? doc.Descendants("model").FirstOrDefault()?.Value ?? "",
                SerialNumber = doc.Descendants(ns + "serialNumber").FirstOrDefault()?.Value
                            ?? doc.Descendants("serialNumber").FirstOrDefault()?.Value ?? "",
                FirmwareVersion = doc.Descendants(ns + "firmwareVersion").FirstOrDefault()?.Value
                            ?? doc.Descendants("firmwareVersion").FirstOrDefault()?.Value ?? "",
            };
        }
        catch { return null; }
    }
}

public class HikvisionDeviceInfo
{
    public string Model           { get; set; } = "";
    public string SerialNumber    { get; set; } = "";
    public string FirmwareVersion { get; set; } = "";
}
