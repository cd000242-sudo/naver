/** Settings-only presentation. Existing inputs, listeners and save handlers stay intact. */
import { setupSettingsAgentAccounts, refreshSettingsAgentAccounts } from './settingsAgentAccounts.js';

type SettingsAgentProvider = 'codex' | 'claude' | 'gemini';
interface SettingsAgentUsage {
  callsInWindow: number;
  observedLimit?: number;
  manualLimit?: number;
  rateLimitResetAt?: number;
  rateLimitedAt?: number;
}
const settingsAgentTargets = [
// Display order: Claude Code first (the default writing engine), then Codex (the default image engine).
  { provider: 'claude', title: 'Claude Code', url: 'https://claude.ai/settings/usage', action: '공식 할당량 확인', help: 'Claude 설정 → 사용량에서 세션·주간 한도를 확인하세요.' },
  { provider: 'codex', title: 'Codex', url: 'https://chatgpt.com/settings/usage', action: '공식 할당량 확인', help: 'ChatGPT 설정 → 사용량에서 남은 한도와 초기화 시각을 확인하세요.' },
  { provider: 'gemini', title: 'Antigravity', url: 'https://antigravity.google/docs/cli/commands/usage', action: '할당량 확인 방법', help: 'Antigravity의 설정 또는 CLI /usage에서 모델별 잔여 할당량을 확인하세요.' },
] as const;

function settingsAgentCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : undefined;
}

export function settingsAgentUsageText(usage: SettingsAgentUsage, now = Date.now()): string {
  const used = settingsAgentCount(usage.callsInWindow);
  if (used === undefined) return '사용 기록을 확인할 수 없습니다. 공식 잔여량은 서비스에서 확인하세요.';
  const parts = [`최근 5시간 · 이 앱에서 ${used}회 생성`];
  const reset = usage.rateLimitResetAt;
  if (typeof reset === 'number' && Number.isFinite(reset) && reset > now && reset < 8.64e15) {
    parts.push(`한도 도달 · 초기화 ${new Date(reset).toLocaleString('ko-KR')}`);
  } else if (usage.rateLimitedAt && !reset) {
    parts.push('한도 도달 기록 있음 · 초기화 시각 확인 필요');
  }
  const observed = settingsAgentCount(usage.observedLimit);
  const manual = settingsAgentCount(usage.manualLimit);
  const limit = observed && observed > 0 ? observed : manual;
  if (limit && limit > 0) {
    parts.push(`${observed ? '과거 관측' : '사용자 설정'} 기준 추정 ${Math.max(0, limit-used)}회 남음`);
  }
  parts.push('공식 잔여량과 다를 수 있습니다. 다른 앱의 사용은 포함되지 않습니다.');
  return parts.join('\n');
}

function settingsAgentElement<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  return node;
}

function settingsAgentButton(text: string): HTMLButtonElement {
  const button = settingsAgentElement('button', text);
  button.type = 'button';
  button.style.cssText = 'padding:8px 12px;border:1px solid var(--border-gold,#6b7280);border-radius:8px;background:var(--bg-secondary,#20232b);color:var(--text-strong,#f5f5f5);cursor:pointer;font:inherit;font-size:0.82rem;';
  return button;
}

function settingsAgentAddUsage(provider: SettingsAgentProvider, parent: HTMLElement): void {
  const target = settingsAgentTargets.find((item) => item.provider === provider)!;
  // Folded by default: the account line above already shows the count and a reached limit.
  const box = settingsAgentElement('details');
  box.style.cssText = 'padding:10px 12px;border:1px solid var(--nv-line,#6b7280);border-radius:10px;background:var(--bg-secondary);';
  const summary = settingsAgentElement('summary', `${target.title} 사용량 · 할당량 보기`);
  summary.style.cssText = 'cursor:pointer;font-weight:700;font-size:0.85rem;color:var(--text-strong);';
  box.append(summary);
  const status = settingsAgentElement('p', '사용 기록을 확인하고 있습니다.');
  status.id = `settings-${provider}-usage`;
  status.setAttribute('role', 'status');
  status.style.cssText = 'white-space:pre-line;line-height:1.6;font-size:0.82rem;color:var(--text-muted);';
  const refresh = settingsAgentButton('사용 기록 새로고침');
  refresh.addEventListener('click', () => { void refreshSettingsAgentUsage([provider]); });
  const official = settingsAgentButton(target.action);
  official.style.marginLeft = '8px';
  official.addEventListener('click', async () => {
    try {
      const result = await (window as any).api?.openExternalUrl?.(target.url);
      if (!result?.success) throw new Error('open failed');
    } catch { status.textContent = '확인 화면을 열지 못했습니다. 잠시 후 다시 시도해 주세요.'; }
  });
  const help = settingsAgentElement('p', target.help);
  help.style.cssText = 'font-size:0.78rem;color:var(--text-muted);line-height:1.5;margin-bottom:0;';
  box.append(status, refresh, official, help); parent.append(box);
}

