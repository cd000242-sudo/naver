/**
 * [2026-10-09] "본문 2벌" — typing fallback measured the editor on the wrong root.
 *
 * The live SmartEditor (read 2026-10-08) is .se-body > ... > article.se-components-wrap and has NO
 * `.se-main-container` (that class is the published-post viewer's). typeBodyWithRetry used to:
 *   - count the "before" offset by summing six nested selectors (every text counted 4-5 times), then
 *   - slice `.se-main-container || document.body` text at that inflated offset.
 * The slice landed past the end of the real text, the tail comparison was empty, planTypingFallback
 * answered `full`, and the whole section was retyped on top of whatever the rich paste had already
 * landed. These tests drive the real typeBodyWithRetry against a live-shaped DOM.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Window } from 'happy-dom';

vi.mock('../automation/richTextPaste.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../automation/richTextPaste.js')>()),
  pasteRichHtmlAtCursor: vi.fn(),
  focusLastEditableLine: vi.fn(async () => undefined),
}));
vi.mock('../automation/typingUtils.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../automation/typingUtils.js')>()),
  humanKeyboardType: vi.fn(),
  safeKeyboardType: vi.fn(),
}));

import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { typeBodyWithRetry } from '../automation/editorHelpers.js';
import { readEditorBodyText } from '../automation/typingFallbackPlan.js';
import { SMART_EDITOR_ROOT_SELECTORS } from '../automation/richTextPaste.js';
import { pasteRichHtmlAtCursor } from '../automation/richTextPaste.js';
import { humanKeyboardType } from '../automation/typingUtils.js';

// Node environment + an explicit happy-dom window: the happy-dom vitest environment cannot resolve the
// `electron` alias that richTextPaste's import graph needs.
const happyWindow = new Window();
beforeAll(() => {
  vi.stubGlobal('window', happyWindow);
  vi.stubGlobal('document', happyWindow.document);
  vi.stubGlobal('HTMLElement', happyWindow.HTMLElement);
  vi.stubGlobal('NodeFilter', happyWindow.NodeFilter);
});
afterAll(() => { vi.unstubAllGlobals(); });

const ZWSP = '​';
const PLACEHOLDER = '본문에 #을 이용하여 태그를 사용해 보세요!';

const SECTION_PARAGRAPHS = [
  '꿀을 고를 때 가장 먼저 확인할 것은 원산지와 채밀 시기입니다. 라벨에 적힌 정보가 구체적일수록 믿을 수 있습니다.',
  '보관은 서늘하고 그늘진 곳이 좋습니다. 냉장 보관하면 결정이 빨리 생기니 실온에 두는 편이 낫습니다.',
  '결정이 생겼다면 상한 것이 아니라 포도당이 굳은 것입니다. 중탕으로 천천히 녹이면 됩니다.',
  '마지막으로 개봉 후에는 뚜껑 주변을 닦아 두세요. 물기가 들어가면 발효가 시작될 수 있습니다.',
];
const SECTION_TEXT = SECTION_PARAGRAPHS.join('\n\n');
const strip = (value: string): string => value.replace(/\s+/g, '').replace(new RegExp(ZWSP, 'g'), '');

/** Live-shaped editor: toolbar chrome outside the article, title + body share article.se-components-wrap. */
function mountLiveEditor(priorSections: number): void {
  const prior = Array.from({ length: priorSections }, (_, i) => `
        <div class="se-component se-quotation"><div class="se-component-content"><div class="se-section se-section-quotation">
          <div class="se-module se-module-text"><p class="se-text-paragraph"><span>이전 소제목 ${i + 1}번 안내</span></p></div></div></div></div>
        <div class="se-component se-text"><div class="se-component-content"><div class="se-section se-section-text">
          <div class="se-module se-module-text"><p class="se-text-paragraph"><span>이전 섹션 ${i + 1}의 본문은 이미 입력되어 있고 충분히 긴 문장으로 구성되어 있습니다. 두 번째 문장도 있습니다.</span></p></div></div></div></div>`).join('');
  document.body.innerHTML = `
    <div class="se-toolbar">사진 편집 문서 너비 AI 사용 설정 마이박스 템플릿 라이브러리 임시저장 발행</div>
    <div class="se-body"><div class="se-wrap"><div class="se-container"><div class="se-content">
      <section class="se-canvas"><article class="se-components-wrap" contenteditable="true">
        <div class="se-component se-documentTitle"><div class="se-component-content"><div class="se-section se-section-documentTitle">
          <div class="se-module se-module-text"><p class="se-text-paragraph"><span>꿀 고르는 방법 총정리</span></p></div></div></div></div>
        ${prior}
        <div class="se-component se-quotation"><div class="se-component-content"><div class="se-section se-section-quotation">
          <div class="se-module se-module-text"><p class="se-text-paragraph"><span>현재 소제목 꿀 보관과 결정</span></p></div></div></div></div>
        <div class="se-component se-text" id="current-body"><div class="se-component-content"><div class="se-section se-section-text">
          <div class="se-module se-module-text" id="current-module"><p class="se-text-paragraph"><span class="se-ff-nanumgothic">${ZWSP}</span><span class="se-placeholder __se_placeholder">${PLACEHOLDER}</span></p></div></div></div></div>
      </article></section>
    </div></div></div></div>`;
}

