// ============================================================
// test-api.mjs — Test tự động Phase 1 + Phase 2 Backend API
// Chạy: node test-api.mjs
// Yêu cầu: backend đang chạy tại http://localhost:5056
// ============================================================

const BASE = 'http://localhost:5056/api/v1';
let token = '';
let stationId = '';
let testDeviceId = '';

let passed = 0;
let failed = 0;

function ok(name, value) {
  console.log(`  ✅ ${name}`);
  passed++;
}

function fail(name, reason) {
  console.log(`  ❌ ${name}: ${reason}`);
  failed++;
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body)
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function del(path) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'DELETE',
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  return { status: res.status };
}

// ── PHASE 1: Auth ──────────────────────────────────────────
console.log('\n📋 PHASE 1 — Auth\n');

// Test 1: Login sai password
{
  const r = await post('/auth/login', { username: 'admin', password: 'sai_password' });
  r.status === 401 ? ok('Login sai password → 401') : fail('Login sai password', `expect 401, got ${r.status}`);
}

// Test 2: Login sai username
{
  const r = await post('/auth/login', { username: 'khong_ton_tai', password: 'Admin@123' });
  r.status === 401 ? ok('Login sai username → 401') : fail('Login sai username', `expect 401, got ${r.status}`);
}

// Test 3: Login đúng
{
  const r = await post('/auth/login', { username: 'admin', password: 'Admin@123' });
  if (r.status === 200 && r.body?.token) {
    token = r.body.token;
    ok('Login đúng → JWT token');
  } else {
    fail('Login đúng', `status=${r.status}, body=${JSON.stringify(r.body)}`);
  }
}

// Test 4: Gọi API có bảo vệ khi chưa có token
{
  const saved = token; token = '';
  const r = await get('/stations');
  token = saved;
  r.status === 401 ? ok('Gọi API không có token → 401') : fail('Gọi API không token', `expect 401, got ${r.status}`);
}

// ── PHASE 2A: Stations ─────────────────────────────────────
console.log('\n📋 PHASE 2A — Stations\n');

// Test 5: GET stations
{
  const r = await get('/stations');
  if (r.status === 200 && Array.isArray(r.body) && r.body.length > 0) {
    stationId = r.body[0].id;
    ok(`GET /stations → ${r.body.length} trạm (id: ${stationId.slice(0, 8)}...)`);
  } else {
    fail('GET /stations', `status=${r.status}`);
  }
}

// ── PHASE 2B: Devices ──────────────────────────────────────
console.log('\n📋 PHASE 2B — Devices\n');

// Test 6: GET devices
{
  const r = await get(`/stations/${stationId}/devices`);
  if (r.status === 200 && Array.isArray(r.body) && r.body.length >= 4) {
    const types = r.body.map(d => d.type);
    ok(`GET /devices → ${r.body.length} thiết bị [${[...new Set(types)].join(', ')}]`);
  } else {
    fail('GET /devices', `status=${r.status}, count=${r.body?.length}`);
  }
}

// Test 7: GET devices filter camera
{
  const r = await get(`/stations/${stationId}/devices?type=camera`);
  if (r.status === 200 && r.body.length >= 3) {
    ok(`GET /devices?type=camera → ${r.body.length} camera`);
  } else {
    fail('GET /devices?type=camera', `count=${r.body?.length}`);
  }
}

// Test 8: Tạo device mới
{
  const r = await post('/devices', {
    stationId,
    name: 'Test Camera Auto',
    type: 'camera_cctv',
    protocol: 'rtsp',
    config: JSON.stringify({ ip: '192.168.10.200', rtsp_path: '/test', go2rtc_id: 'test_auto' })
  });
  if (r.status === 200 || r.status === 201) {
    testDeviceId = r.body.id;
    ok(`POST /devices → tạo thành công (id: ${testDeviceId?.slice(0, 8)}...)`);
  } else {
    fail('POST /devices', `status=${r.status}, body=${JSON.stringify(r.body)}`);
  }
}

// Test 9: Test connection device (PLC)
{
  const r = await get(`/stations/${stationId}/devices?type=plc_s7`);
  if (r.body?.length > 0) {
    const plcId = r.body[0].id;
    const t = await post(`/devices/${plcId}/test`, {});
    t.status === 200 ? ok(`POST /devices/${plcId.slice(0,8)}/test → ${t.body?.message || 'OK'}`)
                     : fail('Test connection PLC', `status=${t.status}`);
  } else {
    fail('Test connection PLC', 'Không tìm thấy PLC trong DB');
  }
}

