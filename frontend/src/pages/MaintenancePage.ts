// ============================================================
// MaintenancePage — Lịch bảo trì (Phase 8)
// Dark theme, đầy đủ CRUD + suggestions + checklist editor
// ============================================================

import { stationApi, type MaintenanceTask, type MaintenanceSuggestion, type Device } from '@/services/StationApiService';
import { confirmDialog } from '@/utils/confirm';

// ── Checklist mặc định theo loại ──────────────────────────
const DEFAULT_CHECKLIST: Record<string, string[]> = {
  inspection:  ['Kiểm tra tổng quan', 'Đo nhiệt độ', 'Kiểm tra cách điện', 'Ghi nhật ký'],
  repair:      ['Xác định hỏng hóc', 'Chuẩn bị phụ tùng', 'Sửa chữa', 'Kiểm tra lại', 'Ghi nhật ký'],
  cleaning:    ['Vệ sinh bề mặt', 'Vệ sinh cách điện', 'Vệ sinh buồng điện', 'Kiểm tra sau vệ sinh'],
  calibration: ['Kiểm tra thiết bị đo', 'Hiệu chỉnh', 'Ghi kết quả', 'Dán tem kiểm định'],
  other:       ['Mô tả công việc', 'Kiểm tra kết quả', 'Ghi nhật ký'],
};

const TYPE_LABELS: Record<string, string> = {
  inspection:  'Kiểm tra',
  repair:      'Sửa chữa',
  cleaning:    'Vệ sinh',
  calibration: 'Hiệu chỉnh',
  other:       'Khác',
};

const STATUS_COLORS: Record<string, string> = {
  pending:     '#f59e0b',
  in_progress: '#3b82f6',
  completed:   '#10b981',
  overdue:     '#ef4444',
};

const STATUS_LABELS: Record<string, string> = {
  pending:     'Đang chờ',
  in_progress: 'Đang làm',
  completed:   'Hoàn thành',
  overdue:     'Quá hạn',
};

interface ChecklistItem {
  item: string;
  done: boolean;
}

export class MaintenancePage {
  private stationId = '';
  private tasks: MaintenanceTask[] = [];
  private suggestions: MaintenanceSuggestion[] = [];
  private devices: Device[] = [];
  private activeFilter = 'all';
  private editingId: string | null = null;
  private expandedRows = new Set<string>();
  // Checklist editor state
  private modalChecklist: ChecklistItem[] = [];