let settingsAgentRefreshSequence = 0;
const settingsAgentRefreshVersions = new Map<string, number>();
export async function refreshSettingsAgentUsage(providers: readonly SettingsAgentProvider[] = ['codex','claude','gemini']): Promise<void> {
  void refreshSettingsAgentAccounts(providers); // accounts and their usage are read together
  await Promise.all(providers.map(async (provider) => {
    const status = document.getElementById(`settings-${provider}-usage`);
    if (!status) return;
    const version = ++settingsAgentRefreshSequence;
    settingsAgentRefreshVersions.set(provider, version);
    status.textContent = '사용 기록을 확인하고 있습니다.';
    try {
      const response = await (window as any).api?.agentUsage?.(provider);
      if (settingsAgentRefreshVersions.get(provider) !== version || !status.isConnected) return;
      if (!response?.success || !response.usage) throw new Error('usage unavailable');
      status.textContent = settingsAgentUsageText(response.usage);
    } catch {
      if (settingsAgentRefreshVersions.get(provider) === version && status.isConnected) {
        status.textContent = '사용 기록 조회 실패 · 새로고침하거나 공식 할당량을 확인해 주세요.';
      }
    }
  }));
}

function settingsAgentCollapseApiKeys(): void {
  const section = document.getElementById('settings-section-api-keys');
  if (!section) return;
  const engine = document.getElementById('settings-section-text-engine');
  if (engine && section.contains(engine)) section.after(engine);
  const children = Array.from(section.children).filter((node) => node.tagName !== 'DETAILS' && !node.classList.contains('settings-back-btn'));
  for (const child of children) {
    if (!child.querySelector('input,textarea')) continue;
    const details = settingsAgentElement('details');
    details.dataset.settingsApiKeys = 'true';
    details.style.cssText = 'margin:12px 0;border:1px solid var(--border-gold,#6b7280);border-radius:12px;padding:14px;';
    const title = child.querySelector('h3,h4')?.textContent?.trim().replace(/\s+/g,' ') || 'API 키 설정';
    const summary = settingsAgentElement('summary', `${title} · 펼쳐서 편집`);
    summary.style.cssText = 'cursor:pointer;color:var(--text-strong);font-weight:700;';
    child.before(details); details.append(summary, child);
  }
}

export function setupSettingsAgentOverview(): void {
  const content = document.querySelector<HTMLElement>('#settings-modal .settings-content');
  if (!content || document.getElementById('settings-agent-overview')) return;
  const first = document.querySelector<HTMLInputElement>('input[name="primaryGeminiTextModel"][value="agent-codex"]')?.closest('label');
  if (!first?.parentElement) return;
  const list = first.parentElement;
  const panel = settingsAgentElement('section'); panel.id = 'settings-agent-overview';
  panel.style.cssText = 'margin-bottom:24px;display:flex;flex-direction:column;gap:12px;';
  panel.append(settingsAgentElement('h3', '에이전트 연결 · 사용량'));
  for (const target of settingsAgentTargets) {
    const card = list.querySelector(`input[value="agent-${target.provider}"]`)?.closest('label');
    const model = document.getElementById(`agent-${target.provider}-model`)?.parentElement;
    if (!card || !model || model.parentElement !== list) continue;
    const group = settingsAgentElement('div');
    group.style.cssText = 'display:flex;flex-direction:column;gap:8px;';
    // Move existing nodes: preserve radio groups, values, status and login handlers.
    let node: Element | null = card;
    while (node) {
      const next: Element | null = node.nextElementSibling;
      group.append(node);
      if (node === model) break;
      node = next;
    }
    setupSettingsAgentAccounts(target.provider, group);
    settingsAgentAddUsage(target.provider, group); panel.append(group);
  }
  // A switch changes which account the usage numbers describe.
  window.addEventListener('agent-account-changed', (event) => {
    const provider = (event as CustomEvent<{ provider?: SettingsAgentProvider }>).detail?.provider;
    if (provider) void refreshSettingsAgentUsage([provider]);
  });
  const save = settingsAgentButton('에이전트 설정 저장'); save.id = 'settings-agent-save';
  save.addEventListener('click', () => { document.getElementById('text-engine-save-btn')?.click(); });
  panel.append(save); content.prepend(panel);
  settingsAgentCollapseApiKeys();
}
