/**
 * [2026-11-16] Homefeed guide v5.2 alignment (stage 1).
 *
 * Locks: heading counts (4~6, fashion 3~4, issue type 4~6), the body/title rules taken from the guide,
 * the prompt size budget, and the sports routing fix (homefeed/sports.prompt used to attach to nothing).
 * Title length is intentionally NOT changed: the app measures width (hangul 1, space/digit/latin 0.5)
 * while the guide counts characters with spaces, so the numbers cannot be swapped one-to-one.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { buildSystemPrompt, buildSystemPromptFromHint, buildStructureVariationDirective, isSportsHint, resolveCategory } from '../promptLoader';
import { resolveHeadingCountRange } from '../content/headingCountPolicy';
import { resolveTitleLengthRange } from '../content/titleLengthPolicy';
import { validateHomefeedContent } from '../contentHomefeedValidator';

const read = (rel: string): string => readFileSync(new URL(`../prompts/${rel}`, import.meta.url), 'utf8');
const bytes = (text: string): number => Buffer.byteLength(text, 'utf8');

/** Byte sizes at HEAD before this change (git show HEAD:<file> | wc -c). */
const BASELINE_BYTES: Record<string, number> = {
  'homefeed/base.prompt': 15727,
  'homefeed/health.prompt': 3230,
  'homefeed/it.prompt': 4640,
  'homefeed/living.prompt': 5063,
  'homefeed/fashion.prompt': 4608,
  'homefeed/entertainment.prompt': 3273,
  'homefeed/sports.prompt': 3108,
};

describe('prompt size budget', () => {
  it('base.prompt grows by at most 2,500 bytes', () => {
    expect(bytes(read('homefeed/base.prompt')) - BASELINE_BYTES['homefeed/base.prompt']).toBeLessThanOrEqual(2500);
  });

  it.each(Object.keys(BASELINE_BYTES).filter((f) => f !== 'homefeed/base.prompt'))('%s grows by at most 1,200 bytes', (file) => {
    expect(bytes(read(file)) - BASELINE_BYTES[file]).toBeLessThanOrEqual(1200);
  });
});

describe('homefeed base.prompt carries the guide rules', () => {
  const base = read('homefeed/base.prompt');

  it('title rules: two-part build, first 10 characters, reveal the twist, banned words', () => {
    expect(base).toContain('[후킹 장치] + [키워드·구체 정보] 2단');
    expect(base).toContain('앞 10자 안에');
    expect(base).toMatch(/「알고 보니」[^\n]*제목 안에서 밝히고/);
    expect(base).toMatch(/비하·조롱, 외모 낙인[^\n]*투자 권유[^\n]*제목에 쓰지 않는다/);
  });

  it('heading count is 4~6 and the old 3~7 wording is gone', () => {
    expect(base).toContain('소제목은 4~6개를 기본으로 하고 10자 이내를 권장한다');
    expect(base).not.toMatch(/3~7개/);
  });

  it('paragraph rules: 3 sentences by default, 2~3 paragraphs per heading, lone-sentence paragraphs 2~3 times', () => {
    expect(base).toContain('3문장이 기본(2~4문장');
    expect(base).toContain('소제목 하나에 문단 2~3개');
    expect(base).toMatch(/1문장 단독 문단은[^\n]*글 전체 2~3회/);
    expect(base).not.toMatch(/한 문단이 세 문장을 넘어가면/);
  });

  it('sentence rules: no three short sentences in a row, connectives, 60/80 characters', () => {
    expect(base).toContain('짧은 단문 세 개를 잇달아');
    expect(base).toContain('연결어미');
    expect(base).toContain('60자 안팎이 기본이고 80자를 넘기지 않는다');
  });

  it('flow rules: reaction after two info paragraphs, crutch words, formulaic endings', () => {
    expect(base).toContain('정보 문단이 둘 이어지면 그 뒤에는 반응·해석·의견 문단을 둔다');
    expect(base).toContain('"진짜·정말·너무"는 합산 3회 이내, 같은 어미는 3연속');
    expect(base).toMatch(/"첫째, 둘째" 나열[^\n]*기사체 상투어[^\n]*기계식 결말/);
    expect(base).toContain('"댓글로 공유해주세요"');
    expect(base).toContain('알아보겠습니다/알아볼게요');
  });

  it('safety rules: risky wording is softened even when verified, experience figures need input', () => {
    expect(base).toMatch(/보장하거나 투자를 권하는 표현[^\n]*검증됐더라도/);
    expect(base).toMatch(/진단 이력·수익·구매가 같은 구체 수치/);
  });

  it('length is guidance only, never a gate', () => {
    expect(base).toMatch(/분량 안내: 본문은 공백 제외 1,200~1,500자 안팎이 읽기 좋은 길이다\. 이 숫자를 맞추려고 늘리거나 자르지 않는다/);
    expect(base).not.toMatch(/(최소|이상)\s*1,?200자/);
  });

  it('heading prompt follows the same numbers', () => {
    const headings = read('shared/headings-homefeed.prompt');
    expect(headings).toContain('4~6개를 기본으로');
    expect(headings).toContain('10자 이내');
    expect(headings).not.toContain('정해진 숫자는 없다');
  });
});

describe('category prompts carry their guide rules', () => {
  it.each([
    ['homefeed/health.prompt', /병원 권유|진료가 우선/, /경각심을 주는 문장은 글 전체에서 1회만/],
    ['homefeed/it.prompt', /예상도/, /괄호 병기는 하지 않는다/],
    ['homefeed/living.prompt', /상세페이지체/, /해결 팁과 한 묶음/],
    ['homefeed/fashion.prompt', /소제목을 3~4개/, /외모·체형이 아니다/],
    ['homefeed/entertainment.prompt', /편집된 결과물/, /공식 입장이 입력에 있을 때만/],
    ['homefeed/sports.prompt', /공식 기록의 값 그대로/, /먹튀/],
  ])('%s', (file, a, b) => {
    const text = read(file as string);
    expect(text).toMatch(a as RegExp);
    expect(text).toMatch(b as RegExp);
    expect(text).not.toMatch(/\r/);
  });
});

