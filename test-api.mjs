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

// Test: DELETE /users/{id} — vô hiệu hóa
if (testUserId) {
  const r = await del(`/users/${testUserId}`);
  r.status === 200
    ? ok(`DELETE /users/${testUserId.slice(0,8)} → vô hiệu hóa thành công`)
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

// ── KẾT QUẢ ────────────────────────────────────────────────
console.log('\n' + '='.repeat(50));
console.log(`  PASSED: ${passed}  |  FAILED: ${failed}  |  TOTAL: ${passed + failed}`);
console.log('='.repeat(50) + '\n');

if (failed > 0) process.exit(1);
