const DB_NAME = 'worldmonitor_db';
const DB_VERSION = 3; // v3: Added scada_history store

interface BaselineEntry {
  key: string;
  counts: number[];
  timestamps: number[];
  avg7d: number;
  avg30d: number;
  lastUpdated: number;
}

let db: IDBDatabase | null = null;

export async function initDB(): Promise<IDBDatabase> {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);

    request.onsuccess = () => {
      db = request.result;
      db.onclose = () => { db = null; };
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;

      if (!database.objectStoreNames.contains('baselines')) {
        database.createObjectStore('baselines', { keyPath: 'key' });
      }

      if (!database.objectStoreNames.contains('snapshots')) {
        const store = database.createObjectStore('snapshots', { keyPath: 'timestamp' });
        store.createIndex('by_time', 'timestamp');
      }

      // v2: SCADA real-time data stores
      if (!database.objectStoreNames.contains('scada_points')) {
        database.createObjectStore('scada_points', { keyPath: 'id' });
      }

      if (!database.objectStoreNames.contains('scada_events')) {
        const evtStore = database.createObjectStore('scada_events', { keyPath: 'eventId' });
        evtStore.createIndex('by_time', 'timestamp');
        evtStore.createIndex('by_device', 'deviceId');
      }

      // v3: SCADA historical data (log every N seconds)
      if (!database.objectStoreNames.contains('scada_history')) {
        const histStore = database.createObjectStore('scada_history', { keyPath: 'id', autoIncrement: true });
        histStore.createIndex('by_time', 'timestamp');
        histStore.createIndex('by_device', 'deviceId');
        histStore.createIndex('by_device_time', ['deviceId', 'timestamp']);
      }
    };
  });
}

async function withTransaction<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore, tx: IDBTransaction) => IDBRequest | void,
  extractResult?: boolean,
): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const database = await initDB();
      return await new Promise<T>((resolve, reject) => {
        const tx = database.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        const request = fn(store, tx);
        if (request && extractResult !== false) {
          request.onsuccess = () => resolve(request.result as T);
          request.onerror = () => reject(request.error);
        } else {
          tx.oncomplete = () => resolve(undefined as T);
          tx.onerror = () => reject(tx.error);
        }
      });
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'InvalidStateError') {
        db = null;
        if (attempt === 0) continue;
        console.warn('[Storage] IndexedDB connection closing after retry');
        if (mode === 'readwrite') throw new DOMException('IndexedDB write failed — connection closing', 'InvalidStateError');
        return undefined as T;
      }
      throw err;
    }
  }
  throw new Error('IndexedDB transaction failed after retry');
}

export async function getBaseline(key: string): Promise<BaselineEntry | null> {
  const result = await withTransaction<BaselineEntry | undefined>(
    'baselines', 'readonly', (store) => store.get(key), true,
  );
  return result || null;
}

export async function updateBaseline(key: string, currentCount: number): Promise<BaselineEntry> {
  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;

  let entry = await getBaseline(key);

  if (!entry) {
    entry = {
      key,
      counts: [currentCount],
      timestamps: [now],
      avg7d: currentCount,
      avg30d: currentCount,
      lastUpdated: now,
    };
  } else {
    entry.counts.push(currentCount);
    entry.timestamps.push(now);

    const cutoff30d = now - 30 * DAY_MS;
    const validIndices = entry.timestamps
      .map((t, i) => (t > cutoff30d ? i : -1))
      .filter(i => i >= 0);

    entry.counts = validIndices.map(i => entry!.counts[i]!);
    entry.timestamps = validIndices.map(i => entry!.timestamps[i]!);

    const cutoff7d = now - 7 * DAY_MS;
    const last7dCounts = entry.counts.filter((_, i) => entry!.timestamps[i]! > cutoff7d);

    entry.avg7d = last7dCounts.length > 0
      ? last7dCounts.reduce((a, b) => a + b, 0) / last7dCounts.length
      : currentCount;

    entry.avg30d = entry.counts.length > 0
      ? entry.counts.reduce((a, b) => a + b, 0) / entry.counts.length
      : currentCount;

    entry.lastUpdated = now;
  }

  await withTransaction<void>(
    'baselines', 'readwrite', (store) => { store.put(entry); }, false,
  );
  return entry!;
}

