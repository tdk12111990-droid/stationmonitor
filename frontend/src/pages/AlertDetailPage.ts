// ============================================================
// AlertDetailPage – D04: Chi tiết Cảnh báo (Full Page)
// ============================================================

import Chart from 'chart.js/auto';
import { formatDateTime } from '@/services/MockDataService';
import { router } from '@/router/Router';
import { getScadaEvents, updateScadaEvent, type ScadaEvent } from '@/services/storage';

export class AlertDetailPage {
    private miniChart: Chart | null = null;

    render(): string {
        return `
    <div class="detail-page" id="alertDetailWrapper">
      <div style="padding:40px;text-align:center;color:#94a3b8">⏳ Đang tải chi tiết cảnh báo từ hệ thống SCADA...</div>
    </div>`;
    }

    private renderDetail(a: ScadaEvent): string {
        const color = a.currentStatus === 'Alarm' ? '#ef4444' : a.currentStatus === 'Warning' ? '#f59e0b' : '#10b981';
        const timeline = [
            { time: new Date(a.timestamp).toISOString(), actor: 'SYSTEM', action: `Hệ thống ghi nhận thay đổi trạng thái SCADA: ${a.previousStatus} → ${a.currentStatus}` },
            { time: new Date(a.timestamp + 5000).toISOString(), actor: 'SYSTEM', action: 'Ghi log sự kiện vào cơ sở dữ liệu (IndexedDB)' },
        ];

        return `
      <!-- Breadcrumb / Back -->
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
        <button id="backBtn" class="btn-industrial">← Quay lại</button>
        <span style="opacity:.5">Nhật ký Cảnh báo</span>
        <span style="opacity:.5">/</span>
        <span style="color:var(--admin-accent)">${a.eventId}</span>
        <div style="margin-left:auto;display:flex;gap:8px">
          <button id="printBtn" class="btn-industrial">🖨 In</button>
          <button class="btn-industrial">📋 Sao chép ID</button>
        </div>
      </div>

      <!-- Level Banner -->
      <div class="level-banner" style="background:${color}18;border:1px solid ${color}44;border-radius:12px;padding:16px 20px;margin-bottom:20px;display:flex;align-items:center;gap:16px">
        <div style="width:12px;height:12px;border-radius:50%;background:${color};animation:pulse 1.5s infinite"></div>
        <span style="font-size:1.1rem;font-weight:800;color:${color}">${a.currentStatus.toUpperCase()}</span>
        <span style="opacity:.7">– ${a.deviceName}</span>
      </div>

      <!-- 2 Column layout -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px">
        <!-- Alarm Info -->
        <div class="admin-card" style="padding:20px">
          <div class="card-title">THÔNG TIN SỰ CỐ</div>
          <div class="info-table">
            <div class="info-row"><span>Thiết bị</span><strong>${a.deviceName}</strong></div>
            <div class="info-row"><span>Loại (Source)</span><strong>${a.deviceType}</strong></div>
            <div class="info-row"><span>Giá trị đo được</span><strong style="color:${color}">${a.currentValue ?? '--'} ${a.measureUnit ?? ''}</strong></div>
            <div class="info-row"><span>Biến động</span><strong>Từ ${a.previousStatus} → ${a.currentStatus}</strong></div>
            <div class="info-row"><span>Phát sinh lúc</span><strong>${formatDateTime(new Date(a.timestamp).toISOString())}</strong></div>
            <div class="info-row"><span>Trạng thái</span>
              <strong style="color:${color}">
                ${a.currentStatus}
              </strong>
            </div>
            <div class="info-row"><span>Event ID</span><code style="font-size:.75rem">${a.eventId}</code></div>
          </div>
        </div>

        <!-- Camera Snapshot -->
        <div class="admin-card" style="padding:20px;display:flex;flex-direction:column">
          <div class="card-title">CAMERA SNAPSHOT</div>
          <div class="snapshot-placeholder" style="flex:1;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px;background:rgba(0,0,0,.3);border-radius:8px;min-height:200px">
            <span style="font-size:2rem">📷</span>
            <span style="font-size:.8rem;opacity:.5">Không có snapshot từ camera</span>
          </div>
          <div style="display:flex;gap:8px;margin-top:12px">
            <button class="btn-industrial btn-sm" disabled>Xem đầy đủ</button>
            <button class="btn-industrial btn-sm" disabled>Tải về</button>
          </div>
        </div>
      </div>

      <!-- Trend Chart 6h -->
      <div class="admin-card" style="padding:20px;margin-bottom:20px">
        <div class="card-title">XU HƯỚNG 6 GIỜ QUA – ${a.deviceName}</div>
        <div style="height:220px"><canvas id="detailMiniChart"></canvas></div>
      </div>

      <!-- Processing Timeline -->
      <div class="admin-card" style="padding:20px;margin-bottom:20px">
        <div class="card-title">LỊCH SỬ XỬ LÝ</div>
        <div class="timeline">
          ${timeline.map((t, i) => `
          <div class="timeline-item">
            <div class="timeline-dot ${i === 0 ? 'dot-red' : i === timeline.length - 1 ? 'dot-green' : 'dot-yellow'}"></div>
            <div class="timeline-content">
              <div class="timeline-time">${formatDateTime(t.time)}</div>
              <div class="timeline-actor"><span class="tag ${t.actor === 'SYSTEM' ? 'tag-system' : 'tag-user'}">${t.actor}</span></div>
              <div class="timeline-action">${t.action}</div>
            </div>
          </div>`).join('')}
        </div>
      </div>

      <!-- Action Form -->
      <div class="admin-card" style="padding:20px">
        <div class="card-title">✏ CẬP NHẬT XỬ LÝ</div>
        ${a.resolvedStatus ? `
        <div style="padding:10px 14px;border-radius:8px;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);margin-bottom:12px;font-size:.85rem">
          <b style="color:#10b981">Đã xử lý:</b>
          ${{ ACKNOWLEDGED: '🔍 Đang kiểm tra thực địa', RESOLVED: '✅ Đã xử lý', FALSE_ALARM: '🚫 Cảnh báo giả', MAINTENANCE: '🔧 Bảo trì' }[a.resolvedStatus] ?? a.resolvedStatus}
          ${a.resolvedNote ? `<br><span style="opacity:.7">"${a.resolvedNote}"</span>` : ''}
          ${a.resolvedAt ? `<br><span style="opacity:.5">${new Date(a.resolvedAt).toLocaleString('vi-VN')} – ${a.resolvedBy ?? 'N/A'}</span>` : ''}
        </div>` : ''}
        <div class="form-grid-2">
          <div class="form-group">
            <label>Trạng thái</label>
            <select id="detailStatus" class="form-select">
              <option value="ACKNOWLEDGED">🔍 Đang kiểm tra thực địa</option>
              <option value="RESOLVED">✅ Đã xử lý</option>
              <option value="RESOLVED_MAINTENANCE">🔧 Đã xử lý – cần bảo trì định kỳ</option>
              <option value="FALSE_ALARM">🚫 Cảnh báo giả (False Alarm)</option>
            </select>
          </div>
          <div class="form-group">
            <label>Ghi chú</label>
            <textarea id="detailNote" class="form-textarea" style="min-height:60px" placeholder="Nhập ghi chú xử lý…">${a.resolvedNote ?? ''}</textarea>
          </div>
        </div>
        <button id="detailSaveBtn" class="btn-industrial btn-primary" style="margin-top:8px">✓ Lưu trạng thái xử lý</button>
      </div>
    `;
    }

