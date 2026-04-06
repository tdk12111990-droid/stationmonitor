// ============================================================
// AlertDetailPage — Chi tiết 1 cảnh báo từ backend API thật
// Điều hướng từ: AlertsHistoryPage (click vào dòng alert)
// ============================================================

import { stationApi, type AlertItem, type AlertHistoryEntry } from '@/services/StationApiService';
import { router } from '@/router/Router';
import { confirmDialog } from '@/utils/confirm';

type AlertDetail = AlertItem & { history: AlertHistoryEntry[] };

export class AlertDetailPage {
  render(): string {
    return `
    <div class="list-page" id="alertDetailRoot" style="max-width:900px;margin:0 auto;">
      <div style="padding:60px;text-align:center;color:#94a3b8">⏳ Đang tải...</div>
    </div>`;
  }

  async mount(): Promise<void> {
    const params = (window as any).__routerParams || {};
    const id = params.id as string;
    const root = document.getElementById('alertDetailRoot')!;

    if (!id) {
      root.innerHTML = `<div style="padding:40px;text-align:center;color:#ef4444">Không có ID cảnh báo.</div>`;
      return;
    }

    try {
      const alert = await stationApi.getAlertDetail(id);
      root.innerHTML = this.renderDetail(alert);
      this.bindEvents(alert);
    } catch (e: any) {
      root.innerHTML = `<div style="padding:40px;text-align:center;color:#ef4444">⚠ Không tải được: ${e.message}</div>`;
    }
  }

