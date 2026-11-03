import { describe, expect, it, vi } from 'vitest';
import { generateWithHomefeedReview } from '../content/homefeedTitleReview.js';
import { attachAgentHarmony, draftBodyOf, handleAgentHarmonyResponse, readAgentHarmony } from '../content/agentHarmony/harmonyRuntime.js';
import { DAILY_EDITORIAL_MARKER } from '../contentRequestSections.js';

// 2026-11-04 Release D: a harmony session article (packet present) is reviewed by ONE independent title/body check
// instead of the 4-call outer review (mining + tournament + candidates + critic) and the full regeneration.
const RAW_LINES = [
  '배우 김모씨(70)는 지난 3일 서울의 한 병원에 1억 원을 기부했다고 밝혔다.',
  '김씨는 "그냥 오래 전부터 하려던 일이었다"고 말했다.',
  '병원 관계자는 기부금이 소아 환자 치료비로 쓰인다고 전했다.',
  '기부는 병원 소아병동 환자 가족들의 치료비 부담을 덜기 위한 것이라고 관계자는 덧붙였다.',
  '이번 기부는 올해 병원에 전달된 개인 기부 가운데 가장 큰 금액으로 알려졌다.',
];
const RAW = RAW_LINES.join('\n');
const B1 = '70세 배우 김모씨가 서울의 한 병원에 1억 원을 기부했다.';
const B2 = '김씨는 "그냥 오래 전부터 하려던 일이었다"고 말했다.';
const B3 = '기부금은 소아 환자 치료비로 쓰인다고 병원 관계자는 전했다.';
const TITLE = '70세 배우가 1억 원을 병원에 건넨 이유';
const TITLE_2 = '소아 환자 치료비로 쓰이는 기부금의 행방';

const cand = (id: string, title: string, q: string, src: string, body: string) => ({
  id, title, readerQuestion: q, expectedBelief: '통상 예상', surprisingFact: '자료 속 실제 행동', clickReason: '지금 확인할 이유', sourceAnchors: [src], bodyAnchors: [body],
});
const harmonyFields = () => ({
  harmonyPacket: {
    version: 1,
    material: { centralEvent: '배우가 병원에 기부', readerSituation: '기부 소식을 본 독자', notInSource: ['동기'] },
    strategy: { readerQuestion: '왜 병원이었나', angle: '기부 행선지', exposureNote: '관측 자료 없음' },
    titles: {
      chosenId: 'c1', comparison: 'c1 이 가장 구체적',
      candidates: [
        cand('c1', TITLE, '왜 병원이었나', RAW_LINES[0], B1),
        cand('c2', '"오래 전부터 하려던 일"이라는 말의 뒷이야기', '무슨 일인가', RAW_LINES[1], B2),
        cand('c3', TITLE_2, '돈은 어디로', RAW_LINES[2], B3),
      ],
    },
    payoff: { promise: '병원에 기부한 이유', answerSentence: B2 },
  },
});
const generated = (title = TITLE, extra: Record<string, unknown> = {}) => {
  const base: Record<string, unknown> = {
    selectedTitle: title,
    introduction: `${B1}\n독자가 가장 궁금해할 점부터 짚어 본다.`,
    headings: [
      { title: '기부의 시작', content: `${B1}\n${B2}`, summary: 's', keywords: ['기부'], imagePrompt: 'p' },
      { title: '돈의 행방', content: `${B3}\n기부는 병원 소아병동 환자 가족들의 치료비 부담을 덜기 위한 것이라고 관계자는 덧붙였다.`, summary: 's', keywords: ['치료비'], imagePrompt: 'p' },
    ],
    conclusion: '이번 기부는 올해 병원에 전달된 개인 기부 가운데 가장 큰 금액으로 알려졌다.',
    ...extra,
  };
  base.bodyPlain = draftBodyOf(base);
  return base as { selectedTitle: string; bodyPlain: string } & Record<string, unknown>;
};
/** A harmony article exactly as contentGenerator hands it over: packet stripped, record attached (non-enumerable). */
const harmonyArticle = (title = TITLE, extra: Record<string, unknown> = {}) => {
  const parsed = { ...generated(title, extra), ...harmonyFields() };
  handleAgentHarmonyResponse(parsed, { rawText: RAW, systemPrompt: '', engine: 'agent-claude', model: 'm', mode: 'homefeed', runId: 'run-d', userDataDir: null, log: () => {} });
  return parsed as unknown as ReturnType<typeof generated>;
};
const titleError = (code: string, extra: Record<string, unknown> = {}) => Object.assign(new Error(`${code}: 검수 실패`), { code, ...extra });