    mount(): void {
        const params = (window as any).__routerParams || {};
        const alarm_id = String(params.alarm_id || '');

        getScadaEvents().then(events => {
          const wrapper = document.getElementById('alertDetailWrapper');
          if (!wrapper) return;

          const ev = events.find(x => x.eventId === alarm_id) || events[0];
          if (!ev) {
            wrapper.innerHTML = '<div style="padding:40px;text-align:center;color:#ef4444">Không tìm thấy sự kiện SCADA.</div>';
            return;
          }

          wrapper.innerHTML = this.renderDetail(ev);

          // Re-attach events
          document.getElementById('backBtn')?.addEventListener('click', () => router.back());
          document.getElementById('detailSaveBtn')?.addEventListener('click', () => {
              const rawStatus = (document.getElementById('detailStatus') as HTMLSelectElement)?.value;
              const note = (document.getElementById('detailNote') as HTMLTextAreaElement)?.value.trim();
              const resolvedStatus = rawStatus === 'RESOLVED_MAINTENANCE' ? 'RESOLVED' : rawStatus as ScadaEvent['resolvedStatus'];
              const finalNote = rawStatus === 'RESOLVED_MAINTENANCE'
                ? (note || 'Ghi nhận để lên lịch bảo trì định kỳ')
                : note;
              updateScadaEvent(ev.eventId, {
                resolvedStatus,
                resolvedNote: finalNote,
                resolvedAt: Date.now(),
                resolvedBy: 'operator',
              }).then(() => {
                this.showToast('✓ Đã lưu trạng thái xử lý', 'success');
                // Refresh lại trang sau 800ms để hiển thị trạng thái mới
                setTimeout(() => {
                  const wrapper = document.getElementById('alertDetailWrapper');
                  if (wrapper) {
                    getScadaEvents(0, Date.now()).then(events => {
                      const updated = events.find(x => x.eventId === ev.eventId);
                      if (updated) wrapper.innerHTML = this.renderDetail(updated);
                      document.getElementById('backBtn')?.addEventListener('click', () => router.back());
                      document.getElementById('printBtn')?.addEventListener('click', () => window.print());
                    });
                  }
                }, 800);
              }).catch(() => this.showToast('Lỗi khi lưu', 'error'));
          });
          document.getElementById('printBtn')?.addEventListener('click', () => window.print());

          // Mini chart
          const ctx = (document.getElementById('detailMiniChart') as HTMLCanvasElement)?.getContext('2d');
          if (ctx) {
              // TODO: load từ GET /api/v1/history?device={id}&from=&to=
              const labels: string[] = [];
              const data: number[] = [];
              this.miniChart = new Chart(ctx, {
                  type: 'line',
                  data: {
                      labels,
                      datasets: [
                          { label: 'Giá trị Sensor', data, borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)', tension: 0.3, fill: true, pointRadius: 0, borderWidth: 2 }
                      ]
                  },
                  options: {
                      responsive: true, maintainAspectRatio: false, animation: { duration: 0 },
                      plugins: {
                          legend: { display: false },
                          annotation: {
                              annotations: {
                                  critLine: { type: 'line', yMin: 80, yMax: 80, borderColor: 'rgba(239,68,68,.6)', borderDash: [5, 5], label: { display: true, content: 'Critical 80', color: '#ef4444', font: { size: 10 } } },
                                  warnLine: { type: 'line', yMin: 70, yMax: 70, borderColor: 'rgba(245,158,11,.6)', borderDash: [5, 5], label: { display: true, content: 'Warning 70', color: '#f59e0b', font: { size: 10 } } },
                              }
                          }
                      } as any,
                      scales: { x: { ticks: { color: '#9ca3af', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.05)' } }, y: { ticks: { color: '#9ca3af' }, grid: { color: 'rgba(255,255,255,0.05)' } } }
                  }
              });
          }
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

    destroy(): void { this.miniChart?.destroy(); }
}