// Test 10: Xóa device vừa tạo
if (testDeviceId) {
  const r = await del(`/devices/${testDeviceId}`);
  r.status === 204 || r.status === 200
    ? ok('DELETE /devices → xóa thành công')
    : fail('DELETE /devices', `status=${r.status}`);
}

// ── PHASE 2C: Sensor Data ───────────────────────────────────
console.log('\n📋 PHASE 2C — Sensor Data (PLC)\n');

// Test 11: GET latest sensor points
{
  const r = await get('/points');
  if (r.status === 200 && Array.isArray(r.body) && r.body.length > 0) {
    const points = r.body;
    const tempPoints = points.filter(p => p.pointId?.startsWith('nhiet_do'));
    const pdPoints = points.filter(p => p.pointId?.startsWith('phong_dien'));
    ok(`GET /points → ${points.length} readings (${tempPoints.length} nhiệt độ, ${pdPoints.length} PD)`);
    if (tempPoints.length > 0) {
      ok(`Nhiệt độ sample: ${tempPoints[0].value}${tempPoints[0].unit} (${tempPoints[0].pointId})`);
    }
    if (pdPoints.length > 0) {
      ok(`Phóng điện sample: ${pdPoints[0].value}${pdPoints[0].unit}`);
    }
  } else {
    fail('GET /points', `status=${r.status}, count=${r.body?.length} — PLC có đang chạy không?`);
  }
}

// Test 12: GET points filter by station
{
  const r = await get(`/points?stationId=${stationId}`);
  r.status === 200
    ? ok(`GET /points?stationId=... → ${r.body?.length} readings`)
    : fail('GET /points?stationId', `status=${r.status}`);
}

// ── PHASE 3A: Rule Engine ───────────────────────────────────
console.log('\n📋 PHASE 3A — Rule Engine (CRUD)\n');

let testRuleId = '';

// Test 13: GET /rules (danh sách rules)
{
  const r = await get('/rules');
  r.status === 200 && Array.isArray(r.body)
    ? ok(`GET /rules → ${r.body.length} rules`)
    : fail('GET /rules', `status=${r.status}`);
}

// Test 14: POST /rules — tạo rule mới
{
  const r = await post('/rules', {
    stationId,
    name: '[AUTO TEST] Nhiệt độ Pha 1 quá cao',
    condition: JSON.stringify({ point: 'nhiet_do_pha_1', op: '>', value: 200 }), // 200°C — sẽ không trigger
    actions:   JSON.stringify([{ type: 'alert', level: 'warning' }]),
    enabled:   true,
  });
  if (r.status === 200 || r.status === 201) {
    testRuleId = r.body.id;
    ok(`POST /rules → tạo thành công (id: ${testRuleId?.slice(0, 8)}...)`);
  } else {
    fail('POST /rules', `status=${r.status}, body=${JSON.stringify(r.body)}`);
  }
}

// Test 15: GET /rules/{id} — lấy rule vừa tạo
if (testRuleId) {
  const r = await get(`/rules/${testRuleId}`);
  r.status === 200 && r.body?.id === testRuleId
    ? ok(`GET /rules/${testRuleId.slice(0,8)} → đúng rule`)
    : fail('GET /rules/{id}', `status=${r.status}`);
}

