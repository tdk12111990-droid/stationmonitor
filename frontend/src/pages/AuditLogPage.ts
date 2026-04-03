// ============================================================
// AuditLogPage – D11: Nhật ký Hành động
// ============================================================


// TODO: load từ GET /api/v1/logs/audit

export class AuditLogPage {
    render(): string {
        return `
    <div class="list-page">
      <div class="page-toolbar">
        <h2>NHẬT KÝ HÀNH ĐỘNG (AUDIT LOG)</h2>
        <button id="auditExportBtn" class="btn-industrial">⬇ Xuất CSV</button>
      </div>

      <div class="admin-card" style="padding:16px;margin-bottom:16px;display:flex;gap:16px;flex-wrap:wrap">
        <div class="form-group" style="flex-direction:row;align-items:center;gap:8px;margin:0">
          <label style="margin:0;white-space:nowrap">Người dùng:</label>
          <input type="text" id="auditUserSearch" class="form-input" placeholder="Tất cả" style="width:140px">
        </div>
        <div class="form-group" style="flex-direction:row;align-items:center;gap:8px;margin:0">
          <label style="margin:0;white-space:nowrap">Loại hành động:</label>
          <select id="auditTypeFilter" class="form-select" style="width:180px">
            <option value="ALL">Tất cả</option>
            <option value="ALARM">Cảnh báo</option>
            <option value="AUTH">Đăng nhập</option>
            <option value="DEVICE">Thiết bị</option>
            <option value="SYSTEM">Hệ thống</option>
          </select>
        </div>
        <div class="form-group" style="flex-direction:row;align-items:center;gap:8px;margin:0">
          <label style="margin:0">Từ:</label>
          <input type="date" id="auditFrom" class="form-input" style="padding:4px 8px">
        </div>
        <button id="auditApply" class="btn-industrial btn-primary">Lọc</button>
      </div>

      <div class="admin-card" style="padding:0;overflow:hidden">
        <table class="data-table">
          <thead>
            <tr>
              <th>Thời gian</th>
              <th>Người dùng</th>
              <th>Loại hành động</th>
              <th>Mô tả</th>
              <th>Đối tượng</th>
            </tr>
          </thead>
          <tbody id="auditTableBody">
            <tr><td colspan="5" style="text-align:center;color:#475569;padding:32px">Chưa có dữ liệu — kết nối backend để tải nhật ký</td></tr>
          </tbody>
        </table>
      </div>
      <div style="padding:12px;font-size:.75rem;opacity:.4;text-align:center">
        Nhật ký chỉ đọc – Không thể sửa hoặc xóa bất kỳ mục nào
      </div>
    </div>`;
    }

    mount(): void {
        document.getElementById('auditApply')?.addEventListener('click', () => {
            // Filter logic sẽ được implement với real data
        });
        document.getElementById('auditExportBtn')?.addEventListener('click', () => {
            // TODO: gọi GET /api/v1/logs/audit/export rồi download CSV
            alert('Chức năng xuất CSV sẽ hoạt động sau khi kết nối backend.');
        });
    }
}