  // ── Render shell ────────────────────────────────────────
  render(): string {
    return `
    <div id="mt-root" style="
      background:#0f172a;min-height:calc(100vh - 64px);
      padding:20px 24px;color:#e2e8f0;font-family:inherit;
      overflow-y:auto;
    ">
      <!-- HEADER -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
        <h2 style="margin:0;font-size:1.2rem;font-weight:800;letter-spacing:.5px;color:#f1f5f9;">
          LỊCH BẢO TRÌ
        </h2>
        <button id="mt-createBtn" style="
          background:#2563eb;color:#fff;border:none;border-radius:8px;
          padding:9px 18px;font-size:0.82rem;font-weight:700;cursor:pointer;
        ">+ Tạo lịch bảo trì</button>
      </div>

      <!-- STATS ROW -->
      <div id="mt-stats" style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px;">
        <div class="mt-stat-card" data-key="total">
          <div class="mt-stat-label">Tổng cộng</div>
          <div class="mt-stat-value" id="stat-total">0</div>
        </div>
        <div class="mt-stat-card" data-key="pending" style="border-color:rgba(245,158,11,.3);">
          <div class="mt-stat-label">Đang chờ</div>
          <div class="mt-stat-value" id="stat-pending" style="color:#f59e0b;">0</div>
        </div>
        <div class="mt-stat-card" data-key="in_progress" style="border-color:rgba(59,130,246,.3);">
          <div class="mt-stat-label">Đang làm</div>
          <div class="mt-stat-value" id="stat-inprogress" style="color:#3b82f6;">0</div>
        </div>
        <div class="mt-stat-card" data-key="overdue" style="border-color:rgba(239,68,68,.3);">
          <div class="mt-stat-label">Quá hạn</div>
          <div class="mt-stat-value" id="stat-overdue" style="color:#ef4444;">0</div>
        </div>
      </div>

      <!-- SUGGESTIONS -->
      <div id="mt-suggestions" style="display:none;margin-bottom:20px;"></div>

      <!-- FILTER TABS -->
      <div style="display:flex;gap:4px;margin-bottom:14px;background:#1e293b;border-radius:8px;padding:4px;width:fit-content;">
        ${['all','pending','in_progress','overdue','completed'].map(f => `
          <button class="mt-filter-tab${f === 'all' ? ' mt-tab-active' : ''}" data-filter="${f}"
            style="
              padding:6px 14px;border:none;border-radius:6px;font-size:0.78rem;font-weight:600;
              cursor:pointer;transition:all .15s;
              background:${f === 'all' ? '#2563eb' : 'transparent'};
              color:${f === 'all' ? '#fff' : '#64748b'};
            ">
            ${{ all:'Tất cả', pending:'Đang chờ', in_progress:'Đang làm', overdue:'Quá hạn', completed:'Hoàn thành' }[f]}
          </button>
        `).join('')}
      </div>

      <!-- TABLE -->
      <div style="background:#1e293b;border:1px solid #334155;border-radius:12px;overflow:hidden;">
        <table style="width:100%;border-collapse:collapse;font-size:0.8rem;">
          <thead>
            <tr style="background:#0f172a;border-bottom:1px solid #334155;">
              <th style="padding:10px 14px;text-align:left;font-weight:700;color:#64748b;font-size:0.72rem;letter-spacing:.5px;">THIẾT BỊ</th>
              <th style="padding:10px 14px;text-align:left;font-weight:700;color:#64748b;font-size:0.72rem;letter-spacing:.5px;">TIÊU ĐỀ</th>
              <th style="padding:10px 14px;text-align:left;font-weight:700;color:#64748b;font-size:0.72rem;letter-spacing:.5px;">LOẠI</th>
              <th style="padding:10px 14px;text-align:left;font-weight:700;color:#64748b;font-size:0.72rem;letter-spacing:.5px;">NGÀY DỰ KIẾN</th>
              <th style="padding:10px 14px;text-align:left;font-weight:700;color:#64748b;font-size:0.72rem;letter-spacing:.5px;">GIAO CHO</th>
              <th style="padding:10px 14px;text-align:left;font-weight:700;color:#64748b;font-size:0.72rem;letter-spacing:.5px;">CHECKLIST</th>
              <th style="padding:10px 14px;text-align:left;font-weight:700;color:#64748b;font-size:0.72rem;letter-spacing:.5px;">TRẠNG THÁI</th>
              <th style="padding:10px 14px;text-align:left;font-weight:700;color:#64748b;font-size:0.72rem;letter-spacing:.5px;">HÀNH ĐỘNG</th>
            </tr>
          </thead>
          <tbody id="mt-tbody">
            <tr><td colspan="8" style="text-align:center;padding:48px;color:#475569;">
              Đang tải...
            </td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modal tạo/sửa -->
    <div id="mt-modal" style="
      display:none;position:fixed;inset:0;z-index:1000;
      background:rgba(0,0,0,.7);backdrop-filter:blur(4px);
      align-items:center;justify-content:center;
    ">
      <div style="
        background:#1e293b;border:1px solid #334155;border-radius:14px;
        width:620px;max-width:95vw;max-height:90vh;overflow-y:auto;
      ">
        <div style="display:flex;align-items:center;justify-content:space-between;
          padding:16px 20px;border-bottom:1px solid #334155;background:#0f172a;border-radius:14px 14px 0 0;">
          <h3 id="mt-modal-title" style="margin:0;font-size:1rem;font-weight:800;color:#f1f5f9;">Tạo lịch bảo trì</h3>
          <button id="mt-modal-close" style="background:none;border:none;color:#64748b;font-size:1.2rem;cursor:pointer;">✕</button>
        </div>
        <div style="padding:20px;">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;">
            <div>
              <label style="display:block;font-size:0.75rem;font-weight:600;color:#94a3b8;margin-bottom:6px;">Thiết bị</label>
              <select id="mt-f-device" style="
                width:100%;background:#0f172a;border:1px solid #334155;border-radius:8px;
                color:#e2e8f0;padding:8px 12px;font-size:0.82rem;outline:none;
              ">
                <option value="">-- Không chọn --</option>
              </select>
            </div>
            <div>
              <label style="display:block;font-size:0.75rem;font-weight:600;color:#94a3b8;margin-bottom:6px;">Loại bảo trì</label>
              <select id="mt-f-type" style="
                width:100%;background:#0f172a;border:1px solid #334155;border-radius:8px;
                color:#e2e8f0;padding:8px 12px;font-size:0.82rem;outline:none;
              ">
                <option value="inspection">Kiểm tra</option>
                <option value="repair">Sửa chữa</option>
                <option value="cleaning">Vệ sinh</option>
                <option value="calibration">Hiệu chỉnh</option>
                <option value="other">Khác</option>
              </select>
            </div>
            <div style="grid-column:1/-1;">
              <label style="display:block;font-size:0.75rem;font-weight:600;color:#94a3b8;margin-bottom:6px;">Tiêu đề <span style="color:#ef4444;">*</span></label>
              <input id="mt-f-title" type="text" placeholder="Vd: Kiểm tra MBA chính" style="
                width:100%;box-sizing:border-box;background:#0f172a;border:1px solid #334155;border-radius:8px;
                color:#e2e8f0;padding:8px 12px;font-size:0.82rem;outline:none;
              ">
            </div>
            <div>
              <label style="display:block;font-size:0.75rem;font-weight:600;color:#94a3b8;margin-bottom:6px;">Ngày dự kiến <span style="color:#ef4444;">*</span></label>
              <input id="mt-f-date" type="date" style="
                width:100%;box-sizing:border-box;background:#0f172a;border:1px solid #334155;border-radius:8px;
                color:#e2e8f0;padding:8px 12px;font-size:0.82rem;outline:none;
              ">
            </div>
            <div>
              <label style="display:block;font-size:0.75rem;font-weight:600;color:#94a3b8;margin-bottom:6px;">Giao cho</label>
              <input id="mt-f-assign" type="text" placeholder="Tên kỹ thuật viên" style="
                width:100%;box-sizing:border-box;background:#0f172a;border:1px solid #334155;border-radius:8px;
                color:#e2e8f0;padding:8px 12px;font-size:0.82rem;outline:none;
              ">
            </div>
          </div>

          <div style="margin-bottom:14px;">
            <label style="display:block;font-size:0.75rem;font-weight:600;color:#94a3b8;margin-bottom:6px;">Ghi chú</label>
            <textarea id="mt-f-notes" rows="2" placeholder="Mô tả công việc..." style="
              width:100%;box-sizing:border-box;background:#0f172a;border:1px solid #334155;border-radius:8px;
              color:#e2e8f0;padding:8px 12px;font-size:0.82rem;outline:none;resize:vertical;
            "></textarea>
          </div>

          <!-- CHECKLIST EDITOR -->
          <div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
              <label style="font-size:0.75rem;font-weight:600;color:#94a3b8;">Checklist</label>
              <button id="mt-cl-add" style="
                background:rgba(37,99,235,.15);border:1px solid rgba(37,99,235,.3);
                color:#60a5fa;border-radius:6px;padding:4px 10px;font-size:0.72rem;cursor:pointer;
              ">+ Thêm mục</button>
            </div>
            <div id="mt-cl-list" style="display:flex;flex-direction:column;gap:6px;"></div>
          </div>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:10px;padding:14px 20px;border-top:1px solid #334155;">
          <button id="mt-modal-cancel" style="
            background:transparent;border:1px solid #334155;color:#94a3b8;
            border-radius:8px;padding:8px 18px;font-size:0.82rem;cursor:pointer;
          ">Hủy</button>
          <button id="mt-modal-save" style="
            background:#2563eb;color:#fff;border:none;border-radius:8px;
            padding:8px 18px;font-size:0.82rem;font-weight:700;cursor:pointer;
          ">Lưu</button>
        </div>
      </div>
    </div>

    <style>
      .mt-stat-card {
        background:#1e293b;border:1px solid #334155;border-radius:10px;
        padding:14px 16px;
      }
      .mt-stat-label { font-size:0.72rem;color:#64748b;font-weight:600;letter-spacing:.4px;margin-bottom:6px; }
      .mt-stat-value { font-size:1.6rem;font-weight:800;color:#f1f5f9; }
      .mt-filter-tab:hover { color:#e2e8f0 !important; }
      .mt-tab-active { background:#2563eb !important;color:#fff !important; }
      .mt-row-expand { background:#0f172a; }
      .mt-cl-item { display:flex;align-items:center;gap:8px;background:#0f172a;border:1px solid #1e293b;border-radius:6px;padding:6px 10px; }
      .mt-cl-item input[type=text] { flex:1;background:transparent;border:none;color:#e2e8f0;font-size:0.8rem;outline:none; }
    </style>`;
  }

