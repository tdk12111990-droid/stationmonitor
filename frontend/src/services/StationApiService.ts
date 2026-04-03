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
}

export const stationApi = new StationApiService();
