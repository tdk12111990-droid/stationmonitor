namespace StationMonitor.Data.Entities;

/// <summary>
/// Active user session tracked for concurrent session limit enforcement.
/// Each login creates an ActiveSession record.
/// </summary>
public class ActiveSession
{
    public Guid Id { get; set; }

    /// <summary>
    /// User ID (foreign key to Users table)
    /// </summary>
    public Guid UserId { get; set; }

    /// <summary>
    /// License key ID (foreign key to LicenseKeys table)
    /// </summary>
    public Guid LicenseKeyId { get; set; }

    /// <summary>
    /// JWT session token identifier (jti claim)
    /// Used to match with JWT claims for session validation
    /// </summary>
    public string SessionToken { get; set; } = string.Empty;

    /// <summary>
    /// IP address of the client (for audit/security)
    /// </summary>
    public string? IpAddress { get; set; }

    /// <summary>
    /// User agent string (for audit/security)
    /// </summary>
    public string? UserAgent { get; set; }

    /// <summary>
    /// When the session was created
    /// </summary>
    public DateTime LoginAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Last API request timestamp (heartbeat)
    /// Used to detect idle sessions
    /// </summary>
    public DateTime LastSeenAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Session expiration time (LoginAt + configured timeout, typically 8h)
    /// </summary>
    public DateTime ExpiresAt { get; set; }

    /// <summary>
    /// Whether the session has been explicitly revoked (logout)
    /// </summary>
    public bool IsRevoked { get; set; }

    public LicenseKey LicenseKey { get; set; } = null!;
}
