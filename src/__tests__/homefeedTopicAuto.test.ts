// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildHomefeedAutoBlock,
  initHomefeedTopicAuto,
  mergeHomefeedAutoBlock,
} from '../renderer/modules/homefeedTopicAuto.js';

/**
 * [2026-10-15] 홈판 오토파일럿 P1 — one click, Claude judges, the topic is adopted
 * automatically (keyword + homefeed mode + extra-request block). No manual pick list.
 */

const ROOT = resolve(__dirname, '..');
const read = (rel: string) =>
  readFileSync(resolve(ROOT, ...rel.split('/')), 'utf-8').replace(/\r/g, '');

const DECISION = {
  keyword: '청년 월세 지원',
  homeTitle: '청년 월세 20만원, 이번 달부터 달라진 3가지',
  angle: '신청 자격 변경점 중심',
  category: '지원금',
  score: 87,
  reasons: ['홈판 노출 글 3건이 같은 주제', '검색량 급등', '<script>x</script>'],
  mustInclude: ['소득 기준', '신청 기간'],
  mustAvoid: ['과장된 금액'],
  checkBefore: [],
  sourceUrls: [],
  alternatives: [{ keyword: '청년 도약계좌', reason: '경쟁 높음' }],
  decidedBy: 'llm' as const,
};

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('auto block build / merge', () => {
  it('builds a marker-wrapped block and skips empty sections', () => {
    const block = buildHomefeedAutoBlock(DECISION);
    expect(block.startsWith('[홈판 자동 선정]\n')).toBe(true);
    expect(block.endsWith('\n[/홈판 자동 선정]')).toBe(true);
    expect(block).toContain('제목 방향: 청년 월세 20만원, 이번 달부터 달라진 3가지');
    expect(block).toContain('각도: 신청 자격 변경점 중심');
    expect(block).toContain('꼭 넣을 것:\n- 소득 기준\n- 신청 기간');
    expect(block).toContain('피할 것:\n- 과장된 금액');
    expect(block).not.toContain('발행 전 확인');
  });

  it('prepends to empty or existing user text with a blank line', () => {
    expect(mergeHomefeedAutoBlock('', DECISION)).toBe(buildHomefeedAutoBlock(DECISION));
    const merged = mergeHomefeedAutoBlock('표로 정리해 주세요.', DECISION);
    expect(merged).toBe(`${buildHomefeedAutoBlock(DECISION)}\n\n표로 정리해 주세요.`);
  });

  it('replaces a previous block instead of stacking, keeping user text', () => {
    const first = mergeHomefeedAutoBlock('내 요청', { ...DECISION, homeTitle: '옛 제목' });
    const second = mergeHomefeedAutoBlock(first, DECISION);
    expect(second.match(/\[홈판 자동 선정\]/g)).toHaveLength(1);
    expect(second).not.toContain('옛 제목');
    expect(second).toContain('내 요청');
    expect(second.endsWith('\n\n내 요청')).toBe(true);
  });

  it('caps the total at 2000 by shortening the block, never the user text', () => {
    const long = { ...DECISION, mustInclude: Array.from({ length: 200 }, (_, i) => `항목 ${i} 아주 긴 설명`) };
    const user = '유'.repeat(1500);
    const merged = mergeHomefeedAutoBlock(user, long);
    expect(merged.length).toBeLessThanOrEqual(2000);
    expect(merged.endsWith(user)).toBe(true);
    expect(merged).toContain('[/홈판 자동 선정]');
    expect(mergeHomefeedAutoBlock('', long).length).toBeLessThanOrEqual(2000);
  });

  it('keeps user text intact even when it alone leaves no room', () => {
    const user = '유'.repeat(1995);
    const merged = mergeHomefeedAutoBlock(user, DECISION);
    expect(merged.endsWith(user)).toBe(true);
  });
});