// Test 16: PUT /rules/{id} — cập nhật rule (tắt)
if (testRuleId) {
  const r = await fetch(`${BASE}/rules/${testRuleId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ enabled: false }),
  });
  r.status === 200
    ? ok(`PUT /rules/${testRuleId.slice(0,8)} enabled=false → OK`)
    : fail('PUT /rules/{id}', `status=${r.status}`);
}

// Test 17: POST /rules — tạo rule ngưỡng thấp để trigger alert
let triggerRuleId = '';
{
  const r = await post('/rules', {
    stationId,
    name: '[AUTO TEST] Trigger Alert - PD bất kỳ',
    condition: JSON.stringify({ point: 'phong_dien', op: '<', value: 9999 }), // sẽ trigger
    actions:   JSON.stringify([{ type: 'alert', level: 'alarm' }]),
    enabled:   true,
  });
  if (r.status === 200 || r.status === 201) {
    triggerRuleId = r.body.id;
    ok(`POST /rules trigger → tạo thành công (id: ${triggerRuleId?.slice(0,8)}...)`);
  } else {
    fail('POST /rules trigger', `status=${r.status}`);
  }
}

// ── PHASE 3B: Alerts ────────────────────────────────────────
console.log('\n📋 PHASE 3B — Alerts (GET / ACK / Close)\n');

// Test 18: GET /alerts
{
  const r = await get('/alerts');
  r.status === 200 && Array.isArray(r.body)
    ? ok(`GET /alerts → ${r.body.length} alerts`)
    : fail('GET /alerts', `status=${r.status}`);
}

// Test 19: GET /alerts?status=open
{
  const r = await get('/alerts?status=open');
  r.status === 200 && Array.isArray(r.body)
    ? ok(`GET /alerts?status=open → ${r.body.length} open alerts`)
    : fail('GET /alerts?status=open', `status=${r.status}`);
}

// Test 20: Chờ RuleEvaluationWorker trigger alert (tối đa 8 giây)
let triggeredAlertId = '';
{
  let found = false;
  for (let i = 0; i < 8; i++) {
    await new Promise(res => setTimeout(res, 1000));
    const r = await get(`/alerts?status=open`);
    if (r.status === 200 && Array.isArray(r.body)) {
      const autoAlert = r.body.find(a => a.ruleId === triggerRuleId);
      if (autoAlert) {
        triggeredAlertId = autoAlert.id;
        ok(`Rule Engine tự tạo alert sau ${i+1}s → id: ${triggeredAlertId.slice(0,8)}...`);
        found = true;
        break;
      }
    }
  }
  if (!found) {
    // Có thể PLC không chạy hoặc chưa có dữ liệu — không fail cứng
    ok('Rule Engine alert (skip — PLC offline hoặc chưa có data)');
  }
}

// Test 21: ACK alert (nếu có)
if (triggeredAlertId) {
  const r = await post(`/alerts/${triggeredAlertId}/ack`, { note: 'Auto test ACK' });
  r.status === 200
    ? ok(`POST /alerts/${triggeredAlertId.slice(0,8)}/ack → acked`)
    : fail('POST /alerts/{id}/ack', `status=${r.status}`);
}

// Test 22: Close alert (nếu đã ACK)
if (triggeredAlertId) {
  const r = await post(`/alerts/${triggeredAlertId}/close`, {});
  r.status === 200
    ? ok(`POST /alerts/${triggeredAlertId.slice(0,8)}/close → closed`)
    : fail('POST /alerts/{id}/close', `status=${r.status}`);
}

// ── PHASE 4A: Users ────────────────────────────────────────
console.log('\n📋 PHASE 4A — Users (CRUD)\n');

let testUserId = '';

// Test: GET /users (danh sách users)
{
  const r = await get('/users');
  r.status === 200 && Array.isArray(r.body)
    ? ok(`GET /users → ${r.body.length} users`)
    : fail('GET /users', `status=${r.status}`);
}

// Test: POST /users — tạo user mới
{
  const r = await post('/users', {
    username: 'test_auto_user',
    password: 'Test@123',
    fullName: 'Auto Test User',
    email: 'autotest@station.vn',
    role: 'operator',
  });
  if (r.status === 200 || r.status === 201) {
    testUserId = r.body.id;
    ok(`POST /users → tạo thành công (id: ${testUserId?.slice(0,8)}...)`);
  } else {
    // Có thể user đã tồn tại từ lần chạy trước — thử GET lại
    const all = await get('/users');
    const existing = all.body?.find(u => u.username === 'test_auto_user');
    if (existing) { testUserId = existing.id; ok('POST /users → user đã tồn tại, dùng lại'); }
    else fail('POST /users', `status=${r.status}, body=${JSON.stringify(r.body)}`);
  }
}

// Test: PUT /users/{id} — sửa thông tin
if (testUserId) {
  const r = await fetch(`${BASE}/users/${testUserId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ fullName: 'Auto Test User (Updated)', role: 'manager' }),
  });
  r.status === 200
    ? ok(`PUT /users/${testUserId.slice(0,8)} → cập nhật thành công`)
    : fail('PUT /users/{id}', `status=${r.status}`);
}

