// ============================================================
// StationApiService — Gọi backend StationMonitor API
// Base: http://localhost:5056/api/v1
// Tự động đính JWT từ localStorage vào mọi request
// ============================================================

import { authService } from './AuthService';

const API_BASE = 'http://localhost:5056/api/v1';

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
  ): Promise<Array<{ time: string; value: number; quality: number }>> {
    const params = new URLSearchParams({ deviceId, pointId, limit: String(limit) });
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    return apiFetch(`/history?${params}`);
  }

  // ── Rules ─────────────────────────────────────────────────
  async getRules(): Promise<Rule[]> {
    return apiFetch<Rule[]>('/rules');
  }

  async createRule(data: { name: string; condition: string; actions?: string; enabled?: boolean; deviceId?: string }): Promise<Rule> {
    return apiMutate('POST', '/rules', data);
  }

  async updateRule(id: string, data: { name?: string; condition?: string; actions?: string; enabled?: boolean }): Promise<Rule> {
    return apiMutate('PUT', `/rules/${id}`, data);
  }

  async deleteRule(id: string): Promise<void> {
    return apiMutate('DELETE', `/rules/${id}`);
  }

  // ── Alerts ────────────────────────────────────────────────
  async getAlerts(status?: string, limit = 100): Promise<AlertItem[]> {
    const q = status ? `?status=${status}&limit=${limit}` : `?limit=${limit}`;
    return apiFetch<AlertItem[]>(`/alerts${q}`);
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
  async getAuditLogs(action?: string, entityType?: string, limit = 100): Promise<AuditLogEntry[]> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (action) params.set('action', action);
    if (entityType) params.set('entityType', entityType);
    return apiFetch(`/logs/audit?${params}`);
  }

  async getLoginLogs(limit = 100): Promise<LoginLogEntry[]> {
    return apiFetch(`/logs/login?limit=${limit}`);
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
}

export interface Rule {
  id: string;
  name: string;
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

export const stationApi = new StationApiService();