function setup(overrides: Record<string, unknown> = {}) {
  const complete = vi.fn(async () => '응답');
  const review = (overrides.review as ReturnType<typeof vi.fn>) ?? vi.fn(async () => ({ title: '토너먼트가 고른 제목' }));
  const validate = (overrides.validate as ReturnType<typeof vi.fn>) ?? vi.fn(async () => ({ title: TITLE }));
  const audit = vi.fn(async (_record: Record<string, unknown>) => {});
  const log = vi.fn();
  const logs = () => log.mock.calls.map(c => String(c[0]));
  const article = (overrides.article as ReturnType<typeof generated>) ?? harmonyArticle();
  // Only the tournament-winner regeneration of the existing path honours a title override; a locked-title source does not.
  const generate = vi.fn(async (s: any) => (s.manualTitleOverride === '토너먼트가 고른 제목' ? { ...article, selectedTitle: s.manualTitleOverride } : article));
  const args = {
    contentMode: 'homefeed', source: { rawText: RAW }, generate, log, audit, review, validate,
    createCaller: async () => ({ complete, timeoutMs: 1000 }), ...overrides,
  };
  delete (args as Record<string, unknown>).article;
  return { args: args as any, complete, review, validate, audit, log, logs, generate, article };
}

describe('harmony branch of generateWithHomefeedReview', () => {
  it('packet present: one generation, one independent validation, no outer review, audit v2', async () => {
    const t = setup();
    const result = await generateWithHomefeedReview(t.args);
    expect(result.titleReview).toBe('reviewed');
    expect(result.article).toBe(t.article);
    expect(t.generate).toHaveBeenCalledTimes(1);
    expect(t.generate.mock.calls[0][0].customPrompt).toContain(DAILY_EDITORIAL_MARKER);
    expect(t.review).not.toHaveBeenCalled();
    expect(t.complete).not.toHaveBeenCalled();
    expect(t.validate).toHaveBeenCalledTimes(1);
    const input = (t.validate.mock.calls[0] as any[])[0];
    expect(input).toMatchObject({ title: TITLE, body: t.article.bodyPlain, sourceVerification: RAW });
    expect((t.validate.mock.calls[0] as any[])[1]).not.toHaveProperty('tournament');
    expect(t.audit).toHaveBeenCalledTimes(1);
    expect(t.audit.mock.calls[0][0]).toMatchObject({ version: 2, pipeline: 'agent-harmony-v1', originalTitle: TITLE, finalTitle: TITLE, regenerated: false, validation: { title: TITLE } });
    expect((t.audit.mock.calls[0][0] as any).verification).toMatchObject({ ok: true, chosenId: 'c1' });
    const lines = t.logs();
    expect(lines.some(l => /^\[AgentHarmony\] 최종 대조: /.test(l))).toBe(true);
    expect(lines).toContain('✅ 조화 세션 제목 · 본문 약속 독립 검수를 통과했습니다.');
    expect(lines.join(' ')).not.toMatch(/⚠️/);
    expect(readAgentHarmony(result.article)?.packet?.titles.chosenId).toBe('c1');
  });

  it('a title that is another verified packet candidate is checked with THAT candidate\'s anchors', async () => {
    const t = setup({ article: harmonyArticle(TITLE_2) });
    const result = await generateWithHomefeedReview(t.args);
    expect(result.titleReview).toBe('reviewed');
    expect((t.audit.mock.calls[0][0] as any).verification).toMatchObject({ ok: true, chosenId: 'c3' });
  });

  it('a soft validation failure keeps the article, warns and records the verdict as it came back', async () => {
    const t = setup({ validate: vi.fn(async () => { throw titleError('DAILY_TITLE_QUALITY', { reasons: ['본문이 확정액인지 답하지 않는다'] }); }) });
    const result = await generateWithHomefeedReview(t.args);
    expect(result.titleReview).toBe('review-warning');
    expect(result.article).toBe(t.article);
    expect(t.generate).toHaveBeenCalledTimes(1);
    expect(t.review).not.toHaveBeenCalled();
    expect(t.validate).toHaveBeenCalledTimes(1);
    expect((t.audit.mock.calls[0][0] as any)).toMatchObject({ version: 2, pipeline: 'agent-harmony-v1', validation: { failed: 'DAILY_TITLE_QUALITY' } });
    const warning = t.logs().find(l => l.startsWith('⚠️'))!;
    expect(warning).toContain('본문이 확정액인지 답하지 않는다');
    expect(t.logs().join(' ')).not.toMatch(/통과했습니다/);
  });

  it('a failed final cross-check (answer sentence gone from the final body) warns but still runs the single validation', async () => {
    const article = harmonyArticle();
    const record = readAgentHarmony(article)!;
    (article as { bodyPlain: string }).bodyPlain = `${B1}\n본문이 바뀌어 약속한 답 문장이 사라졌다.`;
    expect(record.packet).not.toBeNull();
    const t = setup({ article });
    const result = await generateWithHomefeedReview(t.args);
    expect(result.titleReview).toBe('review-warning');
    expect(t.validate).toHaveBeenCalledTimes(1);
    expect(t.review).not.toHaveBeenCalled();
    expect((t.audit.mock.calls[0][0] as any).verification).toMatchObject({ ok: false });
    expect((t.audit.mock.calls[0][0] as any).verification.problems.join(' ')).toMatch(/answer sentence/);
    expect(t.logs().find(l => l.startsWith('⚠️'))).toMatch(/조화 세션/);
    expect(t.logs().join(' ')).not.toMatch(/통과했습니다/);
  });

  it('cancellation and non-title errors still throw', async () => {
    await expect(generateWithHomefeedReview(setup({ validate: vi.fn(async () => { throw titleError('DAILY_TITLE_CANCELLED'); }) }).args)).rejects.toThrow('DAILY_TITLE_CANCELLED');
    await expect(generateWithHomefeedReview(setup({ validate: vi.fn(async () => { throw new Error('네트워크 끊김'); }) }).args)).rejects.toThrow('네트워크 끊김');
    const controller = new AbortController();
    const t = setup({ signal: controller.signal, validate: vi.fn(async () => { controller.abort(); return {}; }) });
    await expect(generateWithHomefeedReview(t.args)).rejects.toThrow('DAILY_CANCELLED');
    expect(t.audit).not.toHaveBeenCalled();
  });

  it('a locked title: mismatch throws DAILY_TITLE_LOCK_MISMATCH before any check, a match is validated once', async () => {
    const mismatch = setup({ source: { rawText: RAW, manualTitleOverride: '다른 제목입니다' } });
    await expect(generateWithHomefeedReview(mismatch.args)).rejects.toThrow('DAILY_TITLE_LOCK_MISMATCH');
    expect(mismatch.validate).not.toHaveBeenCalled();
    const match = setup({ source: { rawText: RAW, manualTitleOverride: TITLE } });
    const result = await generateWithHomefeedReview(match.args);
    expect(result.titleReview).toBe('reviewed');
    expect(match.validate).toHaveBeenCalledTimes(1);
    expect(match.review).not.toHaveBeenCalled();
  });
});

