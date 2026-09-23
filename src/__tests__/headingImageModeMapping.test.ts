// SPEC-NAVER-IMAGE-2026 FINAL IMAGE FIX §1 — odd/even heading images, 1-based, end to end.
// Chain under test: items → heading number → odd/even filter → (generated images keep their heading)
// → normalizePublishImageSequence (the single ordering every publisher consumes) → heading slot.
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { keepSectionImage, selectItemsForHeadingImageMode } from '../image/headingImageSelection';
import { normalizePublishImageSequence } from '../image/publishImageSequence';

const read = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf-8');
const H = (n: number) => Array.from({ length: n }, (_, i) => `소제목 ${i + 1} 내용 제목`);

/** What main returns: one image per kept item, carrying that item's heading. Drop some to simulate failures. */
function generate(items: Array<{ heading?: string; isThumbnail?: boolean }>, failHeadings: string[] = []) {
  return items
    .filter((item) => !failHeadings.includes(String(item.heading)))
    .map((item) => ({ heading: item.heading, filePath: `C:/img/${item.heading}.png`, isThumbnail: item.isThumbnail === true }));
}

/** 1-based heading numbers that received a body image after publish ordering. */
function publishedHeadingNumbers(headings: string[], images: Array<Record<string, unknown>>): number[] {
  const ordered = normalizePublishImageSequence({ headings: headings.map((title) => ({ title })) }, images as any);
  return ordered.filter((img: any) => !img.isThumbnail).map((img: any) => (img.headingIndex as number) + 1);
}

function run(headingCount: number, mode: string, options: { withPlan?: boolean; withSectionIndex?: boolean; fail?: number[] } = {}) {
  const headings = H(headingCount);
  const items = [
    { heading: '🖼️ 썸네일', isThumbnail: true },
    ...headings.map((heading, i) => ({ heading, ...(options.withSectionIndex ? { sectionIndex: i } : {}) })),
  ];
  const selection = selectItemsForHeadingImageMode(items, mode, options.withPlan ? { sectionPlanHeadings: headings } : {});
  const failHeadings = (options.fail || []).map((n) => headings[n - 1]);
  const images = generate(selection.kept, failHeadings);
  return {
    thumbnailKept: selection.kept.some((item) => item.isThumbnail === true),
    published: publishedHeadingNumbers(headings, images),
  };
}

describe('A. section mapping (owner tests 1–7)', () => {
  for (const context of [{ withPlan: true }, { withSectionIndex: true }, {}] as const) {
    const label = 'withPlan' in context ? 'article heading list' : 'withSectionIndex' in context ? 'sectionIndex' : 'batch order only';
    describe(label, () => {
      it('1. H2×5 + ALL → all five, each under its own heading', () => {
        expect(run(5, 'all', context).published).toEqual([1, 2, 3, 4, 5]);
      });
      it('2. H2×5 + ODD → 1, 3, 5', () => {
        expect(run(5, 'odd-only', context).published).toEqual([1, 3, 5]);
      });
      it('3. H2×5 + EVEN → 2, 4', () => {
        expect(run(5, 'even-only', context).published).toEqual([2, 4]);
      });
      it('4. H2×4 + ODD → 1, 3', () => {
        expect(run(4, 'odd-only', context).published).toEqual([1, 3]);
      });
      it('5. H2×4 + EVEN → 2, 4', () => {
        expect(run(4, 'even-only', context).published).toEqual([2, 4]);
      });
      it('6. NONE → no section image; the thumbnail is not removed by the section filter', () => {
        const result = run(5, 'none', context);
        expect(result.published).toEqual([]);
        expect(result.thumbnailKept).toBe(true);
      });
      it('odd/even never remove the thumbnail', () => {
        expect(run(5, 'odd-only', context).thumbnailKept).toBe(true);
        expect(run(5, 'even-only', context).thumbnailKept).toBe(true);
      });
    });
  }

  it('7. a failed image keeps the others under their own headings (no shifting)', () => {
    expect(run(5, 'odd-only', { withPlan: true, fail: [3] }).published).toEqual([1, 5]);
    expect(run(5, 'all', { withPlan: true, fail: [2, 4] }).published).toEqual([1, 3, 5]);
  });
});

