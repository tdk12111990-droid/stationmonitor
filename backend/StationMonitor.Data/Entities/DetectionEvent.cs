using System.ComponentModel.DataAnnotations;

namespace StationMonitor.Data.Entities;

public class DetectionEvent
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid CameraId { get; set; }
    public Device? Camera { get; set; }
    public Guid StationId { get; set; }
    public Guid? ModelVersionId { get; set; }
    public AiModelVersion? ModelVersion { get; set; }
    [Required] public string DetectionType { get; set; } = string.Empty; // thermal_hotspot | partial_discharge | intrusion
    public DateTime DetectedAt { get; set; }
    public float? Confidence { get; set; }
    public string? BoundingBoxes { get; set; } // JSONB: [{x,y,w,h,label,temp}]
    public float? MaxTemp { get; set; }
    public string? AffectedZone { get; set; }
    public Guid? AlertId { get; set; }
    public string? Metadata { get; set; } // JSONB
}