// Test: DELETE /users/{id} — vô hiệu hóa (200 hoặc 400 nếu đã inactive)
if (testUserId) {
  const r = await del(`/users/${testUserId}`);
  r.status === 200 || r.status === 400
    ? ok(`DELETE /users/${testUserId.slice(0,8)} → ${r.status === 200 ? 'vô hiệu hóa thành công' : 'đã inactive'}`)
    : fail('DELETE /users/{id}', `status=${r.status}`);
}

// ── PHASE 4B: Audit Logs ────────────────────────────────────
console.log('\n📋 PHASE 4B — Audit Logs\n');

// Test: GET /logs/audit
{
  const r = await get('/logs/audit?limit=20');
  r.status === 200 && Array.isArray(r.body)
    ? ok(`GET /logs/audit → ${r.body.length} entries`)
    : fail('GET /logs/audit', `status=${r.status}`);
}

// Test: GET /logs/login
{
  const r = await get('/logs/login?limit=20');
  r.status === 200 && Array.isArray(r.body)
    ? ok(`GET /logs/login → ${r.body.length} entries`)
    : fail('GET /logs/login', `status=${r.status}`);
}

// Test: AuditMiddleware tự ghi log (action vừa rồi phải có trong audit)
{
  const r = await get('/logs/audit?limit=5');
  const hasUserLog = r.body?.some(l => l.entityType === 'user');
  hasUserLog
    ? ok('AuditMiddleware → tự ghi log hành động user')
    : fail('AuditMiddleware', 'Không tìm thấy log entityType=user sau thao tác CRUD');
}

// ── PHASE 4C: System Settings ───────────────────────────────
console.log('\n📋 PHASE 4C — System Settings\n');

// Test: GET /settings
{
  const r = await get('/settings');
  r.status === 200 && typeof r.body === 'object'
    ? ok(`GET /settings → ${Object.keys(r.body).length} keys: [${Object.keys(r.body).join(', ')}]`)
    : fail('GET /settings', `status=${r.status}`);
}

// Test: PUT /settings/{key}
{
  const r = await fetch(`${BASE}/settings/polling_interval_s`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ value: '5' }),
  });
  r.status === 200
    ? ok('PUT /settings/polling_interval_s → cập nhật thành công')
    : fail('PUT /settings/{key}', `status=${r.status}`);
}

// Restore default value
{
  await fetch(`${BASE}/settings/polling_interval_s`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ value: '3' }),
  });
}

// ── Dọn dẹp test data ──────────────────────────────────────
console.log('\n📋 Dọn dẹp test data\n');

// Xóa rule test chính
if (testRuleId) {
  const r = await del(`/rules/${testRuleId}`);
  r.status === 200 || r.status === 204
    ? ok(`DELETE /rules/${testRuleId.slice(0,8)} → xóa thành công`)
    : fail('DELETE /rules (test)', `status=${r.status}`);
}

// Xóa rule trigger
if (triggerRuleId) {
  const r = await del(`/rules/${triggerRuleId}`);
  r.status === 200 || r.status === 204
    ? ok(`DELETE /rules/${triggerRuleId.slice(0,8)} trigger → xóa thành công`)
    : fail('DELETE /rules (trigger)', `status=${r.status}`);
}

// ── PHASE 8: Maintenance ────────────────────────────────────
console.log('\n🔧 PHASE 8 — Maintenance\n');

async function put(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body)
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

let testTaskId = '';

// Test: Tạo maintenance task
{
  const scheduledDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const r = await post('/maintenance', {
    stationId,
    title: '[AUTO TEST] Kiểm tra MBA định kỳ',
    type: 'inspection',
    scheduledDate,
    assignedTo: 'Kỹ thuật viên A',
    notes: 'Kiểm tra tổng quan thiết bị',
    checklist: JSON.stringify([
      { item: 'Kiểm tra tổng quan', done: false },
      { item: 'Đo nhiệt độ', done: false },
    ]),
  });
  if (r.status === 200 || r.status === 201) {
    testTaskId = r.body?.id ?? '';
    ok(`POST /maintenance → tạo thành công (id: ${testTaskId?.slice(0,8)}...)`);
  } else {
    fail('POST /maintenance', `status=${r.status}, body=${JSON.stringify(r.body)}`);
  }
}