describe('without a packet the existing review path runs unchanged', () => {
  const plain = () => generated();

  it('flag OFF / API engine (no record): review + validate + audit v1, exactly as before', async () => {
    const t = setup({ article: plain() });
    const result = await generateWithHomefeedReview(t.args);
    expect(result.titleReview).toBe('reviewed');
    expect(t.review).toHaveBeenCalledTimes(1);
    expect((t.review.mock.calls[0] as any[])[1]).toMatchObject({ tournament: true });
    expect(t.generate).toHaveBeenCalledTimes(2); // the tournament picked a different title -> regeneration
    expect(t.validate).toHaveBeenCalledTimes(1);
    expect(t.audit.mock.calls[0][0]).toMatchObject({ version: 1, regenerated: true });
    expect(t.logs()).toContain('✅ 제목 후보 캐기 · 토너먼트 · 비평 · 본문 약속 검수를 통과했습니다.');
    expect(t.logs().join(' ')).not.toMatch(/AgentHarmony/);
  });

  it('an agent record WITHOUT a packet (ignored envelope / malformed packet) also takes the existing path', async () => {
    const article = plain();
    attachAgentHarmony(article, { active: true, packet: null, report: [], issues: ['no harmony fields in the response'], verification: null });
    const t = setup({ article, review: vi.fn(async () => ({ title: TITLE })) });
    const result = await generateWithHomefeedReview(t.args);
    expect(result.titleReview).toBe('reviewed');
    expect(t.review).toHaveBeenCalledTimes(1);
    expect(t.generate).toHaveBeenCalledTimes(1);
    expect(t.audit.mock.calls[0][0]).toMatchObject({ version: 1, regenerated: false });
  });

  it('the first article is reused by the existing path (no extra generation) and a lock mismatch still throws there', async () => {
    const t = setup({ article: plain(), source: { rawText: RAW, manualTitleOverride: '다른 제목입니다' } });
    await expect(generateWithHomefeedReview(t.args)).rejects.toThrow('DAILY_TITLE_LOCK_MISMATCH');
    expect(t.generate).toHaveBeenCalledTimes(1);
    expect(t.review).not.toHaveBeenCalled();
  });
});
