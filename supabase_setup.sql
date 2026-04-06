-- ============================================================
-- Supabase Setup Script — StationMonitor Phase 10
-- Chạy trong Supabase Dashboard → SQL Editor
-- ============================================================

-- Bảng alerts (sync từ trạm lên)
CREATE TABLE IF NOT EXISTS alerts (
  id            uuid PRIMARY KEY,
  station_id    uuid,
  device_id     uuid,
  rule_id       uuid,
  source        text,
  level         text,         -- warning | alarm
  status        text,         -- open | acked | closed
  message       text,
  value         float8,
  triggered_at  timestamptz,
  acked_at      timestamptz,
  closed_at     timestamptz,
  synced_at     timestamptz DEFAULT now()
);

-- Bảng maintenance_tasks (sync từ trạm lên)
CREATE TABLE IF NOT EXISTS maintenance_tasks (
  id            uuid PRIMARY KEY,
  station_id    uuid,
  device_id     uuid,
  title         text,
  type          text,
  status        text,         -- pending | in_progress | completed | overdue
  priority      text,
  scheduled_date timestamptz,
  completed_at  timestamptz,
  notes         text,
  synced_at     timestamptz DEFAULT now()
);

-- Enable Row Level Security (mobile app dùng anon key chỉ đọc được)
ALTER TABLE alerts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_tasks ENABLE ROW LEVEL SECURITY;

-- Policy: anon key chỉ được SELECT (đọc)
CREATE POLICY "anon read alerts"
  ON alerts FOR SELECT TO anon USING (true);

CREATE POLICY "anon read maintenance"
  ON maintenance_tasks FOR SELECT TO anon USING (true);

-- Policy: service_role (backend) được INSERT/UPDATE
CREATE POLICY "service insert alerts"
  ON alerts FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "service update alerts"
  ON alerts FOR UPDATE TO service_role USING (true);

CREATE POLICY "service insert maintenance"
  ON maintenance_tasks FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "service update maintenance"
  ON maintenance_tasks FOR UPDATE TO service_role USING (true);
