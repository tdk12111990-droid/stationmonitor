using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace StationMonitor.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddLicenseSystem : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Create LicenseKeys table
            migrationBuilder.CreateTable(
                name: "LicenseKeys",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Key = table.Column<string>(type: "text", nullable: false),
                    IssuedTo = table.Column<string>(type: "text", nullable: false),
                    MaxConcurrentSessions = table.Column<int>(type: "integer", nullable: false),
                    ExpiresAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LicenseKeys", x => x.Id);
                });

            // Create unique index on license key
            migrationBuilder.CreateIndex(
                name: "IX_LicenseKeys_Key",
                table: "LicenseKeys",
                column: "Key",
                unique: true);

            // Create ActiveSessions table
            migrationBuilder.CreateTable(
                name: "ActiveSessions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    LicenseKeyId = table.Column<Guid>(type: "uuid", nullable: false),
                    SessionToken = table.Column<string>(type: "text", nullable: false),
                    IpAddress = table.Column<string>(type: "text", nullable: true),
                    UserAgent = table.Column<string>(type: "text", nullable: true),
                    LoginAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    LastSeenAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ExpiresAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsRevoked = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ActiveSessions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ActiveSessions_LicenseKeys_LicenseKeyId",
                        column: x => x.LicenseKeyId,
                        principalTable: "LicenseKeys",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            // Create index on LicenseKeyId for query performance
            migrationBuilder.CreateIndex(
                name: "IX_ActiveSessions_LicenseKeyId",
                table: "ActiveSessions",
                column: "LicenseKeyId");

            // Create index on UserId for cleanup
            migrationBuilder.CreateIndex(
                name: "IX_ActiveSessions_UserId",
                table: "ActiveSessions",
                column: "UserId");

            // Seed default license key (1 concurrent session for demo)
            migrationBuilder.InsertData(
                table: "LicenseKeys",
                columns: new[] { "Id", "Key", "IssuedTo", "MaxConcurrentSessions", "ExpiresAt", "IsActive", "CreatedAt" },
                values: new object[] { new Guid("11111111-1111-1111-1111-111111111111"), "SM-DEMO-0000-FREE1", "Demo Account", 1, null, true, DateTime.UtcNow });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ActiveSessions");

            migrationBuilder.DropTable(
                name: "LicenseKeys");
        }
    }
}