export function calculateDeviation(current: number, baseline: BaselineEntry): {
  zScore: number;
  percentChange: number;
  level: 'normal' | 'elevated' | 'spike' | 'quiet';
} {
  const avg = baseline.avg7d;
  const counts = baseline.counts;

  if (counts.length < 3) {
    return { zScore: 0, percentChange: 0, level: 'normal' };
  }

  const variance = counts.reduce((sum, c) => sum + Math.pow(c - avg, 2), 0) / counts.length;
  const stdDev = Math.sqrt(variance) || 1;

  const zScore = (current - avg) / stdDev;
  const percentChange = avg > 0 ? ((current - avg) / avg) * 100 : 0;

  let level: 'normal' | 'elevated' | 'spike' | 'quiet' = 'normal';
  if (zScore > 2.5) level = 'spike';
  else if (zScore > 1.5) level = 'elevated';
  else if (zScore < -2) level = 'quiet';

  return {
    zScore: Math.round(zScore * 100) / 100,
    percentChange: Math.round(percentChange),
    level,
  };
}

export async function getAllBaselines(): Promise<BaselineEntry[]> {
  return (await withTransaction<BaselineEntry[]>(
    'baselines', 'readonly', (store) => store.getAll(), true,
  )) || [];
}

// Snapshot types and functions
export interface DashboardSnapshot {
  timestamp: number;
  events: unknown[];
  marketPrices: Record<string, number>;
  predictions: Array<{ title: string; yesPrice: number }>;
  hotspotLevels: Record<string, string>;
}

const SNAPSHOT_RETENTION_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export async function saveSnapshot(snapshot: DashboardSnapshot): Promise<void> {
  await withTransaction<void>(
    'snapshots', 'readwrite', (store) => { store.put(snapshot); }, false,
  );
}

export async function getSnapshots(fromTime?: number, toTime?: number): Promise<DashboardSnapshot[]> {
  const from = fromTime ?? Date.now() - SNAPSHOT_RETENTION_DAYS * DAY_MS;
  const to = toTime ?? Date.now();

  return (await withTransaction<DashboardSnapshot[]>(
    'snapshots', 'readonly',
    (store) => store.index('by_time').getAll(IDBKeyRange.bound(from, to)),
    true,
  )) || [];
}

export async function getSnapshotAt(timestamp: number): Promise<DashboardSnapshot | null> {
  const snapshots = await getSnapshots(timestamp - 15 * 60 * 1000, timestamp + 15 * 60 * 1000);
  if (snapshots.length === 0) return null;

  // Find closest snapshot to requested time
  return snapshots.reduce((closest, snap) =>
    Math.abs(snap.timestamp - timestamp) < Math.abs(closest.timestamp - timestamp) ? snap : closest
  );
}

export async function cleanOldSnapshots(): Promise<void> {
  const cutoff = Date.now() - SNAPSHOT_RETENTION_DAYS * DAY_MS;

  await withTransaction<void>(
    'snapshots', 'readwrite',
    (store, tx) => {
      const request = store.index('by_time').openCursor(IDBKeyRange.upperBound(cutoff));
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) { cursor.delete(); cursor.continue(); }
      };
      void tx;
    },
    false,
  );
}

export async function getSnapshotTimestamps(): Promise<number[]> {
  return (await withTransaction<number[]>(
    'snapshots', 'readonly', (store) => store.getAllKeys() as IDBRequest<number[]>, true,
  )) || [];
}

// ─────────────────────────────────────────────────────────────
// SCADA Point Types & Persistence
// ─────────────────────────────────────────────────────────────

export interface StoredScadaPoint {
  id: string;
  type: 'Camera' | 'Sensor';
  name: string;
  status: 'Normal' | 'Warning' | 'Alarm';
  ipAddress: string;
  positionX: number;
  positionY: number;
  additionalProperties?: { currentValue: number; measureUnit: string };
  savedAt: number; // Unix ms
}

export interface ScadaEvent {
  eventId: string;       // unique: `${deviceId}_${timestamp}`
  deviceId: string;
  deviceName: string;
  deviceType: 'Camera' | 'Sensor';
  previousStatus: string;
  currentStatus: string;
  currentValue?: number;
  measureUnit?: string;
  timestamp: number;     // Unix ms for IndexedDB range queries
  // Xử lý cảnh báo
  resolvedStatus?: 'ACKNOWLEDGED' | 'RESOLVED' | 'FALSE_ALARM' | 'MAINTENANCE';
  resolvedNote?: string;
  resolvedAt?: number;
  resolvedBy?: string;
}

/** Lưu toàn bộ danh sách điểm đo (overwrite từng id) */
export async function saveScadaPoints(points: StoredScadaPoint[]): Promise<void> {
  for (const p of points) {
    await withTransaction<void>(
      'scada_points', 'readwrite', (store) => { store.put(p); }, false,
    );
  }
}

/** Đọc cache các điểm đo từ IndexedDB */
export async function loadScadaPoints(): Promise<StoredScadaPoint[]> {
  return (await withTransaction<StoredScadaPoint[]>(
    'scada_points', 'readonly', (store) => store.getAll(), true,
  )) || [];
}

