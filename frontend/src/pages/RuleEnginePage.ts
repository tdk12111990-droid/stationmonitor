import { ScadaPoint } from '@/services/ScadaApiService';
import { loadScadaPoints, type StoredScadaPoint, saveScadaEvent, type ScadaEvent } from '@/services/storage';

/** Rule definition */
export interface Rule {
  id: string;
  sensorId: string; // ScadaPoint.id
  condition: '>' | '<' | '>=' | '<=' | '==' | '!=';
  threshold: number;
  // duration in seconds (optional, not used in simple implementation)
  duration?: number;
}

/** Utility to load/save rules from localStorage */
export const RULES_STORAGE_KEY = 'worldmonitor_rules';

export function loadRules(): Rule[] {
  try {
    const data = localStorage.getItem(RULES_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.warn('Failed to load rules', e);
    return [];
  }
}

export function saveRules(rules: Rule[]): void {
  try {
    localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(rules));
  } catch (e) {
    console.warn('Failed to save rules', e);
  }
}

/** Simple UI rendering for Rule Engine */
/** Simple UI rendering for Rule Engine */
export class RuleEnginePage {
  private container: HTMLElement | null = null;
  private rules: Rule[] = [];
  private sensors: StoredScadaPoint[] = [];

  constructor() {
    this.rules = loadRules();
  }

  /** Add a new rule */
  private addRule(rule: Omit<Rule, 'id'>): void {
    const newRule: Rule = { ...rule, id: `rule_${Date.now()}` };
    this.rules.push(newRule);
    saveRules(this.rules);
    this.refresh();
  }

  /** Delete a rule */
  private deleteRule(id: string): void {
    this.rules = this.rules.filter(r => r.id !== id);
    saveRules(this.rules);
    this.refresh();
  }

  private refresh(): void {
    if (this.container) {
      this.container.innerHTML = this.render();
      this.bindEvents();
    }
  }

  /** Render the page */
  public render(): string {
    // Reload rules to ensure fresh data
    this.rules = loadRules();
    return `
      <div class="list-page">
        <div class="page-toolbar">
          <h2>🔔 RULE ENGINE (Cảnh báo tự động)</h2>
        </div>
        
        <div class="admin-card" style="padding:24px; margin-bottom:20px;">
          <div class="card-title">TẠO QUY TẮC MỚI</div>
          <form id="ruleForm" class="form-grid-2" style="display:grid; grid-template-columns: 1fr 1fr 1fr auto; gap:16px; align-items: end;">
            <div class="form-group" style="margin:0">
              <label>Thiết bị giám sát:</label>
              <select name="sensorId" class="form-select" required>
                ${this.sensors.length > 0 
                  ? this.sensors.map(s => `<option value="${s.id}">${s.name} (${s.id})</option>`).join('')
                  : '<option value="">Đang tải danh sách...</option>'}
              </select>
            </div>
            <div class="form-group" style="margin:0">
              <label>Điều kiện:</label>
              <select name="condition" class="form-select">
                <option value=">">&gt; (Lớn hơn)</option>
                <option value="<">&lt; (Nhỏ hơn)</option>
                <option value=">=">&gt;= (Lớn hơn hoặc bằng)</option>
                <option value="<=">&lt;= (Nhỏ hơn hoặc bằng)</option>
                <option value="==">== (Bằng)</option>
                <option value="!=">!= (Khác)</option>
              </select>
            </div>
            <div class="form-group" style="margin:0">
              <label>Ngưỡng (Threshold):</label>
              <input type="number" name="threshold" class="form-input" required step="any" placeholder="80" />
            </div>
            <button type="submit" class="btn-industrial btn-primary" style="height:36px; padding:0 20px;">+ Thêm Rule</button>
          </form>
        </div>

        <div class="admin-card" style="padding:0; overflow:hidden;">
          <div class="card-title" style="padding:20px 24px 10px 24px;">DANH SÁCH QUY TẮC HIỆN TẠI</div>
          <table class="data-table">
            <thead>
              <tr>
                <th>Sensor ID</th>
                <th>Điều kiện</th>
                <th>Ngưỡng</th>
                <th>Trạng thái</th>
                <th>Hành động</th>
              </tr>
            </thead>
            <tbody id="ruleListBody">
              ${this.rules.length > 0 ? this.rules.map(r => {
                const sName = this.sensors.find(s => s.id === r.sensorId)?.name || r.sensorId;
                return `
                <tr>
                  <td><b>${sName}</b> <br/><small style="color:#64748b">${r.sensorId}</small></td>
                  <td><span class="tag tag-role-operator" style="font-weight:700; font-size:14px;">${r.condition}</span></td>
                  <td><b style="font-size:14px; color:#ef4444;">${r.threshold}</b></td>
                  <td><span class="tag tag-success">Hoạt động</span></td>
                  <td>
                    <button class="btn-industrial btn-sm btn-danger btn-delete-rule" data-id="${r.id}">🗑 Xóa</button>
                  </td>
                </tr>
              `;
              }).join('') : `<tr><td colspan="5" style="text-align:center; color:#94a3b8; padding:30px;">Chưa có quy tắc nào được định nghĩa.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  public async mount(): Promise<void> {
    this.container = document.getElementById('pageContent');
    if (!this.container) return;
    
    // Load sensors to populate dropdown
    this.sensors = await loadScadaPoints();
    
    this.container.innerHTML = this.render();
    this.bindEvents();
  }

  private bindEvents(): void {
    if (!this.container) return;
    
    const form = document.getElementById('ruleForm') as HTMLFormElement;
    form?.addEventListener('submit', e => {
      e.preventDefault();
      const fd = new FormData(form);
      const sensorId = fd.get('sensorId') as string;
      const condition = fd.get('condition') as Rule['condition'];
      const threshold = parseFloat(fd.get('threshold') as string);
      this.addRule({ sensorId, condition, threshold });
      form.reset();
    });

    const deleteBtns = this.container.querySelectorAll('.btn-delete-rule');
    deleteBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id!;
        this.deleteRule(id);
      });
    });
  }

  public destroy(): void {
    this.container = null;
  }
}

