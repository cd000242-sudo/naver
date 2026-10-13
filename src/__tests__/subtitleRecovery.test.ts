// @vitest-environment happy-dom
// [2026-10-13 사장님 "가끔 소제목 인식을 이상하게 하거나 타이핑할 때 빼먹는다"] 10/11 02:46 발행: 소제목 DOM 검증 실패 뒤
//   캐럿이 #input_buffer 에 갇혀 그 소제목이 통째로 빠졌다(발행 전 검사 section-order 실패). 인용구 블록은 툴바로 만들어져
//   남아 있으므로, 그 안(.se-quotation-container, 라이브 DOM 10/13)을 눌러 다시 치고 재검증한다.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { locateLastQuotationInPage, recoverSubtitleTyping, QUOTATION_COMPONENT_SELECTOR, QUOTATION_INNER_SELECTORS } from '../automation/subtitleRecovery';
import { safeKeyboardType } from '../automation/typingUtils.js';

vi.mock('../automation/typingUtils.js', () => ({ safeKeyboardType: vi.fn() }));

const QUOTE = (text: string) => `
  <div class="se-component se-quotation se-l-quotation_line"><div class="se-component-content"><div class="se-drop-indicator">
    <div class="se-section se-section-quotation se-l-quotation_line"><div class="se-quotation-container"><p class="se-text-paragraph">${text}</p></div></div>
  </div></div></div>`;

beforeEach(() => { document.body.innerHTML = ''; vi.mocked(safeKeyboardType).mockClear(); });

describe('locateLastQuotationInPage', () => {
  it('마지막 인용구 블록의 안쪽 상자 좌표와 현재 글자를 돌려준다', () => {
    document.body.innerHTML = QUOTE('첫 소제목') + QUOTE('');
    for (const el of Array.from(document.querySelectorAll('.se-quotation-container'))) {
      (el as HTMLElement).getBoundingClientRect = () => ({ left: 100, top: 300, width: 600, height: 45 } as DOMRect);
    }
    const t = locateLastQuotationInPage({ componentSelector: QUOTATION_COMPONENT_SELECTOR, innerSelectors: [...QUOTATION_INNER_SELECTORS] });
    expect(t).toEqual({ found: true, x: 260, y: 322.5, text: '' });
  });

  it('인용구가 없으면 found=false', () => {
    document.body.innerHTML = '<div class="se-component se-text"><p class="se-text-paragraph">본문</p></div>';
    expect(locateLastQuotationInPage({ componentSelector: QUOTATION_COMPONENT_SELECTOR, innerSelectors: [...QUOTATION_INNER_SELECTORS] }).found).toBe(false);
  });
});

function fakes(target: { found: boolean; x: number; y: number; text: string }, verifyResults: boolean[]) {
  const clicks: Array<{ x: number; y: number }> = [];
  const keys: string[] = [];
  const logs: string[] = [];
  const page = {
    $: vi.fn(async () => ({ boundingBox: async () => ({ x: 10, y: 20, width: 800, height: 600 }) })),
    mouse: { click: vi.fn(async (x: number, y: number) => { clicks.push({ x, y }); }) },
    keyboard: { press: vi.fn(async (k: string) => { keys.push(k); }), type: vi.fn(async () => undefined) },
  };
  const frame = { evaluate: vi.fn(async () => target) };
  let v = 0;
  const deps = { log: (m: string) => { logs.push(m); }, delay: async () => undefined, verify: vi.fn(async () => verifyResults[Math.min(v++, verifyResults.length - 1)]) };
  return { page, frame, deps, clicks, keys, logs };
}

describe('recoverSubtitleTyping', () => {
  it('빈 인용구를 찾으면 안쪽을 누르고 다시 친 뒤 재검증 결과를 돌려준다', async () => {
    const f = fakes({ found: true, x: 260, y: 322, text: '' }, [true]);
    expect(await recoverSubtitleTyping(f.page, f.frame, '진짜 3천만원대?', f.deps)).toBe(true);
    expect(f.clicks).toEqual([{ x: 270, y: 342 }]);
    expect(f.keys).toContain('End');
    expect(vi.mocked(safeKeyboardType).mock.calls[0][1]).toBe('진짜 3천만원대?');
    expect(f.logs.join('\n')).toContain('다시 입력');
  });

  it('인용구에 이미 글자가 있으면 다시 치지 않고 검증만 한다(중복 방지)', async () => {
    const f = fakes({ found: true, x: 1, y: 1, text: '진짜 3천만원대?' }, [true]);
    expect(await recoverSubtitleTyping(f.page, f.frame, '진짜 3천만원대?', f.deps)).toBe(true);
    expect(f.clicks).toHaveLength(0);
    expect(safeKeyboardType).not.toHaveBeenCalled();
  });

  it('인용구를 못 찾으면 아무것도 치지 않고 false', async () => {
    const f = fakes({ found: false, x: 0, y: 0, text: '' }, [false]);
    expect(await recoverSubtitleTyping(f.page, f.frame, '소제목', f.deps)).toBe(false);
    expect(safeKeyboardType).not.toHaveBeenCalled();
  });

  it('재입력 뒤에도 검증이 실패하면 false 를 돌려주되 던지지 않는다', async () => {
    const f = fakes({ found: true, x: 5, y: 5, text: '' }, [false]);
    expect(await recoverSubtitleTyping(f.page, f.frame, '소제목', f.deps)).toBe(false);
    expect(f.logs.join('\n')).toContain('재입력도 확인되지 않았습니다');
  });
});

describe('배선(소스 가드)', () => {
  it('typeSubtitleWithRetry 가 DOM 검증 실패 시 recoverSubtitleTyping 을 부른다', () => {
    const src = readFileSync(resolve('src/naverBlogAutomation.ts'), 'utf8').replace(/\r\n/g, '\n');
    const fn = src.split('private async typeSubtitleWithRetry(')[1].split('\n  private ')[0];
    expect(src).toContain("from './automation/subtitleRecovery.js'");
    expect(fn).toContain('recoverSubtitleTyping(');
    expect(fn).not.toContain("DOM 검증 실패 (계속 진행)');");
  });
});
