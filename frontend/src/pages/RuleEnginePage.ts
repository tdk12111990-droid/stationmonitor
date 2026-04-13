// ============================================================
// RuleEnginePage — Quản lý Rule Engine từ backend API
// GET/POST/PUT/DELETE/PATCH /api/v1/rules
// ============================================================

import { stationApi, type Rule } from '@/services/StationApiService';
import { confirmDialog } from '@/utils/confirm';

// Fallback khi API chưa trả về
const FALLBACK_POINTS = [
  { value: 'nhiet_do_pha_1', label: 'Nhiệt độ Pha 1 (°C)' },
  { value: 'nhiet_do_pha_2', label: 'Nhiệt độ Pha 2 (°C)' },
  { value: 'nhiet_do_pha_3', label: 'Nhiệt độ Pha 3 (°C)' },
  { value: 'phong_dien',     label: 'Phóng điện PD (dB)'  },
];

const OP_LABELS: Record<string, string> = {
  '>':  '> lớn hơn',
  '<':  '< nhỏ hơn',
  '>=': '≥ lớn hơn hoặc bằng',
  '<=': '≤ nhỏ hơn hoặc bằng',
  '==': '= bằng',
};

export class RuleEnginePage {
  private rules: Rule[] = [];
  private editingId: string | null = null;
  private pointOptions: { value: string; label: string }[] = FALLBACK_POINTS;

