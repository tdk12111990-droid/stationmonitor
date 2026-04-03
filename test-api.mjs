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

// ── KẾT QUẢ ────────────────────────────────────────────────
console.log('\n' + '='.repeat(50));
console.log(`  PASSED: ${passed}  |  FAILED: ${failed}  |  TOTAL: ${passed + failed}`);
console.log('='.repeat(50) + '\n');

if (failed > 0) process.exit(1);