describe('one image per call (semi-auto, image tab, regenerate)', () => {
  const headings = H(5);
  const one = (n: number, mode: string, ctx = { sectionPlanHeadings: headings }) =>
    selectItemsForHeadingImageMode([{ heading: headings[n - 1] }], mode, ctx).kept.length;

  it('with the article heading list: odd keeps 1, 3, 5 and drops 2, 4 — one by one', () => {
    expect([1, 2, 3, 4, 5].map((n) => one(n, 'odd-only'))).toEqual([1, 0, 1, 0, 1]);
    expect([1, 2, 3, 4, 5].map((n) => one(n, 'even-only'))).toEqual([0, 1, 0, 1, 0]);
  });

  it('without any context the heading number is unknown → kept (never "every image disappears")', () => {
    expect(one(2, 'odd-only', {} as any)).toBe(1);
    expect(one(1, 'even-only', {} as any)).toBe(1);
  });

  it('a real heading that contains 대표/서론 is numbered as a section when the article knows it', () => {
    const plan = ['대표 메뉴 가격', '영업시간', '주차'];
    const kept = selectItemsForHeadingImageMode(plan.map((heading) => ({ heading })), 'even-only', { sectionPlanHeadings: plan }).kept;
    expect(kept.map((k) => k.heading)).toEqual(['영업시간']);
  });

  it('numbered headings ("2. 영업시간") match the article list', () => {
    const plan = ['대표 메뉴', '영업시간', '주차'];
    expect(selectItemsForHeadingImageMode([{ heading: '2. 영업시간' }], 'even-only', { sectionPlanHeadings: plan }).kept).toHaveLength(1);
  });
});

describe('BEFORE / AFTER (the old main.ts rule)', () => {
  // main.ts used the position inside the request: originalIndex % 2 === 1 for "odd".
  const oldRule = (mode: string, position: number) => (mode === 'odd-only' ? position % 2 === 1 : position % 2 === 0);

  it('a batch of all headings: the old rule kept 2, 4 for "odd"; the new rule keeps 1, 3, 5', () => {
    const before = [0, 1, 2, 3, 4].filter((position) => oldRule('odd-only', position)).map((p) => p + 1);
    expect(before).toEqual([2, 4]);
    expect([1, 2, 3, 4, 5].filter((n) => keepSectionImage('odd-only', n))).toEqual([1, 3, 5]);
  });

  it('one item per call: the old rule dropped every heading in odd mode (position 0)', () => {
    expect([1, 2, 3, 4, 5].map(() => oldRule('odd-only', 0))).toEqual([false, false, false, false, false]);
  });
});

describe('wiring (source guards)', () => {
  const main = read('main.ts');
  const wrapper = read('renderer/modules/costAndAutoGen.ts');
  const fullAuto = read('renderer/modules/fullAutoFlow.ts');
  const multi = read('renderer/modules/multiAccountManager.ts');
  const imageTab = read('renderer/modules/headingImageGen.ts');

  it('main filters with the shared rule, returns success when a mode leaves nothing, and reports the owed count', () => {
    expect(main).toMatch(/selectItemsForHeadingImageMode\(options\.items, headingImageMode, \{\s*sectionPlanHeadings: \(options as any\)\.sectionPlanHeadings,/);
    expect(main).not.toMatch(/shouldInclude = origIdx % 2 === 1/);
    expect(main).toMatch(/expectedCount: 0,\s*filteredByMode: true,/);
    expect(main).toMatch(/return \{ success: true, images, expectedCount: requiredGeneratedImageCount, filteredByMode \};/);
  });

  it('main-side multi-account applies odd/even too (it bypasses the IPC filter)', () => {
    expect(main).toMatch(/const headings = selectItemsForHeadingImageMode\(\s*\(structuredContent\?\.headings \|\| \[\]\)\.map/);
  });

  it('the renderer compares with the count main owes, not the pre-filter count', () => {
    expect(wrapper).toMatch(/const expected = Number\(result\?\.expectedCount\);/);
  });

  it('full auto and semi-auto send the heading place and treat "no image by setting" as a skip', () => {
    expect(fullAuto).toMatch(/sectionIndex: slot\.originalIndex,/);
    expect(fullAuto).toMatch(/\.\.\.\(sectionIndex >= 0 \? \{ sectionIndex \} : \{\}\),/);
    expect(fullAuto.match(/imageResult\.filteredByMode === true/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('continuous / multi-account counts section numbers from 1 (not originalIndex % 2)', () => {
    expect(multi).toMatch(/sectionNumber \+= 1;/);
    expect(multi).not.toMatch(/originalIndex % 2 === 1 : originalIndex % 2 === 0/);
  });

  it('the image tab logs a heading skipped by the setting as a skip, not a failure', () => {
    expect(imageTab).toMatch(/소제목 이미지 설정\\\(\.\+\\\)에 따라/);
  });
});
