// ============================================================
// RuleEnginePage — Quản lý Rule Engine từ backend API
// CRUD rules: tên, điểm đo, điều kiện, ngưỡng, level cảnh báo
// ============================================================

import { stationApi, type Rule } from '@/services/StationApiService';
import { confirmDialog } from '@/utils/confirm';

const POINT_OPTIONS = [
  { value: 'nhiet_do_pha_1', label: 'Nhiệt độ Pha 1 (°C)' },
  { value: 'nhiet_do_pha_2', label: 'Nhiệt độ Pha 2 (°C)' },
  { value: 'nhiet_do_pha_3', label: 'Nhiệt độ Pha 3 (°C)' },
  { value: 'phong_dien',     label: 'Phóng điện PD (dB)' },
];

export class RuleEnginePage {
  private rules: Rule[] = [];

  render(): string {
    return `
    <div class="list-page">
      <div class="page-toolbar">
        <h2>🎛️ RULE ENGINE — Cảnh báo tự động</h2>
        <button id="btnAddRule" class="btn-industrial btn-primary">+ Thêm Rule</button>
      </div>

      <div class="admin-card" style="padding:0;overflow:hidden;margin-top:16px;">
        <table class="data-table">
          <thead>
            <tr>
              <th>Tên Rule</th>
              <th>Điều kiện</th>
              <th>Ngưỡng</th>
              <th>Mức cảnh báo</th>
              <th>Trạng thái</th>
              <th>Hành động</th>
            </tr>
          </thead>
          <tbody id="ruleTableBody">
            <tr><td colspan="6" style="text-align:center;padding:40px;color:#94a3b8">Đang tải...</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modal thêm/sửa rule -->
    <div id="ruleModal" class="modal-overlay">
      <div class="modal-content" style="width:480px">
        <div class="modal-header">
          <h3 id="ruleModalTitle">Thêm Rule mới</h3>
          <button id="ruleModalClose" class="modal-close">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Tên Rule</label>
            <input id="ruleNameInput" class="form-input" placeholder="VD: Nhiệt độ Pha 1 quá cao" />
          </div>
          <div class="form-group">
            <label>Điểm đo</label>
            <select id="rulePointInput" class="form-select">
              ${POINT_OPTIONS.map(p => `<option value="${p.value}">${p.label}</option>`).join('')}
            </select>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="form-group">
              <label>Toán tử</label>
              <select id="ruleOpInput" class="form-select">
                <option value=">">&gt; Lớn hơn</option>
                <option value="<">&lt; Nhỏ hơn</option>
                <option value=">=">&gt;= Lớn hơn hoặc bằng</option>
                <option value="<=">&lt;= Nhỏ hơn hoặc bằng</option>
                <option value="==">== Bằng</option>
              </select>
            </div>
            <div class="form-group">
              <label>Ngưỡng</label>
              <input id="ruleValueInput" class="form-input" type="number" placeholder="80" step="any" />
            </div>
          </div>
          <div class="form-group">
            <label>Mức cảnh báo</label>
            <select id="ruleLevelInput" class="form-select">
              <option value="warning">⚠️ Warning</option>
              <option value="alarm">🚨 Alarm</option>
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button id="ruleModalSave" class="btn-industrial btn-primary">Lưu</button>
          <button id="ruleModalCancelBtn" class="btn-industrial">Hủy</button>
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
      this.renderTable();
    } catch (e) {
      const tbody = document.getElementById('ruleTableBody');
      if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#ef4444;padding:30px">Lỗi tải rules: ${e}</td></tr>`;
    }
  }

  private renderTable(): void {
    const tbody = document.getElementById('ruleTableBody');
    if (!tbody) return;

    if (this.rules.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:30px">Chưa có rule nào. Nhấn "+ Thêm Rule" để bắt đầu.</td></tr>`;
      return;
    }

    tbody.innerHTML = this.rules.map(r => {
      const cond = this.parseCondition(r.condition);
      const level = this.parseLevel(r.actions);
      const pointLabel = POINT_OPTIONS.find(p => p.value === cond.point)?.label ?? cond.point;
      return `
      <tr>
        <td><b>${r.name}</b></td>
        <td>${pointLabel}<br><small style="color:#64748b">${cond.op} ${cond.value}</small></td>
        <td><b style="color:#ef4444">${cond.value}</b></td>
        <td>${level === 'alarm' ? '<span class="tag tag-danger">🚨 Alarm</span>' : '<span class="tag tag-warning">⚠️ Warning</span>'}</td>
        <td>${r.enabled ? '<span class="tag tag-success">Bật</span>' : '<span class="tag" style="background:#475569">Tắt</span>'}</td>
        <td>
          <button class="btn-industrial btn-sm rule-toggle-btn" data-id="${r.id}" data-enabled="${r.enabled}">
            ${r.enabled ? 'Tắt' : 'Bật'}
          </button>
          <button class="btn-industrial btn-sm btn-danger rule-del-btn" data-id="${r.id}">🗑</button>
        </td>
      </tr>`;
    }).join('');

    // Bind row buttons
    document.querySelectorAll('.rule-toggle-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = (btn as HTMLElement).dataset.id!;
        const enabled = (btn as HTMLElement).dataset.enabled === 'true';
        await stationApi.updateRule(id, { enabled: !enabled });
        await this.loadRules();
      });
    });

    document.querySelectorAll('.rule-del-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!await confirmDialog({ message: 'Xóa rule này?', confirmText: 'Xóa rule', danger: true })) return;
        await stationApi.deleteRule((btn as HTMLElement).dataset.id!);
        await this.loadRules();
      });
    });
  }

  private bindEvents(): void {
    document.getElementById('btnAddRule')?.addEventListener('click', () => {
      document.getElementById('ruleModal')?.classList.add('active');
    });

    const closeModal = () => document.getElementById('ruleModal')?.classList.remove('active');
    document.getElementById('ruleModalClose')?.addEventListener('click', closeModal);
    document.getElementById('ruleModalCancelBtn')?.addEventListener('click', closeModal);

    document.getElementById('ruleModalSave')?.addEventListener('click', async () => {
      const name  = (document.getElementById('ruleNameInput') as HTMLInputElement).value.trim();
      const point = (document.getElementById('rulePointInput') as HTMLSelectElement).value;
      const op    = (document.getElementById('ruleOpInput') as HTMLSelectElement).value;
      const value = parseFloat((document.getElementById('ruleValueInput') as HTMLInputElement).value);
      const level = (document.getElementById('ruleLevelInput') as HTMLSelectElement).value;

      if (!name || isNaN(value)) { alert('Vui lòng điền đầy đủ thông tin'); return; }

      await stationApi.createRule({
        name,
        condition: JSON.stringify({ point, op, value }),
        actions:   JSON.stringify([{ type: 'alert', level }]),
        enabled:   true,
      });

      closeModal();
      await this.loadRules();
    });
  }

  private parseCondition(json: string): { point: string; op: string; value: number } {
    try { return JSON.parse(json); }
    catch { return { point: '?', op: '>', value: 0 }; }
  }

  private parseLevel(actionsJson: string): string {
    try {
      const arr = JSON.parse(actionsJson);
      return arr[0]?.level ?? 'warning';
    } catch { return 'warning'; }
  }

  destroy(): void {}
}
