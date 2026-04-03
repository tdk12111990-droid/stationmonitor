// ============================================================
// SensorService – Real-time sensor data từ backend
// TODO: kết nối SignalR WebSocket /ws/realtime khi backend sẵn sàng
// ============================================================

export interface SensorData {
    id: string;
    value: number;
    unit: string;
    status: 'normal' | 'error';
    timestamp: number;
}

export class SensorService extends EventTarget {
    private sensors: SensorData[] = [];

    // TODO: kết nối SignalR hub /ws/realtime
    // Hub sẽ push event 'sensorUpdate' với payload SensorData[]
    public startSimulation(): void {
        // no-op — chờ backend SignalR
    }

    public stopSimulation(): void {
        // no-op
    }

    // Gọi hàm này khi nhận được data từ SignalR
    public onRealtimeUpdate(data: SensorData[]): void {
        this.sensors = data;
        this.dispatchEvent(new CustomEvent('sensorUpdate', { detail: this.sensors }));
    }

    public getSensors(): SensorData[] {
        return [...this.sensors];
    }
}

export const sensorService = new SensorService();
