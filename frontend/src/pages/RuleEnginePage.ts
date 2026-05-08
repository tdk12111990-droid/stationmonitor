// ============================================================
// RuleEnginePage — Quản lý Rule Engine từ backend API
// GET/POST/PUT/DELETE/PATCH /api/v1/rules
// ============================================================

import { stationApi, type Rule } from '@/services/StationApiService';
import { confirmDialog } from '@/utils/confirm';

// Fallback khi API chưa trả về
const FALLBACK_POINTS = [
  ...Array.from({ length: 10 }, (_, i) => ({ value: `P${i + 1}`, label: `P${i + 1} — Cam nhiệt (°C)` })),
  { value: 'nhiet_do_pha_1', label: 'Nhiệt độ Pha 1 (°C)' },
  { value: 'nhiet_do_pha_2', label: 'Nhiệt độ Pha 2 (°C)' },
  { value: 'nhiet_do_pha_3', label: 'Nhiệt độ Pha 3 (°C)' },
  { value: 'phong_dien', label: 'Phóng điện PD (dB)' },
];

export class RuleEnginePage {
  private rules: Rule[] = [];
  private editingId: string | null = null;
  private pointOptions: { value: string; label: string }[] = FALLBACK_POINTS;
  private expandedSets = new Set<string>();