  render(): string {
    return `
    <style>
      .re-grid-header, .re-grid-row {
        display: grid;
        grid-template-columns: 1fr 180px 80px 90px 100px;
        align-items: center;
      }
      .re-grid-header {
        border-bottom: 1px solid var(--admin-border);
        background: var(--admin-card-bg);
      }
      .re-grid-header > div {
        padding: 10px 14px;
        font-size: .7rem; font-weight: 700; letter-spacing: .4px;
        text-transform: uppercase; color: var(--admin-text); opacity: .5;
      }
      .re-grid-row {
        border-bottom: 1px solid rgba(255,255,255,.04);
        transition: background .1s;
      }
      .re-grid-row:hover { background: rgba(255,255,255,.025); }
      .re-grid-row > div { padding: 12px 14px; font-size: .85rem; color: var(--admin-text); }
      .re-rule-name { font-weight: 600; }
      .re-cond { font-size: .8rem; }
      .re-cond code {
        background: rgba(255,255,255,.06); padding: 2px 7px;
        border-radius: 4px; font-family: monospace; font-size: .78rem;
      }
      .toggle-switch { position:relative;display:inline-block;width:40px;height:22px;flex-shrink:0; }
      .toggle-switch input { opacity:0;width:0;height:0; }
      .toggle-slider {
        position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;
        background:#334155;border-radius:22px;transition:.2s;
      }
      .toggle-slider:before {
        position:absolute;content:"";height:16px;width:16px;left:3px;bottom:3px;
        background:white;border-radius:50%;transition:.2s;
      }
      .toggle-switch input:checked + .toggle-slider { background:var(--admin-accent,#3b82f6); }
      .toggle-switch input:checked + .toggle-slider:before { transform:translateX(18px); }
    </style>

    <div class="list-page">
      <div class="page-toolbar" style="display:flex;justify-content:space-between;align-items:center;">
        <h2 style="margin:0">🎛️ RULE ENGINE</h2>
        <button id="btnAddRule" class="btn-industrial btn-primary">+ Thêm Rule</button>
      </div>

      <!-- Stats bar -->
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px;" id="reStats">
        <div class="admin-card" style="padding:14px 18px;display:flex;flex-direction:column;gap:4px;">
          <div style="font-size:.65rem;opacity:.45;text-transform:uppercase;letter-spacing:.5px">Tổng rules</div>
          <div style="font-size:1.6rem;font-weight:800;" id="statTotal">—</div>
        </div>
        <div class="admin-card" style="padding:14px 18px;display:flex;flex-direction:column;gap:4px;">
          <div style="font-size:.65rem;opacity:.45;text-transform:uppercase;letter-spacing:.5px">Đang bật</div>
          <div style="font-size:1.6rem;font-weight:800;color:#10b981;" id="statEnabled">—</div>
        </div>
        <div class="admin-card" style="padding:14px 18px;display:flex;flex-direction:column;gap:4px;">
          <div style="font-size:.65rem;opacity:.45;text-transform:uppercase;letter-spacing:.5px">Alarm rules</div>
          <div style="font-size:1.6rem;font-weight:800;color:#ef4444;" id="statAlarm">—</div>
        </div>
      </div>

      <div class="admin-card" style="padding:0;overflow:hidden;">
        <div class="re-grid-header">
          <div>Tên Rule / Điều kiện</div>
          <div>Mức cảnh báo</div>
          <div>Giá trị</div>
          <div style="text-align:center;">Bật/Tắt</div>
          <div>Hành động</div>
        </div>
        <div id="ruleListBody">
          <div style="text-align:center;padding:50px;color:#94a3b8;">Đang tải...</div>
        </div>
      </div>
    </div>

    <!-- Modal thêm/sửa rule -->
    <div id="ruleModal" class="modal-overlay">
      <div class="modal-content" style="width:500px">
        <div class="modal-header">
          <h3 id="ruleModalTitle">Thêm Rule mới</h3>
          <button id="ruleModalClose" class="modal-close">✕</button>
        </div>
        <div class="modal-body" style="display:flex;flex-direction:column;gap:16px;">
          <div class="form-group" style="margin:0">
            <label>Tên Rule <span style="color:#ef4444">*</span></label>
            <input id="ruleNameInput" class="form-input" placeholder="VD: Nhiệt độ Pha 1 quá cao" />
          </div>
          <div class="form-group" style="margin:0">
            <label>Điểm đo <span style="color:#ef4444">*</span></label>
            <select id="rulePointInput" class="form-select">
              ${FALLBACK_POINTS.map(p => `<option value="${p.value}">${p.label}</option>`).join('')}
            </select>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div class="form-group" style="margin:0">
              <label>Toán tử</label>
              <select id="ruleOpInput" class="form-select">
                <option value=">">&gt; Lớn hơn</option>
                <option value="<">&lt; Nhỏ hơn</option>
                <option value=">=">&gt;= Lớn hơn hoặc bằng</option>
                <option value="<=">&lt;= Nhỏ hơn hoặc bằng</option>
                <option value="==">== Bằng</option>
              </select>
            </div>
            <div class="form-group" style="margin:0">
              <label>Ngưỡng <span style="color:#ef4444">*</span></label>
              <input id="ruleValueInput" class="form-input" type="number" placeholder="80" step="any" />
            </div>
          </div>
          <!-- Tác động của Rule -->
          <div class="form-group" style="margin:0">
            <label>Tác động <span style="opacity:.5;font-size:.75rem;">(chọn ít nhất 1)</span></label>
            <div style="display:flex;flex-direction:column;gap:8px;margin-top:8px;">

              <!-- Health option -->
              <div style="padding:12px 14px;border-radius:8px;border:1px solid var(--admin-border);">
                <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
                  <input type="checkbox" id="doHealth" style="accent-color:#0ea5e9;width:16px;height:16px;">
                  <div>
                    <span style="font-weight:600;font-size:.85rem;">🏥 Ảnh hưởng sức khỏe thiết bị</span>
                    <div style="font-size:.73rem;opacity:.55;margin-top:1px;">Trừ điểm Health Score âm thầm, không tạo alert</div>
                  </div>
                </label>
                <div id="penaltyRow" style="display:none;margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,.07);">
                  <label style="font-size:.78rem;opacity:.7;display:block;margin-bottom:4px;">Penalty (điểm trừ)</label>
                  <div style="display:flex;align-items:center;gap:8px;">
                    <input id="penaltyInput" type="number" class="form-input" value="10" min="1" max="50"
                      style="width:90px;padding:6px 10px;">
                    <span style="font-size:.75rem;opacity:.5;">điểm / lần vượt ngưỡng</span>
                  </div>
                </div>
              </div>

              <!-- Alert option -->
              <div style="padding:12px 14px;border-radius:8px;border:1px solid var(--admin-border);">
                <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
                  <input type="checkbox" id="doAlert" checked style="accent-color:#f59e0b;width:16px;height:16px;">
                  <div>
                    <span style="font-weight:600;font-size:.85rem;">🔔 Tạo cảnh báo</span>
                    <div style="font-size:.73rem;opacity:.55;margin-top:1px;">Tạo Alert + gửi email khi vượt ngưỡng</div>
                  </div>
                </label>
                <div id="levelRow" style="display:flex;gap:10px;margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,.07);">
                  <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:8px 12px;border-radius:6px;border:1px solid var(--admin-border);flex:1;">
                    <input type="radio" name="ruleLevel" value="warning" checked style="accent-color:#f59e0b;">
                    <span style="font-size:.83rem;">⚠️ <b>Warning</b></span>
                  </label>
                  <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:8px 12px;border-radius:6px;border:1px solid var(--admin-border);flex:1;">
                    <input type="radio" name="ruleLevel" value="alarm" style="accent-color:#ef4444;">
                    <span style="font-size:.83rem;">🚨 <b>Alarm</b></span>
                  </label>
                </div>
              </div>

              <!-- Maintenance option -->
              <div style="padding:12px 14px;border-radius:8px;border:1px solid var(--admin-border);">
                <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
                  <input type="checkbox" id="doMaintenance" style="accent-color:#22c55e;width:16px;height:16px;">
                  <div>
                    <span style="font-weight:600;font-size:.85rem;">🔧 Tạo lịch bảo trì</span>
                    <div style="font-size:.73rem;opacity:.55;margin-top:1px;">Tự động tạo MaintenanceTask khi vượt ngưỡng</div>
                  </div>
                </label>
                <div id="maintRow" style="display:none;margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,.07);display:none;">
                  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                    <div>
                      <label style="font-size:.78rem;opacity:.7;display:block;margin-bottom:4px;">Loại công việc</label>
                      <select id="maintTypeInput" class="form-select" style="padding:6px 10px;font-size:.82rem;">
                        <option value="inspection">Kiểm tra</option>
                        <option value="repair">Sửa chữa</option>
                        <option value="cleaning">Vệ sinh</option>
                        <option value="calibration">Hiệu chỉnh</option>
                      </select>
                    </div>
                    <div>
                      <label style="font-size:.78rem;opacity:.7;display:block;margin-bottom:4px;">Lên lịch sau (ngày)</label>
                      <input id="maintDaysInput" type="number" class="form-input" value="30" min="1" max="365"
                        style="width:100%;padding:6px 10px;">
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button id="ruleModalCancel" class="btn-industrial">Hủy</button>
          <button id="ruleModalSave" class="btn-industrial btn-primary">Lưu Rule</button>
        </div>
      </div>
    </div>`;
  }