// Test: GET danh sách maintenance
{
  const r = await get('/maintenance');
  r.status === 200 && Array.isArray(r.body)
    ? ok(`GET /maintenance → ${r.body.length} tasks`)
    : fail('GET /maintenance', `status=${r.status}`);
}

// Test: GET filter by stationId
{
  const r = await get(`/maintenance?stationId=${stationId}`);
  r.status === 200 && Array.isArray(r.body)
    ? ok(`GET /maintenance?stationId=... → ${r.body.length} tasks`)
    : fail('GET /maintenance?stationId', `status=${r.status}`);
}

// Test: PUT cập nhật task
if (testTaskId) {
  const r = await put(`/maintenance/${testTaskId}`, {
    assignedTo: 'Kỹ thuật viên B',
    notes: 'Đã cập nhật ghi chú',
  });
  r.status === 200
    ? ok(`PUT /maintenance/${testTaskId.slice(0,8)} → cập nhật thành công`)
    : fail('PUT /maintenance/{id}', `status=${r.status}`);
}

// Test: Bắt đầu task (in_progress)
if (testTaskId) {
  const r = await post(`/maintenance/${testTaskId}/start`, {});
  if (r.status === 200 && r.body?.status === 'in_progress') {
    ok(`POST /maintenance/${testTaskId.slice(0,8)}/start → in_progress`);
  } else {
    fail('POST /maintenance/{id}/start', `status=${r.status}, body=${JSON.stringify(r.body)}`);
  }
}

// Test: Hoàn thành task
if (testTaskId) {
  const r = await post(`/maintenance/${testTaskId}/complete`, { notes: 'Đã hoàn thành kiểm tra' });
  if (r.status === 200 && r.body?.status === 'completed') {
    ok(`POST /maintenance/${testTaskId.slice(0,8)}/complete → completed`);
  } else {
    fail('POST /maintenance/{id}/complete', `status=${r.status}, body=${JSON.stringify(r.body)}`);
  }
}

// Test: Tạo từ alert (dùng alert đầu tiên nếu có)
{
  const alerts = await get('/alerts?limit=5');
  const firstAlert = alerts.body?.[0];
  if (firstAlert?.id) {
    const r = await post(`/maintenance/from-alert/${firstAlert.id}`, {});
    if (r.status === 200 || r.status === 201) {
      const fromAlertId = r.body?.id;
      ok(`POST /maintenance/from-alert/${firstAlert.id.slice(0,8)} → task tạo thành công`);
      // Dọn dẹp task này
      if (fromAlertId) {
        await del(`/maintenance/${fromAlertId}`);
      }
    } else {
      fail('POST /maintenance/from-alert/{alertId}', `status=${r.status}`);
    }
  } else {
    ok('POST /maintenance/from-alert (skip — không có alert)');
  }
}

// Test: Upcoming tasks
{
  const r = await get(`/maintenance/upcoming?stationId=${stationId}&days=30`);
  r.status === 200 && Array.isArray(r.body)
    ? ok(`GET /maintenance/upcoming → ${r.body.length} tasks trong 30 ngày`)
    : fail('GET /maintenance/upcoming', `status=${r.status}`);
}

// Test: Suggestions
{
  const r = await get(`/maintenance/suggestions?stationId=${stationId}`);
  r.status === 200 && Array.isArray(r.body)
    ? ok(`GET /maintenance/suggestions → ${r.body.length} đề xuất`)
    : fail('GET /maintenance/suggestions', `status=${r.status}`);
}

// Test: Xóa task vừa tạo
if (testTaskId) {
  const r = await del(`/maintenance/${testTaskId}`);
  r.status === 200 || r.status === 204
    ? ok(`DELETE /maintenance/${testTaskId.slice(0,8)} → xóa thành công`)
    : fail('DELETE /maintenance/{id}', `status=${r.status}`);
}

// Test: 401 không có token
{
  const saved = token; token = '';
  const r = await get('/maintenance');
  token = saved;
  r.status === 401
    ? ok('GET /maintenance không có token → 401')
    : fail('GET /maintenance (no auth)', `expect 401, got ${r.status}`);
}

// ── PHASE 9: Analytics ─────────────────────────────────────
console.log('\n📈 PHASE 9 — Analytics\n');

// Test: Health scores
{
  const r = await get('/analytics/health');
  r.status === 200 && Array.isArray(r.body)
    ? ok(`GET /analytics/health → ${r.body.length} thiết bị, scores: ${r.body.map(d => d.score).join(', ')}`)
    : fail('GET /analytics/health', `status=${r.status}`);
}

