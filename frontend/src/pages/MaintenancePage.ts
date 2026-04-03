// ============================================================
// MaintenancePage – D12: Lịch Bảo trì & AI Đề xuất
// ============================================================

import { loadScadaPoints } from '@/services/storage';
// TODO: load từ GET /api/v1/maintenance

export class MaintenancePage {
    render(): string {
        const aiSuggested: any[] = [];


        return `
    <div class="list-page">
      <div class="page-toolbar">
        <h2>LỊCH BẢO TRÌ</h2>
        <button id="addTaskBtn" class="btn-industrial btn-primary">+ Tạo lịch bảo trì</button>
      </div>

      ${aiSuggested.length > 0 ? `
      <!-- AI Suggestions -->
      <div class="admin-card ai-suggest-card" style="padding:20px;margin-bottom:16px;border:1px solid rgba(59,130,246,0.3);background:rgba(59,130,246,0.05)">
        <div class="card-title" style="color:#60a5fa">🤖 AI ĐỀ XUẤT BẢO TRÌ</div>
        <div style="display:flex;flex-direction:column;gap:12px">
          ${aiSuggested.map(t => `
          <div class="ai-suggest-item">
            <div style="display:flex;justify-content:space-between;align-items:flex-start">
              <div>
                <b>⚡ ${t.device_name}</b> – Nên kiểm tra trong 14 ngày
                <div style="font-size:.82rem;opacity:.7;margin-top:4px">${t.ai_reason}</div>
              </div>
              <button class="btn-industrial btn-primary btn-sm create-from-ai" data-task-id="${t.task_id}">Tạo lịch</button>
            </div>
          </div>`).join('')}
        </div>
      </div>` : ''}

      <!-- Regular tasks -->
      <div class="admin-card" style="padding:0;overflow:hidden">
        <table class="data-table">
          <thead>
            <tr>
              <th>Thiết bị</th>
              <th>Loại bảo trì</th>
              <th>Ngày dự kiến</th>
              <th>Giao cho</th>
              <th>Trạng thái</th>
              <th>Checklist</th>
              <th>Hành động</th>
            </tr>
          </thead>
          <tbody>
            <tr><td colspan="7" style="text-align:center;color:#475569;padding:32px">Chưa có dữ liệu — kết nối backend để tải lịch bảo trì</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Add/Edit Task Modal -->
    <div id="taskModal" class="modal-overlay">
      <div class="modal-content">
        <div class="modal-header">
          <h3>Tạo lịch bảo trì</h3>
          <button id="taskModalClose" class="modal-close-btn">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-grid-2">
            <div class="form-group">
              <label>Thiết bị</label>
              <select id="taskDevice" class="form-select">
                <option value="">(Đang tải SCADA...)</option>
              </select>
            </div>
            <div class="form-group">
              <label>Loại bảo trì</label>
              <select id="taskType" class="form-select">
                <option>Vệ sinh định kỳ</option>
                <option>Kiểm tra PD</option>
                <option>Thay thế linh kiện</option>
                <option>Hiệu chỉnh</option>
                <option>Kiểm định</option>
              </select>
            </div>
            <div class="form-group">
              <label>Ngày dự kiến</label>
              <input type="date" id="taskDate" class="form-input">
            </div>
            <div class="form-group">
              <label>Giao cho</label>
              <input type="text" id="taskAssign" class="form-input" placeholder="Tên kỹ thuật viên">
            </div>
          </div>
          <div class="form-group">
            <label>Mô tả</label>
            <textarea id="taskDesc" class="form-textarea" placeholder="Mô tả công việc…"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button id="taskModalCancel" class="btn-industrial">Hủy</button>
          <button id="taskModalSave" class="btn-industrial btn-primary">Lưu</button>
        </div>
      </div>
    </div>`;
    }

    mount(): void {
        const showModal = () => document.getElementById('taskModal')?.classList.add('active');
        const hideModal = () => document.getElementById('taskModal')?.classList.remove('active');

        // Load devices for the select
        loadScadaPoints().then(points => {
            const select = document.getElementById('taskDevice') as HTMLSelectElement;
            if (select) {
                if (points.length === 0) {
                    select.innerHTML = '<option value="">(Không có thiết bị SCADA)</option>';
                } else {
                    select.innerHTML = points.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
                }
            }
        });

        document.getElementById('addTaskBtn')?.addEventListener('click', showModal);
        document.getElementById('taskModalClose')?.addEventListener('click', hideModal);
        document.getElementById('taskModalCancel')?.addEventListener('click', hideModal);
        document.getElementById('taskModalSave')?.addEventListener('click', () => {
            hideModal();
            this.showToast('✓ Đã tạo lịch bảo trì', 'success');
        });

        document.querySelectorAll('.create-from-ai').forEach(btn => {
            btn.addEventListener('click', () => showModal());
        });

        document.querySelectorAll('.del-task-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (confirm('Xóa lịch bảo trì này?')) {
                    (btn as HTMLElement).closest('tr')?.remove();
                    this.showToast('✓ Đã xóa', 'success');
                }
            });
        });
    }

    private showToast(msg: string, type: 'success' | 'error'): void {
        const t = document.createElement('div');
        t.className = `toast toast-${type}`;
        t.textContent = msg;
        document.body.appendChild(t);
        setTimeout(() => t.classList.add('toast-show'), 10);
        setTimeout(() => { t.classList.remove('toast-show'); setTimeout(() => t.remove(), 300); }, 3000);
    }
}
