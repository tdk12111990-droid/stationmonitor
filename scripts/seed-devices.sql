-- Script nạp thiết bị PLC và Camera vào Database
INSERT INTO "Devices" ("Id", "Name", "Type", "Config", "IsActive", "CreatedAt")
VALUES 
(
    'plc-station-01', 
    'PLC S7-1200 Trạm', 
    'plc_s7', 
    '{"ip": "192.168.10.100", "rack": 0, "slot": 1, "dbNumber": 1, "points": [{"offset": 0, "type": "real", "name": "Sensor 1"}, {"offset": 4, "type": "real", "name": "Sensor 2"}, {"offset": 8, "type": "real", "name": "Sensor 3"}, {"offset": 12, "type": "real", "name": "Sensor 4"}]}', 
    true, 
    NOW()
),
(
    'cam-thermal-01',
    'Camera Nhiệt 152',
    'hikvision_thermal',
    '{"ip": "192.168.10.152", "user": "admin", "pass": "Demo@2024"}',
    true,
    NOW()
)
ON CONFLICT ("Id") DO UPDATE 
SET "Config" = EXCLUDED."Config", "IsActive" = true;
