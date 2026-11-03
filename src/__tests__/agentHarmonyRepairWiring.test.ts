import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { loadConfigMock, generateWithAgentMock, releaseLimiterMock, acquireLimiterMock } = vi.hoisted(() => ({ loadConfigMock: vi.fn(), generateWithAgentMock: vi.fn(), releaseLimiterMock: vi.fn(), acquireLimiterMock: vi.fn() }));

vi.mock('../configManager.js', async (importOriginal) => ({ ...(await importOriginal<typeof import('../configManager.js')>()), loadConfig: loadConfigMock }));
vi.mock('../runtime/adaptiveLimiter', () => ({ globalLimiter: { acquire: acquireLimiterMock } }));
vi.mock('../agentCli/index.js', () => ({ generateWithAgent: generateWithAgentMock }));

import { generateStructuredContent, type ContentSource } from '../contentGenerator';

/**
 * Release C2 (2026-11-04): with the harmony session active the outer LLM repairs that re-read the same material
 * are warn-only; a fact-type regeneration (Faithfulness overlap) still happens once. Flag OFF must not change.
 * The agent CLI is mocked; every call is classified by its prompt so the call sequence can be compared.
 */
const RAW_LINES = [
  '배우 김모씨(70)는 지난 3일 서울의 한 병원에 1억 원을 기부했다고 밝혔다.',
  '김씨는 "그냥 오래 전부터 하려던 일이었다"고 말했다.',
  '병원 관계자는 기부금이 소아 환자 치료비로 쓰인다고 전했다.',
  '기부는 병원 소아병동 환자 가족들의 치료비 부담을 덜기 위한 것이라고 관계자는 덧붙였다.',
  '이번 기부는 올해 병원에 전달된 개인 기부 가운데 가장 큰 금액으로 알려졌다.',
];
const RAW = RAW_LINES.join('\n');
const B1 = '70세 배우 김모씨가 서울의 한 병원에 1억 원을 기부했다.';
const B2Quoted = '김씨는 "그냥 오래 전부터 하려던 일이었다"고 말했다.';
const B2Plain = B2Quoted.replace(/"/g, '');
const B3 = '기부금은 소아 환자 치료비로 쓰인다고 병원 관계자는 전했다.';
const B4 = '기부는 병원 소아병동 환자 가족들의 치료비 부담을 덜기 위한 것이라고 관계자는 덧붙였다.';
const TITLE = '70세 배우가 1억 원을 병원에 건넨 이유';

type Json = Record<string, unknown>;
const article = (extra: Json = {}, quote = true): Json => ({
  selectedTitle: TITLE,
  titleCandidates: [{ text: TITLE, score: 80 }, { text: '다른 후보 제목입니다 정말로', score: 70 }, { text: '세 번째 후보 제목입니다 정말로', score: 60 }],
  introduction: `${B1}\n독자가 가장 궁금해할 점부터 짚어 본다.`,
  headings: [
    { title: '기부의 시작', content: `${B1}\n${quote ? B2Quoted : B2Plain}`, summary: 's', keywords: ['기부'], imagePrompt: 'p' },
    { title: '돈의 행방', content: `${B3}\n${B4}`, summary: 's', keywords: ['치료비'], imagePrompt: 'p' },
  ],
  conclusion: '이번 기부는 올해 병원에 전달된 개인 기부 가운데 가장 큰 금액으로 알려졌다.',
  hashtags: ['#기부'], ...extra,
});
const cand = (id: string, title: string, anchor: string, body: string) => ({ id, title, readerQuestion: '왜 병원이었나', expectedBelief: '통상 예상', surprisingFact: '자료 속 실제 행동', clickReason: '지금 확인할 이유', sourceAnchors: [anchor], bodyAnchors: [body] });
/** A harmony response the extractor accepts (3 candidates). Without these fields the session did not happen. */
const harmonyFields = (): Json => ({
  harmonyPacket: {
    version: 1,
    material: { centralEvent: '배우가 병원에 기부', readerSituation: '기부 소식을 본 독자', notInSource: ['동기'] },
    strategy: { readerQuestion: '왜 병원이었나', angle: '기부 행선지', exposureNote: '관측 자료 없음' },
    titles: { chosenId: 'c1', comparison: 'c1 이 가장 구체적', candidates: [cand('c1', TITLE, RAW_LINES[0], B1), cand('c2', '"오래 전부터 하려던 일"이라는 말의 뒷이야기', RAW_LINES[1], B2Quoted), cand('c3', '소아 환자 치료비로 쓰이는 기부금의 행방', RAW_LINES[2], B3)] },
    payoff: { promise: '병원에 기부한 이유', answerSentence: B2Quoted },
  },
  complementReport: { version: 1, items: [] },
});
const BLUEPRINT = {
  angle: '왜 병원에 기부했나', readerSituation: '기부 소식을 본 독자가 이유를 궁금해한다', quotes: [{ text: '그냥 오래 전부터 하려던 일이었다', speaker: '김씨' }],
  facts: [{ claim: '기부액은 1억 원', snippet: '서울의 한 병원에 1억 원을 기부했다고 밝혔다' }], skeleton: ['기부의 시작', '돈의 행방', '남은 질문'], offTopic: [],
};

type Kind = 'blueprint' | 'distinctness-judge' | 'quote-patch' | 'intro-patch' | 'body';
const classify = (prompt: string): Kind => {
  if (prompt.startsWith('아래 [자료]를 읽고')) return 'blueprint';
  if (prompt.includes('"redundantSections"')) return 'distinctness-judge';
  if (prompt.includes('아래 본문에는 당사자 발언 인용이 없다')) return 'quote-patch';
  if (/\[TASK\]\s*홈판 모드 도입부만/.test(prompt)) return 'intro-patch';
  return 'body';
};

const dirs: string[] = [];
afterAll(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });

