// ============================================================
// StationApiService — Gọi backend StationMonitor API
// Base: từ VITE_API_URL env var, mặc định http://localhost:5056/api/v1
// Tự động đính JWT từ localStorage vào mọi request
// ============================================================

import { authService } from './AuthService';
import { API_BASE_URL } from '@/utils/env';

const API_BASE = `${API_BASE_URL}/api/v1`;

export interface CameraDevice {
  id: string;
  name: string;
  type: string;       // camera_cctv | camera_thermal | camera_pd
  protocol: string;
  config: {
    ip?: string;
    rtsp_path?: string;
    go2rtc_id?: string;
  };
  status: string;     // online | offline
  stationId: string;
}

export interface SensorPoint {
  deviceId: string;
  pointId: string;    // nhiet_do_pha_1 | nhiet_do_pha_2 | nhiet_do_pha_3 | phong_dien
  value: number;
  predictedValue?: number; // [NEW] Thêm giá trị dự báo
  unit: string;
  quality: number;
  time: string;
}

async function apiFetch<T>(path: string): Promise<T> {
  const token = authService.getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  if (!res.ok) throw new Error(`API ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

export interface Device {
  id: string;
  name: string;
  type: string;
  protocol: string;
  config: Record<string, any>;
  status: string;
  stationId: string;
  createdAt: string;
}

export interface Station {
  id: string;
  name: string;
  code: string;
  status: string;
  location?: string;
  createdAt?: string;
}

async function apiMutate(method: string, path: string, body?: object): Promise<any> {
  const token = authService.getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || `${method} ${path} → ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

class StationApiService {
  // ── Stations ──────────────────────────────────────────────
  async getStations(): Promise<Station[]> {
    return apiFetch<Station[]>('/stations');
  }

  async getFirstStationId(): Promise<string | null> {
    const stations = await this.getStations();
    return stations[0]?.id ?? null;
  }

  async createStation(data: { name: string; code?: string; location?: string }): Promise<Station> {
    return apiMutate('POST', '/stations', data);
  }

  async updateStation(id: string, data: { name?: string; code?: string; location?: string; status?: string }): Promise<Station> {
    return apiMutate('PUT', `/stations/${id}`, data);
  }

  async deleteStation(id: string): Promise<void> {
    return apiMutate('DELETE', `/stations/${id}`);
  }

  // ── Devices ───────────────────────────────────────────────
  async getDevices(stationId: string, type?: string): Promise<Device[]> {
    const q = type ? `?type=${type}` : '';
    const raw = await apiFetch<any[]>(`/stations/${stationId}/devices${q}`);
    return raw.map(d => ({
      ...d,
      config: typeof d.config === 'string' ? JSON.parse(d.config) : (d.config ?? {})
    })) as Device[];
  }

  async createDevice(data: {
    stationId: string; name: string; type: string;
    protocol?: string; config?: string;
  }): Promise<Device> {
    return apiMutate('POST', '/devices', data);
  }

  async updateDevice(id: string, data: { name?: string; config?: string; status?: string }): Promise<Device> {
    return apiMutate('PUT', `/devices/${id}`, data);
  }

  async deleteDevice(id: string): Promise<void> {
    return apiMutate('DELETE', `/devices/${id}`);
  }

  async testConnection(id: string): Promise<{ success: boolean; message: string; latencyMs: number }> {
    return apiMutate('POST', `/devices/${id}/test`);
  }

  // ── Cameras (filter từ getDevices) ────────────────────────
  async getCameras(stationId: string): Promise<CameraDevice[]> {
    const devices = await this.getDevices(stationId, 'camera');
    return devices as CameraDevice[];
  }

  async getCamerasFromFirstStation(): Promise<CameraDevice[]> {
    const stations = await this.getStations();
    const first = stations[0];
    if (!first) return [];
    return this.getCameras(first.id);
  }

  // ── Sensors ───────────────────────────────────────────────
  async getLatestPoints(stationId?: string): Promise<SensorPoint[]> {
    const query = stationId ? `?stationId=${stationId}` : '';
    return apiFetch<SensorPoint[]>(`/points${query}`);
  }

  async getHistory(
    deviceId: string,
    pointId: string,
    from?: string,
    to?: string,
    limit = 500
  ): Promise<Array<{ time: string; value: number; predictedValue?: number; quality: number }>> {
    const params = new URLSearchParams({ deviceId, pointId, limit: String(limit) });
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    return apiFetch(`/history?${params}`);
  }

  // ── Rules ─────────────────────────────────────────────────
  async getRules(): Promise<Rule[]> {
    return apiFetch<Rule[]>('/rules');
  }

  async createRule(data: { name: string; ruleSet?: string; condition: string; actions?: string; enabled?: boolean; deviceId?: string }): Promise<Rule> {
    return apiMutate('POST', '/rules', data);
  }

  async updateRule(id: string, data: { name?: string; ruleSet?: string; condition?: string; actions?: string; enabled?: boolean }): Promise<Rule> {
    return apiMutate('PUT', `/rules/${id}`, data);
  }

  async deleteRule(id: string): Promise<void> {
    return apiMutate('DELETE', `/rules/${id}`);
  }

  async toggleRule(id: string): Promise<{ id: string; enabled: boolean }> {
    return apiMutate('PATCH', `/rules/${id}/toggle`, {});
  }

  // ── Alerts ────────────────────────────────────────────────
  async getAlerts(status?: string, from?: string, to?: string, limit = 10000, deviceId?: string): Promise<AlertItem[]> {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (deviceId) params.set('deviceId', deviceId);
    params.set('limit', String(limit));
    return apiFetch<AlertItem[]>(`/alerts?${params.toString()}`);
  }

  async ackAlert(id: string, note?: string): Promise<void> {
    return apiMutate('POST', `/alerts/${id}/ack`, { note });
  }

  async closeAlert(id: string): Promise<void> {
    return apiMutate('POST', `/alerts/${id}/close`);
  }

  async getAlertDetail(id: string): Promise<AlertItem & { history: AlertHistoryEntry[] }> {
    return apiFetch(`/alerts/${id}`);
  }

  // ── Logs ──────────────────────────────────────────────────
  async getAuditLogs(opts?: { action?: string; entityType?: string; from?: string; to?: string; limit?: number }): Promise<AuditLogEntry[]> {
    const params = new URLSearchParams({ limit: String(opts?.limit ?? 200) });
    if (opts?.action) params.set('action', opts.action);
    if (opts?.entityType) params.set('entityType', opts.entityType);
    if (opts?.from) params.set('from', opts.from);
    if (opts?.to) params.set('to', opts.to);
    return apiFetch(`/logs/audit?${params}`);
  }

  async getLoginLogs(opts?: { from?: string; to?: string; limit?: number }): Promise<LoginLogEntry[]> {
    const params = new URLSearchParams({ limit: String(opts?.limit ?? 200) });
    if (opts?.from) params.set('from', opts.from);
    if (opts?.to) params.set('to', opts.to);
    return apiFetch(`/logs/login?${params}`);
  }

  async getNotifyLogs(opts?: { from?: string; to?: string; status?: string; limit?: number }): Promise<any[]> {
    const params = new URLSearchParams({ limit: String(opts?.limit ?? 200) });
    if (opts?.from) params.set('from', opts.from);
    if (opts?.to) params.set('to', opts.to);
    if (opts?.status) params.set('status', opts.status);
    return apiFetch(`/logs/notify?${params}`);
  }

  // ── Users ─────────────────────────────────────────────────
  async getUsers(): Promise<UserItem[]> {
    return apiFetch<UserItem[]>('/users');
  }

  async createUser(data: {
    username: string; password: string;
    fullName?: string; email?: string; role?: string;
  }): Promise<UserItem> {
    return apiMutate('POST', '/users', data);
  }

  async updateUser(id: string, data: {
    fullName?: string; email?: string; role?: string; isActive?: boolean;
  }): Promise<UserItem> {
    return apiMutate('PUT', `/users/${id}`, data);
  }

  async changePassword(id: string, data: {
    oldPassword?: string; newPassword: string;
  }): Promise<{ message: string }> {
    return apiMutate('POST', `/users/${id}/change-password`, data);
  }

  async deactivateUser(id: string): Promise<{ message: string }> {
    return apiMutate('DELETE', `/users/${id}`);
  }

  // ── System Settings ───────────────────────────────────────
  async getSettings(): Promise<Record<string, string>> {
    return apiFetch<Record<string, string>>('/settings');
  }

  async updateSetting(key: string, value: string): Promise<{ key: string; value: string }> {
    return apiMutate('PUT', `/settings/${key}`, { value });
  }

  // ── SLD (Sơ đồ một sợi) ──────────────────────────────────
  async getSld(stationId: string): Promise<SldData> {
    return apiFetch<SldData>(`/sld/${stationId}`);
  }

  async uploadSldSvg(stationId: string, file: File): Promise<{ sldFileId: string; svgUrl: string; version: number }> {
    const token = authService.getToken();
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${API_BASE}/sld/${stationId}/upload`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
    if (!res.ok) { const err = await res.text(); throw new Error(err || `Upload failed ${res.status}`); }
    return res.json();
  }

  async addSldPoint(stationId: string, data: {
    deviceId?: string; x: number; y: number; r?: number; label?: string; pointId?: string;
  }): Promise<SldPoint> {
    return apiMutate('POST', `/sld/${stationId}/points`, data);
  }

  async updateSldPoint(id: string, data: {
    x?: number; y?: number; r?: number; label?: string;
  }): Promise<SldPoint> {
    return apiMutate('PUT', `/sld/points/${id}`, data);
  }

  async deleteSldPoint(id: string): Promise<void> {
    return apiMutate('DELETE', `/sld/points/${id}`);
  }

  // ── History Bulk (cho XLSX export) ───────────────────────
  async getHistoryBulk(
    stationId: string,
    from: string,
    to: string,
    intervalMinutes = 5,
    pointIds?: string[]
  ): Promise<Array<{ pointId: string; time: string; value: number }>> {
    const params = new URLSearchParams({ stationId, from, to, intervalMinutes: String(intervalMinutes) });
    if (pointIds?.length) params.set('pointIds', pointIds.join(','));
    return apiFetch(`/history/bulk?${params}`);
  }

  // ── Reports ───────────────────────────────────────────────
  async generateReport(data: {
    stationId: string; type: string; from: string; to: string;
  }): Promise<ReportItem> {
    return apiMutate('POST', '/reports/generate', {
      stationId: data.stationId,
      type: data.type,
      from: new Date(data.from).toISOString(),
      to: new Date(data.to).toISOString(),
    });
  }

  async getReports(stationId?: string): Promise<ReportItem[]> {
    const q = stationId ? `?stationId=${stationId}` : '';
    return apiFetch<ReportItem[]>(`/reports${q}`);
  }

  async deleteReport(id: string): Promise<void> {
    return apiMutate('DELETE', `/reports/${id}`);
  }

  async downloadReport(id: string): Promise<Blob> {
    const token = authService.getToken();
    const res = await fetch(`${API_BASE}/reports/${id}/download`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);
    return res.blob();
  }

  // ── Maintenance ───────────────────────────────────────────
  async getMaintenance(stationId?: string, status?: string, deviceId?: string): Promise<MaintenanceTask[]> {
    const params = new URLSearchParams();
    if (stationId) params.set('stationId', stationId);
    if (status) params.set('status', status);
    if (deviceId) params.set('deviceId', deviceId);
    const q = params.toString() ? `?${params}` : '';
    return apiFetch<MaintenanceTask[]>(`/maintenance${q}`);
  }

  async createMaintenance(data: {
    stationId: string;
    deviceId?: string;
    title: string;
    type: string;
    scheduledDate: string;
    assignedTo?: string;
    notes?: string;
    checklist?: string;
  }): Promise<MaintenanceTask> {
    return apiMutate('POST', '/maintenance', data);
  }

  async updateMaintenance(id: string, data: Partial<{
    title: string;
    type: string;
    scheduledDate: string;
    assignedTo: string;
    notes: string;
    checklist: string;
    status: string;
  }>): Promise<MaintenanceTask> {
    return apiMutate('PUT', `/maintenance/${id}`, data);
  }

  async deleteMaintenance(id: string): Promise<void> {
    return apiMutate('DELETE', `/maintenance/${id}`);
  }

  async startMaintenance(id: string): Promise<MaintenanceTask> {
    return apiMutate('POST', `/maintenance/${id}/start`, {});
  }

  async completeMaintenance(id: string, notes?: string): Promise<MaintenanceTask> {
    return apiMutate('POST', `/maintenance/${id}/complete`, { notes });
  }

  async createMaintenanceFromAlert(alertId: string): Promise<MaintenanceTask> {
    return apiMutate('POST', `/maintenance/from-alert/${alertId}`, {});
  }

  async getUpcomingMaintenance(stationId?: string, days?: number): Promise<MaintenanceTask[]> {
    const params = new URLSearchParams();
    if (stationId) params.set('stationId', stationId);
    if (days) params.set('days', String(days));
    const q = params.toString() ? `?${params}` : '';
    return apiFetch<MaintenanceTask[]>(`/maintenance/upcoming${q}`);
  }

  async getMaintenanceSuggestions(stationId?: string): Promise<MaintenanceSuggestion[]> {
    const q = stationId ? `?stationId=${stationId}` : '';
    return apiFetch<MaintenanceSuggestion[]>(`/maintenance/suggestions${q}`);
  }

  // ── Notifications ─────────────────────────────────────────
  async getSmtpConfig(): Promise<SmtpConfig> {
    return apiFetch<SmtpConfig>('/notifications/smtp-config');
  }

  async sendTestEmail(email: string): Promise<{ message: string }> {
    return apiMutate('POST', '/notifications/test-email', { email });
  }

  async getRuleTriggerLogs(params: { from?: string; to?: string; ruleId?: string; deviceId?: string; limit?: number }): Promise<any[]> {
    const p = new URLSearchParams();
    if (params.from) p.set('from', params.from);
    if (params.to) p.set('to', params.to);
    if (params.ruleId) p.set('ruleId', params.ruleId);
    if (params.deviceId) p.set('deviceId', params.deviceId);
    if (params.limit) p.set('limit', String(params.limit));
    return apiFetch(`/logs/rule-triggers?${p.toString()}`);
  }

  // ── Analytics ─────────────────────────────────────────────
  async getHealthScores(stationId?: string): Promise<HealthScore[]> {
    const q = stationId ? `?stationId=${stationId}` : '';
    return apiFetch<HealthScore[]>(`/analytics/health${q}`);
  }

  async getTrends(stationId?: string, days = 7): Promise<TrendItem[]> {
    const params = new URLSearchParams({ days: String(days) });
    if (stationId) params.set('stationId', stationId);
    return apiFetch<TrendItem[]>(`/analytics/trend?${params}`);
  }

  async recalculateHealth(deviceId?: string): Promise<{ message: string; clearedZones: number; clearedScores: number }> {
    const q = deviceId ? `?deviceId=${deviceId}` : '';
    return apiMutate('POST', `/analytics/health/recalculate${q}`);
  }

  // ── Cloud Sync ────────────────────────────────────────────
  async getSyncStatus(): Promise<SyncStatus> {
    return apiFetch<SyncStatus>('/sync/status');
  }

  async triggerSync(): Promise<{ message: string }> {
    return apiMutate('POST', '/sync/trigger');
  }

  // ── Camera Detections ─────────────────────────────────────
  async getDetections(query = ''): Promise<any[]> {
    return apiFetch<any[]>(`/detections${query ? '?' + query : ''}`);
  }
}

export interface Rule {
  id: string;
  name: string;
  ruleSet?: string;   // Tên bộ rule: "Tủ 471 — CBM"
  condition: string;  // JSON: { point, op, value }
  actions: string;    // JSON: [{ type, level }]
  enabled: boolean;
  deviceId?: string;
  deviceName?: string;
  createdAt: string;
}

export interface AlertItem {
  id: string;
  source: string;     // rule_engine | ai_detection | manual
  level: string;      // warning | alarm
  status: string;     // open | acked | closed
  message: string;
  value?: number;
  deviceId?: string;
  ruleId?: string;
  triggeredAt: string;
  ackedAt?: string;
  closedAt?: string;
  ackNote?: string;
  imageUrl?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
}

export interface AlertHistoryEntry {
  status: string;
  changedAt: string;
  note?: string;
  changedBy?: string;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  entityType?: string;
  entityId?: string;
  ipAddress?: string;
  ts: string;
  userId?: string;
  username?: string;
  fullName?: string;
  oldValue?: string | null;
  newValue?: string | null;
}

export interface LoginLogEntry {
  id: string;
  username?: string;
  action: string;
  ipAddress?: string;
  ts: string;
}

export interface UserItem {
  id: string;
  username: string;
  fullName?: string;
  email?: string;
  role: string;       // operator | manager | admin
  isActive: boolean;
  createdAt: string;
}

export interface SldPoint {
  id: string;
  pointId: string;
  label: string;
  x: number;
  y: number;
  r: number;
  deviceId?: string;
  deviceName?: string;
  deviceType?: string;
  deviceStatus?: string;
}

export interface SldUnpinnedDevice {
  id: string;
  name: string;
  type: string;
  status: string;
  sensorTag?: string; // Specific sensor for multi-point devices
}

export interface SldData {
  sldFileId?: string;
  svgUrl?: string;
  version: number;
  points: SldPoint[];
  unpinned: SldUnpinnedDevice[];
}

export interface ReportItem {
  id: string;
  stationId: string;
  type: string;           // daily | monthly | event
  periodFrom?: string;
  periodTo?: string;
  fileUrl?: string;
  generatedBy?: string;
  generatedAt: string;
}

export interface MaintenanceTask {
  id: string;
  stationId: string;
  deviceId?: string;
  deviceName?: string;
  title: string;
  type: string;       // inspection | repair | cleaning | calibration | other
  scheduledDate: string;
  assignedTo?: string;
  status: string;     // pending | in_progress | completed | overdue
  checklist?: string; // JSON string
  notes?: string;
  sourceAlertId?: string;
  createdAt: string;
  completedAt?: string;
}

export interface MaintenanceSuggestion {
  deviceId?: string;
  deviceName: string;
  reason: string;
  priority: string; // high | medium | low
  suggestedDate: string;
}

export interface SmtpConfig {
  host: string;
  port: string;
  username: string;
  hasPassword: boolean;
  from: string;
}

export interface HealthScore {
  deviceId: string;
  deviceName: string;
  deviceType: string;
  status: string;
  score: number;        // 0–100
  risk: string;         // good | fair | poor | critical
  ts?: string;
}

export interface TrendItem {
  deviceId: string;
  pointId: string;
  label: string;
  slopePerDay: number;
  trend: string;        // rising | falling | stable
  sampleCount: number;
  latestValue: number;
  unit: string;
}

export interface SyncStatus {
  isConfigured: boolean;
  pendingCount: number;
  sentCount: number;
  failedCount: number;
  lastSyncAt?: string;
  supabaseUrl?: string;
}

export const stationApi = new StationApiService();