  private renderDetail(a: AlertDetail): string {
    const isAlarm   = a.level === 'alarm';
    const color     = isAlarm ? '#ef4444' : '#f59e0b';
    const levelText = isAlarm ? '🚨 ALARM' : '⚠️ WARNING';

    const statusLabel: Record<string, string> = {
      open:   '🔴 Chưa xử lý',
      acked:  '🟡 Đang xử lý',
      closed: '🟢 Đã đóng',
    };
    const sourceLabel: Record<string, string> = {
      rule_engine:   'Rule Engine',
      ai_detection:  'AI Detection',
      manual:        'Thủ công',
      maintenance:   'Bảo trì',
    };

    const fmt = (ts?: string) => ts
      ? new Date(ts).toLocaleString('vi-VN', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit', second:'2-digit' })
      : '—';

    return `
    <!-- Header breadcrumb -->
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;flex-wrap:wrap;">
      <button id="adBackBtn" class="btn-industrial">← Quay lại</button>
      <span style="opacity:.4">Nhật ký cảnh báo</span>
      <span style="opacity:.4">/</span>
      <span style="color:var(--admin-accent);font-size:.85rem;font-family:monospace">${a.id.slice(0,8)}…</span>
      <div style="margin-left:auto;display:flex;gap:8px;">
        ${a.status === 'open'   ? `<button id="adAckBtn"   class="btn-industrial btn-primary">✓ ACK</button>` : ''}
        ${a.status === 'acked'  ? `<button id="adCloseBtn" class="btn-industrial btn-danger" >✕ Đóng</button>` : ''}
        <button id="adAnalyticsBtn" class="btn-industrial">📈 Xem phân tích</button>
      </div>
    </div>

    <!-- Level banner -->
    <div style="background:${color}18;border:1px solid ${color}44;border-radius:12px;padding:14px 20px;margin-bottom:20px;display:flex;align-items:center;gap:14px;">
      <div style="width:10px;height:10px;border-radius:50%;background:${color};flex-shrink:0;box-shadow:0 0 8px ${color}"></div>
      <span style="font-size:1rem;font-weight:800;color:${color}">${levelText}</span>
      <span style="opacity:.6;font-size:.9rem">${a.message}</span>
      <span style="margin-left:auto;font-size:.8rem;opacity:.5">${fmt(a.triggeredAt)}</span>
    </div>

    <!-- 2 cột info -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
      <div class="admin-card" style="padding:20px;">
        <div class="card-title" style="margin-bottom:14px;">THÔNG TIN CẢNH BÁO</div>
        ${this.infoRow('Mức độ',    `<span class="tag ${isAlarm ? 'tag-danger' : 'tag-warning'}">${levelText}</span>`)}
        ${this.infoRow('Trạng thái', statusLabel[a.status] ?? a.status)}
        ${this.infoRow('Nguồn',     sourceLabel[a.source] ?? a.source)}
        ${this.infoRow('Giá trị',   a.value != null ? `<b style="color:${color}">${a.value.toFixed(2)}</b>` : '—')}
        ${this.infoRow('Phát sinh', fmt(a.triggeredAt))}
        ${this.infoRow('ACK lúc',   fmt(a.ackedAt))}
        ${this.infoRow('Đóng lúc',  fmt(a.closedAt))}
        ${a.ackNote ? this.infoRow('Ghi chú ACK', `<em style="opacity:.7">${a.ackNote}</em>`) : ''}
      </div>

      <div class="admin-card" style="padding:20px;">
        <div class="card-title" style="margin-bottom:14px;">ID THAM CHIẾU</div>
        ${this.infoRow('Alert ID',  `<code style="font-size:.72rem;opacity:.7">${a.id}</code>`)}
        ${this.infoRow('Device ID', a.deviceId ? `<code style="font-size:.72rem;opacity:.7">${a.deviceId}</code>` : '—')}
        ${this.infoRow('Rule ID',   a.ruleId   ? `<code style="font-size:.72rem;opacity:.7">${a.ruleId}</code>`   : '—')}
        <div style="margin-top:20px;padding:12px;background:rgba(59,130,246,.06);border:1px solid rgba(59,130,246,.15);border-radius:8px;font-size:.8rem;color:#7dd3fc;">
          Để xem xu hướng dữ liệu theo thời gian, dùng trang <b>Phân tích</b>.
          <br><button id="adAnalyticsBtn2" class="btn-industrial btn-primary" style="margin-top:10px;font-size:.8rem;">📈 Mở trang Phân tích</button>
        </div>
      </div>
    </div>

    <!-- Timeline lịch sử xử lý -->
    <div class="admin-card" style="padding:20px;">
      <div class="card-title" style="margin-bottom:16px;">LỊCH SỬ XỬ LÝ</div>
      ${a.history.length === 0
        ? `<div style="text-align:center;padding:24px;opacity:.4;font-size:.85rem;">Chưa có lịch sử xử lý.</div>`
        : `<div style="display:flex;flex-direction:column;gap:0;">
            <!-- Dòng khởi tạo -->
            ${this.timelineItem({
              icon: '🔔', color: color,
              time: fmt(a.triggeredAt),
              actor: 'SYSTEM',
              desc: `Cảnh báo phát sinh — ${levelText} — ${a.message}`,
              isFirst: true,
            })}
            ${a.history.map((h) => this.timelineItem({
              icon: h.status === 'acked' ? '✓' : h.status === 'closed' ? '✕' : '•',
              color: h.status === 'closed' ? '#10b981' : h.status === 'acked' ? '#f59e0b' : '#64748b',
              time: fmt(h.changedAt),
              actor: h.changedBy || 'system',
              desc: `Chuyển trạng thái → <b>${statusLabel[h.status] ?? h.status}</b>${h.note ? ` — <em style="opacity:.7">${h.note}</em>` : ''}`,
              isFirst: false,
            })).join('')}
          </div>`
      }
    </div>`;
  }

  private infoRow(label: string, value: string): string {
    return `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--admin-border);">
      <span style="font-size:.78rem;opacity:.5;text-transform:uppercase;letter-spacing:.3px;">${label}</span>
      <span style="font-size:.85rem;">${value}</span>
    </div>`;
  }

  private timelineItem(o: { icon: string; color: string; time: string; actor: string; desc: string; isFirst: boolean }): string {
    return `
    <div style="display:flex;gap:14px;position:relative;padding-bottom:16px;">
      <div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0;">
        <div style="width:30px;height:30px;border-radius:50%;background:${o.color}22;border:2px solid ${o.color};display:flex;align-items:center;justify-content:center;font-size:.75rem;color:${o.color};font-weight:700;">${o.icon}</div>
        ${!o.isFirst ? `<div style="width:2px;flex:1;background:var(--admin-border);margin-top:4px;min-height:16px;"></div>` : ''}
      </div>
      <div style="flex:1;padding-top:4px;">
        <div style="display:flex;gap:10px;align-items:center;margin-bottom:4px;flex-wrap:wrap;">
          <span style="font-size:.7rem;font-family:monospace;opacity:.5;">${o.time}</span>
          <span style="font-size:.65rem;font-weight:700;padding:1px 7px;border-radius:4px;background:var(--admin-bg);border:1px solid var(--admin-border);color:var(--admin-text);opacity:.7;">${o.actor.toUpperCase()}</span>
        </div>
        <div style="font-size:.85rem;">${o.desc}</div>
      </div>
    </div>`;
  }

  private bindEvents(a: AlertDetail): void {
    document.getElementById('adBackBtn')?.addEventListener('click', () => router.back());

    [document.getElementById('adAnalyticsBtn'), document.getElementById('adAnalyticsBtn2')]
      .forEach(btn => btn?.addEventListener('click', () => router.navigate('analytics')));

    document.getElementById('adAckBtn')?.addEventListener('click', async () => {
      const note = prompt('Ghi chú ACK (tùy chọn):') ?? '';
      await stationApi.ackAlert(a.id, note);
      router.navigate('alerts-history');
    });

    document.getElementById('adCloseBtn')?.addEventListener('click', async () => {
      if (!await confirmDialog({ title: 'Đóng cảnh báo', message: 'Xác nhận đóng alert này?', confirmText: 'Đóng' })) return;
      await stationApi.closeAlert(a.id);
      router.navigate('alerts-history');
    });
  }

  destroy(): void {}
}
