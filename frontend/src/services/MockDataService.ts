// ============================================================
// MockDataService – Utility functions dùng chung toàn app
// Data thật sẽ đến từ ScadaApiService / backend REST API
// ============================================================

import type {
    Alarm, Device, AuditLog,
    MaintenanceTask, KpiSummary, SystemMetrics, User
} from '@/types/app.types';

// ── Các mảng này trước đây là mock, giờ để trống ──────────────
// Data thật load từ API: GET /api/v1/devices
export const MOCK_DEVICES: Device[] = [];

// Data thật load từ API: GET /api/v1/alerts
export const MOCK_ALARMS: Alarm[] = [];

// Data thật load từ API: GET /api/v1/logs/audit
export const MOCK_AUDIT_LOGS: AuditLog[] = [];

// Data thật load từ API: GET /api/v1/maintenance (TODO: thêm endpoint)
export const MOCK_MAINTENANCE: MaintenanceTask[] = [];

// Data thật load từ API: GET /api/v1/users
export const MOCK_USERS_LIST: User[] = [];

// ── KPI: sẽ tính từ data thật ─────────────────────────────────
// TODO: gọi GET /api/v1/stations/{id}/kpi
export function getKpiSummary(): KpiSummary {
    return {
        max_temp: 0,
        max_temp_device: '–',
        pd_events_24h: 0,
        devices_online: 0,
        devices_total: 0,
        active_alarms: 0,
    };
}

// ── System metrics: sẽ đến từ backend health endpoint ─────────
// TODO: gọi GET /api/v1/system/metrics
export function getSystemMetrics(): SystemMetrics {
    return {
        cpu_percent: 0,
        ram_used_gb: 0,
        ram_total_gb: 0,
        disk_used_gb: 0,
        disk_total_gb: 0,
        db_connected: false,
        cloud_connected: false,
        last_sync: '',
    };
}

// ── Utility functions (không phải mock data, giữ nguyên) ───────

export function timeAgo(isoStr: string): string {
    const diff = Date.now() - new Date(isoStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'vừa xong';
    if (mins < 60) return `${mins} phút trước`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} giờ trước`;
    const days = Math.floor(hrs / 24);
    return `${days} ngày trước`;
}

export function formatDateTime(isoStr?: string): string {
    if (!isoStr) return '–';
    const d = new Date(isoStr);
    return d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function alarmLevelColor(level: string): string {
    if (level === 'CRITICAL' || level === 'FIRE_RISK') return '#ef4444';
    if (level === 'WARNING') return '#f59e0b';
    return '#10b981';
}

export function alarmLevelLabel(level: string): string {
    const map: Record<string, string> = { 'CRITICAL': 'NGUY CẤP', 'WARNING': 'CẢNH BÁO', 'FIRE_RISK': 'NGUY CƠ CHÁY' };
    return map[level] ?? level;
}

export function alarmTypeLabel(type: string): string {
    const map: Record<string, string> = { 'THERMAL': '🌡 Quá nhiệt', 'PD': '⚡ Phóng điện', 'ACOUSTIC': '🔊 Âm thanh', 'SMOKE': '💨 Khói', 'LIQUID': '💧 Chất lỏng', 'SECURITY': '🔒 An ninh', 'DEVICE_OFFLINE': '📡 Mất kết nối' };
    return map[type] ?? type;
}

export function statusLabel(status: string): string {
    const map: Record<string, string> = { 'ACTIVE': 'Chưa xử lý', 'ACKNOWLEDGED': 'Đang xử lý', 'RESOLVED': 'Đã xử lý' };
    return map[status] ?? status;
}

export function statusColor(status: string): string {
    if (status === 'ACTIVE') return '#ef4444';
    if (status === 'ACKNOWLEDGED') return '#f59e0b';
    return '#10b981';
}