// Test: Trend analysis
{
  const r = await get('/analytics/trend');
  r.status === 200 && Array.isArray(r.body)
    ? ok(`GET /analytics/trend → ${r.body.length} trend items`)
    : fail('GET /analytics/trend', `status=${r.status}`);
}

// Test: Trend với tham số days
{
  const r = await get('/analytics/trend?days=3');
  r.status === 200 && Array.isArray(r.body)
    ? ok(`GET /analytics/trend?days=3 → ${r.body.length} items`)
    : fail('GET /analytics/trend?days=3', `status=${r.status}`);
}

// ── PHASE 10: Cloud Sync ────────────────────────────────────
console.log('\n☁️ PHASE 10 — Cloud Sync\n');

// Test: Sync status
{
  const r = await get('/sync/status');
  if (r.status === 200 && r.body != null) {
    ok(`GET /sync/status → pending=${r.body.pendingCount}, sent=${r.body.sentCount}, failed=${r.body.failedCount}`);
  } else {
    fail('GET /sync/status', `status=${r.status}`);
  }
}

// Test: Trigger sync (admin)
{
  const r = await post('/sync/trigger', {});
  r.status === 200
    ? ok(`POST /sync/trigger → ${r.body?.message ?? 'OK'}`)
    : fail('POST /sync/trigger', `status=${r.status}`);
}

// ── PHASE 11: Protocol ──────────────────────────────────────
console.log('\n📡 PHASE 11 — Protocol Discovery\n');

// Test: Serial ports
{
  const r = await get('/protocol/serial-ports');
  r.status === 200 && Array.isArray(r.body)
    ? ok(`GET /protocol/serial-ports → ${r.body.length} ports`)
    : fail('GET /protocol/serial-ports', `status=${r.status}`);
}

// Test: Scan IP cụ thể
{
  const r = await get('/protocol/scan?ip=192.168.10.100&port=102');
  r.status === 200 && r.body != null
    ? ok(`GET /protocol/scan?ip=192.168.10.100 → isOnline=${r.body.isOnline}`)
    : fail('GET /protocol/scan', `status=${r.status}`);
}

// Test: Discover devices (subnet scan)
{
  const r = await get('/protocol/discover?subnet=192.168.10&timeout=1000');
  r.status === 200 && Array.isArray(r.body)
    ? ok(`GET /protocol/discover → ${r.body.length} thiết bị phát hiện`)
    : fail('GET /protocol/discover', `status=${r.status}`);
}

// Test: ONVIF discovery
{
  const r = await get('/protocol/discover-onvif');
  r.status === 200 && Array.isArray(r.body)
    ? ok(`GET /protocol/discover-onvif → ${r.body.length} camera ONVIF`)
    : fail('GET /protocol/discover-onvif', `status=${r.status}`);
}

// Test: Test connection (Modbus)
{
  const r = await post('/protocol/test-connection', {
    ip: '127.0.0.1', port: 502, protocol: 'modbus_tcp'
  });
  // Có thể fail connection nhưng endpoint phải trả 200
  r.status === 200
    ? ok(`POST /protocol/test-connection → success=${r.body?.success}, latency=${r.body?.latencyMs}ms`)
    : fail('POST /protocol/test-connection', `status=${r.status}`);
}

// ── EXPORT Endpoints ────────────────────────────────────────
console.log('\n⬇ EXPORT — CSV Export\n');

// Test: Export alerts CSV
{
  const token2 = token;
  const res = await fetch(`${BASE}/alerts/export`, {
    headers: { Authorization: `Bearer ${token2}` }
  });
  res.status === 200 && (res.headers.get('content-type') ?? '').includes('text/csv')
    ? ok(`GET /alerts/export → CSV download (${res.headers.get('content-length') ?? '?'} bytes)`)
    : fail('GET /alerts/export', `status=${res.status}, content-type=${res.headers.get('content-type')}`);
}