/** Appends text to the current body like the editor does: the placeholder disappears once text exists. */
function landText(text: string): void {
  const module = document.getElementById('current-module') as HTMLElement;
  module.querySelectorAll('.se-placeholder').forEach((el) => el.remove());
  const paragraph = document.createElement('p');
  paragraph.className = 'se-text-paragraph';
  const span = document.createElement('span');
  span.textContent = text;
  paragraph.appendChild(span);
  module.appendChild(paragraph);
}

function makeHarness() {
  const self = {
    log: vi.fn(),
    retry: async (fn: () => Promise<string>) => fn(),
    delay: vi.fn(async () => undefined),
    DELAYS: { SHORT: 1, MEDIUM: 1, LONG: 1 },
    setFontSize: vi.fn(async () => undefined),
    setBold: vi.fn(async () => undefined),
    verifyContentInDOM: vi.fn(async () => true),
    ensureNotCancelled: vi.fn(),
    switchToMainFrame: vi.fn(async () => undefined),
    getAttachedFrame: vi.fn(),
  };
  const frame = { evaluate: async (fn: (...a: any[]) => unknown, ...args: unknown[]) => fn(...args) };
  const page = { keyboard: { press: vi.fn(async () => undefined), type: vi.fn(), down: vi.fn(), up: vi.fn() } };
  return { self, frame, page };
}

/** Runs the section once with a rich paste that lands `landed` text and then reports failure. */
async function runFallback(options: { priorSections: number; landed: string[] }): Promise<string[]> {
  mountLiveEditor(options.priorSections);
  const typed: string[] = [];
  vi.mocked(pasteRichHtmlAtCursor).mockImplementation(async () => {
    options.landed.forEach(landText);
    return { ok: false, method: 'none', reason: 'simulated paste failure', safeToFallback: true } as any;
  });
  vi.mocked(humanKeyboardType).mockImplementation(async (_page: any, line: string) => {
    typed.push(line);
    landText(line);
  });
  const { self, frame, page } = makeHarness();
  await typeBodyWithRetry(self, frame as any, page as any, SECTION_TEXT, 19);
  return typed;
}

/** How many times the section paragraph appears in the editor body (whitespace/ZWSP-insensitive). */
function occurrences(paragraph: string): number {
  const body = strip(document.querySelector('article.se-components-wrap')!.textContent || '');
  const needle = strip(paragraph);
  return body.split(needle).length - 1;
}

beforeEach(() => {
  vi.mocked(pasteRichHtmlAtCursor).mockReset();
  vi.mocked(humanKeyboardType).mockReset();
});

describe.each([0, 3])('typing fallback on the live editor DOM (%i earlier sections)', (priorSections) => {
  it('nothing landed → the section is typed exactly once', async () => {
    const typed = await runFallback({ priorSections, landed: [] });
    expect(strip(typed.join(''))).toBe(strip(SECTION_TEXT));
    SECTION_PARAGRAPHS.forEach((p) => expect(occurrences(p)).toBe(1));
  });

  it('paste fully landed but rollback was unverified → nothing is retyped', async () => {
    const typed = await runFallback({ priorSections, landed: SECTION_PARAGRAPHS });
    expect(typed).toEqual([]);
    SECTION_PARAGRAPHS.forEach((p) => expect(occurrences(p)).toBe(1));
  });

  it('first two paragraphs landed → only the missing two are typed', async () => {
    const typed = await runFallback({ priorSections, landed: SECTION_PARAGRAPHS.slice(0, 2) });
    expect(strip(typed.join(''))).toBe(strip(SECTION_PARAGRAPHS.slice(2).join('')));
    SECTION_PARAGRAPHS.forEach((p) => expect(occurrences(p)).toBe(1));
  });

  it('paste cut mid-paragraph → the remainder continues without repeating the prefix', async () => {
    const cut = SECTION_PARAGRAPHS[2].slice(0, 28);
    const typed = await runFallback({
      priorSections,
      landed: [...SECTION_PARAGRAPHS.slice(0, 2), cut],
    });
    const expectedRemainder = strip(SECTION_PARAGRAPHS[2]).slice(strip(cut).length) + strip(SECTION_PARAGRAPHS[3]);
    expect(strip(typed.join(''))).toBe(expectedRemainder);
    SECTION_PARAGRAPHS.forEach((p) => expect(occurrences(p)).toBe(1));
  });
});

