namespace StationMonitor.Data.Entities;

/// <summary>
/// License key for controlling concurrent user sessions.
/// A license key has a maximum concurrent sessions limit.
/// </summary>
public class LicenseKey
{
    public Guid Id { get; set; }

    /// <summary>
    /// License key string (e.g., "SM-2026-ABC1-PRO5")
    /// </summary>
    public string Key { get; set; } = string.Empty;

    /// <summary>
    /// Customer/organization name
    /// </summary>
    public string IssuedTo { get; set; } = string.Empty;

    /// <summary>
    /// Maximum concurrent sessions allowed (1, 5, 30, etc.)
    /// </summary>
    public int MaxConcurrentSessions { get; set; }

    /// <summary>
    /// License expiration date (null = never expires)
    /// </summary>
    public DateTime? ExpiresAt { get; set; }

    /// <summary>
    /// Whether the license is currently active
    /// </summary>
    public bool IsActive { get; set; } = true;

    /// <summary>
    /// Creation timestamp
    /// </summary>
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<ActiveSession> ActiveSessions { get; set; } = new List<ActiveSession>();
}
