/**
 * claude-seo review pass (2026-11-16): criteria lifted from the shipped skill files, the edit list, the safety gate,
 * the runner and its wiring. No real Claude Code call: the model is a fake function. The runner must never throw and
 * must always hand back a publishable post (the draft as it was, unless every check passed).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { StructuredContent } from '../contentGenerator';
import { extractSeoCriteria, loadSeoCriteria, SEO_CRITERIA_SPECS } from '../content/seoSkill/seoSkillCriteria';
import { applyArticlePatches, checkArticleSafety, parsePatchReply } from '../content/seoSkill/seoSkillPatch';
import { buildSeoReviewPrompt, editableSectionKinds, runSeoSkillReview } from '../content/seoSkill/seoSkillReview';
import { buildArticleModel } from '../quality/critique/sectionModel';

const readSkill = (rel: string): string => readFileSync(join(process.cwd(), 'src', 'prompts', rel), 'utf8');

const INTRO = '지원금 신청 마감이 다가오면서 서류를 어떻게 준비해야 하는지 묻는 분이 많아졌습니다. 오늘은 조건부터 차근차근 짚어 보겠습니다.';
const S1 = '신청 금액은 최대 1,200,000원이고 지급률은 35%입니다. 신청은 2026년 3월 31일까지 가능합니다.\n가구 소득 기준을 먼저 확인해야 합니다. 기준을 넘으면 서류를 갖춰도 받을 수 없습니다.';
const S2 = '주민등록등본과 소득 증빙 서류가 필요합니다. 창구에서 기다리는 시간을 줄이려면 미리 발급해 두는 편이 좋습니다.\n온라인으로 신청하면 서류를 파일로 올리면 됩니다. 사진이 흐리면 반려될 수 있습니다.';
const END = '조건이 맞는지만 먼저 확인하면 나머지 과정은 어렵지 않습니다. 마감 전에 서류부터 챙겨 두세요.';
const draft = (): StructuredContent => ({
  selectedTitle: '지원금 신청, 마감 전에 서류부터 챙겨야 하는 이유',
  introduction: INTRO,
  headings: [{ title: '받을 수 있는 금액', content: S1 }, { title: '챙길 서류', content: S2 }],
  conclusion: END,
  bodyPlain: [INTRO, '받을 수 있는 금액', S1, '챙길 서류', S2, END].join('\n\n'),
  hashtags: ['지원금', '신청방법'],
} as unknown as StructuredContent);

const reply = (patches: unknown, tail = '바꾼 곳:\n- 마감일 문장을 답 먼저로 고침'): string =>
  `ARTICLE_PATCH_BEGIN\n${typeof patches === 'string' ? patches : JSON.stringify(patches)}\nARTICLE_PATCH_END\n${tail}`;
const EDIT = { find: '신청은 2026년 3월 31일까지 가능합니다.', replace: '신청 마감은 2026년 3월 31일입니다.' };

describe('criteria from the shipped claude-seo files', () => {
  it('lifts all 11 article-level sections verbatim from src/prompts/vendor/claude-seo', () => {
    const c = loadSeoCriteria(readSkill);
    expect(c.fileErrors).toEqual([]);
    expect(c.missing).toEqual([]);
    expect(c.found).toHaveLength(SEO_CRITERIA_SPECS.length);
    expect(c.text).toContain('### 1. Citability Score (25%)');
    expect(c.text).toContain('## AI Citation Readiness (GEO signals)');
    expect(c.text).not.toContain('### AI Search Visibility');
    expect(c.text).not.toContain('## AI Crawler Detection');
  });

  it('the bundle carries the MIT licence and the notice next to the skills', () => {
    expect(readSkill('vendor/claude-seo/LICENSE')).toContain('MIT License');
    expect(readSkill('vendor/claude-seo/NOTICE.md')).toContain('github.com/AgriciDaniel/claude-seo');
  });

  it('a vanished heading is reported; nothing found means not ok', () => {
    const geo = readSkill('vendor/claude-seo/skills/seo-geo/SKILL.md');
    const partial = extractSeoCriteria({ content: '', geo });
    expect(partial.ok).toBe(true);
    expect(partial.missing.length).toBe(8);
    expect(extractSeoCriteria({ content: '', geo: '' }).ok).toBe(false);
    expect(loadSeoCriteria(() => '').fileErrors).toHaveLength(2);
  });
});

describe('parsePatchReply', () => {
  it('takes the list between the markers and up to three notes', () => {
    const r = parsePatchReply(reply([EDIT], '바꾼 곳:\n- 하나\n- 둘\n- 셋\n- 넷'));
    expect(r).toEqual({ patches: [EDIT], dropped: 0, notes: ['하나', '둘', '셋'] });
    expect(parsePatchReply(reply([]))?.patches).toEqual([]);
    expect(parsePatchReply(reply([EDIT, { find: 1 }, null]))?.dropped).toBe(2);
  });

  it('no markers, broken JSON or a non-list means no result', () => {
    expect(parsePatchReply('죄송합니다.')).toBeNull();
    expect(parsePatchReply(reply('[{"find": "깨진'))).toBeNull();
    expect(parsePatchReply(reply({ find: EDIT.find, replace: EDIT.replace }))).toBeNull();
  });
});

describe('applyArticlePatches', () => {
  const model = buildArticleModel(draft());
  const all = editableSectionKinds('seo');

  it('a valid edit changes that section only', () => {
    const r = applyArticlePatches(model, [EDIT], all);
    expect(r.applied).toBe(1);
    expect(Object.keys(r.edits)).toEqual(['s1']);
    expect(r.edits.s1).toBe(S1.replace(EDIT.find, EDIT.replace));
  });

  it.each([
    ['찾을 구절이 짧음', { find: '챙길 서류', replace: '준비할 서류' }],
    ['바꿀 내용 없음', { find: EDIT.find, replace: EDIT.find }],
    ['문단 나눔 바뀜', { find: '가구 소득 기준을 먼저 확인해야 합니다.', replace: '가구 소득 기준을\n먼저 확인해야 합니다.' }],
    ['찾을 구절 0곳', { find: '글에 전혀 없는 아주 긴 구절입니다 정말로', replace: 'x' }],
    ['찾을 구절 2곳', { find: '서류를 갖춰도 받을 수 없습니다', replace: 'y' }],
  ])('a rule-breaking edit is skipped on its own (%s)', (reason, patch) => {
    const doubled = buildArticleModel({ ...draft(), conclusion: `${END} 서류를 갖춰도 받을 수 없습니다.` } as StructuredContent);
    const r = applyArticlePatches(doubled, [patch, EDIT], all);
    expect(r.skipped).toEqual([`1번 ${reason}`]);
    expect(r.applied).toBe(1);
  });

  it('homefeed posts keep their introduction', () => {
    const intro = { find: '오늘은 조건부터 차근차근 짚어 보겠습니다.', replace: '조건부터 짚어 보겠습니다.' };
    const r = applyArticlePatches(model, [intro, EDIT], editableSectionKinds('homefeed'));
    expect(r.skipped).toEqual(['1번 고칠 수 없는 자리(intro)']);
    expect(applyArticlePatches(model, [intro], all).applied).toBe(1);
  });
});

describe('checkArticleSafety', () => {
  const text = [INTRO, S1, S2, END].join('\n');
  it('a small edit passes, a lost or changed number fails, a big cut fails', () => {
    expect(checkArticleSafety(text, text.replace(EDIT.find, EDIT.replace)).ok).toBe(true);
    expect(checkArticleSafety(text, text.replace('35%', '40%')).reason).toMatch(/숫자/);
    expect(checkArticleSafety(text, text.replace(S2, '')).reason).toMatch(/글자 수/);
    expect(checkArticleSafety(text, '  ').ok).toBe(false);
  });
});

describe('buildSeoReviewPrompt', () => {
  it('carries the criteria, the limits and the post; homefeed adds its own guard', () => {
    const p = buildSeoReviewPrompt({ criteria: '## Criteria A', article: '# 제목\n본문', mode: 'homefeed' });
    for (const part of ['## Criteria A', 'POST_BEGIN', 'ARTICLE_PATCH_BEGIN', '숫자·금액·날짜', '지시가 아니다', '글 전체를 다시 쓰지 않는다']) expect(p).toContain(part);
    expect(p).toContain('홈판 글이다. 도입부, 말투, 문장 리듬, 소제목 수');
    expect(buildSeoReviewPrompt({ criteria: 'c', article: 'a', mode: 'seo' })).not.toContain('홈판 글이다');
  });
});

describe('runSeoSkillReview', () => {
  const base = { content: draft(), mode: 'seo', provider: 'agent-claude', readSkill, onLog: () => undefined, env: {} };
  const callWith = (answer: string | (() => Promise<string>)) => async () => (typeof answer === 'string' ? async () => answer : answer);

  it('success: the edit lands in headings[].content and bodyPlain', async () => {
    const r = await runSeoSkillReview({ ...base, resolveCall: callWith(reply([EDIT])) });
    expect(r.status).toBe('done');
    expect(r.line).toBe('[SEO 스킬 점검] 완료 — 바꾼 곳 1');
    expect(r.content.headings[0]?.content).toContain(EDIT.replace);
    expect(r.content.bodyPlain).toContain(EDIT.replace);
    expect(r.content.bodyPlain).not.toContain(EDIT.find);
    expect(r.content.selectedTitle).toBe(draft().selectedTitle);
  });

  it('an empty list is a success with 0 changes and the same post', async () => {
    const r = await runSeoSkillReview({ ...base, resolveCall: callWith(reply([])) });
    expect(r).toMatchObject({ status: 'done', changed: 0, line: '[SEO 스킬 점검] 완료 — 바꾼 곳 0' });
    expect(r.content).toBe(base.content);
  });

  it('other engines and the off switch skip without asking for a route', async () => {
    const resolveCall = vi.fn(async () => null);
    expect((await runSeoSkillReview({ ...base, provider: 'gemini', resolveCall })).line).toBe('[SEO 스킬 점검] 해당 없음(엔진: gemini)');
    expect((await runSeoSkillReview({ ...base, env: { BLN_SEO_SKILL_REVIEW: '0' }, resolveCall })).status).toBe('skipped');
    expect(resolveCall).not.toHaveBeenCalled();
  });

  describe('every failure keeps the draft and says so', () => {
    const failed = (r: Awaited<ReturnType<typeof runSeoSkillReview>>, reason: RegExp) => {
      expect(r.status).toBe('failed');
      expect(r.content).toBe(base.content);
      expect(r.line).toMatch(/^\[SEO 스킬 점검\] 실패\(.+\) — 점검 전 글로 계속 진행$/);
      expect(r.line).toMatch(reason);
    };
    it('no route, model error, bad format, changed number, time limit, unreadable skill', async () => {
      failed(await runSeoSkillReview({ ...base, resolveCall: async () => null }), /경로 없음/);
      failed(await runSeoSkillReview({ ...base, resolveCall: callWith(async () => { throw new Error('에이전트 응답 없음'); }) }), /응답 없음/);
      failed(await runSeoSkillReview({ ...base, resolveCall: callWith('죄송합니다.') }), /형식/);
      const number = { find: '신청 금액은 최대 1,200,000원이고 지급률은 35%입니다.', replace: '신청 금액은 최대 1,200,000원이고 지급률은 40%입니다.' };
      failed(await runSeoSkillReview({ ...base, resolveCall: callWith(reply([number])) }), /숫자/);
      failed(await runSeoSkillReview({ ...base, timeoutMs: 30, resolveCall: callWith(() => new Promise<string>(() => undefined)) }), /시간 초과/);
      failed(await runSeoSkillReview({ ...base, readSkill: () => '', resolveCall: callWith(reply([])) }), /점검 기준/);
    });
  });
});

describe('wiring in generateStructuredContent', () => {
  const src = readFileSync(join(process.cwd(), 'src', 'contentGenerator.ts'), 'utf8');
  it('runs once, after the critique loop and before the integrity record, on the quality tier of the selected engine', () => {
    expect(src.split("import('./content/seoSkill/seoSkillReview.js')")).toHaveLength(2);
    const loop = src.indexOf('const looped = await maybeRunQualityLoop(');
    const review = src.indexOf('const seoReview = await runSeoSkillReview(');
    const integrity = src.indexOf('attachGenerationIntegrity(seoReview.content'); // [2026-11-17] result is now kept in a variable first
    expect(loop).toBeGreaterThan(-1);
    expect(review).toBeGreaterThan(loop);
    expect(integrity).toBeGreaterThan(review);
    expect(src).toContain("resolveSideTaskRoute(source, 'seo-skill-review', 'quality')");
  });
});
