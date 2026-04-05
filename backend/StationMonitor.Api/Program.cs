// ============================================================
// Program.cs — Điểm khởi động ASP.NET Core API
// Phase 2: thêm SignalR, PlcPollingWorker, DeviceService
// ============================================================

using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Hangfire;
using Hangfire.PostgreSql;
using StationMonitor.Api.Hubs;
using StationMonitor.Api.Middleware;
using StationMonitor.Data;
using StationMonitor.Services;
using StationMonitor.Services.Auth;
using StationMonitor.Services.Camera;
using StationMonitor.Services.Devices;
using StationMonitor.Services.Reports;
using StationMonitor.Workers.Polling;

var builder = WebApplication.CreateBuilder(args);

// ── QuestPDF license ──────────────────────────────────────
QuestPDF.Settings.License = QuestPDF.Infrastructure.LicenseType.Community;

// ── Database ──────────────────────────────────────────────
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("Default")));

// ── Hangfire ──────────────────────────────────────────────
builder.Services.AddHangfire(config =>
    config.UsePostgreSqlStorage(c =>
        c.UseNpgsqlConnection(builder.Configuration.GetConnectionString("Default"))));
builder.Services.AddHangfireServer();

// ── Services ──────────────────────────────────────────────
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<EmailNotifyService>();
builder.Services.AddScoped<PermissionService>();
builder.Services.AddScoped<DeviceService>();
builder.Services.AddScoped<ReportGeneratorService>();
builder.Services.AddScoped<ReportSchedulerWorker>();
builder.Services.AddHttpClient(); // cho DeviceService gọi go2rtc API
builder.Services.AddSingleton<IRealtimeNotifier, SignalRNotifier>(); // SignalR push
builder.Services.AddScoped<OnvifService>();
builder.Services.AddScoped<HikvisionIsapiService>();
builder.Services.AddScoped<AutoDiscoveryService>();

// ── Background Workers ────────────────────────────────────
// PlcPollingWorker: đọc PLC S7 mỗi 3 giây
builder.Services.AddHostedService<PlcPollingWorker>();
// RuleEvaluationWorker: đánh giá rules mỗi 5 giây
builder.Services.AddHostedService<RuleEvaluationWorker>();
// MaintenanceReminderWorker: nhắc nhở lịch bảo trì mỗi 1 giờ
builder.Services.AddHostedService<MaintenanceReminderWorker>();
// EarlyWarningWorker: phát hiện xu hướng tăng bất thường (linear regression, mỗi 30 phút)
builder.Services.AddHostedService<EarlyWarningWorker>();
// HealthScoreWorker: tính điểm sức khỏe 0-100 mỗi thiết bị (mỗi 1 giờ)
builder.Services.AddHostedService<HealthScoreWorker>();
// StorageMonitorWorker: theo dõi dung lượng ổ đĩa, cảnh báo khi < 10%
builder.Services.AddHostedService<StorageMonitorWorker>();
// ModbusTcpWorker: đọc thiết bị Modbus TCP (FC3 holding registers)
builder.Services.AddHostedService<ModbusTcpWorker>();
// ModbusRtuWorker: đọc thiết bị Modbus RTU qua cổng serial
builder.Services.AddHostedService<ModbusRtuWorker>();
// MqttSubscriberWorker: nhận dữ liệu IoT qua MQTT broker
builder.Services.AddHostedService<MqttSubscriberWorker>();
// Iec104Worker: kết nối IEC 60870-5-104 (skeleton)
builder.Services.AddHostedService<Iec104Worker>();

// ── SignalR ───────────────────────────────────────────────
// Client kết nối: ws://localhost:5056/ws/realtime
builder.Services.AddSignalR();

// ── JWT Authentication ────────────────────────────────────
var jwtKey = builder.Configuration["Jwt:Key"]!;
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"],
            ValidAudience = builder.Configuration["Jwt:Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(jwtKey))
        };
        // SignalR cần đọc token từ query string
        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = ctx =>
            {
                var token = ctx.Request.Query["access_token"];
                if (!string.IsNullOrEmpty(token) &&
                    ctx.HttpContext.Request.Path.StartsWithSegments("/ws"))
                    ctx.Token = token;
                return Task.CompletedTask;
            }
        };
    });

