// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TITLE_CANDIDATE_CHIPS_HOST_ID,
  collectTitleCandidateChips,
  renderTitleCandidateChips,
} from '../renderer/modules/titleCandidateChips.js';

/**
 * [2026-09-30] Semi-auto title candidate chips.
 *
 * Owner request: "반자동으로 앱에서 글생성을 할때 아래에 제목 후보 버튼으로 다른 제목도
 * 추천해서 보여주세요". The generator already returns titleCandidates[3]; the renderer
 * only showed the selected one. The existing "제목 A/B" panel is a separate keyword tool
 * and never sees the post's own candidates.
 */

const ROOT = resolve(__dirname, '..');
const read = (rel: string) =>
  readFileSync(resolve(ROOT, ...rel.split('/')), 'utf-8').replace(/\r/g, '');

const CANDIDATES = [
  { text: '청약통장 해지 전 확인할 3가지', score: 92, reasoning: '조건 제시' },
  { text: '청약통장, 지금 깨면 손해인 사람', score: 88, reasoning: '갈림길' },
  { text: '청약통장 유지가 답인 경우', score: 80 },
];

function content(overrides: Record<string, unknown> = {}) {
  return {
    selectedTitle: CANDIDATES[0].text,
    title: CANDIDATES[0].text,
    titleCandidates: CANDIDATES,
    ...overrides,
  };
}

describe('collectTitleCandidateChips — what is worth showing', () => {
  it('returns every distinct candidate including the selected one', () => {
    const chips = collectTitleCandidateChips(content());
    expect(chips.map((c) => c.text)).toEqual(CANDIDATES.map((c) => c.text));
    expect(chips[0].reasoning).toBe('조건 제시');
  });

  it('accepts plain-string candidates and titleAlternatives, de-duplicating by text', () => {
    const chips = collectTitleCandidateChips(content({
      titleCandidates: ['A 제목', { text: 'B 제목' }, 'A 제목'],
      titleAlternatives: ['B 제목', 'C 제목'],
    }));
    expect(chips.map((c) => c.text)).toEqual(['A 제목', 'B 제목', 'C 제목']);
  });

  it('hides when fewer than two distinct candidates exist', () => {
    expect(collectTitleCandidateChips(content({ titleCandidates: [CANDIDATES[0]] }))).toEqual([]);
    expect(collectTitleCandidateChips(content({ titleCandidates: [] }))).toEqual([]);
    expect(collectTitleCandidateChips(content({ titleCandidates: undefined }))).toEqual([]);
    expect(collectTitleCandidateChips(null)).toEqual([]);
  });

  it('hides when the title is locked (manual override or keyword-as-title)', () => {
    expect(collectTitleCandidateChips(content({ manualTitleLocked: true }))).toEqual([]);
    expect(collectTitleCandidateChips(content({ keywordAsTitleLocked: true }))).toEqual([]);
  });

  it('drops empty and URL candidates', () => {
    const chips = collectTitleCandidateChips(content({
      titleCandidates: [{ text: '' }, { text: 'https://example.com/x' }, ...CANDIDATES],
    }));
    expect(chips).toHaveLength(3);
  });
});

describe('renderTitleCandidateChips — DOM', () => {
  beforeEach(() => {
    document.body.innerHTML =
      `<input id="unified-generated-title" value="${CANDIDATES[0].text}">` +
      `<div id="${TITLE_CANDIDATE_CHIPS_HOST_ID}" style="display:none"></div>`;
  });

  it('renders one button per candidate, marks the current title active, and hides nothing as HTML', () => {
    const onSelect = vi.fn();
    renderTitleCandidateChips(content({
      titleCandidates: [...CANDIDATES, { text: '<img src=x onerror=alert(1)> 제목' }],
    }), onSelect);
    const host = document.getElementById(TITLE_CANDIDATE_CHIPS_HOST_ID) as HTMLElement;
    const buttons = host.querySelectorAll('button');
    expect(host.style.display).not.toBe('none');
    expect(buttons).toHaveLength(4);
    expect(buttons[0].classList.contains('is-active')).toBe(true);
    expect(buttons[1].classList.contains('is-active')).toBe(false);
    expect(buttons[1].title).toBe('갈림길');
    expect(host.querySelector('img')).toBeNull();
    expect(buttons[3].textContent).toContain('<img');
  });

  it('calls onSelect with the candidate text on click', () => {
    const onSelect = vi.fn();
    renderTitleCandidateChips(content(), onSelect);
    const host = document.getElementById(TITLE_CANDIDATE_CHIPS_HOST_ID) as HTMLElement;
    (host.querySelectorAll('button')[1] as HTMLButtonElement).click();
    expect(onSelect).toHaveBeenCalledWith(CANDIDATES[1].text);
  });

  it('clears and hides the host when there is nothing to show (locked / single / reload)', () => {
    renderTitleCandidateChips(content(), () => {});
    renderTitleCandidateChips(content({ manualTitleLocked: true }), () => {});
    const host = document.getElementById(TITLE_CANDIDATE_CHIPS_HOST_ID) as HTMLElement;
    expect(host.style.display).toBe('none');
    expect(host.children).toHaveLength(0);
  });

  it('is a no-op when the host element is absent (older DOM fixtures)', () => {
    document.body.innerHTML = '<input id="unified-generated-title">';
    expect(() => renderTitleCandidateChips(content(), () => {})).not.toThrow();
  });
});

describe('wiring — the chips are attached to the semi-auto result view', () => {
  it('index.html hosts the chip row directly under the title input', () => {
    const html = read('../public/index.html');
    const titleAt = html.indexOf('id="unified-generated-title"');
    const hostAt = html.indexOf(`id="${TITLE_CANDIDATE_CHIPS_HOST_ID}"`);
    const bodyAt = html.indexOf('id="unified-generated-content"');
    expect(titleAt).toBeGreaterThan(0);
    expect(hostAt).toBeGreaterThan(titleAt);
    expect(bodyAt).toBeGreaterThan(hostAt);
  });

  it('fillSemiAutoFields renders chips and the selection handler updates input + state + saved post', () => {
    const src = read('renderer/modules/contentGeneration.ts');
    expect(src).toContain("from './titleCandidateChips.js'");
    expect(src).toMatch(/renderTitleCandidateChips\(structuredContent,\s*applyTitleCandidate\)/u);
    const handlerStart = src.indexOf('function applyTitleCandidate(');
    expect(handlerStart).toBeGreaterThan(0);
    const handler = src.slice(handlerStart, handlerStart + 1500);
    expect(handler).toContain("new Event('input', { bubbles: true })");
    expect(handler).toContain('selectedTitle = ');
    expect(handler).toContain('saveGeneratedPost(');
  });

  it('the load-from-list path clears stale chips (candidates are not persisted)', () => {
    const src = read('renderer/modules/postListUI.ts');
    expect(src).toContain("from './titleCandidateChips.js'");
    expect(src).toMatch(/renderTitleCandidateChips\(null/u);
  });

  it('the new module is registered for the inline bundle and the runtime fingerprint', () => {
    const copyStatic = read('../scripts/copy-static.mjs');
    const fingerprint = read('contentQualityV3/candidateRuntimeFingerprint.ts');
    expect(copyStatic).toContain("'titleCandidateChips.js'");
    expect(fingerprint).toContain("'src/renderer/modules/titleCandidateChips.ts'");
  });
});
