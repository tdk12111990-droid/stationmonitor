// ============================================================
// AuthController — REST API xác thực người dùng
// Routes:
//   POST /api/v1/auth/login   — Đăng nhập → JWT (8h)
//   POST /api/v1/auth/refresh — Refresh token
//   GET  /api/v1/auth/me      — Thông tin user hiện tại (cần JWT)
// ============================================================

using System.Security.Claims;
using System.IdentityModel.Tokens.Jwt;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using StationMonitor.Data;
using StationMonitor.Data.Entities;
using StationMonitor.Services.Auth;

namespace StationMonitor.Api.Controllers;

[ApiController]
[Route("api/v1/auth")]
public class AuthController : ControllerBase
{
    private readonly AuthService _auth;
    private readonly AppDbContext _db;

    public AuthController(AuthService auth, AppDbContext db)
    {
        _auth = auth;
        _db = db;
    }

    /// <summary>
    /// Đăng nhập bằng username/password/licenseKey
    /// Trả về: JWT token, refresh token, thông tin user, thông tin license
    /// Lỗi 401: sai thông tin hoặc tài khoản bị khóa
    /// Lỗi 403: license key không hợp lệ, hết hạn, hoặc đạt giới hạn session
    /// </summary>
    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest req)
    {
        try
        {
            var result = await _auth.LoginAsync(req.Username, req.Password, req.LicenseKey);
            if (result == null)
                return Unauthorized(new { message = "Tên đăng nhập hoặc mật khẩu không đúng" });

            var user = result.User;

            // Lưu refresh token vào SystemSettings (đơn giản, không cần bảng riêng)
            await SaveRefreshTokenAsync(user.Id, result.RefreshToken);

            return Ok(new
            {
                token = result.Token,
                refreshToken = result.RefreshToken,
                user = new
                {
                    id = user.Id,
                    username = user.Username,
                    fullName = user.FullName,
                    role = user.Role,
                    email = user.Email
                },
                licenseInfo = result.LicenseInfo
            });
        }
        catch (InvalidOperationException ex)
        {
            return StatusCode(403, new { message = ex.Message });
        }
    }

    /// <summary>
    /// Refresh JWT token bằng refresh token
    /// Nhận: { refreshToken: string }
    /// Trả về: JWT mới + refresh token mới
    /// </summary>
    [HttpPost("refresh")]
    public async Task<IActionResult> Refresh([FromBody] RefreshRequest req)
    {
        if (string.IsNullOrEmpty(req.RefreshToken))
            return BadRequest(new { message = "Thiếu refresh token" });

        // Tìm user có refresh token này trong SystemSettings (key: refresh_token_{userId})
        var settings = await _db.SystemSettings
            .Where(s => s.Key.StartsWith("refresh_token_"))
            .ToListAsync();

        // Unwrap JSON value
        static string UnwrapJson(string val)
        {
            if (val.StartsWith("\"") && val.EndsWith("\"") && val.Length >= 2)
                return val[1..^1];
            return val;
        }

        var match = settings.FirstOrDefault(s => UnwrapJson(s.Value) == req.RefreshToken);
        if (match == null)
            return Unauthorized(new { message = "Refresh token không hợp lệ hoặc đã hết hạn" });

        var user = await _db.Users.FindAsync(match.UpdatedBy);
        if (user == null || !user.IsActive)
            return Unauthorized(new { message = "Tài khoản không tồn tại hoặc bị vô hiệu hóa" });

        // Issue new tokens
        var newToken = _auth.GenerateJwt(user);
        var newRefreshToken = AuthService.GenerateRefreshToken();
        await SaveRefreshTokenAsync(user.Id, newRefreshToken);

        return Ok(new
        {
            token = newToken,
            refreshToken = newRefreshToken,
            user = new
            {
                id = user.Id,
                username = user.Username,
                fullName = user.FullName,
                role = user.Role,
                email = user.Email
            }
        });
    }

    /// <summary>
    /// Lấy thông tin user hiện tại từ JWT token
    /// Yêu cầu: Header Authorization: Bearer {token}
    /// </summary>
    [Authorize]
    [HttpGet("me")]
    public IActionResult Me()
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        var username = User.FindFirstValue(ClaimTypes.Name);
        var role = User.FindFirstValue(ClaimTypes.Role);
        var fullName = User.FindFirstValue("fullName");

        return Ok(new { userId, username, role, fullName });
    }

    /// <summary>
    /// Đăng xuất: revoke session
    /// Yêu cầu: Header Authorization: Bearer {token}
    /// </summary>
    [Authorize]
    [HttpPost("logout")]
    public async Task<IActionResult> Logout()
    {
        var jti = User.FindFirstValue(JwtRegisteredClaimNames.Jti);
        if (string.IsNullOrEmpty(jti))
            return BadRequest(new { message = "Không thể xác định session" });

        // Đánh dấu session là revoked
        var session = await _db.ActiveSessions
            .FirstOrDefaultAsync(s => s.SessionToken == jti);

        if (session != null)
        {
            session.IsRevoked = true;
            await _db.SaveChangesAsync();
        }

        return Ok(new { message = "Đăng xuất thành công" });
    }

    // ── Helpers ──────────────────────────────────────────────
    private async Task SaveRefreshTokenAsync(Guid userId, string token)
    {
        // Lưu refresh token trong SystemSettings với key riêng mỗi user
        // Dùng station ID thật để không vi phạm FK constraint
        var station = await _db.Stations.FirstOrDefaultAsync();
        if (station == null) return; // Chưa có station — bỏ qua

        var key = $"refresh_token_{userId}";
        var jsonValue = System.Text.Json.JsonSerializer.Serialize(token);

        var existing = await _db.SystemSettings
            .FirstOrDefaultAsync(s => s.StationId == station.Id && s.Key == key);

        if (existing == null)
        {
            _db.SystemSettings.Add(new SystemSettings
            {
                StationId = station.Id,
                Key       = key,
                Value     = jsonValue,
                UpdatedBy = userId,
                UpdatedAt = DateTime.UtcNow
            });
        }
        else
        {
            existing.Value     = jsonValue;
            existing.UpdatedBy = userId;
            existing.UpdatedAt = DateTime.UtcNow;
        }

        await _db.SaveChangesAsync();
    }
}

// ── Request Models ────────────────────────────────────────
public record LoginRequest(string Username, string Password, string LicenseKey);
public record RefreshRequest(string RefreshToken);