  // ── Mount ─────────────────────────────────────────────────
  async mount(): Promise<void> {
    // Load station & data
    this.stationId = await stationApi.getFirstStationId() ?? '';
    await this.loadAll();

    // Create button
    document.getElementById('mt-createBtn')?.addEventListener('click', () => {
      this.openModal(null);
    });

    // Filter tabs
    document.querySelectorAll('.mt-filter-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        this.activeFilter = (btn as HTMLElement).dataset['filter'] ?? 'all';
        document.querySelectorAll('.mt-filter-tab').forEach(b => {
          (b as HTMLElement).style.background = 'transparent';
          (b as HTMLElement).style.color = '#64748b';
          b.classList.remove('mt-tab-active');
        });
        (btn as HTMLElement).style.background = '#2563eb';
        (btn as HTMLElement).style.color = '#fff';
        btn.classList.add('mt-tab-active');
        this.renderTable();
      });
    });

    // Modal buttons
    document.getElementById('mt-modal-close')?.addEventListener('click', () => this.closeModal());
    document.getElementById('mt-modal-cancel')?.addEventListener('click', () => this.closeModal());
    document.getElementById('mt-modal-save')?.addEventListener('click', () => this.saveModal());

    // Checklist add
    document.getElementById('mt-cl-add')?.addEventListener('click', () => {
      this.modalChecklist.push({ item: '', done: false });
      this.renderChecklistEditor();
    });

    // Type change → update checklist
    document.getElementById('mt-f-type')?.addEventListener('change', (e) => {
      const type = (e.target as HTMLSelectElement).value;
      const items = DEFAULT_CHECKLIST[type] ?? [];
      this.modalChecklist = items.map(i => ({ item: i, done: false }));
      this.renderChecklistEditor();
    });
  }

  destroy(): void {}

  // ── Load data ─────────────────────────────────────────────
  private async loadAll(): Promise<void> {
    try {
      [this.tasks, this.suggestions, this.devices] = await Promise.all([
        stationApi.getMaintenance(this.stationId || undefined),
        stationApi.getMaintenanceSuggestions(this.stationId || undefined),
        this.stationId ? stationApi.getDevices(this.stationId) : Promise.resolve([]),
      ]);
      this.updateStats();
      this.renderSuggestions();
      this.renderTable();
      this.populateDeviceSelect();
    } catch (err) {
      console.error('[MaintenancePage] Lỗi tải dữ liệu:', err);
    }
  }

  // ── Stats ─────────────────────────────────────────────────
  private updateStats(): void {
    const total   = this.tasks.length;
    const pending = this.tasks.filter(t => t.status === 'pending').length;
    const inprog  = this.tasks.filter(t => t.status === 'in_progress').length;
    const overdue = this.tasks.filter(t => t.status === 'overdue').length;

    const el = (id: string) => document.getElementById(id);
    const s  = (id: string, v: number) => { const e = el(id); if (e) e.textContent = String(v); };
    s('stat-total', total);
    s('stat-pending', pending);
    s('stat-inprogress', inprog);
    s('stat-overdue', overdue);
  }

  // ── Suggestions ───────────────────────────────────────────
  private renderSuggestions(): void {
    const container = document.getElementById('mt-suggestions');
    if (!container) return;

    if (this.suggestions.length === 0) {
      container.style.display = 'none';
      return;
    }

    container.style.display = 'block';
    container.innerHTML = `
      <div style="
        background:rgba(37,99,235,.05);border:1px solid rgba(37,99,235,.2);
        border-radius:12px;padding:16px 20px;
      ">
        <div style="font-size:0.8rem;font-weight:800;color:#60a5fa;margin-bottom:12px;letter-spacing:.3px;">
          ⚙ ĐỀ XUẤT BẢO TRÌ
        </div>
        <div style="display:flex;flex-direction:column;gap:10px;">
          ${this.suggestions.map((s, i) => `
            <div style="
              display:flex;align-items:center;justify-content:space-between;
              background:#1e293b;border:1px solid #334155;border-radius:8px;padding:10px 14px;
            ">
              <div>
                <div style="font-size:0.82rem;font-weight:700;color:#e2e8f0;">${s.deviceName}</div>
                <div style="font-size:0.75rem;color:#64748b;margin-top:2px;">
                  ${s.reason}
                  &nbsp;·&nbsp;
                  <span style="color:${s.priority === 'high' ? '#ef4444' : s.priority === 'medium' ? '#f59e0b' : '#10b981'};">
                    ${s.priority === 'high' ? 'Ưu tiên cao' : s.priority === 'medium' ? 'Ưu tiên vừa' : 'Ưu tiên thấp'}
                  </span>
                  &nbsp;·&nbsp; Đề xuất: ${s.suggestedDate}
                </div>
              </div>
              <button class="mt-suggestion-create" data-idx="${i}" style="
                background:rgba(37,99,235,.15);border:1px solid rgba(37,99,235,.3);
                color:#60a5fa;border-radius:6px;padding:6px 14px;font-size:0.78rem;
                font-weight:600;cursor:pointer;white-space:nowrap;flex-shrink:0;margin-left:12px;
              ">Tạo lịch</button>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    container.querySelectorAll('.mt-suggestion-create').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt((btn as HTMLElement).dataset['idx'] ?? '0');
        const s = this.suggestions[idx];
        if (s) this.openModalFromSuggestion(s);
      });
    });
  }

  // ── Table ─────────────────────────────────────────────────
  private renderTable(): void {
    const tbody = document.getElementById('mt-tbody');
    if (!tbody) return;

    let filtered = this.tasks;
    if (this.activeFilter !== 'all')
      filtered = this.tasks.filter(t => t.status === this.activeFilter);

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr><td colspan="8" style="text-align:center;padding:48px;color:#475569;">
          Không có lịch bảo trì nào
        </td></tr>
      `;
      return;
    }

    tbody.innerHTML = filtered.map(t => this.renderRow(t)).join('');

    // Row click → expand checklist
    tbody.querySelectorAll('.mt-row-main').forEach(row => {
      row.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.closest('button')) return; // ignore button clicks
        const id = (row as HTMLElement).dataset['id'] ?? '';
        if (this.expandedRows.has(id)) this.expandedRows.delete(id);
        else this.expandedRows.add(id);
        this.renderTable();
      });
    });

    // Action buttons
    tbody.querySelectorAll('.mt-btn-start').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = (btn as HTMLElement).dataset['id'] ?? '';
        await this.doStart(id);
      });
    });

    tbody.querySelectorAll('.mt-btn-complete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = (btn as HTMLElement).dataset['id'] ?? '';
        await this.doComplete(id);
      });
    });

    tbody.querySelectorAll('.mt-btn-edit').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = (btn as HTMLElement).dataset['id'] ?? '';
        const task = this.tasks.find(t => t.id === id);
        if (task) this.openModal(task);
      });
    });

    tbody.querySelectorAll('.mt-btn-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = (btn as HTMLElement).dataset['id'] ?? '';
        await this.doDelete(id);
      });
    });
  }

  private sourceBadge(notes: string | undefined): string {
    if (!notes) return '';
    // Task từ Rule Engine (bao gồm NETA rules và custom rules)
    if (/\[RULE:/.test(notes)) {
      const isNeta = /NETA/.test(notes);
      if (isNeta)
        return `<span style="display:inline-block;margin-top:4px;padding:1px 7px;border-radius:4px;font-size:0.65rem;font-weight:700;background:rgba(14,165,233,.15);color:#38bdf8;border:1px solid rgba(14,165,233,.2);">NETA PD</span>`;
      return `<span style="display:inline-block;margin-top:4px;padding:1px 7px;border-radius:4px;font-size:0.65rem;font-weight:700;background:rgba(34,197,94,.15);color:#4ade80;border:1px solid rgba(34,197,94,.2);">Rule Engine</span>`;
    }
    if (/\[EW:LOADCORR:/.test(notes))
      return `<span style="display:inline-block;margin-top:4px;padding:1px 7px;border-radius:4px;font-size:0.65rem;font-weight:700;background:rgba(168,85,247,.15);color:#c084fc;border:1px solid rgba(168,85,247,.2);">Load Corr</span>`;
    if (/\[EW:/.test(notes))
      return `<span style="display:inline-block;margin-top:4px;padding:1px 7px;border-radius:4px;font-size:0.65rem;font-weight:700;background:rgba(245,158,11,.15);color:#fbbf24;border:1px solid rgba(245,158,11,.2);">Early Warning</span>`;
    return '';
  }

  private renderRow(t: MaintenanceTask): string {
    const cl     = this.parseChecklist(t.checklist);
    const done   = cl.filter(i => i.done).length;
    const total  = cl.length;
    const pct    = total > 0 ? Math.round((done / total) * 100) : 0;
    const color  = STATUS_COLORS[t.status] ?? '#64748b';
    const isExp  = this.expandedRows.has(t.id);
    const date   = t.scheduledDate ? t.scheduledDate.substring(0, 10) : '';
    const badge  = this.sourceBadge(t.notes);

    const actionBtns = t.status === 'completed' ? '' : `
      ${t.status === 'pending' || t.status === 'overdue' ? `
        <button class="mt-btn-start" data-id="${t.id}" style="
          background:rgba(37,99,235,.15);border:1px solid rgba(37,99,235,.25);
          color:#60a5fa;border-radius:5px;padding:4px 10px;font-size:0.72rem;cursor:pointer;
        ">Bắt đầu</button>
      ` : ''}
      ${t.status === 'in_progress' ? `
        <button class="mt-btn-complete" data-id="${t.id}" style="
          background:rgba(16,185,129,.15);border:1px solid rgba(16,185,129,.25);
          color:#10b981;border-radius:5px;padding:4px 10px;font-size:0.72rem;cursor:pointer;
        ">Hoàn thành</button>
      ` : ''}
    `;

    const mainRow = `
      <tr class="mt-row-main" data-id="${t.id}" style="
        border-bottom:${isExp ? 'none' : '1px solid #1e293b'};cursor:pointer;
        transition:background .12s;
      " onmouseover="this.style.background='rgba(255,255,255,.02)'"
         onmouseout="this.style.background=''"
      >
        <td style="padding:10px 14px;color:#cbd5e1;">${t.deviceName ?? '<span style="color:#475569">—</span>'}</td>
        <td style="padding:10px 14px;font-weight:600;color:#f1f5f9;max-width:200px;">
          <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${t.title}">${t.title}</div>
          ${badge}
        </td>
        <td style="padding:10px 14px;color:#94a3b8;">${TYPE_LABELS[t.type] ?? t.type}</td>
        <td style="padding:10px 14px;color:#94a3b8;white-space:nowrap;">${date}</td>
        <td style="padding:10px 14px;color:#94a3b8;">${t.assignedTo ?? '—'}</td>
        <td style="padding:10px 14px;">
          ${total > 0 ? `
            <div style="font-size:0.75rem;color:#94a3b8;margin-bottom:3px;">${done}/${total} ✓</div>
            <div style="background:#1e293b;border-radius:3px;height:4px;width:80px;overflow:hidden;">
              <div style="background:${color};height:100%;width:${pct}%;transition:width .3s;"></div>
            </div>
          ` : '<span style="color:#475569;">—</span>'}
        </td>
        <td style="padding:10px 14px;">
          <span style="
            background:${color}22;color:${color};border:1px solid ${color}44;
            border-radius:5px;padding:3px 9px;font-size:0.72rem;font-weight:700;
          ">${STATUS_LABELS[t.status] ?? t.status}</span>
        </td>
        <td style="padding:10px 14px;">
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
            ${actionBtns}
            <button class="mt-btn-edit" data-id="${t.id}" style="
              background:rgba(148,163,184,.1);border:1px solid #334155;
              color:#94a3b8;border-radius:5px;padding:4px 10px;font-size:0.72rem;cursor:pointer;
            ">Sửa</button>
            <button class="mt-btn-delete" data-id="${t.id}" style="
              background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.2);
              color:#ef4444;border-radius:5px;padding:4px 10px;font-size:0.72rem;cursor:pointer;
            ">Xóa</button>
          </div>
        </td>
      </tr>
    `;

    const expandRow = isExp ? `
      <tr class="mt-row-expand">
        <td colspan="8" style="padding:12px 20px 16px;border-bottom:1px solid #1e293b;">
          ${t.notes ? `<div style="font-size:0.78rem;color:#94a3b8;margin-bottom:10px;">Ghi chú: ${t.notes.replace(/\[RULE:[^\]]+\]/g,'').replace(/\[EW:[^\]]+\]/g,'').trim()}</div>` : ''}
          ${total > 0 ? `
            <div style="font-size:0.75rem;font-weight:700;color:#64748b;margin-bottom:8px;letter-spacing:.4px;">CHECKLIST</div>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:6px;">
              ${cl.map(item => `
                <div style="
                  display:flex;align-items:center;gap:8px;
                  background:#1e293b;border:1px solid #334155;
                  border-radius:6px;padding:6px 10px;
                ">
                  <span style="color:${item.done ? '#10b981' : '#475569'};font-size:1rem;">
                    ${item.done ? '✓' : '○'}
                  </span>
                  <span style="font-size:0.78rem;color:${item.done ? '#94a3b8' : '#e2e8f0'};
                    text-decoration:${item.done ? 'line-through' : 'none'};">
                    ${item.item}
                  </span>
                </div>
              `).join('')}
            </div>
          ` : '<div style="color:#475569;font-size:0.78rem;">Không có checklist</div>'}
        </td>
      </tr>
    ` : '';

    return mainRow + expandRow;
  }

  // ── Modal ─────────────────────────────────────────────────
  private openModal(task: MaintenanceTask | null): void {
    this.editingId = task?.id ?? null;
    const modal = document.getElementById('mt-modal');
    if (!modal) return;

    const titleEl = document.getElementById('mt-modal-title');
    if (titleEl) titleEl.textContent = task ? 'Sửa lịch bảo trì' : 'Tạo lịch bảo trì';

    // Populate device select
    this.populateDeviceSelect(task?.deviceId);

    // Fill fields
    const set = (id: string, val: string) => {
      const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
      if (el) el.value = val;
    };

    set('mt-f-title',  task?.title ?? '');
    set('mt-f-type',   task?.type ?? 'inspection');
    set('mt-f-date',   task?.scheduledDate ? task.scheduledDate.substring(0, 10) : '');
    set('mt-f-assign', task?.assignedTo ?? '');
    set('mt-f-notes',  task?.notes ?? '');

    // Checklist
    if (task?.checklist) {
      this.modalChecklist = this.parseChecklist(task.checklist);
    } else {
      const type = task?.type ?? 'inspection';
      const items = DEFAULT_CHECKLIST[type] ?? [];
      this.modalChecklist = items.map(i => ({ item: i, done: false }));
    }
    this.renderChecklistEditor();

    modal.style.display = 'flex';
  }

  private openModalFromSuggestion(s: MaintenanceSuggestion): void {
    const fakeTask: Partial<MaintenanceTask> = {
      deviceId:      s.deviceId,
      scheduledDate: s.suggestedDate,
      type:          'inspection',
    };
    this.openModal(fakeTask as MaintenanceTask);
  }

  private closeModal(): void {
    const modal = document.getElementById('mt-modal');
    if (modal) modal.style.display = 'none';
    this.editingId = null;
  }

  private async saveModal(): Promise<void> {
    const get = (id: string) => {
      const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
      return el?.value?.trim() ?? '';
    };

    const title = get('mt-f-title');
    const type  = get('mt-f-type');
    const date  = get('mt-f-date');

    if (!title) { this.showToast('Vui lòng nhập tiêu đề', 'error'); return; }
    if (!date)  { this.showToast('Vui lòng chọn ngày dự kiến', 'error'); return; }

    const deviceId  = get('mt-f-device') || undefined;
    const assignedTo = get('mt-f-assign') || undefined;
    const notes      = get('mt-f-notes') || undefined;
    const checklist  = this.modalChecklist.length > 0
      ? JSON.stringify(this.modalChecklist)
      : undefined;

    try {
      if (this.editingId) {
        await stationApi.updateMaintenance(this.editingId, {
          title, type,
          scheduledDate: new Date(date).toISOString(),
          assignedTo,
          notes,
          checklist,
        });
        this.showToast('Đã cập nhật lịch bảo trì', 'success');
      } else {
        if (!this.stationId) { this.showToast('Không tìm thấy trạm', 'error'); return; }
        await stationApi.createMaintenance({
          stationId: this.stationId,
          deviceId,
          title,
          type,
          scheduledDate: new Date(date).toISOString(),
          assignedTo,
          notes,
          checklist,
        });
        this.showToast('Đã tạo lịch bảo trì', 'success');
      }

      this.closeModal();
      await this.loadAll();
    } catch (err) {
      this.showToast('Lỗi: ' + (err instanceof Error ? err.message : 'Unknown'), 'error');
    }
  }

  // ── Checklist editor ──────────────────────────────────────
  private renderChecklistEditor(): void {
    const list = document.getElementById('mt-cl-list');
    if (!list) return;

    list.innerHTML = this.modalChecklist.map((item, i) => `
      <div class="mt-cl-item">
        <input type="checkbox" ${item.done ? 'checked' : ''} data-idx="${i}"
          class="mt-cl-check" style="accent-color:#10b981;cursor:pointer;">
        <input type="text" value="${item.item.replace(/"/g, '&quot;')}" data-idx="${i}"
          class="mt-cl-text" placeholder="Nội dung mục..."
          style="flex:1;background:transparent;border:none;color:#e2e8f0;font-size:0.8rem;outline:none;">
        <button class="mt-cl-del" data-idx="${i}"
          style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:0.85rem;padding:0 4px;">✕</button>
      </div>
    `).join('');

    list.querySelectorAll('.mt-cl-check').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const idx = parseInt((e.target as HTMLElement).dataset['idx'] ?? '0');
        if (this.modalChecklist[idx]) this.modalChecklist[idx]!.done = (e.target as HTMLInputElement).checked;
      });
    });

    list.querySelectorAll('.mt-cl-text').forEach(inp => {
      inp.addEventListener('input', (e) => {
        const idx = parseInt((e.target as HTMLElement).dataset['idx'] ?? '0');
        if (this.modalChecklist[idx]) this.modalChecklist[idx]!.item = (e.target as HTMLInputElement).value;
      });
    });

    list.querySelectorAll('.mt-cl-del').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt((btn as HTMLElement).dataset['idx'] ?? '0');
        this.modalChecklist.splice(idx, 1);
        this.renderChecklistEditor();
      });
    });
  }

  // ── Device select population ──────────────────────────────
  private populateDeviceSelect(selectedId?: string): void {
    const sel = document.getElementById('mt-f-device') as HTMLSelectElement | null;
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Không chọn --</option>' +
      this.devices.map(d => `<option value="${d.id}" ${d.id === selectedId ? 'selected' : ''}>${d.name}</option>`).join('');
  }

  // ── Actions ───────────────────────────────────────────────
  private async doStart(id: string): Promise<void> {
    try {
      await stationApi.startMaintenance(id);
      this.showToast('Đã bắt đầu bảo trì', 'success');
      await this.loadAll();
    } catch (err) {
      this.showToast('Lỗi: ' + (err instanceof Error ? err.message : 'Unknown'), 'error');
    }
  }

  private async doComplete(id: string): Promise<void> {
    try {
      await stationApi.completeMaintenance(id);
      this.showToast('Đã hoàn thành bảo trì', 'success');
      await this.loadAll();
    } catch (err) {
      this.showToast('Lỗi: ' + (err instanceof Error ? err.message : 'Unknown'), 'error');
    }
  }

  private async doDelete(id: string): Promise<void> {
    const ok = await confirmDialog({ message: 'Xóa lịch bảo trì này?', confirmText: 'Xóa', danger: true });
    if (!ok) return;
    try {
      await stationApi.deleteMaintenance(id);
      this.showToast('Đã xóa lịch bảo trì', 'success');
      await this.loadAll();
    } catch (err) {
      this.showToast('Lỗi: ' + (err instanceof Error ? err.message : 'Unknown'), 'error');
    }
  }

  // ── Helpers ───────────────────────────────────────────────
  private parseChecklist(json?: string): ChecklistItem[] {
    if (!json) return [];
    try { return JSON.parse(json) as ChecklistItem[]; }
    catch { return []; }
  }

  private showToast(msg: string, type: 'success' | 'error'): void {
    const t = document.createElement('div');
    t.style.cssText = `
      position:fixed;bottom:20px;right:20px;z-index:9999;
      background:${type === 'success' ? '#10b981' : '#ef4444'};
      color:#fff;padding:10px 18px;border-radius:8px;
      font-size:0.82rem;font-weight:600;
      opacity:0;transition:opacity .2s;box-shadow:0 4px 20px rgba(0,0,0,.4);
    `;
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => { t.style.opacity = '1'; });
    setTimeout(() => {
      t.style.opacity = '0';
      setTimeout(() => t.remove(), 300);
    }, 3000);
  }
}