describe('click flow', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <input id="unified-keywords" />
      <input type="hidden" id="unified-content-mode" value="seo" />
      <button class="content-mode-btn" data-mode="homefeed">홈판</button>
      <textarea id="unified-extra-request" maxlength="2000">사용자 메모</textarea>
      <button id="homefeed-auto-btn">🏠 홈판 글감 자동 선정 (Claude)</button>
      <div id="homefeed-auto-result" style="display:none"></div>`;
    const modeBtn = document.querySelector<HTMLButtonElement>('.content-mode-btn')!;
    modeBtn.addEventListener('click', () => {
      (document.getElementById('unified-content-mode') as HTMLInputElement).value = 'homefeed';
    });
    (window as any).toastManager = { success: vi.fn() };
  });

  async function clickOnce() {
    initHomefeedTopicAuto();
    const btn = document.getElementById('homefeed-auto-btn') as HTMLButtonElement;
    btn.click();
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toBe('⏳ Claude가 홈판 글감 분석 중...');
    await tick();
    await tick();
    return btn;
  }

  it('applies keyword, homefeed mode, extra request block and renders the result panel', async () => {
    (window as any).api = {
      judgeHomefeedTopic: vi.fn(async () => ({ success: true, decision: DECISION, engine: 'claude-opus', warning: '데이터 일부 누락' })),
    };
    const keywordInput = vi.fn();
    document.getElementById('unified-keywords')!.addEventListener('input', keywordInput);
    const btn = await clickOnce();

    expect((document.getElementById('unified-keywords') as HTMLInputElement).value).toBe('청년 월세 지원');
    expect(keywordInput).toHaveBeenCalled();
    expect((document.getElementById('unified-content-mode') as HTMLInputElement).value).toBe('homefeed');
    const extra = (document.getElementById('unified-extra-request') as HTMLTextAreaElement).value;
    expect(extra.startsWith('[홈판 자동 선정]')).toBe(true);
    expect(extra.endsWith('\n\n사용자 메모')).toBe(true);
    expect((window as any).toastManager.success).toHaveBeenCalledWith('홈판 글감 자동 채택: 청년 월세 지원');

    const panel = document.getElementById('homefeed-auto-result')!;
    expect(panel.style.display).toBe('block');
    expect(panel.textContent).toContain('Claude 판단 (claude-opus)');
    expect(panel.textContent).toContain('점수 87');
    expect(panel.textContent).toContain('청년 도약계좌');
    expect(panel.querySelectorAll('li')).toHaveLength(3);
    expect(panel.innerHTML).not.toContain('<script>');
    expect(panel.querySelector('.homefeed-auto-warning')?.textContent).toContain('데이터 일부 누락');
    expect(btn.disabled).toBe(false);
    expect(btn.textContent).toBe('🏠 홈판 글감 자동 선정 (Claude)');
  });

  it('score fallback is labelled 점수 1순위', async () => {
    (window as any).api = { judgeHomefeedTopic: vi.fn(async () => ({ success: true, decision: { ...DECISION, decidedBy: 'score' } })) };
    await clickOnce();
    expect(document.getElementById('homefeed-auto-result')!.textContent).toContain('점수 1순위');
  });

  it('failure shows the message and leaves the form untouched', async () => {
    (window as any).api = { judgeHomefeedTopic: vi.fn(async () => ({ success: false, message: 'Claude 키가 없습니다' })) };
    const btn = await clickOnce();
    expect(document.getElementById('homefeed-auto-result')!.textContent).toContain('Claude 키가 없습니다');
    expect((document.getElementById('unified-keywords') as HTMLInputElement).value).toBe('');
    expect((document.getElementById('unified-extra-request') as HTMLTextAreaElement).value).toBe('사용자 메모');
    expect(btn.disabled).toBe(false);
  });

  it('a thrown IPC error is shown, not rethrown, and the button is restored', async () => {
    (window as any).api = { judgeHomefeedTopic: vi.fn(async () => { throw new Error('boom'); }) };
    const btn = await clickOnce();
    expect(document.getElementById('homefeed-auto-result')!.textContent).toContain('boom');
    expect(btn.disabled).toBe(false);
  });
});

describe('wiring locks', () => {
  it('index.html, copy-static and renderer.ts are wired', () => {
    const html = read('../public/index.html');
    expect(html).toContain('id="homefeed-auto-btn"');
    expect(html).toContain('id="homefeed-auto-result"');
    expect(html.indexOf('id="leword-board-list"')).toBeLessThan(html.indexOf('id="homefeed-auto-btn"'));
    expect(html.indexOf('id="homefeed-auto-btn"')).toBeLessThan(html.indexOf('id="blueocean-auto-select"'));

    const copyStatic = read('../scripts/copy-static.mjs');
    expect(copyStatic).toMatch(/'lewordBoardPicker\.js',\s*(\/\/[^\n]*\n\s*)*'homefeedTopicAuto\.js',/);

    const renderer = read('renderer/renderer.ts');
    expect(renderer).toContain("import { initHomefeedTopicAuto } from './modules/homefeedTopicAuto.js';");
    expect(renderer).toMatch(/initLewordBoardPicker\(\);[\s\S]{0,200}initHomefeedTopicAuto\(\);/);
  });
});