builder.Services.AddAuthorization();
builder.Services.AddControllers();

// ── CORS ──────────────────────────────────────────────────
// AllowCredentials() bắt buộc để SignalR hoạt động
// → không được dùng AllowAnyOrigin() cùng AllowCredentials()
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
        policy.WithOrigins("http://localhost:5173", "http://localhost:5174", "http://localhost:4173")
              .AllowAnyMethod()
              .AllowAnyHeader()
              .AllowCredentials());
});

var app = builder.Build();

// Serve static files (SVG diagrams) từ wwwroot/
app.UseStaticFiles();

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.UseMiddleware<AuditMiddleware>(); // Ghi audit log tự động
app.MapControllers();

// SignalR endpoint
app.MapHub<RealtimeHub>("/ws/realtime");

// Hangfire dashboard (admin only in production)
app.UseHangfireDashboard("/hangfire");

// Đăng ký recurring job: tạo báo cáo ngày lúc 00:05 hàng ngày
RecurringJob.AddOrUpdate<ReportSchedulerWorker>(
    "daily-report",
    worker => worker.GenerateDailyAsync(),
    "5 0 * * *");  // 00:05 mỗi ngày

// ── Startup Tasks ─────────────────────────────────────────
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.Migrate();

    var authService = scope.ServiceProvider.GetRequiredService<AuthService>();
    await authService.SeedAdminIfNotExistsAsync();

    // Seed trạm + thiết bị mặc định nếu chưa có
    await SeedDefaultStationAsync(db);

    // Sync tất cả camera trong DB lên go2rtc (phòng khi go2rtc restart)
    var deviceService = scope.ServiceProvider.GetRequiredService<DeviceService>();
    var cameras = await db.Devices.Where(d => d.Type.StartsWith("camera")).ToListAsync();
    await deviceService.SyncAllCamerasToGo2RtcAsync(cameras);
}

app.Run();

// ── Seed trạm + thiết bị thật ────────────────────────────
static async Task SeedDefaultStationAsync(AppDbContext db)
{
    if (await db.Stations.AnyAsync()) return;

    // Tạo trạm mặc định
    var station = new StationMonitor.Data.Entities.Station
    {
        Name = "Trạm Biến Áp Chính",
        Code = "TBA-001",
        Location = """{"lat": 10.7769, "lng": 106.7009, "address": "TP.HCM"}""",
        Status = "active"
    };
    db.Stations.Add(station);
    await db.SaveChangesAsync();

    // Thiết bị 1: PLC S7-1200 (4 cảm biến nhiệt + PD)
    db.Devices.Add(new StationMonitor.Data.Entities.Device
    {
        StationId = station.Id,
        Name = "PLC S7-1200 – Cảm biến nhiệt & PD",
        Type = "plc_s7",
        Protocol = "snap7",
        Config = """{"ip":"192.168.10.100","rack":0,"slot":1,"db":32,"offset":0,"length":10}""",
        Status = "online"
    });

    // Thiết bị 2-4: 3 Camera Hikvision
    db.Devices.Add(new StationMonitor.Data.Entities.Device
    {
        StationId = station.Id,
        Name = "HIKVISION – Quan sát thường",
        Type = "camera_cctv",
        Protocol = "rtsp",
        Config = """{"ip":"192.168.10.152","rtsp_path":"/Streaming/Channels/101","go2rtc_id":"camera_152_normal"}""",
        Status = "online"
    });
    db.Devices.Add(new StationMonitor.Data.Entities.Device
    {
        StationId = station.Id,
        Name = "HIKVISION – Ảnh nhiệt",
        Type = "camera_thermal",
        Protocol = "rtsp",
        Config = """{"ip":"192.168.10.152","rtsp_path":"/Streaming/Channels/201","go2rtc_id":"camera_152_thermal"}""",
        Status = "online"
    });
    db.Devices.Add(new StationMonitor.Data.Entities.Device
    {
        StationId = station.Id,
        Name = "HIKVISION – Phóng điện",
        Type = "camera_pd",
        Protocol = "rtsp",
        Config = """{"ip":"192.168.10.153","rtsp_path":"/Streaming/Channels/101","go2rtc_id":"hikvision_main"}""",
        Status = "online"
    });

    await db.SaveChangesAsync();
}
