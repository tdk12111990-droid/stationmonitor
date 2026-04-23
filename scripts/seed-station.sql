-- Tạo trạm mặc định để tránh lỗi Foreign Key
INSERT INTO "Stations" ("Id", "Name", "Location", "IsActive", "CreatedAt")
VALUES ('station-01', 'Trạm DL380 HPE', 'HPE Server Room', true, NOW())
ON CONFLICT ("Id") DO NOTHING;

-- Cập nhật cấu hình hệ thống trỏ về trạm này
UPDATE "Devices" SET "StationId" = 'station-01' WHERE "StationId" IS NULL;
