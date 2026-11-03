// @vitest-environment happy-dom
/**
 * [2026-11-03] 메인 화면 맨 위 정리.
 *  - "AI 탐지 · 법적 위험 · 품질 점수 · 일일 권장" 카드 줄과 "에이전트 잔여" 배지는 기본 접힘(토글 + localStorage 기억).
 *    접혀 있어도 갱신 코드는 그대로 동작해야 하므로 DOM 에서 지우지 않고 숨기기만 한다.
 *  - [매일 예약발행] 버튼은 오른쪽 위 "도구 접기" 토글 바로 왼쪽의 네이버 초록 버튼.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const root = (rel: string) => resolve(__dirname, '../..', rel);
const script = readFileSync(root('public/floating-scroll.js'), 'utf8');
const html = readFileSync(root('public/index.html'), 'utf8');
const floatingCss = readFileSync(root('public/floating-buttons.css'), 'utf8');
const dailyCss = readFileSync(root('public/daily-publishing.css'), 'utf8');
const stylesCss = readFileSync(root('public/styles.css'), 'utf8');
const runScript = () => new Function('document', 'window', script)(document, globalThis);
const KEY = 'riskSummaryCollapsed';
const bar = () => document.getElementById('risk-summary-fixed') as HTMLElement;
const toggle = () => document.getElementById('risk-summary-toggle') as HTMLButtonElement;

beforeEach(() => {
  localStorage.clear();
  document.body.className = '';
  document.body.innerHTML = `<header>
    <button type="button" id="risk-summary-toggle" aria-controls="risk-summary-fixed" aria-expanded="false">지표 보기</button>
    <div class="summary-bar" id="risk-summary-fixed" hidden>
      <div class="summary-card"><span class="label">AI 탐지</span><span class="value" data-risk-ai>—</span></div>
      <div class="summary-card"><span class="label">법적 위험</span><span class="value" data-risk-legal>—</span></div>
      <div class="summary-card" id="agent-quota-badge" style="display: none;"><span id="agent-quota-badge-value">—</span></div>
    </div>
    <p data-risk-warning>경고</p>
  </header>`;
});
afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  localStorage.clear();
});

describe('지표 줄 접기', () => {
  it('저장값이 없으면 기본 접힘이다', () => {
    runScript();
    expect(bar().hidden).toBe(true);
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(toggle().textContent).toContain('보기');
  });

  it('토글하면 펼쳐지고 다시 누르면 접히며 상태를 localStorage 에 기억한다', () => {
    runScript();
    toggle().click();
    expect(bar().hidden).toBe(false);
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(toggle().textContent).toContain('접기');
    expect(localStorage.getItem(KEY)).toBe('false');
    toggle().click();
    expect(bar().hidden).toBe(true);
    expect(localStorage.getItem(KEY)).toBe('true');
  });

  it('펼침으로 저장돼 있으면 다음 실행에서 펼쳐진 채 시작한다', () => {
    localStorage.setItem(KEY, 'false');
    runScript();
    expect(bar().hidden).toBe(false);
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
  });

  it('깨진 저장값은 기본(접힘)으로 본다', () => {
    localStorage.setItem(KEY, 'broken');
    runScript();
    expect(bar().hidden).toBe(true);
  });

  it('접혀 있어도 지표·에이전트 배지 DOM 은 살아 있어 갱신 코드가 그대로 동작한다', () => {
    runScript();
    const ai = document.querySelector('[data-risk-ai]') as HTMLElement;
    ai.textContent = '12%';
    const badge = document.getElementById('agent-quota-badge') as HTMLElement;
    badge.style.display = '';
    expect(bar().contains(ai)).toBe(true);
    expect(bar().contains(badge)).toBe(true);
    expect(bar().hidden).toBe(true);
    toggle().click();
    expect((document.querySelector('[data-risk-ai]') as HTMLElement).textContent).toBe('12%');
    expect(badge.style.display).toBe('');
  });

  it('경고 문구(data-risk-warning)는 접어도 숨기지 않는다', () => {
    runScript();
    const warning = document.querySelector('[data-risk-warning]') as HTMLElement;
    expect(warning.hidden).toBe(false);
    expect(bar().contains(warning)).toBe(false);
  });

  it('저장소를 못 쓰는 환경에서도 던지지 않고 토글된다', () => {
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(runScript).not.toThrow();
    toggle().click();
    expect(bar().hidden).toBe(false);
  });

  it('두 번 초기화해도 핸들러가 겹치지 않는다', () => {
    runScript();
    runScript();
    toggle().click();
    expect(bar().hidden).toBe(false);
  });

  it('카드 줄이 없는 화면에서는 아무 일도 하지 않는다', () => {
    document.body.innerHTML = '';
    expect(runScript).not.toThrow();
  });

  it('CSS: display:grid 가 hidden 을 이기지 않도록 [hidden] 규칙이 있다', () => {
    expect(stylesCss).toMatch(/\.summary-bar\[hidden\]\s*\{\s*display:\s*none/);
  });

  // [2026-11-03 app run] Above the bar the toggle sat at (28,76) under the fixed member badge
  // (#left-status-badges 20,64,185x43): elementFromPoint returned the badge, so it could not be clicked.
  it('index.html: 카드 줄은 hidden 으로 시작하고 토글 버튼은 회원 배지에 가리지 않게 안내 문구 아래에 있다', () => {
    expect(html).toMatch(/<button type="button" id="risk-summary-toggle"[^>]*aria-controls="risk-summary-fixed"/);
    expect(html).toMatch(/<div class="summary-bar" id="risk-summary-fixed" hidden>/);
    expect(html.indexOf('id="risk-summary-toggle"')).toBeGreaterThan(html.indexOf('id="ai-basic-law-notice"'));
    expect(html.indexOf('id="risk-summary-toggle"')).toBeLessThan(html.indexOf('id="serp-benchmark-bar"'));
    expect(html).toContain('id="agent-quota-badge"');
  });
});

describe('[매일 예약발행] 버튼 위치', () => {
  const header = html.slice(html.indexOf('<header class="app-header">'), html.indexOf('</header>'));

  it('왼쪽 위 헤더 안에서 빠지고 body 바로 아래(fixed 가 헤더 필터에 갇히지 않는 곳)에 한 번만 있다', () => {
    expect(header).not.toContain('open-daily-publishing');
    expect(html.match(/id="open-daily-publishing"/g)).toHaveLength(1);
    expect(html).toMatch(/<button type="button" id="open-daily-publishing"[^>]*>매일 예약발행<\/button>/);
    expect(html.indexOf('id="open-daily-publishing"')).toBeLessThan(html.indexOf('<div class="app-container">'));
  });

  it('도구 접기 토글과 같은 줄(top 56px), 토글 바로 왼쪽(right = 토글 오른쪽 여백 + 토글 폭 + 간격)', () => {
    const toggleRule = floatingCss.match(/#right-toolbar-toggle\s*\{[^}]*\}/)![0];
    const dailyRule = floatingCss.match(/#open-daily-publishing\s*\{[^}]*\}/)![0];
    expect(floatingCss).toMatch(/--right-toggle-width:\s*6\.5rem/);
    expect(toggleRule).toMatch(/width:\s*var\(--right-toggle-width\)/);
    expect(toggleRule).toMatch(/top:\s*56px/);
    expect(dailyRule).toMatch(/position:\s*fixed/);
    expect(dailyRule).toMatch(/top:\s*56px/);
    expect(dailyRule).toMatch(/right:\s*calc\(16px \+ var\(--right-toggle-width\) \+ 8px\)/);
  });

  it('네이버 초록 #03C75A, hover #02B350, 흰 글자, 둥근 모서리', () => {
    const dailyRule = floatingCss.match(/#open-daily-publishing\s*\{[^}]*\}/)![0];
    const hoverRule = floatingCss.match(/#open-daily-publishing:hover\s*\{[^}]*\}/)![0];
    expect(dailyRule).toMatch(/background:\s*#03C75A/i);
    expect(dailyRule).toMatch(/color:\s*#fff/i);
    expect(dailyRule).toMatch(/border-radius:\s*\d+(px|rem)/);
    expect(hoverRule).toMatch(/background:\s*#02B350/i);
  });

  it('daily-publishing.css 의 공통 회색 버튼 규칙이 이 버튼을 더는 덮지 않는다', () => {
    expect(dailyCss).not.toMatch(/#open-daily-publishing\s*\{/);
    expect(dailyCss).not.toMatch(/,\s*#open-daily-publishing\s*\{/);
  });

  it('바인딩 계약 유지: 패널 코드가 id 로 찾고 e2e 도 같은 id 를 누른다', () => {
    expect(readFileSync(root('src/renderer/modules/dailyPublishingPanel.ts'), 'utf8')).toContain("getElementById('open-daily-publishing')");
    expect(readFileSync(root('e2e/daily-publishing-panel.spec.ts'), 'utf8')).toContain('#open-daily-publishing');
  });
});
