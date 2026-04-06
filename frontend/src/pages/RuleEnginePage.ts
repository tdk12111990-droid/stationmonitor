// ============================================================
// RuleEnginePage — Quản lý Rule Engine từ backend API
// GET/POST/PUT/DELETE/PATCH /api/v1/rules
// ============================================================

import { stationApi, type Rule } from '@/services/StationApiService';
import { confirmDialog } from '@/utils/confirm';

const POINT_OPTIONS = [
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
              ${POINT_OPTIONS.map(p => `<option value="${p.value}">${p.label}</option>`).join('')}
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
          <div class="form-group" style="margin:0">
            <label>Mức cảnh báo</label>
            <div style="display:flex;gap:12px;margin-top:6px;">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:10px 16px;border-radius:8px;border:1px solid var(--admin-border);flex:1;transition:border-color .15s;" id="levelWarningCard">
                <input type="radio" name="ruleLevel" value="warning" checked style="accent-color:#f59e0b;">
                <span>⚠️ <b>Warning</b></span>
              </label>
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:10px 16px;border-radius:8px;border:1px solid var(--admin-border);flex:1;transition:border-color .15s;" id="levelAlarmCard">
                <input type="radio" name="ruleLevel" value="alarm" style="accent-color:#ef4444;">
                <span>🚨 <b>Alarm</b></span>
              </label>
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
    await this.loadRules();
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
      const cond  = this.parseCondition(r.condition);
      const level = this.parseLevel(r.actions);
      const pointLabel = POINT_OPTIONS.find(p => p.value === cond.point)?.label ?? cond.point;
      const levelBadge = level === 'alarm'
        ? '<span class="tag tag-danger">🚨 Alarm</span>'
        : '<span class="tag tag-warning">⚠️ Warning</span>';

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
        <div>${levelBadge}</div>
        <div><b style="color:${level === 'alarm' ? '#ef4444' : '#f59e0b'}">${cond.value}</b></div>
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
    (document.getElementById('rulePointInput') as HTMLSelectElement).selectedIndex = 0;
    (document.getElementById('ruleOpInput') as HTMLSelectElement).value = '>';
    (document.querySelector('input[name="ruleLevel"][value="warning"]') as HTMLInputElement).checked = true;
    document.getElementById('ruleModal')!.classList.add('active');
  }

  private openEditModal(id: string): void {
    const rule = this.rules.find(r => r.id === id);
    if (!rule) return;
    this.editingId = id;
    const cond  = this.parseCondition(rule.condition);
    const level = this.parseLevel(rule.actions);

    (document.getElementById('ruleModalTitle') as HTMLElement).textContent = `Sửa Rule — ${rule.name}`;
    (document.getElementById('ruleNameInput') as HTMLInputElement).value = rule.name;
    (document.getElementById('ruleValueInput') as HTMLInputElement).value = String(cond.value);
    (document.getElementById('rulePointInput') as HTMLSelectElement).value = cond.point;
    (document.getElementById('ruleOpInput') as HTMLSelectElement).value = cond.op;
    (document.querySelector(`input[name="ruleLevel"][value="${level}"]`) as HTMLInputElement).checked = true;
    document.getElementById('ruleModal')!.classList.add('active');
  }

  private bindEvents(): void {
    document.getElementById('btnAddRule')?.addEventListener('click', () => this.openAddModal());

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

      const condition = JSON.stringify({ point, op, value });
      const actions   = JSON.stringify([{ type: 'alert', level }]);

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

  private parseLevel(actionsJson: string): string {
    try { return JSON.parse(actionsJson)[0]?.level ?? 'warning'; }
    catch { return 'warning'; }
  }

  destroy(): void {}
}
