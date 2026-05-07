// ============================================================
// AuthService — Xử lý đăng nhập và tạo JWT token
// Dùng: BCrypt để hash/verify password
//        System.IdentityModel.Tokens.Jwt để tạo token
// Ghi: LoginLog mỗi lần đăng nhập thành công
// ============================================================

using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;
using StationMonitor.Data;
using StationMonitor.Data.Entities;

namespace StationMonitor.Services.Auth;

public class AuthService
{
    private readonly AppDbContext _db;
    private readonly IConfiguration _config;

    public AuthService(AppDbContext db, IConfiguration config)
    {
        _db = db;
        _config = config;
    }

    /// <summary>
    /// Đăng nhập: kiểm tra username/password + licenseKey → trả JWT + refreshToken
    /// Trả null nếu sai thông tin, tài khoản bị vô hiệu, hoặc license không hợp lệ
    /// Trả LoginException nếu vượt giới hạn concurrent sessions
    /// </summary>
    public async Task<LoginResult?> LoginAsync(string username, string password, string licenseKey)
    {
        // Tìm user active trong DB
        var user = await _db.Users
            .FirstOrDefaultAsync(u => u.Username == username && u.IsActive);

        // BCrypt.Verify so sánh password nhập với hash trong DB
        if (user == null || !BCrypt.Net.BCrypt.Verify(password, user.PasswordHash))
            return null;

        // Xác thực license key
        var license = await _db.LicenseKeys
            .FirstOrDefaultAsync(l => l.Key == licenseKey && l.IsActive);

        if (license == null)
            throw new InvalidOperationException("License key không hợp lệ hoặc không hoạt động");

        // Kiểm tra hết hạn
        if (license.ExpiresAt.HasValue && license.ExpiresAt.Value < DateTime.UtcNow)
            throw new InvalidOperationException("License key đã hết hạn");

        // Đếm active sessions cho license này (chưa revoke, chưa hết hạn)
        var activeSessions = await _db.ActiveSessions
            .Where(s => s.LicenseKeyId == license.Id
                     && !s.IsRevoked
                     && s.ExpiresAt > DateTime.UtcNow)
            .CountAsync();

        if (activeSessions >= license.MaxConcurrentSessions)
            throw new InvalidOperationException(
                $"Đã đạt giới hạn phiên đăng nhập ({activeSessions}/{license.MaxConcurrentSessions}). Vui lòng thử lại sau.");

        // Generate JWT với jti claim
        var jti = Guid.NewGuid().ToString();
        var token = GenerateJwt(user, jti);
        var refreshToken = GenerateRefreshToken();

        // Tạo ActiveSession record
        var sessionTimeout = int.TryParse(_config["License:SessionTimeoutMinutes"], out var timeout)
            ? timeout
            : 480; // Mặc định 8 giờ

        var activeSession = new ActiveSession
        {
            UserId = user.Id,
            LicenseKeyId = license.Id,
            SessionToken = jti,
            LoginAt = DateTime.UtcNow,
            LastSeenAt = DateTime.UtcNow,
            ExpiresAt = DateTime.UtcNow.AddMinutes(sessionTimeout),
            IsRevoked = false
        };
        _db.ActiveSessions.Add(activeSession);

        // Ghi log đăng nhập vào bảng LoginLogs
        _db.LoginLogs.Add(new LoginLog
        {
            UserId = user.Id,
            Username = user.Username,
            Action = "login"
        });
        await _db.SaveChangesAsync();

        return new LoginResult
        {
            Token = token,
            RefreshToken = refreshToken,
            User = user,
            LicenseInfo = new LicenseInfo
            {
                IssuedTo = license.IssuedTo,
                ExpiresAt = license.ExpiresAt,
                MaxSessions = license.MaxConcurrentSessions,
                SessionsInUse = activeSessions + 1
            }
        };
    }

    /// <summary>
    /// Tạo JWT token chứa: userId, username, role, fullName, jti
    /// Hết hạn sau ExpiryMinutes phút (config trong appsettings.json)
    /// </summary>
    public string GenerateJwt(User user, string jti = "")
    {
        var key = new SymmetricSecurityKey(
            Encoding.UTF8.GetBytes(_config["Jwt:Key"]!));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new List<Claim>
        {
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim(ClaimTypes.Name, user.Username),
            new Claim(ClaimTypes.Role, user.Role),
            new Claim("fullName", user.FullName ?? user.Username),
        };

        // Thêm jti claim nếu có (để track session)
        if (!string.IsNullOrEmpty(jti))
            claims.Add(new Claim(JwtRegisteredClaimNames.Jti, jti));

        var token = new JwtSecurityToken(
            issuer: _config["Jwt:Issuer"],
            audience: _config["Jwt:Audience"],
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(
                int.Parse(_config["Jwt:ExpiryMinutes"]!)),
            signingCredentials: creds);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    /// <summary>
    /// Tạo refresh token ngẫu nhiên 64 bytes (base64)
    /// TODO: lưu vào DB để validate khi refresh
    /// </summary>
    public static string GenerateRefreshToken()
    {
        var bytes = RandomNumberGenerator.GetBytes(64);
        return Convert.ToBase64String(bytes);
    }

    /// <summary>
    /// Seed tài khoản admin mặc định nếu bảng Users còn trống
    /// Chạy 1 lần khi khởi động lần đầu
    /// Tài khoản: admin / Admin@123
    /// </summary>
    public async Task SeedAdminIfNotExistsAsync()
    {
        if (!await _db.Users.AnyAsync())
        {
            _db.Users.Add(new User
            {
                Username = "admin",
                PasswordHash = BCrypt.Net.BCrypt.HashPassword("Admin@123"),
                FullName = "Quản trị viên",
                Email = "admin@stationmonitor.vn",
                Role = "admin",
                IsActive = true
            });
            await _db.SaveChangesAsync();
        }
    }
}

/// <summary>
/// Kết quả đăng nhập thành công kèm thông tin license
/// </summary>
public class LoginResult
{
    public string Token { get; set; } = string.Empty;
    public string RefreshToken { get; set; } = string.Empty;
    public User User { get; set; } = null!;
    public LicenseInfo LicenseInfo { get; set; } = null!;
}

/// <summary>
/// Thông tin license để hiển thị ở frontend
/// </summary>
public class LicenseInfo
{
    public string IssuedTo { get; set; } = string.Empty;
    public DateTime? ExpiresAt { get; set; }
    public int MaxSessions { get; set; }
    public int SessionsInUse { get; set; }
}
