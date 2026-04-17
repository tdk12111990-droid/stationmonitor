// ============================================================
// Core App Types – Hệ thống Giám sát Phóng điện & Quá nhiệt
// Tất cả interfaces dùng chung cho toàn bộ Desktop App
// ============================================================

export type UserRole = 'admin' | 'manager' | 'operator';
export type AlarmLevel = 'WARNING' | 'CRITICAL' | 'FIRE_RISK';
export type AlarmStatus = 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED';
export type AlarmType = 'THERMAL' | 'PD' | 'ACOUSTIC' | 'SMOKE' | 'LIQUID' | 'SECURITY' | 'DEVICE_OFFLINE';
export type DeviceType = 'CAMERA_ACOUSTIC' | 'CAMERA_THERMAL' | 'SENSOR_PT100' | 'SENSOR_SMOKE' | 'SENSOR_LIQUID';
export type DeviceProtocol = 'RTSP' | 'MODBUS_TCP' | 'MODBUS_RTU';
export type DeviceStatus = 'ONLINE' | 'OFFLINE' | 'UNKNOWN';

export interface User {
    user_id: string;
    username: string;
    fullname: string;
    email: string;
    role: UserRole;
    active: boolean;
    created_at: string;
}

export interface Device {
    device_id: string;
    name: string;
    description: string;
    type: DeviceType;
    protocol: DeviceProtocol;
    address: string;           // IP address or Modbus address
    port?: number;
    warn_threshold: number;
    crit_threshold: number;
    unit: string;              // '°C', 'dB', 'ppm'
    map_x: number;            // % x position on CAD map
    map_y: number;            // % y position on CAD map
    status: DeviceStatus;
    last_seen?: string;        // ISO timestamp
}

export interface SensorReading {
    reading_id: string;
    device_id: string;
    value: number;
    unit: string;
    timestamp: string;         // ISO timestamp
}

export interface Alarm {
    alarm_id: string;
    device_id: string;
    device_name: string;
    alarm_type: AlarmType;
    level: AlarmLevel;
    value: number;
    unit: string;
    msg: string;
    time: string;             // ISO timestamp
    status: AlarmStatus;
    snapshot_url?: string;
    ack_by?: string;
    ack_note?: string;
    ack_at?: string;          // ISO timestamp
    resolved_at?: string;
}

export interface AckLog {
    log_id: string;
    alarm_id: string;
    username: string;
    action: string;           // 'ACKNOWLEDGED' | 'UPDATED' | 'RESOLVED'
    note?: string;
    timestamp: string;
}

export interface AuditLog {
    log_id: string;
    time: string;
    username: string;         // 'SYSTEM' for automated actions
    action_type: string;
    description: string;
    target_id?: string;
    ip_address?: string;
}

export interface MaintenanceTask {
    task_id: string;
    device_id: string;
    device_name: string;
    task_type: string;
    description: string;
    scheduled_date: string;
    assigned_to: string;
    status: 'PENDING' | 'IN_PROGRESS' | 'DONE';
    checklist: { item: string; done: boolean }[];
    ai_suggested?: boolean;
    ai_reason?: string;
}

export interface KpiSummary {
    max_temp: number;
    max_temp_device: string;
    pd_events_24h: number;
    devices_online: number;
    devices_total: number;
    active_alarms: number;
}

export interface SystemMetrics {
    cpu_percent: number;
    ram_used_gb: number;
    ram_total_gb: number;
    disk_used_gb: number;
    disk_total_gb: number;
    db_connected: boolean;
    cloud_connected: boolean;
    last_sync: string;
}

// Navigation page IDs used by the Router
export type PageId =
    | 'login'
    | 'dashboard'
    | 'realtime'
    | 'alert-detail'
    | 'alerts-history'
    | 'analytics'
    | 'reports'
    | 'device-management'
    | 'user-management'
    | 'settings'
    | 'audit-log'
    | 'maintenance'
    | 'multisite'
    | 'rule-engine';