  async mount(): Promise<void> {
    await Promise.all([this.loadRules(), this.loadPoints()]);
    this.bindEvents();
  }

  private async loadRules(): Promise<void> {
    try {
      this.rules = await stationApi.getRules();
      this.renderList();
    } catch (e) {
      const body = document.getElementById('ruleListBody');
      if (body) body.innerHTML = `<div style="text-align:center;color:#ef4444;padding:30px">Lỗi tải rules: ${e}</div>`;
    }
  }

  private async loadPoints(): Promise<void> {
    try {
      const pts = await stationApi.getLatestPoints();
      if (!pts.length) return;
      // Unique pointIds, build label from pointId + unit
      const seen = new Set<string>();
      this.pointOptions = pts
        .filter(p => { const ok = !seen.has(p.pointId); seen.add(p.pointId); return ok; })
        .map(p => ({
          value: p.pointId,
          label: this.prettifyPoint(p.pointId, p.unit),
        }));
      // Update the select element if it exists (modal already rendered)
      const sel = document.getElementById('rulePointInput') as HTMLSelectElement | null;
      if (sel) {
        const cur = sel.value;
        sel.innerHTML = this.pointOptions.map(p => `<option value="${p.value}">${p.label}</option>`).join('');
        if (this.pointOptions.some(p => p.value === cur)) sel.value = cur;
      }
    } catch { /* keep fallback */ }
  }

  private prettifyPoint(pointId: string, unit: string): string {
    const names: Record<string, string> = {
      nhiet_do_pha_1: 'Nhiệt độ Pha 1',
      nhiet_do_pha_2: 'Nhiệt độ Pha 2',
      nhiet_do_pha_3: 'Nhiệt độ Pha 3',
      phong_dien:     'Phóng điện PD',
    };
    const name = names[pointId] ?? pointId.replace(/_/g, ' ');
    return unit ? `${name} (${unit})` : name;
  }

