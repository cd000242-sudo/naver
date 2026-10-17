// src/renderer/modules/homefeedTopicAuto.ts
// [2026-10-15] 홈판 오토파일럿 P1 — one click: Claude judges the best homefeed topic and the
// decision is applied to the form automatically (keyword, homefeed mode, extra-request block).
//
// Every top-level identifier is prefixed (homefeedAuto / HOMEFEED_AUTO_) because copy-static
// concatenates renderer modules into a single scope. Main-process types are mirrored locally.

interface HomefeedAutoDecision {
  keyword: string;
  homeTitle: string;
  angle: string;
  category: string;
  score: number;
  reasons: string[];
  mustInclude: string[];
  mustAvoid: string[];
  checkBefore: string[];
  sourceUrls: string[];
  alternatives: { keyword: string; reason: string }[];
  decidedBy: 'llm' | 'score';
}

interface HomefeedAutoResponse {
  success: boolean;
  decision?: HomefeedAutoDecision;
  shortlist?: { keyword: string; title: string; score: number }[];
  engine?: string;
  warning?: string;
  message?: string;
}

const HOMEFEED_AUTO_IDS = {
  button: 'homefeed-auto-btn',
  result: 'homefeed-auto-result',
  keyword: 'unified-keywords',
  mode: 'unified-content-mode',
  extra: 'unified-extra-request',
} as const;

const HOMEFEED_AUTO_OPEN = '[홈판 자동 선정]';
const HOMEFEED_AUTO_CLOSE = '[/홈판 자동 선정]';
const HOMEFEED_AUTO_MAX = 2000;
const HOMEFEED_AUTO_BLOCK_RE = /\[홈판 자동 선정\][\s\S]*?\[\/홈판 자동 선정\]/;
const HOMEFEED_AUTO_BUSY = '⏳ Claude가 홈판 글감 분석 중...';
const HOMEFEED_AUTO_LABEL = '🏠 홈판 글감 자동 선정 (Claude)';

function homefeedAutoById<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function homefeedAutoEscape(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string
  ));
}

function homefeedAutoList(items: unknown): string[] {
  return Array.isArray(items) ? items.map((v) => String(v ?? '').trim()).filter(Boolean) : [];
}

/** Body lines of the auto block (without markers). Empty sections are skipped. */
function homefeedAutoBody(decision: HomefeedAutoDecision): string {
  const lines: string[] = [];
  if (String(decision.homeTitle || '').trim()) lines.push(`제목 방향: ${decision.homeTitle.trim()}`);
  if (String(decision.angle || '').trim()) lines.push(`각도: ${decision.angle.trim()}`);
  const sections: [string, string[]][] = [
    ['꼭 넣을 것', homefeedAutoList(decision.mustInclude)],
    ['피할 것', homefeedAutoList(decision.mustAvoid)],
    ['발행 전 확인', homefeedAutoList(decision.checkBefore)],
  ];
  for (const [label, items] of sections) {
    if (items.length === 0) continue;
    lines.push(`${label}:`, ...items.map((item) => `- ${item}`));
  }
  return lines.join('\n');
}

/** Builds the marker-wrapped block; the body is truncated so the block fits within maxLen. */
export function buildHomefeedAutoBlock(decision: HomefeedAutoDecision, maxLen = HOMEFEED_AUTO_MAX): string {
  const frame = HOMEFEED_AUTO_OPEN.length + HOMEFEED_AUTO_CLOSE.length + 2;
  let body = homefeedAutoBody(decision);
  const room = Math.max(0, maxLen - frame);
  if (body.length > room) body = room > 1 ? `${body.slice(0, room - 1).trimEnd()}…` : '';
  return `${HOMEFEED_AUTO_OPEN}\n${body}\n${HOMEFEED_AUTO_CLOSE}`;
}

/**
 * Puts the auto block into the existing extra-request text. A previous block is replaced in
 * place; otherwise the block is prepended with a blank line. The user's own text is never
 * cut — only the block shrinks to keep the total within maxLen.
 */
export function mergeHomefeedAutoBlock(existing: string, decision: HomefeedAutoDecision, maxLen = HOMEFEED_AUTO_MAX): string {
  const text = String(existing || '');
  const match = text.match(HOMEFEED_AUTO_BLOCK_RE);
  const compose = match
    ? (block: string) => text.slice(0, match.index) + block + text.slice((match.index || 0) + match[0].length)
    : (block: string) => (text.trim() ? `${block}\n\n${text}` : block);
  const userLen = compose('').length;
  return compose(buildHomefeedAutoBlock(decision, maxLen - userLen));
}

