// ============================================================
// ScadaApiService – Tầng gọi API Backend .NET (local LAN)
// ============================================================

import { API_BASE_URL as ENV_API_BASE } from '@/utils/env';

export const API_BASE_URL = ENV_API_BASE;

const DEFAULT_HEADERS: HeadersInit = {
  'Content-Type': 'application/json',
};

// ── Types ──────────────────────────────────────────────────

export interface ScadaArea {
  id: string;
  name: string;
  imagePath: string;
}

export interface ScadaPoint {
  id: string;
  type: 'Camera' | 'Sensor';
  name: string;
  status: 'Normal' | 'Warning' | 'Alarm';
  ipAddress: string;
  positionX: number;
  positionY: number;
  additionalProperties?: {
    currentValue: number;
    measureUnit: string;
    description?: string;
    camFolder?: string;
    camNode?: string;
    camOnvif?: string;
  };
}

// ── Internal fetch helper ──────────────────────────────────

async function fetchJson<T>(path: string, token?: string): Promise<T> {
  const headers: HeadersInit = { ...DEFAULT_HEADERS };
  if (token) (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE_URL}/api${path}`, { headers });
  if (!res.ok) throw new Error(`ScadaAPI Error: ${res.status} on ${path}`);
  return res.json() as Promise<T>;
}

// ── Public API ─────────────────────────────────────────────

export const scadaApi = {
  getAreas: (token?: string): Promise<ScadaArea[]> => fetchJson<ScadaArea[]>('/areas', token),
  getPoints: (token?: string): Promise<ScadaPoint[]> => fetchJson<ScadaPoint[]>('/points', token),
};
