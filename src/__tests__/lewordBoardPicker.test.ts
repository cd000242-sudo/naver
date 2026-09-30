// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildLewordSectionsHtml, initLewordBoardPicker } from '../renderer/modules/lewordBoardPicker.js';

/**
 * [2026-09-30] "오늘의 글감 불러오기 클릭하면 저번부터 안바뀌는데 ... 이거 접었다폈다가능하게해줘"
 *
 * Two things: the list is grouped by source (each with its own refresh time, briefs first
 * and open, slower boards collapsed) and the whole panel can be folded/unfolded without
 * refetching.
 */

const ROOT = resolve(__dirname, '..');
const read = (rel: string) =>
  readFileSync(resolve(ROOT, ...rel.split('/')), 'utf-8').replace(/\r/g, '');

const brief = { keyword: '청주 특례시', searchVolume: 5100, documentCount: 4748, verdict: 'NOW', lane: '지원금·복지', recommended: true, briefTitle: '청주 특례시 지정되면 복지 기준 어떻게 바뀌나' };
const slot = { keyword: '무료 쳇지피티', searchVolume: 3530, documentCount: 246, verdict: 'golden', lane: 'IT', recommended: true, openSlot: 3, adClicks: 1344.8, saturated: false };
const niche = { keyword: '김유정 더쿠', searchVolume: 200, documentCount: 40, verdict: 'niche', lane: 'realtime', recommended: true };

const SECTIONS = [
  { key: 'briefs' as const, label: '오늘의 글감', publishedAt: '2026-09-30T03:29:21.943Z', picks: [brief] },
  { key: 'preemption' as const, label: '블로그가 이기는 자리', publishedAt: '2026-09-28T13:18:01.337Z', picks: [slot] },
  { key: 'niche' as const, label: '실검 틈새', publishedAt: '2026-09-30T03:28:40.184Z', picks: [niche] },
];

describe('buildLewordSectionsHtml — grouped by source', () => {
  it('renders one <details> per section, briefs open and the slower boards collapsed', () => {
    const html = buildLewordSectionsHtml(SECTIONS);
    const root = document.createElement('div');
    root.innerHTML = html;
    const details = Array.from(root.querySelectorAll('details.leword-section'));
    expect(details.map((d) => d.getAttribute('data-key'))).toEqual(['briefs', 'preemption', 'niche']);
    expect(details.map((d) => d.hasAttribute('open'))).toEqual([true, false, false]);
  });

  it('labels every section with its own refresh time — the boards are days apart', () => {
    const html = buildLewordSectionsHtml(SECTIONS);
    expect(html).toMatch(/오늘의 글감[\s\S]*?09-30 \d{2}:\d{2} 갱신/);
    expect(html).toMatch(/블로그가 이기는 자리[\s\S]*?09-28 \d{2}:\d{2} 갱신/);
  });

  it('shows the brief title under the keyword and uses timing as the badge', () => {
    const html = buildLewordSectionsHtml(SECTIONS);
    expect(html).toContain('청주 특례시 지정되면 복지 기준 어떻게 바뀌나');
    expect(html).toMatch(/>NOW<\/span>청주 특례시/);
    expect(html).toMatch(/>블로그 자리<\/span>무료 쳇지피티/);
  });

  it('an empty section stays rendered (collapsed) with an explicit "nothing today" line', () => {
    const html = buildLewordSectionsHtml([{ ...SECTIONS[0], picks: [] }]);
    expect(html).toContain('오늘은 고를 만한 것이 없습니다');
    expect(html).not.toMatch(/<details[^>]*\sopen/);
  });

  it('escapes keyword text', () => {
    const html = buildLewordSectionsHtml([{ ...SECTIONS[2], picks: [{ ...niche, keyword: '<b>x</b>' }] }]);
    expect(html).not.toContain('<b>x</b>');
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
  });
});

describe('panel fold/unfold', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <input id="unified-keywords" />
      <button id="leword-board-btn">📋 오늘의 글감 불러오기 (leword)</button>
      <div id="leword-board-meta" style="display:none"></div>
      <button id="leword-board-toggle" style="display:none">▼ 펼치기</button>
      <div id="leword-board-list" style="display:none"></div>`;
    (window as any).api = { getLewordBoard: vi.fn(async () => ({ success: true, board: { picks: [brief, slot, niche], sections: SECTIONS, publishedAt: SECTIONS[0].publishedAt, measured: {} } })) };
  });

  async function load() {
    initLewordBoardPicker();
    document.getElementById('leword-board-btn')!.click();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
  }

  it('after loading, the list is open and the toggle reads 접기; toggling folds without refetch', async () => {
    await load();
    const list = document.getElementById('leword-board-list')!;
    const toggle = document.getElementById('leword-board-toggle')!;
    expect(list.style.display).toBe('block');
    expect(toggle.style.display).toBe('inline-block');
    expect(toggle.textContent).toBe('▲ 접기');

    toggle.click();
    expect(list.style.display).toBe('none');
    expect(toggle.textContent).toBe('▼ 펼치기');
    toggle.click();
    expect(list.style.display).toBe('block');
    expect((window as any).api.getLewordBoard).toHaveBeenCalledTimes(1);
  });

  it('picking a keyword fills the input and folds the list, keeping it available to unfold', async () => {
    await load();
    const pick = document.querySelector<HTMLButtonElement>('.leword-pick[data-keyword="청주 특례시"]')!;
    pick.click();
    expect((document.getElementById('unified-keywords') as HTMLInputElement).value).toBe('청주 특례시');
    expect(document.getElementById('leword-board-list')!.style.display).toBe('none');
    expect(document.getElementById('leword-board-toggle')!.textContent).toBe('▼ 펼치기');
  });

  it('meta line names every source with its count', async () => {
    await load();
    const meta = document.getElementById('leword-board-meta')!.textContent || '';
    expect(meta).toContain('총 3건');
    expect(meta).toContain('오늘의 글감 1');
    expect(meta).toContain('블로그가 이기는 자리 1');
  });
});

describe('wiring locks', () => {
  it('index.html has the toggle next to the meta line and the main fetches the briefs first', () => {
    const html = read('../public/index.html');
    expect(html).toContain('id="leword-board-toggle"');
    const handler = read('main/ipc/lewordBoardHandlers.ts');
    expect(handler).toMatch(/fetchJson\(LEWORD_BRIEFS_URL\),\s*fetchJson\(LEWORD_BOARD_URL\),\s*fetchJson\(LEWORD_PREEMPTION_URL\)/);
    expect(handler).toMatch(/key: 'briefs'[\s\S]*key: 'preemption'[\s\S]*key: 'niche'/);
  });
});