/** Lưu một sự kiện thay đổi trạng thái (chống spam trùng lặp trạng thái liên tiếp) */
export async function saveScadaEvent(event: ScadaEvent): Promise<void> {
  // Deduplicate: If the latest event for this device has the same currentStatus, do not save.
  const allEvents = await getScadaEvents();
  const latestDeviceEvent = allEvents
    .filter(e => String(e.deviceId) === String(event.deviceId))
    .sort((a, b) => b.timestamp - a.timestamp)[0];

  if (latestDeviceEvent && latestDeviceEvent.currentStatus === event.currentStatus) {
    return; // Bỏ qua vì trạng thái chưa thay đổi so với DB
  }

  await withTransaction<void>(
    'scada_events', 'readwrite', (store) => { store.put(event); }, false,
  );
}

/** Đọc lịch sử sự kiện (mặc định: 30 ngày gần nhất) */
export async function getScadaEvents(
  fromTime?: number,
  toTime?: number,
): Promise<ScadaEvent[]> {
  const from = fromTime ?? Date.now() - 30 * 24 * 60 * 60 * 1000;
  const to = toTime ?? Date.now();
  return (await withTransaction<ScadaEvent[]>(
    'scada_events', 'readonly',
    (store) => store.index('by_time').getAll(IDBKeyRange.bound(from, to)),
    true,
  )) || [];
}

/** Cập nhật một sự kiện đã có (dùng cho xử lý cảnh báo) */
export async function updateScadaEvent(eventId: string, updates: Partial<ScadaEvent>): Promise<void> {
  const allEvents = await getScadaEvents(0, Date.now());
  const existing = allEvents.find(e => e.eventId === eventId);
  if (!existing) return;
  const updated = { ...existing, ...updates };
  await withTransaction<void>('scada_events', 'readwrite', (store) => { store.put(updated); }, false);
}

/** Xóa các sự kiện có eventId bắt đầu bằng prefix (dùng cho clear demo data) */
export async function deleteScadaEventsByPrefix(prefix: string): Promise<void> {
  const allEvents = await getScadaEvents(0, Date.now());
  const toDelete = allEvents.filter(e => e.eventId.startsWith(prefix));
  for (const ev of toDelete) {
    await withTransaction<void>('scada_events', 'readwrite', (store) => { store.delete(ev.eventId); }, false);
  }
}

/** Xóa scada_points có id bắt đầu bằng prefix (dùng cho clear demo devices) */
export async function deleteScadaPointsByPrefix(prefix: string): Promise<void> {
  const points = await loadScadaPoints();
  const toDelete = points.filter(p => p.id.startsWith(prefix));
  for (const p of toDelete) {
    await withTransaction<void>('scada_points', 'readwrite', (store) => { store.delete(p.id); }, false);
  }
}

/** Xóa lịch sử của một deviceId (dùng cho clear demo history) */
export async function deleteScadaHistoryByDevicePrefix(devicePrefix: string): Promise<void> {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('scada_history', 'readwrite');
    const store = tx.objectStore('scada_history');
    const request = store.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        if (String((cursor.value as ScadaHistoryEntry).deviceId).startsWith(devicePrefix)) {
          cursor.delete();
        }
        cursor.continue();
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Lấy danh sách device đang ở chế độ bảo trì (localStorage) */
export function getMaintenanceModeDevices(): Set<string> {
  try {
    const data = localStorage.getItem('wm_maintenance_devices');
    return new Set(data ? JSON.parse(data) : []);
  } catch { return new Set(); }
}

/** Bật/tắt chế độ bảo trì cho một thiết bị */
export function setMaintenanceMode(deviceId: string, enabled: boolean): void {
  const devices = getMaintenanceModeDevices();
  if (enabled) devices.add(deviceId); else devices.delete(deviceId);
  localStorage.setItem('wm_maintenance_devices', JSON.stringify([...devices]));
}

/** Xoá sự kiện cũ hơn 30 ngày */
export async function clearOldScadaEvents(): Promise<void> {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  await withTransaction<void>(
    'scada_events', 'readwrite',
    (store, tx) => {
      const req = store.index('by_time').openCursor(IDBKeyRange.upperBound(cutoff));
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) { cursor.delete(); cursor.continue(); }
      };
      void tx;
    },
    false,
  );
}


// ─────────────────────────────────────────────────────────────
// SCADA History (Periodic snapshots for performance/trends)
// ─────────────────────────────────────────────────────────────

export interface ScadaHistoryEntry {
  deviceId: string;
  value: number;
  status: string;
  timestamp: number;
}

