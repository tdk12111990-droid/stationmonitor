export class AiDebugPage {
  render(): string {
    return `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
      height:calc(100vh - 80px);background:#0f172a;color:#94a3b8;font-family:'Inter',sans-serif;gap:16px;">
      <div style="font-size:48px;">🤖</div>
      <h2 style="margin:0;color:#fff;font-size:1.4rem;font-weight:700;">AI Vision Module</h2>
      <p style="margin:0;font-size:0.95rem;text-align:center;max-width:400px;line-height:1.6;">
        Tính năng AI phát hiện xâm nhập (YOLO) đang được tích hợp vào Backend.<br>
        Sẽ khả dụng trong <span style="color:#3b82f6;font-weight:600;">Phase 3</span>.
      </p>
      <div style="display:flex;gap:8px;margin-top:8px;">
        <span style="background:#1e293b;border:1px solid #334155;padding:4px 12px;border-radius:20px;font-size:12px;">YOLO v11</span>
        <span style="background:#1e293b;border:1px solid #334155;padding:4px 12px;border-radius:20px;font-size:12px;">TimescaleDB Events</span>
        <span style="background:#1e293b;border:1px solid #334155;padding:4px 12px;border-radius:20px;font-size:12px;">SignalR Push</span>
      </div>
    </div>`;
  }

  mount(): void {}
  destroy(): void {}
}