  render(): string {
    return `
    <style>
      .re-grid-header, .re-grid-row {
        display: grid;
        grid-template-columns: 1fr 180px 80px 90px 100px;
        align-items: center;
      }
      .re-grid-header {
        border-bottom: 2px solid rgba(255,255,255,.07);
        background: #0f172a;
      }
      .re-grid-header > div {
        padding: 12px 14px;
        font-size: .68rem; font-weight: 800; letter-spacing: .6px;
        text-transform: uppercase; color: #94a3b8;
      }
      .re-grid-row {
        border-bottom: 1px solid rgba(255,255,255,.03);
        background: #0b0f1a;
        transition: background .1s;
      }
      .re-grid-row:hover { background: rgba(255,255,255,.02); }
      .re-grid-row > div { padding: 14px 16px; font-size: .82rem; color: #e2e8f0; }
      .re-rule-name { font-weight: 600; }
      
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
      .toggle-switch input:checked + .toggle-slider { background:#3b82f6; }
      .toggle-switch input:checked + .toggle-slider:before { transform:translateX(18px); }
      
      .list-page {
        padding: 20px;
        padding-bottom: 200px;
      }
      .re-set-card { background: #0f172a!important; border: 1px solid rgba(255,255,255,.05)!important; }
      .re-set-header { background: #1e293b!important; border-left: 4px solid #3b82f6!important; }

      .row-warning { border-left: 3px solid #f59e0b; }
      .row-alarm { border-left: 3px solid #ef4444; }
    </style>

    <div class="list-page">
      <div class="page-toolbar" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
        <h2 style="margin:0; font-size: 1.1rem; color: #f8fafc; letter-spacing: 1px;">🎛️ RULE ENGINE</h2>
        <button id="btnAddRule" class="btn-industrial btn-primary" style="padding: 8px 16px;">+ Thêm Rule</button>
      </div>

      <!-- Stats bar -->
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:20px;" id="reStats">
        <div class="admin-card" style="padding:16px 20px; display:flex; flex-direction:column; gap:4px; border: 1px solid rgba(255,255,255,.05); background:#0f172a;">
          <div style="font-size:.62rem;opacity:.5;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Tổng rules</div>
          <div style="font-size:1.8rem;font-weight:800;color:#f1f5f9;" id="statTotal">—</div>
        </div>
        <div class="admin-card" style="padding:16px 20px; display:flex; flex-direction:column; gap:4px; border: 1px solid rgba(255,255,255,.05); background:#0f172a;">
          <div style="font-size:.62rem;opacity:.5;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Đang bật</div>
          <div style="font-size:1.8rem;font-weight:800;color:#10b981;" id="statEnabled">—</div>
        </div>
        <div class="admin-card" style="padding:16px 20px; display:flex; flex-direction:column; gap:4px; border: 1px solid rgba(255,255,255,.05); background:#0f172a;">
          <div style="font-size:.62rem;opacity:.5;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Warning rules</div>
          <div style="font-size:1.8rem;font-weight:800;color:#f59e0b;" id="statWarning">—</div>
        </div>
        <div class="admin-card" style="padding:16px 20px; display:flex; flex-direction:column; gap:4px; border: 1px solid rgba(255,255,255,.05); background:#0f172a;">
          <div style="font-size:.62rem;opacity:.5;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Alarm rules</div>
          <div style="font-size:1.8rem;font-weight:800;color:#ef4444;" id="statAlarm">—</div>
        </div>
      </div>

      <div id="ruleListBody">
        <div style="text-align:center;padding:50px;color:#94a3b8;">Đang tải...</div>
      </div>
    </div>

    <!-- Modal thêm/sửa rule -->
    <div id="ruleModal" class="modal-overlay">
      <div class="modal-content" style="width:550px">
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
            <label>Bộ rule <small style="opacity:.5">(nhóm theo tủ/thiết bị)</small></label>
            <input id="ruleSetInput" class="form-input" list="ruleSetDatalist"
              placeholder="VD: Tủ 471 — CBM" />
            <datalist id="ruleSetDatalist"></datalist>
          </div>
          <div class="form-group" style="margin:0">
            <label>Điểm đo <span style="color:#ef4444">*</span></label>
            <select id="rulePointInput" class="form-select">
              ${FALLBACK_POINTS.map(p => `<option value="${p.value}">${p.label}</option>`).join('')}
            </select>
          </div>

          <!-- PHẦN THIẾT LẬP NGƯỠNG (ĐÃ ĐỒNG BỘ) -->
          <div style="border:1px solid rgba(255,255,255,.05); padding:16px; border-radius:8px; background:rgba(255,255,255,.01);">
            <div style="font-size:0.7rem; color:#94a3b8; font-weight:700; margin-bottom:12px; text-transform:uppercase; letter-spacing:0.5px;">Thiết lập mức ngưỡng</div>
            
            <div class="form-group" style="margin-bottom:12px">
              <label>Toán tử chung</label>
              <select id="ruleOpInput" class="form-select">
                <option value=">">&gt; Lớn hơn</option>
                <option value="<">&lt; Nhỏ hơn</option>
                <option value=">=" selected>&gt;= Lớn hơn hoặc bằng</option>
                <option value="<=">&lt;= Nhỏ hơn hoặc bằng</option>
                <option value="==">== Bằng</option>
              </select>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
              <div class="form-group" style="margin:0">
                <label style="color:#f59e0b;">Kiểm tra (Warning)</label>
                <input id="rulePreAlarmInput" class="form-input" type="number" placeholder="Trống = Tắt" style="border-color:rgba(245,158,11,.2)" step="any" />
              </div>
              <div class="form-group" style="margin:0">
                <label style="color:#ef4444;">Nguy hiểm (Alarm)</label>
                <input id="ruleAlarmInput" class="form-input" type="number" placeholder="Trống = Tắt" style="border-color:rgba(239,68,68,.2)" step="any" />
              </div>
            </div>
            
            <!-- Trường ẩn để tương thích với các điểm đơn cũ -->
            <input id="ruleValueInput" type="hidden" />
          </div>

          <!-- Tác động của Rule -->
          <div class="form-group" style="margin:0" id="modalActionsGroup">
            <label>Tác động <span style="opacity:.5;font-size:.75rem;">(chọn ít nhất 1)</span></label>
            <div style="display:flex;flex-direction:column;gap:8px;margin-top:8px;">
               
              <!-- Cảnh báo -->
              <div id="alertActionCard" style="padding:12px 14px;border-radius:8px;border:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.01);">
                <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
                  <input type="checkbox" id="doAlert" checked style="accent-color:#f59e0b;width:16px;height:16px;">
                  <div>
                    <span style="font-weight:600;font-size:.85rem;">🔔 Tạo cảnh báo</span>
                    <div style="font-size:.73rem;opacity:.55;margin-top:1px;">Tạo Alert + thông báo theo mức ngưỡng</div>
                  </div>
                </label>
                <div id="levelRow" style="display:flex;gap:10px;margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,.07);">
                  <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:8px 12px;border-radius:6px;border:1px solid rgba(255,255,255,.07);flex:1;">
                    <input type="radio" name="ruleLevel" value="warning" checked style="accent-color:#f59e0b;">
                    <span style="font-size:.83rem;">⚠️ <b>Warning</b></span>
                  </label>
                  <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:8px 12px;border-radius:6px;border:1px solid rgba(255,255,255,.07);flex:1;">
                    <input type="radio" name="ruleLevel" value="alarm" style="accent-color:#ef4444;">
                    <span style="font-size:.83rem;">🚨 <b>Alarm</b></span>
                  </label>
                </div>
              </div>

              <!-- Sức khỏe -->
              <div style="padding:12px 14px;border-radius:8px;border:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.01);">
                <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
                  <input type="checkbox" id="doHealth" style="accent-color:#0ea5e9;width:16px;height:16px;">
                  <div>
                    <span style="font-weight:600;font-size:.85rem;">🏥 Chỉ số sức khỏe</span>
                    <div style="font-size:.73rem;opacity:.55;margin-top:1px;">Giảm điểm sức khỏe thiết bị khi vi phạm</div>
                  </div>
                </label>
                <div id="penaltyRow" style="display:none;margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,.07);">
                  <label style="font-size:.7rem;color:#94a3b8;display:block;margin-bottom:6px;">Điểm trừ (0-100)</label>
                  <input type="number" id="penaltyInput" class="form-input" value="10" />
                </div>
              </div>

              <!-- Bảo trì -->
              <div style="padding:12px 14px;border-radius:8px;border:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.01);">
                <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
                  <input type="checkbox" id="doMaintenance" style="accent-color:#10b981;width:16px;height:16px;">
                  <div>
                    <span style="font-weight:600;font-size:.85rem;">🔧 Kế hoạch bảo trì</span>
                    <div style="font-size:.73rem;opacity:.55;margin-top:1px;">Tự động tạo phiếu bảo trì định kỳ</div>
                  </div>
                </label>
                <div id="maintRow" style="display:none;margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,.07);">
                  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                    <div>
                      <label style="font-size:.7rem;color:#94a3b8;display:block;margin-bottom:6px;">Loại việc</label>
                      <select id="maintTypeInput" class="form-select" style="padding:6px 10px;font-size:.75rem;">
                        <option value="inspection">Kiểm tra</option>
                        <option value="repair">Sửa chữa</option>
                        <option value="cleaning">Vệ sinh</option>
                        <option value="calibration">Hiệu chuẩn</option>
                      </select>
                    </div>
                    <div>
                      <label style="font-size:.7rem;color:#94a3b8;display:block;margin-bottom:6px;">Thời hạn (ngày)</label>
                      <input type="number" id="maintDaysInput" class="form-input" value="30" style="padding:6px 10px;font-size:.75rem;" />
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
    this.renderList();
    this.bindEvents();
  }

  private renderList(): void {
    const body = document.getElementById('ruleListBody');
    if (!body) return;

    // Cập nhật thống kê
    const total = this.rules.length;
    const enabled = this.rules.filter(r => r.enabled).length;
    
    let totalWarning = 0;
    let totalAlarm = 0;

    for (const r of this.rules) {
      const cond = this.parseCondition(r.condition);
      const actions = this.parseActions(r.actions);
      if (cond.alarm !== null && cond.alarm !== undefined && cond.alarm !== '') totalAlarm++;
      else if (actions.level === 'alarm') totalAlarm++;

      if (cond.pre_alarm !== null && cond.pre_alarm !== undefined && cond.pre_alarm !== '') totalWarning++;
      else if (actions.level === 'warning') totalWarning++;
      else if (actions.level === 'hybrid') totalWarning++; // Hybrid counts as both in list rendering but for stats we count the rule
    }

    document.getElementById('statTotal')!.textContent = String(total);
    document.getElementById('statEnabled')!.textContent = String(enabled);
    document.getElementById('statWarning')!.textContent = String(totalWarning);
    document.getElementById('statAlarm')!.textContent = String(totalAlarm);

    if (total === 0) {
      body.innerHTML = `<div style="text-align:center;color:#64748b;padding:50px; font-size: 0.85rem;">Chưa có rule nào. Nhấn <b>+ Thêm Rule</b> để bắt đầu.</div>`;
      return;
    }

    const grouped = new Map<string, Rule[]>();
    for (const r of this.rules) {
      let key = r.ruleSet ?? '';
      if (key === 'camera_thermal_zones') key = 'Các điểm đo của cam nhiệt';
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(r);
    }
    const sortedGroups = [...grouped.entries()].sort((a, b) =>
      a[0] && !b[0] ? -1 : !a[0] && b[0] ? 1 : a[0].localeCompare(b[0]));

    // Render từng dòng (1 rule = 1 dòng duy nhất, gom cả Warning/Alarm)
    const renderRow = (r: Rule): string => {
      const cond = this.parseCondition(r.condition);
      const actions = this.parseActions(r.actions);
      const pointLabelRaw = this.pointOptions.find(p => p.value === cond.point)?.label ?? cond.point;
      const pointLabel = pointLabelRaw.split(' — ')[0];

      const hasAlarm = cond.alarm !== null && cond.alarm !== undefined && cond.alarm !== '';
      const hasWarning = (cond.pre_alarm !== null && cond.pre_alarm !== undefined && cond.pre_alarm !== '') || (cond.value !== undefined && actions.level === 'warning');
      const valAlarm = cond.alarm ?? (actions.level === 'alarm' ? cond.value : null);
      const valWarning = cond.pre_alarm ?? (actions.level === 'warning' ? cond.value : null);

      let badgeHtml = '';
      let valueHtml = '';
      let rowClass = '';

      if (hasAlarm && hasWarning) {
        badgeHtml = `
          <div style="display:flex;flex-direction:column;gap:2px;">
            <span style="padding:1px 6px;border-radius:3px;background:rgba(239,68,68,.1);color:#ef4444;font-size:0.6rem;font-weight:700;text-align:center;">🚨 Alarm</span>
            <span style="padding:1px 6px;border-radius:3px;background:rgba(245,158,11,.1);color:#f59e0b;font-size:0.6rem;font-weight:700;text-align:center;">⚠️ Warning</span>
          </div>`;
        valueHtml = `<span style="color:#ef4444;">${valAlarm}</span> <span style="opacity:0.3;margin:0 2px;">/</span> <span style="color:#f59e0b;">${valWarning}</span>`;
        rowClass = 'row-alarm'; // Ưu tiên màu đỏ nếu có cả 2
      } else if (hasAlarm) {
        badgeHtml = `<span style="padding:2px 6px;border-radius:3px;background:rgba(239,68,68,.1);color:#ef4444;font-size:.65rem;font-weight:700;">🚨 Alarm</span>`;
        valueHtml = `<span style="color:#ef4444;">${valAlarm}</span>`;
        rowClass = 'row-alarm';
      } else {
        badgeHtml = `<span style="padding:2px 6px;border-radius:3px;background:rgba(245,158,11,.1);color:#f59e0b;font-size:.65rem;font-weight:700;">⚠️ Warning</span>`;
        valueHtml = `<span style="color:#f59e0b;">${valWarning}</span>`;
        rowClass = 'row-warning';
      }

      // Badge bổ sung cho Health/Maint
      let extraBadges = '';
      if (actions.doHealth) extraBadges += ` <span title="Trừ ${actions.penalty}đ sức khỏe" style="opacity:.6;cursor:help;font-size:0.75rem;">🏥</span>`;
      if (actions.doMaintenance) extraBadges += ` <span title="Tạo phiếu bảo trì" style="opacity:.6;cursor:help;font-size:0.75rem;">🔧</span>`;

      return `
      <div class="re-grid-row ${rowClass}" data-id="${r.id}" style="grid-template-columns: 1fr 140px 90px 90px 100px;">
        <div style="padding-left: 14px">
          <div class="re-rule-name" style="font-size:0.85rem; color:#fff;">${r.name}${extraBadges}</div>
          <div style="font-size: .7rem; opacity: .5; margin-top:3px;">
            ${pointLabel} <code>${cond.op || '≥'}</code>
          </div>
        </div>
        <div style="display:flex;align-items:center;justify-content:center;">${badgeHtml}</div>
        <div style="font-weight:800; font-size:0.9rem; text-align:center;">${valueHtml}</div>
        <div style="display:flex;justify-content:center;">
          <label class="toggle-switch">
            <input type="checkbox" class="re-toggle" data-id="${r.id}" ${r.enabled ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div style="display:flex;gap:4px;justify-content:flex-end;padding-right:10px;">
          <button class="btn-industrial btn-sm re-edit-btn" data-id="${r.id}">✏</button>
          <button class="btn-industrial btn-sm btn-danger re-del-btn" data-id="${r.id}">🗑</button>
        </div>
      </div>`;
    };

    const cards = sortedGroups.map(([groupName, groupRules], idx) => {
      const displayName = groupName || 'Chưa phân nhóm';
      const enabledCount = groupRules.filter(r => r.enabled).length;
      
      let groupWarning = 0;
      let groupAlarm = 0;
      for (const r of groupRules) {
        const cond = this.parseCondition(r.condition);
        const actions = this.parseActions(r.actions);
        if (cond.alarm !== null && cond.alarm !== undefined && cond.alarm !== '') groupAlarm++;
        else if (actions.level === 'alarm') groupAlarm++;
        
        if (cond.pre_alarm !== null && cond.pre_alarm !== undefined && cond.pre_alarm !== '') groupWarning++;
        else if (actions.level === 'warning') groupWarning++;
        else if (actions.level === 'hybrid') groupWarning++;
      }

      const isExpanded = this.expandedSets.has(groupName) || groupName === 'Các điểm đo của cam nhiệt';

      const rowsHtml = groupRules.map(r => renderRow(r)).join('');

      return `
      <div class="admin-card re-set-card" style="margin-bottom:8px; border-radius:8px; overflow:hidden;" data-group-idx="${idx}">
        <div class="re-set-header" style="padding:12px 20px; cursor:pointer; display:flex; align-items:center; gap:12px;">
          <span style="font-size:1.1rem; filter: sepia(1) saturate(5) hue-rotate(-20deg);">📦</span>
          <div style="flex:1;">
            <div style="font-weight:800; font-size:1rem; color:#f1f5f9;">${displayName}</div>
            <div style="font-size:.7rem; color:#94a3b8; margin-top:2px; font-weight:600;">
              ${groupRules.length} rule &nbsp;·&nbsp; 
              <span style="color:#10b981;">${enabledCount} đang bật</span> &nbsp;·&nbsp; 
              <span style="color:#f59e0b;">${groupWarning} warning</span> &nbsp;·&nbsp; 
              <span style="color:#ef4444;">${groupAlarm} alarm</span>
            </div>
          </div>
          <button class="btn-industrial btn-primary re-add-to-set" data-group-idx="${idx}" 
             style="font-size:0.65rem; padding:4px 12px; height:26px; font-weight:900;">+ Thêm rule</button>
          <span class="re-chevron" style="opacity:.5; font-size:0.6rem; transform:rotate(${isExpanded ? '0' : '-90'}deg);">▼</span>
        </div>
        <div class="re-set-body" style="display:${isExpanded ? 'block' : 'none'}; border-top:1px solid rgba(255,255,255,.05);">
          <div class="re-grid-header" style="grid-template-columns: 1fr 140px 90px 90px 100px;">
            <div>Tên Rule / Điểm đo</div>
            <div style="text-align:center;">Cảnh báo</div>
            <div style="text-align:center;">Ngưỡng (A/W)</div>
            <div style="text-align:center;">Bật/Tắt</div>
            <div>Hành động</div>
          </div>
          ${rowsHtml}
        </div>
      </div>`;
    });

    body.innerHTML = `<div style="display:flex;flex-direction:column;gap:10px;">${cards.join('')}</div>`;

    body.querySelectorAll('.re-set-header').forEach(header => {
      header.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('.re-add-to-set')) return;
        const card = header.closest('.re-set-card') as HTMLElement;
        const idx = parseInt(card.dataset.groupIdx!);
        const key = sortedGroups[idx]?.[0] ?? '';
        const bodyEl = card.querySelector('.re-set-body') as HTMLElement;
        const chevron = header.querySelector('.re-chevron') as HTMLElement;
        if (this.expandedSets.has(key)) {
          this.expandedSets.delete(key);
          bodyEl.style.display = 'none';
          chevron.style.transform = 'rotate(-90deg)';
        } else {
          this.expandedSets.add(key);
          bodyEl.style.display = 'block';
          chevron.style.transform = 'rotate(0deg)';
        }
      });
    });

    body.querySelectorAll('.re-add-to-set').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt((btn as HTMLElement).dataset.groupIdx!);
        this.openAddModal(sortedGroups[idx]?.[0] ?? '');
      });
    });

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

    body.querySelectorAll('.re-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => this.openEditModal((btn as HTMLElement).dataset.id!));
    });

    body.querySelectorAll('.re-del-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!await confirmDialog({ title: 'Xóa Rule', message: 'Xóa rule này? Các cảnh báo liên quan vẫn được giữ lại.', confirmText: 'Xóa', danger: true })) return;
        await stationApi.deleteRule((btn as HTMLElement).dataset.id!);
        await this.loadRules();
      });
    });
  }

  private async loadRules(): Promise<void> {
    try {
      this.rules = await stationApi.getRules();
      
      // LOGIC ĐỒNG BỘ THEO YÊU CẦU: P1(30/50, OFF), P2-P10(50/70, ON)
      const isSynced = localStorage.getItem('thermal_rules_sync_v3');
      if (!isSynced && this.rules.length > 0) {
        console.log('--- Resyncing Thermal Rules to User Specs ---');
        for (const r of this.rules) {
          if (r.ruleSet === 'Các điểm đo của cam nhiệt' || r.ruleSet === 'camera_thermal_zones') {
            const cond = this.parseCondition(r.condition);
            if (!cond.point) continue;

            let updated = false;
            let pre_alarm = 50;
            let alarm = 70;

            if (cond.point === 'P1') {
              pre_alarm = 30;
              alarm = 50;
              updated = true;
            } else if (cond.point.match(/^P[2-9]$/) || cond.point === 'P10') {
              pre_alarm = 50;
              alarm = 70;
              updated = true;
            }

            if (updated) {
              await stationApi.updateRule(r.id, {
                ...r,
                enabled: r.enabled, // Giữ nguyên trạng thái cũ thay vì ép tắt P1
                condition: JSON.stringify({ ...cond, type: 'analog', pre_alarm, alarm })
              });
            }
          }
        }
        localStorage.setItem('thermal_rules_sync_v3', 'true');
        this.rules = await stationApi.getRules(); // Refresh list after sync
      }

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
      const seen = new Set<string>();
      const apiPoints = pts
        .filter(p => { const ok = !seen.has(p.pointId); seen.add(p.pointId); return ok; })
        .map(p => ({
          value: p.pointId,
          label: this.prettifyPoint(p.pointId, p.unit),
        }));

      // Bổ sung 10 điểm mặc định cho Camera Nhiệt (P1 -> P10)
      const thermalPoints = Array.from({ length: 10 }, (_, i) => ({
        value: `P${i + 1}`,
        label: `Điểm đo P${i + 1} (Camera Nhiệt)`,
      }));

      this.pointOptions = [...thermalPoints, ...apiPoints];
      
      const sel = document.getElementById('rulePointInput') as HTMLSelectElement | null;
      if (sel) {
        sel.innerHTML = this.pointOptions.map(p => `<option value="${p.value}">${p.label}</option>`).join('');
      }
    } catch { /* fallback */ }
  }

  private prettifyPoint(pointId: string, unit: string): string {
    const names: Record<string, string> = {
      nhiet_do_pha_1: 'Nhiệt độ Pha 1',
      nhiet_do_pha_2: 'Nhiệt độ Pha 2',
      nhiet_do_pha_3: 'Nhiệt độ Pha 3',
      phong_dien: 'Phóng điện PD',
    };
    if (pointId.startsWith('P')) {
        return `Điểm đo ${pointId} (Camera Nhiệt)`;
    }
    const name = names[pointId] ?? pointId.replace(/_/g, ' ');
    return unit ? `${name} (${unit})` : name;
  }

  private openAddModal(presetSet = ''): void {
    this.editingId = null;
    (document.getElementById('ruleModalTitle') as HTMLElement).textContent = 'Thêm Rule mới';
    (document.getElementById('ruleNameInput') as HTMLInputElement).value = '';
    (document.getElementById('rulePreAlarmInput') as HTMLInputElement).value = '';
    (document.getElementById('ruleAlarmInput') as HTMLInputElement).value = '';
    
    const addSel = document.getElementById('rulePointInput') as HTMLSelectElement;
    addSel.innerHTML = this.pointOptions.map(p => `<option value="${p.value}">${p.label}</option>`).join('');
    addSel.selectedIndex = 0;
    (document.getElementById('ruleOpInput') as HTMLSelectElement).value = '>=';
    (document.getElementById('doAlert') as HTMLInputElement).checked = true;
    (document.getElementById('doHealth') as HTMLInputElement).checked = false;
    (document.getElementById('doMaintenance') as HTMLInputElement).checked = false;
    (document.getElementById('penaltyRow') as HTMLElement).style.display = 'none';
    (document.getElementById('maintRow') as HTMLElement).style.display = 'none';
    (document.getElementById('ruleSetInput') as HTMLInputElement).value = presetSet || (addSel.value.startsWith('P') ? 'Các điểm đo của cam nhiệt' : '');
    
    const dl = document.getElementById('ruleSetDatalist') as HTMLDataListElement;
    const sets = [...new Set(this.rules.map(r => r.ruleSet).filter((s): s is string => !!s))];
    dl.innerHTML = sets.map(s => `<option value="${s}">`).join('');
    document.getElementById('ruleModal')!.classList.add('active');
  }

  private openEditModal(id: string): void {
    const rule = this.rules.find(r => r.id === id);
    if (!rule) return;
    this.editingId = id;
    const cond = this.parseCondition(rule.condition);
    const actions = this.parseActions(rule.actions);

    (document.getElementById('ruleModalTitle') as HTMLElement).textContent = `Sửa Rule — ${rule.name}`;
    (document.getElementById('ruleNameInput') as HTMLInputElement).value = rule.name;
    (document.getElementById('rulePreAlarmInput') as HTMLInputElement).value = String(cond.pre_alarm ?? cond.value ?? '');
    (document.getElementById('ruleAlarmInput') as HTMLInputElement).value = String(cond.alarm ?? '');

    const pointSel = document.getElementById('rulePointInput') as HTMLSelectElement;
    pointSel.innerHTML = this.pointOptions.map(p => `<option value="${p.value}">${p.label}</option>`).join('');
    pointSel.value = cond.point;
    (document.getElementById('ruleOpInput') as HTMLSelectElement).value = cond.op || '>=';

    (document.getElementById('doAlert') as HTMLInputElement).checked = actions.doAlert;
    (document.getElementById('doHealth') as HTMLInputElement).checked = actions.doHealth;
    (document.getElementById('doMaintenance') as HTMLInputElement).checked = actions.doMaintenance;

    (document.getElementById('penaltyRow') as HTMLElement).style.display = actions.doHealth ? 'block' : 'none';
    (document.getElementById('maintRow') as HTMLElement).style.display = actions.doMaintenance ? 'block' : 'none';

    (document.getElementById('penaltyInput') as HTMLInputElement).value = String(actions.penalty);
    (document.getElementById('maintTypeInput') as HTMLSelectElement).value = actions.maintType;
    (document.getElementById('maintDaysInput') as HTMLInputElement).value = String(actions.maintDays);
    
    let setVal = rule.ruleSet ?? '';
    if (setVal === 'camera_thermal_zones') setVal = 'Các điểm đo của cam nhiệt';
    (document.getElementById('ruleSetInput') as HTMLInputElement).value = setVal;

    const dlEdit = document.getElementById('ruleSetDatalist') as HTMLDataListElement;
    const setsEdit = [...new Set(this.rules.map(r => r.ruleSet).filter((s): s is string => !!s))];
    dlEdit.innerHTML = setsEdit.map(s => `<option value="${s}">`).join('');

    document.getElementById('ruleModal')!.classList.add('active');
  }

  private bindEvents(): void {
    document.getElementById('btnAddRule')?.addEventListener('click', () => this.openAddModal());

    document.getElementById('rulePointInput')?.addEventListener('change', (e) => {
      const val = (e.target as HTMLSelectElement).value;
      if (val.startsWith('P')) {
        const setInput = document.getElementById('ruleSetInput') as HTMLInputElement;
        if (!setInput.value) setInput.value = 'Các điểm đo của cam nhiệt';
      }
    });

    document.getElementById('doHealth')?.addEventListener('change', (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      (document.getElementById('penaltyRow') as HTMLElement).style.display = checked ? 'block' : 'none';
    });

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
      const name = (document.getElementById('ruleNameInput') as HTMLInputElement).value.trim();
      const point = (document.getElementById('rulePointInput') as HTMLSelectElement).value;
      const op = (document.getElementById('ruleOpInput') as HTMLSelectElement).value;
      const ruleSet = (document.getElementById('ruleSetInput') as HTMLInputElement).value.trim() || undefined;

      if (!name) { alert('Vui lòng nhập tên rule'); return; }

      const preValStr = (document.getElementById('rulePreAlarmInput') as HTMLInputElement).value;
      const alarmValStr = (document.getElementById('ruleAlarmInput') as HTMLInputElement).value;
      const preAlarm = preValStr === '' ? null : parseFloat(preValStr);
      const alarm = alarmValStr === '' ? null : parseFloat(alarmValStr);

      if (preAlarm === null && alarm === null) {
        alert('Vui lòng nhập ít nhất 1 ngưỡng (Warning hoặc Alarm)');
        return;
      }

      const doAlert = (document.getElementById('doAlert') as HTMLInputElement).checked;
      const doHealth = (document.getElementById('doHealth') as HTMLInputElement).checked;
      const doMaintenance = (document.getElementById('doMaintenance') as HTMLInputElement).checked;
      const penalty = parseInt((document.getElementById('penaltyInput') as HTMLInputElement).value) || 10;
      const maintType = (document.getElementById('maintTypeInput') as HTMLSelectElement).value;
      const maintDays = parseInt((document.getElementById('maintDaysInput') as HTMLInputElement).value) || 30;

      if (!doAlert && !doHealth && !doMaintenance) {
        alert('Vui lòng chọn ít nhất 1 tác động');
        return;
      }

      const condition = JSON.stringify({ type: 'analog', point, op, pre_alarm: preAlarm, alarm: alarm });
      
      const actionList: any[] = [];
      if (doAlert) actionList.push({ type: 'alert', level: (alarm !== null && preAlarm !== null) ? 'hybrid' : (alarm !== null ? 'alarm' : 'warning') });
      if (doHealth) actionList.push({ type: 'health', penalty });
      if (doMaintenance) actionList.push({ type: 'maintenance', taskType: maintType, scheduledInDays: maintDays });

      const actions = JSON.stringify(actionList);

      try {
        if (this.editingId) {
          await stationApi.updateRule(this.editingId, { name, ruleSet, condition, actions });
        } else {
          await stationApi.createRule({ name, ruleSet, condition, actions, enabled: true });
        }
        closeModal();
        await this.loadRules();
      } catch (e) {
        alert(`Lỗi lưu rule: ${e}`);
      }
    });
  }

  private parseCondition(json: string): any {
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
      const alertA = arr.find((a: any) => a.type === 'alert' || !a.type);
      const maintA = arr.find((a: any) => a.type === 'maintenance');
      return {
        doHealth: !!healthA,
        penalty: healthA?.penalty ?? 10,
        doAlert: !!alertA,
        level: alertA?.level ?? (alertA === undefined ? 'warning' : 'hybrid'), // Mặc định thermal là hybrid
        doMaintenance: !!maintA,
        maintType: maintA?.taskType ?? 'inspection',
        maintDays: maintA?.scheduledInDays ?? 30,
      };
    } catch {
      return { doHealth: false, penalty: 10, doAlert: true, level: 'warning', doMaintenance: false, maintType: 'inspection', maintDays: 30 };
    }
  }

  destroy(): void { }
}