describe('readEditorBodyText — one root, each text node once', () => {
  const roots = () => [...SMART_EDITOR_ROOT_SELECTORS];

  it('reads article.se-components-wrap and ignores the toolbar chrome around it', () => {
    mountLiveEditor(1);
    const text = readEditorBodyText(roots());
    expect(text).toContain('꿀 고르는 방법 총정리');
    expect(text).toContain('현재 소제목 꿀 보관과 결정');
    expect(text).not.toContain('사진 편집');
    expect(text).not.toContain('임시저장');
  });

  it('counts nested wrappers once — length equals the visible characters, not a multiple of them', () => {
    mountLiveEditor(0);
    landText(SECTION_PARAGRAPHS[0]);
    const expected = ['꿀 고르는 방법 총정리', '현재 소제목 꿀 보관과 결정', SECTION_PARAGRAPHS[0]].join(' ');
    expect(readEditorBodyText(roots()).replace(/\s+/g, ' ')).toBe(expected.replace(/\s+/g, ' '));
  });

  it('ignores placeholders and zero-width padding, so focus changes do not move the offset', () => {
    mountLiveEditor(0);
    const withHint = readEditorBodyText(roots());
    document.querySelectorAll('.se-placeholder').forEach((el) => el.remove());
    expect(readEditorBodyText(roots())).toBe(withHint);
    expect(withHint).not.toContain(PLACEHOLDER);
    expect(withHint).not.toContain(ZWSP);
  });

  it('prefers the editor article over .se-main-container, keeping the viewer class only as a last resort', () => {
    document.body.innerHTML = `<div class="se-main-container">뷰어 본문</div>
      <section class="se-canvas"><article class="se-components-wrap"><p>에디터 본문</p></article></section>`;
    expect(readEditorBodyText(roots())).toBe('에디터 본문');
    document.body.innerHTML = '<div class="se-main-container">뷰어 본문</div>';
    expect(readEditorBodyText(roots())).toBe('뷰어 본문');
  });

  it('survives puppeteer-style serialization — it reads nothing but document and NodeFilter', () => {
    mountLiveEditor(1);
    landText(SECTION_PARAGRAPHS[0]);
    // frame.evaluate ships fn.toString() to the page; a sandbox without any other binding proves it is self-contained.
    const shipped = runInNewContext(`(${readEditorBodyText.toString()})`, { document, NodeFilter }) as typeof readEditorBodyText;
    expect(shipped(roots())).toBe(readEditorBodyText(roots()));
  });

  it('falls back to the document body when no known editor root exists, and to empty text when blank', () => {
    document.body.innerHTML = '<div>알 수 없는 레이아웃</div>';
    expect(readEditorBodyText(roots())).toBe('알 수 없는 레이아웃');
    document.body.innerHTML = '';
    expect(readEditorBodyText(roots())).toBe('');
  });
});

describe('typeBodyWithRetry wiring', () => {
  it('slices the fallback tail from the same reader that measured the offset', () => {
    const source = readFileSync(new URL('../automation/editorHelpers.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
    const start = source.indexOf('export async function typeBodyWithRetry');
    const writer = source.slice(start, source.indexOf('// ── applyStructuredContent', start));
    expect(writer).not.toMatch(/querySelector\('\.se-main-container'\) \|\| document\.body/);
    expect(writer).not.toMatch(/full\.slice\(Math\.max\(0, beforeLen/);
    expect(writer).toContain('frame.evaluate(readEditorBodyText, editorBodyRoots)');
    expect(writer).toMatch(/full\.slice\(Math\.max\(0, editorBodyLenBeforeBody - 80\)\)/);
  });
});
