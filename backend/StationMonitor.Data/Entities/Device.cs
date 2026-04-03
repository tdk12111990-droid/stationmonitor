using System.ComponentModel.DataAnnotations;

namespace StationMonitor.Data.Entities;

public class Device
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid StationId { get; set; }
    public Station? Station { get; set; }
    [Required] public string Name { get; set; } = string.Empty;
    [Required] public string Type { get; set; } = string.Empty; // plc_s7 | modbus | camera_thermal | camera_pd | camera_cctv
    public string? Protocol { get; set; } // snap7 | modbus_tcp | modbus_rtu | rtsp
    public string? Config { get; set; }   // JSONB: IP, port, DB address, register map
    public string Status { get; set; } = "online"; // online | offline | maintenance
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
