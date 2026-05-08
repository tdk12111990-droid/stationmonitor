using Microsoft.EntityFrameworkCore;
using StationMonitor.Data.Entities;

namespace StationMonitor.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<Station> Stations => Set<Station>();
    public DbSet<Device> Devices => Set<Device>();
    public DbSet<User> Users => Set<User>();
    public DbSet<SldFile> SldFiles => Set<SldFile>();
    public DbSet<SldPoint> SldPoints => Set<SldPoint>();
    public DbSet<SensorReading> SensorReadings => Set<SensorReading>();
    public DbSet<AiModelVersion> AiModelVersions => Set<AiModelVersion>();
    public DbSet<DetectionEvent> DetectionEvents => Set<DetectionEvent>();
    public DbSet<MediaFile> MediaFiles => Set<MediaFile>();
    public DbSet<ThermalFrame> ThermalFrames => Set<ThermalFrame>();
    public DbSet<Alert> Alerts => Set<Alert>();
    public DbSet<AlertHistory> AlertHistories => Set<AlertHistory>();
    public DbSet<Rule> Rules => Set<Rule>();
    public DbSet<RuleTriggerLog> RuleTriggerLogs => Set<RuleTriggerLog>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<LoginLog> LoginLogs => Set<LoginLog>();
    public DbSet<NotifyLog> NotifyLogs => Set<NotifyLog>();
    public DbSet<SystemSettings> SystemSettings => Set<SystemSettings>();
    public DbSet<Report> Reports => Set<Report>();
    public DbSet<SyncQueue> SyncQueues => Set<SyncQueue>();
    public DbSet<MaintenanceTask> MaintenanceTasks => Set<MaintenanceTask>();
    public DbSet<LicenseKey> LicenseKeys => Set<LicenseKey>();
    public DbSet<ActiveSession> ActiveSessions => Set<ActiveSession>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // SensorReading — TimescaleDB hypertable (composite key: time + id)
        modelBuilder.Entity<SensorReading>(e =>
        {
            e.HasKey(x => new { x.Time, x.Id });
            e.Property(x => x.Id).ValueGeneratedOnAdd();
        });

        // SystemSettings — unique constraint (station_id, key)
        modelBuilder.Entity<SystemSettings>()
            .HasIndex(x => new { x.StationId, x.Key })
            .IsUnique();

        // LicenseKeys — seed default demo license
        modelBuilder.Entity<LicenseKey>().HasData(
            new LicenseKey
            {
                Id = new Guid("11111111-1111-1111-1111-111111111111"),
                Key = "SM-DEMO-0000-FREE1",
                IssuedTo = "Demo Account",
                MaxConcurrentSessions = 1,
                ExpiresAt = null,
                IsActive = true,
                CreatedAt = DateTime.UtcNow
            }
        );

        // JSON columns (PostgreSQL JSONB)
        modelBuilder.Entity<Station>().Property(x => x.Location).HasColumnType("jsonb");
        modelBuilder.Entity<Device>().Property(x => x.Config).HasColumnType("jsonb");
        modelBuilder.Entity<Rule>().Property(x => x.Condition).HasColumnType("jsonb");
        modelBuilder.Entity<Rule>().Property(x => x.Actions).HasColumnType("jsonb");
        modelBuilder.Entity<DetectionEvent>().Property(x => x.BoundingBoxes).HasColumnType("jsonb");
        modelBuilder.Entity<DetectionEvent>().Property(x => x.Metadata).HasColumnType("jsonb");
        modelBuilder.Entity<ThermalFrame>().Property(x => x.TempMatrix).HasColumnType("jsonb");
        modelBuilder.Entity<AuditLog>().Property(x => x.OldValue).HasColumnType("jsonb");
        modelBuilder.Entity<AuditLog>().Property(x => x.NewValue).HasColumnType("jsonb");
        modelBuilder.Entity<SyncQueue>().Property(x => x.Payload).HasColumnType("jsonb");
        modelBuilder.Entity<SystemSettings>().Property(x => x.Value).HasColumnType("jsonb");
        modelBuilder.Entity<RuleTriggerLog>().Property(x => x.ConditionSnapshot).HasColumnType("jsonb");
        modelBuilder.Entity<MaintenanceTask>().Property(x => x.Checklist).HasColumnType("jsonb");
    }
}
