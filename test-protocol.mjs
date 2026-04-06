// ============================================================
// test-protocol.mjs — Test Protocol APIs + Simulator end-to-end
// Chạy: node test-protocol.mjs
// Yêu cầu: backend đang chạy tại http://localhost:5056
//           Simulator đang chạy:
//             cd backend && dotnet run --project StationMonitor.Simulators -- modbus
// ============================================================

const BASE = 'http://localhost:5056/api/v1';
let token = '';
let pass = 0;
let fail = 0;

function ok(name, detail = '') {
  console.log(`  ✅ ${name}${detail ? ' — ' + detail : ''}`);
  pass++;
}
function fail_(name, reason) {
  console.log(`  ❌ ${name}: ${reason}`);
  fail++;
}
function warn(name, msg) {
  console.log(`  ⚠️  ${name}: ${msg}`);
}
function section(title) {
  console.log(`\n📋 ${title}\n${'─'.repeat(50)}`);
}

async function req(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  }).catch(e => ({ status: 0, _err: e.message }));
  if (res._err) return { status: 0, body: null, error: res._err };
  const text = await res.text().catch(() => '');
  let bodyJson = null;
  try { bodyJson = JSON.parse(text); } catch { bodyJson = text; }
  return { status: res.status, body: bodyJson };
}

const get  = (path)       => req('GET',  path);
const post = (path, body) => req('POST', path, body);

// ── Login ─────────────────────────────────────────────────

section('AUTH — Đăng nhập lấy token');

{
  const r = await post('/auth/login', { username: 'admin', password: 'Admin@123' });
  if (r.status === 200 && r.body?.token) {
    token = r.body.token;
    ok('Đăng nhập thành công', `role=${r.body.role}`);
  } else {
    fail_('Đăng nhập', `status=${r.status} — không lấy được token, dừng test`);
    process.exit(1);
  }
}

// ── Serial Ports ──────────────────────────────────────────

section('PROTOCOL — Danh sách cổng serial');

{
  const r = await get('/protocols/serial-ports');
  if (r.status === 200) {
    const ports = r.body?.ports ?? [];
    ok(`GET /protocols/serial-ports → [${ports.join(', ') || 'không có'}]`);
  } else {
    fail_('GET /protocols/serial-ports', `status=${r.status}`);
  }
}

// ── Test Connection: Ping ─────────────────────────────────

section('PROTOCOL — Test Connection (Ping)');

{
  const r = await post('/protocols/test-connection', {
    protocol: 'ping',
    config: JSON.stringify({ ip: '127.0.0.1' }),
  });
  if (r.status === 200 && r.body?.success) {
    ok('Ping localhost', `latency=${r.body.latencyMs}ms`);
  } else {
    fail_('Ping localhost', `status=${r.status}, err=${r.body?.error}`);
  }
}

{
  const r = await post('/protocols/test-connection', {
    protocol: 'ping',
    config: JSON.stringify({ ip: '192.0.2.1' }), // non-routable, sẽ timeout
  });
  if (r.status === 200 && r.body?.success === false) {
    ok('Ping non-routable IP → fail gracefully', r.body.error ?? '');
  } else if (r.status === 200) {
    warn('Ping non-routable', `Không phải lỗi nhưng success=${r.body?.success}`);
  } else {
    fail_('Ping non-routable', `status=${r.status}`);
  }
}

// ── Test Connection: Modbus TCP (cần simulator chạy) ──────

section('PROTOCOL — Test Connection (Modbus TCP)');

{
  // Test với localhost:502 — cần simulator
  const r = await post('/protocols/test-connection', {
    protocol: 'modbus_tcp',
    config: JSON.stringify({ ip: '127.0.0.1', port: 502, unit_id: 1 }),
  });

  if (r.status === 200) {
    if (r.body?.success) {
      const pts = r.body.points ?? [];
      ok(`Modbus TCP 127.0.0.1:502 kết nối OK`, `${pts.length} registers, ${r.body.latencyMs}ms`);
      if (pts.length > 0) {
        const hr0 = pts.find(p => p.pointId === 'HR[0]');
        if (hr0) {
          const temp = hr0.value / 10.0;
          const inRange = temp >= 60 && temp <= 90;
          inRange
            ? ok(`HR[0]=${hr0.value} raw → ${temp.toFixed(1)}°C (trong 60-90°C)`)
            : fail_(`HR[0] ngoài khoảng`, `${temp.toFixed(1)}°C không nằm trong [60, 90]`);
        }
      }
    } else {
      warn('Modbus TCP', `Simulator chưa chạy — ${r.body?.error}. Chạy: cd backend && dotnet run --project StationMonitor.Simulators -- modbus`);
    }
  } else {
    fail_('POST /protocols/test-connection Modbus', `status=${r.status}`);
  }
}