  private renderList(): void {
    const body = document.getElementById('ruleListBody');
    if (!body) return;

    // Update stats
    const total   = this.rules.length;
    const enabled = this.rules.filter(r => r.enabled).length;
    const alarm   = this.rules.filter(r => this.parseLevel(r.actions) === 'alarm').length;
    document.getElementById('statTotal')!.textContent   = String(total);
    document.getElementById('statEnabled')!.textContent = String(enabled);
    document.getElementById('statAlarm')!.textContent   = String(alarm);

    if (total === 0) {
      body.innerHTML = `<div style="text-align:center;color:#94a3b8;padding:50px;">Chưa có rule nào. Nhấn <b>+ Thêm Rule</b> để bắt đầu.</div>`;
      return;
    }

    body.innerHTML = this.rules.map(r => {
      const cond    = this.parseCondition(r.condition);
      const actions = this.parseActions(r.actions);
      const pointLabel = this.pointOptions.find(p => p.value === cond.point)?.label ?? cond.point;

      // Badge loại rule
      let typeBadges = '';
      if (actions.doHealth)
        typeBadges += `<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:4px;background:rgba(14,165,233,.15);color:#38bdf8;font-size:.72rem;font-weight:700;margin-right:4px;">🏥 Sức khỏe −${actions.penalty}đ</span>`;
      if (actions.doAlert) {
        const isAlarm = actions.level === 'alarm';
        typeBadges += `<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:4px;background:${isAlarm ? 'rgba(239,68,68,.15)' : 'rgba(245,158,11,.15)'};color:${isAlarm ? '#f87171' : '#fbbf24'};font-size:.72rem;font-weight:700;">${isAlarm ? '🚨 Alarm' : '⚠️ Warning'}</span>`;
      }
      if (actions.doMaintenance)
        typeBadges += `<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:4px;background:rgba(34,197,94,.15);color:#4ade80;font-size:.72rem;font-weight:700;">🔧 ${actions.maintDays}d</span>`;

      return `
      <div class="re-grid-row" data-id="${r.id}">
        <div>
          <div class="re-rule-name">${r.name}</div>
          <div class="re-cond" style="margin-top:4px;opacity:.65;">
            ${pointLabel}
            <code>${OP_LABELS[cond.op] ?? cond.op} ${cond.value}</code>
            ${r.deviceName ? `<span style="opacity:.5;font-size:.75rem;margin-left:4px;">· ${r.deviceName}</span>` : ''}
          </div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center;">${typeBadges}</div>
        <div><b style="color:${actions.doAlert && actions.level === 'alarm' ? '#ef4444' : '#0ea5e9'}">${cond.value}</b></div>
        <div style="display:flex;justify-content:center;">
          <label class="toggle-switch" title="${r.enabled ? 'Tắt rule' : 'Bật rule'}">
            <input type="checkbox" class="re-toggle" data-id="${r.id}" ${r.enabled ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div style="display:flex;gap:6px;">
          <button class="btn-industrial btn-sm re-edit-btn" data-id="${r.id}" title="Sửa">✏</button>
          <button class="btn-industrial btn-sm btn-danger re-del-btn" data-id="${r.id}" title="Xóa">🗑</button>
        </div>
      </div>`;
    }).join('');

    // Toggle
    body.querySelectorAll('.re-toggle').forEach(chk => {
      chk.addEventListener('change', async (e) => {
        const id = (chk as HTMLElement).dataset.id!;
        try {
          await stationApi.toggleRule(id);
          await this.loadRules();
        } catch (err) {
          alert(`Lỗi: ${err}`);
          (e.target as HTMLInputElement).checked = !(e.target as HTMLInputElement).checked;
        }
      });
    });

    // Edit
    body.querySelectorAll('.re-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => this.openEditModal((btn as HTMLElement).dataset.id!));
    });

