using System.ComponentModel.DataAnnotations;

namespace StationMonitor.Data.Entities;

public class MediaFile
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid StationId { get; set; }
    public Guid? DeviceId { get; set; }
    public Guid? DetectionId { get; set; }
    public Guid? TakenBy { get; set; }
    [Required] public string FileType { get; set; } = string.Empty;  // image | video_clip | thermal_map
    [Required] public string Source { get; set; } = string.Empty;    // ai_detection | manual_snapshot | event_trigger
    [Required] public string Storage { get; set; } = "local";        // local | r2_cloud | both
    public string? FilePath { get; set; }
    public string? FileUrl { get; set; }
    public int? FileSizeKb { get; set; }
    public int? DurationS { get; set; }
    public DateTime CapturedAt { get; set; }
    public bool Synced { get; set; } = false;
    public DateTime? SyncedAt { get; set; }
}