{
  // Test với port không tồn tại → phải fail gracefully
  const r = await post('/protocols/test-connection', {
    protocol: 'modbus_tcp',
    config: JSON.stringify({ ip: '127.0.0.1', port: 19999 }),
  });
  if (r.status === 200 && r.body?.success === false) {
    ok('Modbus TCP port không tồn tại → fail gracefully', r.body.error ?? '');
  } else if (r.status === 200 && r.body?.success) {
    warn('Modbus TCP 19999', 'Kết nối được — có gì đó đang chạy trên port 19999?');
  } else {
    fail_('Modbus TCP fail gracefully', `status=${r.status}`);
  }
}

// ── Test Connection: IEC-104 (cần simulator chạy) ─────────

section('PROTOCOL — Test Connection (IEC-104)');

{
  const r = await post('/protocols/test-connection', {
    protocol: 'iec104',
    config: JSON.stringify({ ip: '127.0.0.1', port: 2404 }),
  });

  if (r.status === 200) {
    if (r.body?.success) {
      ok(`IEC-104 127.0.0.1:2404 STARTDT OK`, `${r.body.latencyMs}ms`);
    } else {
      warn('IEC-104', `Simulator chưa chạy — ${r.body?.error}. Chạy: dotnet run --project StationMonitor.Simulators -- iec104`);
    }
  } else {
    fail_('POST /protocols/test-connection IEC-104', `status=${r.status}`);
  }
}

// ── Test Connection: Protocol không hợp lệ ───────────────

section('PROTOCOL — Validation');

{
  const r = await post('/protocols/test-connection', {
    protocol: '',
    config: '{}',
  });
  (r.status === 400)
    ? ok('Protocol rỗng → 400 BadRequest')
    : fail_('Protocol rỗng validation', `expect 400, got ${r.status}`);
}

{
  const r = await post('/protocols/test-connection', {
    protocol: 'unknown_xyz',
    config: '{}',
  });
  if (r.status === 200 && r.body?.success === false) {
    ok('Protocol không hợp lệ → success=false', r.body.error ?? '');
  } else {
    fail_('Protocol unknown', `status=${r.status}, success=${r.body?.success}`);
  }
}

// ── Scan IP đơn ───────────────────────────────────────────

section('PROTOCOL — Scan IP đơn (localhost)');

{
  const r = await get('/protocols/scan?ip=127.0.0.1');
  if (r.status === 200 && Array.isArray(r.body)) {
    ok(`GET /protocols/scan?ip=127.0.0.1 → ${r.body.length} kết quả`, r.body.map(d => `${d.protocol}:${d.port}`).join(', ') || 'none');
  } else {
    fail_('GET /protocols/scan', `status=${r.status}`);
  }
}

// ── Discover subnet (nhỏ để nhanh) ───────────────────────

section('PROTOCOL — Discover subnet (127.0.0.1-3, nhanh)');

{
  const r = await get('/protocols/discover?subnet=127.0.0&from=1&to=3');
  if (r.status === 200 && Array.isArray(r.body)) {
    ok(`GET /protocols/discover → ${r.body.length} thiết bị tìm được`);
  } else {
    fail_('GET /protocols/discover', `status=${r.status}`);
  }
}

{
  // Validate range limit
  const r = await get('/protocols/discover?subnet=192.168.1&from=1&to=300');
  (r.status === 400)
    ? ok('Range > 254 → 400 BadRequest')
    : fail_('Range validation', `expect 400, got ${r.status}`);
}

// ── Summary ───────────────────────────────────────────────

console.log('\n' + '═'.repeat(50));
const total = pass + fail;
if (fail === 0) {
  console.log(`✅ TẤT CẢ ${pass}/${total} TESTS PASSED`);
} else {
  console.log(`❌ ${fail} FAIL  |  ✅ ${pass} PASS  |  ${total} tổng`);
}
console.log('═'.repeat(50) + '\n');

if (fail > 0) process.exit(1);