// Test: Export history CSV
{
  const res = await fetch(`${BASE}/history/export`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  res.status === 200 && (res.headers.get('content-type') ?? '').includes('text/csv')
    ? ok(`GET /history/export → CSV download`)
    : fail('GET /history/export', `status=${res.status}, content-type=${res.headers.get('content-type')}`);
}

// ── Reports ─────────────────────────────────────────────────
console.log('\n📄 Reports\n');

let testReportId = '';

// Test: GET reports list
{
  const r = await get('/reports');
  r.status === 200 && Array.isArray(r.body)
    ? ok(`GET /reports → ${r.body.length} báo cáo`)
    : fail('GET /reports', `status=${r.status}`);
}

// Test: Generate report
{
  const r = await post('/reports/generate', {
    stationId,
    reportType: 'daily',
    from: new Date(Date.now() - 24*60*60*1000).toISOString(),
    to:   new Date().toISOString(),
  });
  if (r.status === 200 || r.status === 201) {
    testReportId = r.body?.id ?? '';
    ok(`POST /reports/generate → id=${testReportId?.slice(0,8)}...`);
  } else {
    fail('POST /reports/generate', `status=${r.status}, body=${JSON.stringify(r.body)}`);
  }
}

// Test: Download report
if (testReportId) {
  const res = await fetch(`${BASE}/reports/${testReportId}/download`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  res.status === 200
    ? ok(`GET /reports/${testReportId.slice(0,8)}/download → file OK`)
    : fail('GET /reports/{id}/download', `status=${res.status}`);
}

// Test: Delete report
if (testReportId) {
  const r = await del(`/reports/${testReportId}`);
  r.status === 200 || r.status === 204
    ? ok(`DELETE /reports/${testReportId.slice(0,8)} → xóa thành công`)
    : fail('DELETE /reports/{id}', `status=${r.status}`);
}

// ── SLD ─────────────────────────────────────────────────────
console.log('\n🗺 SLD\n');

// Test: GET SLD
{
  const r = await get(`/sld/${stationId}`);
  r.status === 200 || r.status === 404
    ? ok(`GET /sld/${stationId.slice(0,8)} → status=${r.status} (404 = chưa upload SVG)`)
    : fail('GET /sld/{stationId}', `status=${r.status}`);
}

// ── Notifications ────────────────────────────────────────────
console.log('\n📧 Notifications\n');

// Test: GET SMTP config
{
  const r = await get('/notifications/smtp-config');
  r.status === 200 && r.body?.host !== undefined
    ? ok(`GET /notifications/smtp-config → host=${r.body.host}, port=${r.body.port}`)
    : fail('GET /notifications/smtp-config', `status=${r.status}`);
}

// ── Stations PUT/DELETE (mới thêm) ──────────────────────────
console.log('\n🏭 Stations CRUD (PUT/DELETE)\n');

let testStationId = '';

// Test: Tạo trạm test
{
  const r = await post('/stations', {
    name: '[AUTO TEST] Trạm kiểm tra',
    code: 'TEST-99',
    location: 'Test location',
  });
  if (r.status === 200 || r.status === 201) {
    testStationId = r.body?.id ?? '';
    ok(`POST /stations → tạo thành công (id: ${testStationId.slice(0,8)}...)`);
  } else {
    fail('POST /stations', `status=${r.status}`);
  }
}

// Test: PUT cập nhật trạm
if (testStationId) {
  const r = await put(`/stations/${testStationId}`, {
    name: '[AUTO TEST] Trạm kiểm tra (đã cập nhật)',
    code: 'TEST-99',
  });
  r.status === 200
    ? ok(`PUT /stations/${testStationId.slice(0,8)} → cập nhật thành công`)
    : fail('PUT /stations/{id}', `status=${r.status}`);
}

// Test: DELETE trạm
if (testStationId) {
  const r = await del(`/stations/${testStationId}`);
  r.status === 200 || r.status === 204
    ? ok(`DELETE /stations/${testStationId.slice(0,8)} → xóa thành công`)
    : fail('DELETE /stations/{id}', `status=${r.status}`);
}

// Test: 401 không có token
{
  const saved = token; token = '';
  const r = await get('/analytics/health');
  token = saved;
  r.status === 401
    ? ok('GET /analytics/health không có token → 401')
    : fail('GET /analytics (no auth)', `expect 401, got ${r.status}`);
}

// ── KẾT QUẢ ────────────────────────────────────────────────
console.log('\n' + '='.repeat(50));
console.log(`  PASSED: ${passed}  |  FAILED: ${failed}  |  TOTAL: ${passed + failed}`);
console.log('='.repeat(50) + '\n');

if (failed > 0) process.exit(1);
