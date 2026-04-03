// ============================================================
// AuthController — REST API xác thực người dùng
// Routes:
//   POST /api/v1/auth/login   — Đăng nhập → JWT
//   POST /api/v1/auth/refresh — Refresh token (TODO)
//   GET  /api/v1/auth/me      — Thông tin user hiện tại (cần JWT)
// ============================================================

using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using StationMonitor.Services.Auth;

namespace StationMonitor.Api.Controllers;

[ApiController]
[Route("api/v1/auth")]
public class AuthController : ControllerBase
{
    private readonly AuthService _auth;

    public AuthController(AuthService auth)
    {
        _auth = auth;
    }

    /// <summary>
    /// Đăng nhập bằng username/password
    /// Trả về: JWT token, refresh token, thông tin user
    /// Lỗi 401: sai thông tin hoặc tài khoản bị khóa
    /// </summary>
    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest req)
    {
        var result = await _auth.LoginAsync(req.Username, req.Password);
        if (result == null)
            return Unauthorized(new { message = "Tên đăng nhập hoặc mật khẩu không đúng" });

        var (token, refreshToken, user) = result.Value;
        return Ok(new
        {
            token,
            refreshToken,
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
    /// Refresh JWT token bằng refresh token
    /// TODO: implement refresh token store trong DB
    /// </summary>
    [HttpPost("refresh")]
    public IActionResult Refresh([FromBody] RefreshRequest req)
    {
        return BadRequest(new { message = "Refresh token chưa được triển khai" });
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
}

// ── Request Models ────────────────────────────────────────
public record LoginRequest(string Username, string Password);
public record RefreshRequest(string RefreshToken);