export async function saveScadaHistory(entries: ScadaHistoryEntry[]): Promise<void> {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('scada_history', 'readwrite');
    const store = tx.objectStore('scada_history');
    entries.forEach(e => store.put(e));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getScadaHistory(
  deviceId: string,
  fromTime: number,
  toTime: number
): Promise<ScadaHistoryEntry[]> {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('scada_history', 'readonly');
    const store = tx.objectStore('scada_history');
    const index = store.index('by_device_time');
    const range = IDBKeyRange.bound([deviceId, fromTime], [deviceId, toTime]);
    const request = index.getAll(range);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Cleanup history older than 7 days to prevent DB bloat */
export async function clearOldScadaHistory(): Promise<void> {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  await withTransaction<void>(
    'scada_history', 'readwrite',
    (store, tx) => {
      const req = store.index('by_time').openCursor(IDBKeyRange.upperBound(cutoff));
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) { cursor.delete(); cursor.continue(); }
      };
      void tx;
    },
    false,
  );
}

// ─────────────────────────────────────────────────────────────
// Local Overrides (Drag & Drop point positions)
// ─────────────────────────────────────────────────────────────

export function getCustomPointPositions(): Record<string, { x: number, y: number, r?: number }> {
  try {
    const data = localStorage.getItem('worldmonitor_custom_positions');
    return data ? JSON.parse(data) : {};
  } catch (e) {
    return {};
  }
}

export function saveCustomPointPosition(id: string, x: number, y: number, r?: number): void {
  try {
    const current = getCustomPointPositions();
    current[id] = { x, y, ...(r !== undefined ? { r } : current[id]?.r !== undefined ? { r: current[id].r } : {}) };
    localStorage.setItem('worldmonitor_custom_positions', JSON.stringify(current));
  } catch (e) {
    console.warn('Failed to save custom position to localStorage', e);
  }
}

export function resetCustomPointPositions(): void {
  localStorage.removeItem('worldmonitor_custom_positions');
}

// ─────────────────────────────────────────────────────────────
// Virtual Points (Mock Devices added locally)
// ─────────────────────────────────────────────────────────────

/** Retrieve user-created virtual points */
export function getVirtualPoints(): StoredScadaPoint[] {
  try {
    const data = localStorage.getItem('worldmonitor_virtual_points');
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
}

/** Save or update a virtual point */
export function saveVirtualPoint(point: StoredScadaPoint): void {
  try {
    const points = getVirtualPoints();
    const existingIdx = points.findIndex(p => p.id === point.id);
    if (existingIdx >= 0) {
      points[existingIdx] = point;
    } else {
      points.push(point);
    }
    localStorage.setItem('worldmonitor_virtual_points', JSON.stringify(points));
  } catch (e) {
    console.warn('Failed to save virtual point', e);
  }
}

/** Delete a virtual point */
export function deleteVirtualPoint(id: string): void {
  try {
    const points = getVirtualPoints();
    const updated = points.filter(p => p.id !== id);
    localStorage.setItem('worldmonitor_virtual_points', JSON.stringify(updated));
  } catch (e) {
    console.warn('Failed to delete virtual point', e);
  }
}

// ─────────────────────────────────────────────────────────────
// Hidden Points (IDs of Real/API points that the user wants to "delete" locally)
// ─────────────────────────────────────────────────────────────

/** Retrieve IDs of points hidden by the user */
export function getHiddenPointIds(): string[] {
  try {
    const data = localStorage.getItem('worldmonitor_hidden_points');
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
}

/** Hide a point locally (adds to the hidden list) */
export function hidePointLocal(id: string): void {
  try {
    const ids = getHiddenPointIds();
    if (!ids.includes(id)) {
      ids.push(id);
      localStorage.setItem('worldmonitor_hidden_points', JSON.stringify(ids));
    }
  } catch (e) {
    console.warn('Failed to hide point locally', e);
  }
}

/** Clear the list of hidden points */
export function resetHiddenPoints(): void {
  localStorage.removeItem('worldmonitor_hidden_points');
}

// ── Xóa toàn bộ data SCADA khỏi IndexedDB + localStorage ────
// Gọi khi muốn reset sạch, hoặc khi schema thay đổi
export async function clearAllScadaData(): Promise<void> {
  const database = await initDB();

  const stores = ['scada_points', 'scada_events', 'scada_history'];
  await Promise.all(stores.map(storeName =>
    new Promise<void>((resolve, reject) => {
      const tx = database.transaction(storeName, 'readwrite');
      const req = tx.objectStore(storeName).clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    })
  ));

  // Xóa tất cả localStorage keys liên quan
  const keysToRemove = [
    'wm_demo_seeded_v1', 'wm_demo_seeded_v2',
    'worldmonitor_virtual_points', 'worldmonitor_custom_positions',
    'worldmonitor_hidden_points', 'worldmonitor_maintenance_mode',
  ];
  keysToRemove.forEach(k => localStorage.removeItem(k));

  console.info('[Storage] Đã xóa toàn bộ SCADA data.');
}
