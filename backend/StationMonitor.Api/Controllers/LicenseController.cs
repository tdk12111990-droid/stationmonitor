// ============================================================
// LicenseController — Quản lý license key (admin only)
// Routes:
//   GET  /api/v1/licenses              — Danh sách license
//   POST /api/v1/licenses              — Tạo license mới
//   PUT  /api/v1/licenses/{id}         — Cập nhật license
//   GET  /api/v1/licenses/{id}/sessions — Xem active sessions
// ============================================================

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using StationMonitor.Data;
using StationMonitor.Data.Entities;

namespace StationMonitor.Api.Controllers;

[ApiController]
[Route("api/v1/licenses")]
[Authorize(Roles = "admin")]
public class LicenseController : ControllerBase
{
    private readonly AppDbContext _db;

    public LicenseController(AppDbContext db)
    {
        _db = db;
    }

    /// <summary>
    /// Danh sách tất cả license keys
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> GetLicenses()
    {
        var licenses = await _db.LicenseKeys
            .Select(l => new
            {
                l.Id,
                l.Key,
                l.IssuedTo,
                l.MaxConcurrentSessions,
                l.ExpiresAt,
                l.IsActive,
                l.CreatedAt
            })
            .ToListAsync();

        return Ok(licenses);
    }

    /// <summary>
    /// Tạo license key mới
    /// </summary>
    [HttpPost]
    public async Task<IActionResult> CreateLicense([FromBody] CreateLicenseRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Key))
            return BadRequest(new { message = "Key là bắt buộc" });

        // Kiểm tra duplicate key
        if (await _db.LicenseKeys.AnyAsync(l => l.Key == req.Key))
            return BadRequest(new { message = "License key đã tồn tại" });

        var license = new LicenseKey
        {
            Key = req.Key.ToUpper().Trim(),
            IssuedTo = req.IssuedTo ?? "Unknown",
            MaxConcurrentSessions = req.MaxConcurrentSessions,
            ExpiresAt = req.ExpiresAt,
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };

        _db.LicenseKeys.Add(license);
        await _db.SaveChangesAsync();

        return CreatedAtAction(nameof(GetLicense), new { id = license.Id }, license);
    }

    /// <summary>
    /// Lấy chi tiết 1 license
    /// </summary>
    [HttpGet("{id}")]
    public async Task<IActionResult> GetLicense(Guid id)
    {
        var license = await _db.LicenseKeys
            .FirstOrDefaultAsync(l => l.Id == id);

        if (license == null)
            return NotFound(new { message = "License không tồn tại" });

        return Ok(new
        {
            license.Id,
            license.Key,
            license.IssuedTo,
            license.MaxConcurrentSessions,
            license.ExpiresAt,
            license.IsActive,
            license.CreatedAt
        });
    }

    /// <summary>
    /// Cập nhật license (activate/deactivate, đổi limit)
    /// </summary>
    [HttpPut("{id}")]
    public async Task<IActionResult> UpdateLicense(Guid id, [FromBody] UpdateLicenseRequest req)
    {
        var license = await _db.LicenseKeys.FindAsync(id);
        if (license == null)
            return NotFound(new { message = "License không tồn tại" });

        if (req.IsActive.HasValue)
            license.IsActive = req.IsActive.Value;

        if (req.MaxConcurrentSessions.HasValue)
            license.MaxConcurrentSessions = req.MaxConcurrentSessions.Value;

        if (req.ExpiresAt.HasValue)
            license.ExpiresAt = req.ExpiresAt.Value;

        if (!string.IsNullOrEmpty(req.IssuedTo))
            license.IssuedTo = req.IssuedTo;

        await _db.SaveChangesAsync();

        return Ok(new { message = "Cập nhật thành công" });
    }

    /// <summary>
    /// Xem active sessions của 1 license
    /// </summary>
    [HttpGet("{id}/sessions")]
    public async Task<IActionResult> GetLicenseSessions(Guid id)
    {
        var license = await _db.LicenseKeys.FindAsync(id);
        if (license == null)
            return NotFound(new { message = "License không tồn tại" });

        var sessions = await _db.ActiveSessions
            .Where(s => s.LicenseKeyId == id && !s.IsRevoked && s.ExpiresAt > DateTime.UtcNow)
            .Select(s => new
            {
                s.Id,
                s.UserId,
                s.LoginAt,
                s.LastSeenAt,
                s.ExpiresAt,
                s.IpAddress
            })
            .ToListAsync();

        return Ok(new
        {
            licenseId = id,
            maxSessions = license.MaxConcurrentSessions,
            activeSessions = sessions.Count,
            sessions
        });
    }

    /// <summary>
    /// Revoke 1 session (kick user)
    /// </summary>
    [HttpPost("sessions/{sessionId}/revoke")]
    public async Task<IActionResult> RevokeSession(Guid sessionId)
    {
        var session = await _db.ActiveSessions.FindAsync(sessionId);
        if (session == null)
            return NotFound(new { message = "Session không tồn tại" });

        session.IsRevoked = true;
        await _db.SaveChangesAsync();

        return Ok(new { message = "Session đã bị revoke" });
    }
}

// ── Request Models ────────────────────────────────────────
public record CreateLicenseRequest(
    string Key,
    string? IssuedTo,
    int MaxConcurrentSessions,
    DateTime? ExpiresAt
);

public record UpdateLicenseRequest(
    string? IssuedTo,
    int? MaxConcurrentSessions,
    DateTime? ExpiresAt,
    bool? IsActive
);