describe('numbers: heading counts follow one policy', () => {
  it('homefeed 4~6, issue type 4~6, fashion 3~4; other modes unchanged', () => {
    expect(resolveHeadingCountRange('homefeed')).toMatchObject({ min: 4, max: 6 });
    expect(resolveHeadingCountRange('homefeed', { issueStory: true })).toMatchObject({ min: 4, max: 6 });
    expect(resolveHeadingCountRange('homefeed', { fashion: true })).toMatchObject({ min: 3, max: 4 });
    expect(resolveHeadingCountRange('seo')).toMatchObject({ min: 3, max: 8 });
    expect(resolveHeadingCountRange('mate')).toMatchObject({ min: 5, max: 7 });
  });

  it('title length follows the v5.2 guide (25~40) and stays on the width scale', () => {
    expect(resolveTitleLengthRange('homefeed')).toEqual({ min: 25, max: 40 });
  });

  const headings = (n: number) => Array.from({ length: n }, (_, i) => ({ title: `소제목${i + 1}`, content: '본문입니다. 내용입니다.' }));
  const run = (n: number, categoryHint: string): string[] => {
    const logs: string[] = [];
    const spy = (...args: unknown[]) => { logs.push(args.join(' ')); };
    const origWarn = console.warn; const origLog = console.log;
    console.warn = spy as never; console.log = (() => undefined) as never;
    try {
      const content = { selectedTitle: '"이럴 줄 몰랐다" 알고 보니 달랐던 이유', headings: headings(n), introduction: '도입입니다.', conclusion: '마무리입니다.' } as never;
      validateHomefeedContent(content, { contentMode: 'homefeed', categoryHint } as never);
    } finally { console.warn = origWarn; console.log = origLog; }
    return logs.filter((l) => l.includes('소제목'));
  };

  it('validator: practical category warns outside 4~6', () => {
    expect(run(3, '건강')).toHaveLength(1);
    expect(run(4, '건강')).toHaveLength(0);
    expect(run(6, '건강')).toHaveLength(0);
    expect(run(7, '건강')).toHaveLength(1);
  });

  it('validator: issue type needs 4~6 now (0~3 no longer passes)', () => {
    expect(run(2, '연예')).toHaveLength(1);
    expect(run(5, '연예')).toHaveLength(0);
  });

  it('validator: fashion accepts 3~4 and warns at 5', () => {
    expect(run(3, '패션')).toHaveLength(0);
    expect(run(4, '패션')).toHaveLength(0);
    expect(run(5, '패션')).toHaveLength(1);
  });
});

describe('structure directive stays inside the policy range', () => {
  const quiet = (fn: () => string): string => {
    const orig = console.log; console.log = (() => undefined) as never;
    try { return fn(); } finally { console.log = orig; }
  };

  it('never asks for 7 headings and never leaves 4~6 for ordinary categories', () => {
    for (let i = 0; i < 40; i += 1) {
      const text = quiet(() => buildStructureVariationDirective(2500, '건강'));
      const n = Number(/소제목 개수: (\d+)개/.exec(text)?.[1]);
      expect(n).toBeGreaterThanOrEqual(4);
      expect(n).toBeLessThanOrEqual(6);
      expect(text).toContain('4~6개 범위 안에서 조정');
      expect(text).not.toContain('(±1)');
      expect(text).not.toContain('소제목 7개');
    }
  });

  it('fashion stays at 3~4 and lists no more flow lines than headings', () => {
    for (let i = 0; i < 40; i += 1) {
      const text = quiet(() => buildStructureVariationDirective(2500, '패션'));
      const n = Number(/소제목 개수: (\d+)개/.exec(text)?.[1]);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(4);
      expect(text).not.toMatch(new RegExp(`소제목${n + 1}:`));
    }
  });
});

describe('sports routing', () => {
  it('homefeed + 스포츠 now receives homefeed/sports.prompt on top of the issue-type files', () => {
    const composed = buildSystemPromptFromHint('homefeed', '스포츠');
    expect(composed).toContain('[HOMEFEED CATEGORY: SPORTS]');
    expect(composed).toContain('[HOMEFEED CATEGORY: ENTERTAINMENT]');
    expect(composed).toContain('[ISSUE-STORY]');
    expect(composed.indexOf('[HOMEFEED CATEGORY: SPORTS]')).toBeLessThan(composed.lastIndexOf('[ISSUE-STORY]'));
  });

  it('the category mapping and issue-story judgement are unchanged', () => {
    expect(resolveCategory('스포츠')).toBe('entertainment');
    expect(isSportsHint('스포츠')).toBe(true);
    expect(isSportsHint('연예')).toBe(false);
    expect(isSportsHint(undefined)).toBe(false);
  });

  it('other homefeed categories and other modes do not get the sports file', () => {
    expect(buildSystemPromptFromHint('homefeed', '연예')).not.toContain('[HOMEFEED CATEGORY: SPORTS]');
    expect(buildSystemPromptFromHint('homefeed', '건강')).not.toContain('[HOMEFEED CATEGORY: SPORTS]');
    expect(buildSystemPromptFromHint('seo', '스포츠')).not.toContain('[HOMEFEED CATEGORY: SPORTS]');
    expect(buildSystemPrompt('homefeed', 'entertainment')).not.toContain('[HOMEFEED CATEGORY: SPORTS]');
  });
});
