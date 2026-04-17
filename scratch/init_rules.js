const API_BASE = 'http://localhost:5056/api/v1';

async function initThermalRules() {
  console.log('--- Starting Thermal Rules Initialization ---');
  for (let i = 1; i <= 10; i++) {
    const point = `P${i}`;
    const payload = {
      name: `Giám sát điểm nhiệt ${point}`,
      ruleSet: 'Các điểm đo của cam nhiệt',
      enabled: true,
      condition: JSON.stringify({ type: 'temperature', point, op: '>=', pre_alarm: 35, alarm: 55 }),
      actions: JSON.stringify([{ type: 'alert', level: 'hybrid' }])
    };

    try {
      const res = await fetch(`${API_BASE}/rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        console.log(`[PASS] Created rule for ${point}`);
      } else {
        const txt = await res.text();
        console.error(`[FAIL] ${point}: ${res.status} - ${txt}`);
      }
    } catch (e) {
      console.error(`[ERROR] ${point}: ${e.message}`);
    }
  }
  console.log('--- Done ---');
}

initThermalRules();