/** Track triggered state to avoid spamming alerts/events */
const triggeredRules = new Set<string>();

/** Helper to evaluate rules against current points */
export function evaluateRules(points: ScadaPoint[]): void {
  const rules = loadRules();
  if (!rules.length) return;

  for (const rule of rules) {
    const point = points.find(p => p.id === rule.sensorId);
    if (!point || !point.additionalProperties) continue;

    const value = point.additionalProperties.currentValue as number;
    let conditionMet = false;

    switch (rule.condition) {
      case '>':  conditionMet = value > rule.threshold; break;
      case '<':  conditionMet = value < rule.threshold; break;
      case '>=': conditionMet = value >= rule.threshold; break;
      case '<=': conditionMet = value <= rule.threshold; break;
      case '==': conditionMet = value === rule.threshold; break;
      case '!=': conditionMet = value !== rule.threshold; break;
    }

    const stateKey = `${rule.id}_${point.id}`;

    if (conditionMet) {
      if (!triggeredRules.has(stateKey)) {
        // First time triggered (Edge-trigger)
        console.warn(`[RuleEngine] Triggered: ${point.name} ${rule.condition} ${rule.threshold} (Value: ${value})`);
        
        // 1. Log to ScadaEvents (so it appears in Alarm List)
        const event: ScadaEvent = {
          eventId: `rule_${Date.now()}_${point.id}`,
          deviceId: point.id,
          deviceName: `[RULE] ${point.name}`,
          deviceType: point.type,
          previousStatus: point.status,
          currentStatus: 'Alarm', // Override to Alarm for visibility
          currentValue: value,
          measureUnit: point.additionalProperties.measureUnit,
          timestamp: Date.now()
        };
        saveScadaEvent(event).catch(() => {});

        // 2. Visual Alert (Optional: replace with toast later)
        // alert(`⚠️ CẢNH BÁO Quy tắc: ${point.name} đang ở mức ${value}${event.measureUnit} (Ngưỡng: ${rule.threshold})`);
        
        triggeredRules.add(stateKey);
      }
    } else {
      if (triggeredRules.has(stateKey)) {
        // Condition was MET but now CLEARED (Normal)
        console.warn(`[RuleEngine] Cleared: ${point.name} (Value: ${value})`);

        const event: ScadaEvent = {
          eventId: `rule_cleared_${Date.now()}_${point.id}`,
          deviceId: point.id,
          deviceName: `[RULE] ${point.name}`,
          deviceType: point.type,
          previousStatus: 'Alarm',
          currentStatus: 'Normal',
          currentValue: value,
          measureUnit: point.additionalProperties.measureUnit,
          timestamp: Date.now()
        };
        saveScadaEvent(event).catch(() => {});

        triggeredRules.delete(stateKey);
      }
    }
  }
}