interface Scenario {
  readonly harmony: boolean | undefined; readonly body: Json | ((bodyCall: number) => Json); readonly source?: Json; readonly env?: Record<string, string>; readonly blueprint?: Json;
  /** Extra generate options (the semantic distinctness judge only runs for submissionMode 'legacy-retry'). */
  readonly options?: Json;
}

async function run(scenario: Scenario) {
  const runsDir = mkdtempSync(path.join(tmpdir(), 'bln-harmony-repair-'));
  dirs.push(runsDir);
  const previous = Object.fromEntries(Object.keys({ GENERATION_RUNS_DIR: 1, ...scenario.env }).map(key => [key, process.env[key]]));
  process.env.GENERATION_RUNS_DIR = runsDir;
  for (const [key, value] of Object.entries(scenario.env ?? {})) process.env[key] = value;
  const kinds: Kind[] = [];
  generateWithAgentMock.mockReset().mockImplementation(async (options: { prompt?: string }) => {
    const prompt = String(options?.prompt ?? '');
    const kind = classify(prompt);
    kinds.push(kind);
    const bodyCalls = kinds.filter(k => k === 'body').length;
    const body = typeof scenario.body === 'function' ? scenario.body(Math.max(0, bodyCalls - 1)) : scenario.body;
    const replies: Partial<Record<Kind, unknown>> = {
      blueprint: scenario.blueprint ?? body, 'distinctness-judge': { distinct: false, redundantSections: [2], reason: '섹션 중복' }, 'quote-patch': { insertions: [] },
    };
    return { text: JSON.stringify(replies[kind] ?? body), durationMs: 5 };
  });
  const logs: string[] = [];
  const spies = (['log', 'warn', 'error'] as const).map(level => vi.spyOn(console, level).mockImplementation((...args: unknown[]) => { logs.push(args.map(String).join(' ')); }));
  let content: any;
  let error: unknown;
  try {
    const source = {
      sourceType: 'custom_text', rawText: RAW, contentMode: 'homefeed', generator: 'agent-claude',
      ...(scenario.harmony === undefined ? {} : { agentHarmony: scenario.harmony }), ...scenario.source,
    } as ContentSource;
    content = await generateStructuredContent(source, { provider: 'agent-claude', ...scenario.options } as never);
  } catch (e) { error = e; } finally {
    spies.forEach(spy => spy.mockRestore());
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
  const count = (kind: Kind) => kinds.filter(k => k === kind).length;
  const has = (pattern: RegExp) => logs.some(line => pattern.test(line));
  return { content, error, kinds, logs, count, has, skipLogs: logs.filter(line => line.startsWith('[AgentHarmony]') && line.includes('생략 —')) };
}

describe('harmony repair policy wired into generateStructuredContent (mocked agent CLI)', () => {
  beforeEach(() => {
    loadConfigMock.mockReset().mockResolvedValue({});
    releaseLimiterMock.mockReset();
    acquireLimiterMock.mockReset().mockResolvedValue(releaseLimiterMock);
  });

  describe('intro patch + title-answer regeneration', () => {
    const body = (harmony: boolean) => article(harmony ? harmonyFields() : {});

    it('flag OFF: the call sequence is exactly what it was before C2 (blueprint, body, intro patch, TitleAnswer regeneration, intro patch)', async () => {
      const off = await run({ harmony: undefined, body: body(false) });
      expect(off.error).toBeUndefined();
      expect(off.kinds).toEqual(['blueprint', 'body', 'intro-patch', 'body', 'intro-patch']);
      expect(off.has(/\[TitleAnswer\] 🔁 제목 약속 미이행/)).toBe(true);
      expect(off.logs.some(line => line.startsWith('[AgentHarmony]'))).toBe(false);
      const explicitOff = await run({ harmony: false, body: body(false) });
      expect(explicitOff.kinds).toEqual(off.kinds);
    });

    it('harmony ON: no intro patch call and no TitleAnswer regeneration — one body call, skips logged, issue still visible in the log', async () => {
      const on = await run({ harmony: true, body: body(true) });
      expect(on.error).toBeUndefined();
      expect(on.kinds).toEqual(['blueprint', 'body']);
      expect(on.has(/\[TitleAnswer\] 🔁/)).toBe(false);
      expect(on.has(/\[TitleAnswer\] 검사: 응답 50%/)).toBe(true);
      expect(on.skipLogs.some(line => /^\[AgentHarmony\] 도입부 보정 생략 — 조화 세션이 같은 기준으로 자기점검: .+/.test(line))).toBe(true);
      expect(on.skipLogs.some(line => /^\[AgentHarmony\] 제목 약속 재생성 생략 — 조화 세션이 같은 기준으로 자기점검: .*응답 50%/.test(line))).toBe(true);
      expect(on.content.selectedTitle).toBeTruthy();
      expect(on.has(/패킷 없음 — 바깥 보정을 평소대로/)).toBe(false);
    });

    it('harmony ON but the agent ignored the envelope (no packet): every repair runs exactly as with the flag OFF, one fallback line per attempt', async () => {
      const off = await run({ harmony: undefined, body: body(false) });
      const noPacket = await run({ harmony: true, body: body(false) });
      expect(noPacket.error).toBeUndefined();
      expect(noPacket.kinds).toEqual(off.kinds);
      expect(noPacket.kinds).toEqual(['blueprint', 'body', 'intro-patch', 'body', 'intro-patch']);
      expect(noPacket.has(/\[TitleAnswer\] 🔁 제목 약속 미이행/)).toBe(true);
      expect(noPacket.skipLogs).toEqual([]);
      expect(noPacket.logs.filter(line => line === '[AgentHarmony] 패킷 없음 — 바깥 보정을 평소대로 실행합니다')).toHaveLength(noPacket.count('body'));
    });

    it('a malformed packet (rejected by the extractor) counts as no packet', async () => {
      const bad = await run({ harmony: true, body: article({ harmonyPacket: { version: 1 } }) });
      expect(bad.kinds).toEqual(['blueprint', 'body', 'intro-patch', 'body', 'intro-patch']);
      expect(bad.skipLogs).toEqual([]);
    });
  });

  describe('Faithfulness (fact-type) regeneration stays under harmony', () => {
    const FACT_SOURCE = { factCheckRawSource: '전혀 다른 주제의 자료입니다. 기후 변화와 해수면 상승 그리고 극지방 빙하 감소에 관한 장문의 설명이 이어집니다. 연구진은 관측 위성 자료를 바탕으로 수십 년간의 추세를 분석했다고 밝혔다.' };

    it('flag OFF: the fact regeneration happens once (body twice) with intro patches in between', async () => {
      const off = await run({ harmony: undefined, body: article(), source: FACT_SOURCE });
      expect(off.error).toBeUndefined();
      expect(off.kinds).toEqual(['blueprint', 'body', 'intro-patch', 'body', 'intro-patch']);
      expect(off.logs.filter(line => /Faithfulness 실패\(자료 무시/.test(line))).toHaveLength(1);
    });

    it('harmony ON: the fact regeneration still happens exactly once; the skipped patches are not called', async () => {
      const on = await run({ harmony: true, body: article(harmonyFields()), source: FACT_SOURCE });
      expect(on.error).toBeUndefined();
      expect(on.kinds).toEqual(['blueprint', 'body', 'body']);
      expect(on.logs.filter(line => /Faithfulness 실패\(자료 무시/.test(line))).toHaveLength(1);
      expect(on.skipLogs.some(line => line.includes('도입부 보정 생략'))).toBe(true);
    });

    it('per attempt: a packet on the first response skips its patches; a retry whose response has no packet runs them', async () => {
      const mixed = await run({ harmony: true, body: (n) => (n === 0 ? article(harmonyFields()) : article()), source: FACT_SOURCE });
      expect(mixed.error).toBeUndefined();
      expect(mixed.kinds).toEqual(['blueprint', 'body', 'body', 'intro-patch']);
      expect(mixed.logs.filter(line => /Faithfulness 실패\(자료 무시/.test(line))).toHaveLength(1);
      expect(mixed.skipLogs.filter(line => line.includes('도입부 보정 생략'))).toHaveLength(1);
      expect(mixed.logs.filter(line => line === '[AgentHarmony] 패킷 없음 — 바깥 보정을 평소대로 실행합니다')).toHaveLength(1);
    });
  });

  describe('PromptAdherence regeneration', () => {
    const SOURCE = { customPrompt: "'병원' 단어는 쓰지 말아주세요." };

    it('flag OFF: a violated user prompt regenerates the body once', async () => {
      const off = await run({ harmony: undefined, body: article(), source: SOURCE, env: { CONTENT_ALLOW_EXTRA_LLM_PATCHES: '0' } });
      expect(off.error).toBeUndefined();
      expect(off.count('body')).toBe(2);
      expect(off.has(/\[PromptAdherence\] 🔁 자동 보정 재시도/)).toBe(true);
    });

    it('harmony ON: no regeneration; the final-warning branch keeps the violation in quality.warnings', async () => {
      const on = await run({ harmony: true, body: article(harmonyFields()), source: SOURCE, env: { CONTENT_ALLOW_EXTRA_LLM_PATCHES: '0' } });
      expect(on.error).toBeUndefined();
      expect(on.count('body')).toBe(1);
      expect(on.has(/\[PromptAdherence\] 🔁/)).toBe(false);
      expect(on.has(/\[PromptAdherence\] ⚠️ 최종 경고 후 통과/)).toBe(true);
      expect(on.skipLogs.some(line => line.includes('사용자 프롬프트 준수 재생성 생략'))).toBe(true);
      expect((on.content.quality?.warnings ?? []).some((w: string) => w.startsWith('사용자 프롬프트 준수 경고'))).toBe(true);
    });
  });

  describe('quote insertion patch', () => {
    const scenario = (harmony: boolean | undefined): Scenario => ({
      harmony, body: article(harmony ? harmonyFields() : {}, false), blueprint: BLUEPRINT, env: { CONTENT_ALLOW_EXTRA_LLM_PATCHES: '0' },
    });

    it('flag OFF: a verified blueprint quote with zero direct quotes in the body triggers the insertion patch call', async () => {
      const off = await run(scenario(undefined));
      expect(off.error).toBeUndefined();
      expect(off.count('quote-patch')).toBeGreaterThanOrEqual(1);
    });

    it('harmony ON: the insertion patch is not called and the skip is logged', async () => {
      const on = await run(scenario(true));
      expect(on.error).toBeUndefined();
      expect(on.count('quote-patch')).toBe(0);
      expect(on.skipLogs.some(line => line.includes('인용 삽입 보정 생략'))).toBe(true);
    });
  });

  describe('section distinctness regeneration', () => {
    const scenario = (harmony: boolean | undefined): Scenario => ({
      harmony,
      body: { ...article(harmony ? harmonyFields() : {}), headings: [...(article().headings as Json[]), { title: '남은 질문', content: `${B3}\n${B4}`, summary: 's', keywords: ['기부'], imagePrompt: 'p' }] },
      source: { rawText: '짧은 키워드', metadata: { keywords: ['병원 기부'] } },
      env: { CONTENT_SEMANTIC_DISTINCTNESS_JUDGE: '1', CONTENT_ALLOW_EXTRA_LLM_PATCHES: '0' },
      options: { submissionMode: 'legacy-retry' },
    });

    it('flag OFF: a redundant verdict regenerates the body', async () => {
      const off = await run(scenario(undefined));
      expect(off.error).toBeUndefined();
      expect(off.count('distinctness-judge')).toBeGreaterThanOrEqual(1);
      expect(off.has(/\[DistinctnessJudge\] 🔁 섹션 중복 감지/)).toBe(true);
      expect(off.count('body')).toBeGreaterThanOrEqual(2);
    });

    it('harmony ON: no regeneration; the terminal warning (aiDetectionRisk high) stays', async () => {
      const on = await run(scenario(true));
      expect(on.error).toBeUndefined();
      expect(on.has(/\[DistinctnessJudge\] 🔁 섹션 중복 감지/)).toBe(true);
      expect(on.count('body')).toBe(1);
      expect(on.skipLogs.some(line => line.includes('섹션 변별 재생성 생략'))).toBe(true);
      expect(on.has(/\[DistinctnessJudge\] ⚠️ 섹션 중복 미해결로 발행/)).toBe(true);
      expect((on.content.quality?.warnings ?? []).some((w: string) => w.startsWith('섹션 중복 미해결(시맨틱)'))).toBe(true);
    });
  });

  describe('[TitleSelect] keeps the session title under harmony', () => {
    const QUOTED = '"오래 전부터 하려던 일"이라는 말 뒤에 숨은 1억 원 기부의 이유';
    const BETTER = '김모씨가 병원에 건넨 1억 원, 왜 하필 소아병동이었을까';
    const titled = (harmony: boolean, selectedTitle: string): Json => article({
      ...(harmony ? harmonyFields() : {}),
      selectedTitle,
      titleCandidates: [{ text: selectedTitle, score: 70 }, { text: BETTER, score: 90 }, { text: '세 번째 후보 제목입니다 정말로', score: 60 }],
    });
    const env = { CONTENT_ALLOW_EXTRA_LLM_PATCHES: '0' };

    it('flag OFF: a clearly higher-scoring candidate still replaces the selected title (unchanged behaviour)', async () => {
      const off = await run({ harmony: undefined, body: titled(false, QUOTED), env });
      expect(off.error).toBeUndefined();
      expect(off.has(/\[TitleSelect\] 제목 교체\(higher-score/)).toBe(true);
    });

    it('harmony ON: the same pair keeps the session title (no score-only swap)', async () => {
      const on = await run({ harmony: true, body: titled(true, QUOTED), env });
      expect(on.error).toBeUndefined();
      expect(on.has(/\[TitleSelect\] 제목 교체/)).toBe(false);
    });

    it('harmony ON without a packet: TitleSelect behaves as today (score swap allowed)', async () => {
      const on = await run({ harmony: true, body: titled(false, QUOTED), env });
      expect(on.error).toBeUndefined();
      expect(on.has(/\[TitleSelect\] 제목 교체\(higher-score/)).toBe(true);
    });

    it('harmony ON: an echo of the keyword is still replaced (only echo / length problems may swap)', async () => {
      const ECHO = '병원 기부';
      const on = await run({ harmony: true, body: titled(true, ECHO), source: { metadata: { keywords: [ECHO] } }, env });
      expect(on.error).toBeUndefined();
      expect(on.has(/\[TitleSelect\] 제목 교체\(keyword-echo/)).toBe(true);
    });
  });
});