/** Result panel HTML (all text escaped). */
export function buildHomefeedAutoResultHtml(res: HomefeedAutoResponse): string {
  const d = res.decision;
  if (!res.success || !d || !d.keyword) {
    return `<div style="color:#f87171;">${homefeedAutoEscape(res.message || '홈판 글감을 고르지 못했습니다.')}</div>`;
  }
  const who = d.decidedBy === 'llm' ? `Claude 판단${res.engine ? ` (${res.engine})` : ''}` : '점수 1순위';
  const reasons = homefeedAutoList(d.reasons).slice(0, 6);
  const alts = Array.isArray(d.alternatives) ? d.alternatives.filter((a) => a && a.keyword) : [];
  const muted = 'color:var(--text-muted);font-size:0.72rem;';
  return (
    `<div style="font-weight:700;color:var(--text-strong);">🏠 ${homefeedAutoEscape(d.keyword)}`
    + ` <span style="${muted}font-weight:500;">점수 ${homefeedAutoEscape(d.score)} · ${homefeedAutoEscape(who)}</span></div>`
    + (d.homeTitle ? `<div style="margin-top:0.2rem;color:var(--text-secondary);">${homefeedAutoEscape(d.homeTitle)}</div>` : '')
    + (reasons.length
      ? `<ul style="margin:0.35rem 0 0;padding-left:1.1rem;">${reasons.map((r) => `<li>${homefeedAutoEscape(r)}</li>`).join('')}</ul>`
      : '')
    + (alts.length
      ? `<div style="margin-top:0.35rem;${muted}">차선: ${alts.map((a) => `${homefeedAutoEscape(a.keyword)}${a.reason ? ` — ${homefeedAutoEscape(a.reason)}` : ''}`).join(' · ')}</div>`
      : '')
    + (res.warning
      ? `<div class="homefeed-auto-warning" style="margin-top:0.35rem;color:#f59e0b;">⚠️ ${homefeedAutoEscape(res.warning)}</div>`
      : '')
  );
}

/** Switches to homefeed mode the same way a user would — by clicking the mode button. */
function homefeedAutoSwitchMode(): void {
  const mode = homefeedAutoById<HTMLInputElement>(HOMEFEED_AUTO_IDS.mode);
  if (mode?.value === 'homefeed') return;
  document.querySelector<HTMLButtonElement>('.content-mode-btn[data-mode="homefeed"]')?.click();
}

function homefeedAutoApply(decision: HomefeedAutoDecision): void {
  const input = homefeedAutoById<HTMLInputElement>(HOMEFEED_AUTO_IDS.keyword);
  if (input) {
    input.value = decision.keyword;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  homefeedAutoSwitchMode();
  const extra = homefeedAutoById<HTMLTextAreaElement>(HOMEFEED_AUTO_IDS.extra);
  if (extra) {
    extra.value = mergeHomefeedAutoBlock(extra.value, decision);
    extra.dispatchEvent(new Event('input', { bubbles: true }));
  }
  try { (window as any).toastManager?.success?.(`홈판 글감 자동 채택: ${decision.keyword}`); } catch { /* ignore */ }
}

function homefeedAutoShow(html: string): void {
  const panel = homefeedAutoById(HOMEFEED_AUTO_IDS.result);
  if (!panel) return;
  panel.innerHTML = html;
  panel.style.display = 'block';
}

async function homefeedAutoRun(): Promise<void> {
  const button = homefeedAutoById<HTMLButtonElement>(HOMEFEED_AUTO_IDS.button);
  if (!button || button.disabled) return;
  button.disabled = true;
  button.textContent = HOMEFEED_AUTO_BUSY;
  try {
    const judge = (window as any).api?.judgeHomefeedTopic;
    const res: HomefeedAutoResponse = typeof judge === 'function'
      ? (await judge()) || { success: false }
      : { success: false, message: '홈판 글감 선정 기능을 사용할 수 없습니다 (앱을 다시 시작해 주세요).' };
    if (res.success && res.decision?.keyword) homefeedAutoApply(res.decision);
    homefeedAutoShow(buildHomefeedAutoResultHtml(res));
  } catch (error) {
    const message = `홈판 글감을 고르지 못했습니다 — ${(error as Error)?.message ?? '알 수 없는 오류'}`;
    homefeedAutoShow(buildHomefeedAutoResultHtml({ success: false, message }));
  } finally {
    button.disabled = false;
    button.textContent = HOMEFEED_AUTO_LABEL;
  }
}

export function initHomefeedTopicAuto(): void {
  const button = homefeedAutoById(HOMEFEED_AUTO_IDS.button);
  if (!button || (button as any).__bound) return;
  (button as any).__bound = true;
  button.addEventListener('click', () => { void homefeedAutoRun(); });
}