    // Delete
    body.querySelectorAll('.re-del-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!await confirmDialog({ title: 'Xóa Rule', message: 'Xóa rule này? Các cảnh báo liên quan vẫn được giữ lại.', confirmText: 'Xóa', danger: true })) return;
        await stationApi.deleteRule((btn as HTMLElement).dataset.id!);
        await this.loadRules();
      });
    });
  }

  private openAddModal(): void {
    this.editingId = null;
    (document.getElementById('ruleModalTitle') as HTMLElement).textContent = 'Thêm Rule mới';
    (document.getElementById('ruleNameInput') as HTMLInputElement).value = '';
    (document.getElementById('ruleValueInput') as HTMLInputElement).value = '';
    const addSel = document.getElementById('rulePointInput') as HTMLSelectElement;
    addSel.innerHTML = this.pointOptions.map(p => `<option value="${p.value}">${p.label}</option>`).join('');
    addSel.selectedIndex = 0;
    (document.getElementById('ruleOpInput') as HTMLSelectElement).value = '>';
    // Defaults: chỉ alert, không health, không maintenance
    (document.getElementById('doHealth') as HTMLInputElement).checked = false;
    (document.getElementById('doAlert') as HTMLInputElement).checked = true;
    (document.getElementById('doMaintenance') as HTMLInputElement).checked = false;
    (document.getElementById('penaltyInput') as HTMLInputElement).value = '10';
    (document.getElementById('penaltyRow') as HTMLElement).style.display = 'none';
    (document.getElementById('levelRow') as HTMLElement).style.display = 'flex';
    (document.getElementById('maintRow') as HTMLElement).style.display = 'none';
    (document.getElementById('maintTypeInput') as HTMLSelectElement).value = 'inspection';
    (document.getElementById('maintDaysInput') as HTMLInputElement).value = '30';
    (document.querySelector('input[name="ruleLevel"][value="warning"]') as HTMLInputElement).checked = true;
    document.getElementById('ruleModal')!.classList.add('active');
  }

  private openEditModal(id: string): void {
    const rule = this.rules.find(r => r.id === id);
    if (!rule) return;
    this.editingId = id;
    const cond    = this.parseCondition(rule.condition);
    const actions = this.parseActions(rule.actions);

    (document.getElementById('ruleModalTitle') as HTMLElement).textContent = `Sửa Rule — ${rule.name}`;
    (document.getElementById('ruleNameInput') as HTMLInputElement).value = rule.name;
    (document.getElementById('ruleValueInput') as HTMLInputElement).value = String(cond.value);
    const pointSel = document.getElementById('rulePointInput') as HTMLSelectElement;
    pointSel.innerHTML = this.pointOptions.map(p => `<option value="${p.value}">${p.label}</option>`).join('');
    pointSel.value = cond.point;
    (document.getElementById('ruleOpInput') as HTMLSelectElement).value = cond.op;

    (document.getElementById('doHealth') as HTMLInputElement).checked      = actions.doHealth;
    (document.getElementById('doAlert') as HTMLInputElement).checked       = actions.doAlert;
    (document.getElementById('doMaintenance') as HTMLInputElement).checked = actions.doMaintenance;
    (document.getElementById('penaltyInput') as HTMLInputElement).value    = String(actions.penalty);
    (document.getElementById('penaltyRow') as HTMLElement).style.display   = actions.doHealth      ? 'block' : 'none';
    (document.getElementById('levelRow') as HTMLElement).style.display     = actions.doAlert       ? 'flex'  : 'none';
    (document.getElementById('maintRow') as HTMLElement).style.display     = actions.doMaintenance ? 'block' : 'none';
    (document.getElementById('maintTypeInput') as HTMLSelectElement).value = actions.maintType;
    (document.getElementById('maintDaysInput') as HTMLInputElement).value  = String(actions.maintDays);
    (document.querySelector(`input[name="ruleLevel"][value="${actions.level}"]`) as HTMLInputElement).checked = true;

    document.getElementById('ruleModal')!.classList.add('active');
  }

  private bindEvents(): void {
    document.getElementById('btnAddRule')?.addEventListener('click', () => this.openAddModal());

    // Toggle hiển thị phần penalty khi check/uncheck "Sức khỏe"
    document.getElementById('doHealth')?.addEventListener('change', (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      (document.getElementById('penaltyRow') as HTMLElement).style.display = checked ? 'block' : 'none';
    });

    // Toggle hiển thị phần level khi check/uncheck "Cảnh báo"
    document.getElementById('doAlert')?.addEventListener('change', (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      (document.getElementById('levelRow') as HTMLElement).style.display = checked ? 'flex' : 'none';
    });

    // Toggle hiển thị phần maintenance
    document.getElementById('doMaintenance')?.addEventListener('change', (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      (document.getElementById('maintRow') as HTMLElement).style.display = checked ? 'block' : 'none';
    });

    const closeModal = () => {
      document.getElementById('ruleModal')!.classList.remove('active');
      this.editingId = null;
    };
    document.getElementById('ruleModalClose')?.addEventListener('click', closeModal);
    document.getElementById('ruleModalCancel')?.addEventListener('click', closeModal);

    document.getElementById('ruleModalSave')?.addEventListener('click', async () => {
      const name  = (document.getElementById('ruleNameInput') as HTMLInputElement).value.trim();
      const point = (document.getElementById('rulePointInput') as HTMLSelectElement).value;
      const op    = (document.getElementById('ruleOpInput') as HTMLSelectElement).value;
      const value = parseFloat((document.getElementById('ruleValueInput') as HTMLInputElement).value);
      const level = (document.querySelector('input[name="ruleLevel"]:checked') as HTMLInputElement)?.value ?? 'warning';

      if (!name) { alert('Vui lòng nhập tên rule'); return; }
      if (isNaN(value)) { alert('Vui lòng nhập ngưỡng hợp lệ'); return; }

      const doHealth      = (document.getElementById('doHealth') as HTMLInputElement).checked;
      const doAlert       = (document.getElementById('doAlert') as HTMLInputElement).checked;
      const doMaintenance = (document.getElementById('doMaintenance') as HTMLInputElement).checked;
      const penalty       = parseInt((document.getElementById('penaltyInput') as HTMLInputElement).value) || 10;
      const maintType     = (document.getElementById('maintTypeInput') as HTMLSelectElement).value;
      const maintDays     = parseInt((document.getElementById('maintDaysInput') as HTMLInputElement).value) || 30;

      if (!doHealth && !doAlert && !doMaintenance) {
        alert('Vui lòng chọn ít nhất 1 tác động');
        return;
      }

      const actionList: object[] = [];
      if (doHealth)      actionList.push({ type: 'health',      penalty });
      if (doAlert)       actionList.push({ type: 'alert',       level });
      if (doMaintenance) actionList.push({ type: 'maintenance', taskType: maintType, scheduledInDays: maintDays });

      const condition = JSON.stringify({ point, op, value });
      const actions   = JSON.stringify(actionList);

      try {
        if (this.editingId) {
          await stationApi.updateRule(this.editingId, { name, condition, actions });
        } else {
          await stationApi.createRule({ name, condition, actions, enabled: true });
        }
        closeModal();
        await this.loadRules();
      } catch (e) {
        alert(`Lỗi lưu rule: ${e}`);
      }
    });
  }

  private parseCondition(json: string): { point: string; op: string; value: number } {
    try { return JSON.parse(json); }
    catch { return { point: '?', op: '>', value: 0 }; }
  }

  private parseActions(actionsJson: string): {
    doHealth: boolean; penalty: number;
    doAlert: boolean; level: string;
    doMaintenance: boolean; maintType: string; maintDays: number;
  } {
    try {
      const arr: any[] = JSON.parse(actionsJson);
      const healthA = arr.find((a: any) => a.type === 'health');
      const alertA  = arr.find((a: any) => a.type === 'alert' || !a.type);
      const maintA  = arr.find((a: any) => a.type === 'maintenance');
      return {
        doHealth:      !!healthA,
        penalty:       healthA?.penalty ?? 10,
        doAlert:       !!alertA,
        level:         alertA?.level ?? 'warning',
        doMaintenance: !!maintA,
        maintType:     maintA?.taskType ?? 'inspection',
        maintDays:     maintA?.scheduledInDays ?? 30,
      };
    } catch {
      return { doHealth: false, penalty: 10, doAlert: true, level: 'warning', doMaintenance: false, maintType: 'inspection', maintDays: 30 };
    }
  }

  private parseLevel(actionsJson: string): string {
    return this.parseActions(actionsJson).level;
  }

  destroy(): void {}
}
