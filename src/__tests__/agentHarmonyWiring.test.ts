import { mkdtempSync, readFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const loadConfigMock = vi.hoisted(() => vi.fn());
const generateWithAgentMock = vi.hoisted(() => vi.fn());
const releaseLimiterMock = vi.hoisted(() => vi.fn());
const acquireLimiterMock = vi.hoisted(() => vi.fn());

vi.mock('../configManager.js', async (importOriginal) => ({ ...(await importOriginal<typeof import('../configManager.js')>()), loadConfig: loadConfigMock }));
vi.mock('../runtime/adaptiveLimiter', () => ({ globalLimiter: { acquire: acquireLimiterMock } }));
vi.mock('../agentCli/index.js', () => ({ generateWithAgent: generateWithAgentMock }));

import { generateStructuredContent, type ContentSource } from '../contentGenerator';
import { wrapAsAgenticTask } from '../agentCli/agenticEnvelope';
import { contentTextOf } from '../content/postProcessTrace';
import { generateWithHomefeedReview } from '../content/homefeedTitleReview';
import {
  attachAgentHarmony, draftBodyOf, handleAgentHarmonyResponse, readAgentHarmony, resolveAgentHarmonyFlag,
  resolveAgentHarmonyRequest, restoreAgentHarmony,
} from '../content/agentHarmony/harmonyRuntime';
import { HARMONY_LEDGER_FILE } from '../content/agentHarmony/harmonyLedger';

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
const TASK_SENTENCE = '제목의 약속은 도입부에서 첫 답을 준다';

const cand = (id: string, title: string, q: string, src: string, body: string) => ({
  id, title, readerQuestion: q, expectedBelief: '통상 예상', surprisingFact: '자료 속 실제 행동', clickReason: '지금 확인할 이유', sourceAnchors: [src], bodyAnchors: [body],
});
const TITLE = '70세 배우가 1억 원을 병원에 건넨 이유';
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
        cand('c3', '소아 환자 치료비로 쓰이는 기부금의 행방', '돈은 어디로', RAW_LINES[2], B3),
      ],
    },
    payoff: { promise: '병원에 기부한 이유', answerSentence: B2 },
  },
  complementReport: { version: 1, items: [{ kind: 'conflict', instructionQuote: TASK_SENTENCE, otherQuote: '', resolution: '도입부 첫 답을 두 번째 문단에 둠', rule: 'payoff', affected: ['introduction'] }] },
});
const article = (extra: Record<string, unknown> = {}) => ({
  selectedTitle: TITLE,
  titleCandidates: [{ text: TITLE, score: 80 }, { text: '다른 후보 제목입니다 정말로', score: 70 }, { text: '세 번째 후보 제목입니다 정말로', score: 60 }],
  introduction: `${B1}\n독자가 가장 궁금해할 점부터 짚어 본다.`,
  headings: [
    { title: '기부의 시작', content: `${B1}\n${B2}`, summary: 's', keywords: ['기부'], imagePrompt: 'p' },
    { title: '돈의 행방', content: `${B3}\n기부는 병원 소아병동 환자 가족들의 치료비 부담을 덜기 위한 것이라고 관계자는 덧붙였다.`, summary: 's', keywords: ['치료비'], imagePrompt: 'p' },
  ],
  conclusion: '이번 기부는 올해 병원에 전달된 개인 기부 가운데 가장 큰 금액으로 알려졌다.',
  hashtags: ['#기부'], ...extra,
});

const dirs: string[] = [];
const tmp = () => { const dir = mkdtempSync(path.join(tmpdir(), 'bln-harmony-wire-')); dirs.push(dir); return dir; };
afterAll(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });

describe('flag and request resolution', () => {
  it('is OFF unless config says true; env 0/1 overrides in both directions', () => {
    expect(resolveAgentHarmonyFlag(undefined, {})).toBe(false);
    expect(resolveAgentHarmonyFlag({}, {})).toBe(false);
    expect(resolveAgentHarmonyFlag({ agentHarmonyMode: 'yes' }, {})).toBe(false);
    expect(resolveAgentHarmonyFlag({ agentHarmonyMode: true }, {})).toBe(true);
    expect(resolveAgentHarmonyFlag({ agentHarmonyMode: true }, { AGENT_HARMONY: '0' })).toBe(false);
    expect(resolveAgentHarmonyFlag({ agentHarmonyMode: false }, { AGENT_HARMONY: '1' })).toBe(true);
    expect(resolveAgentHarmonyFlag({ agentHarmonyMode: true }, { AGENT_HARMONY: 'off' })).toBe(false);
  });

  it('requires the flag, an agent-claude/agent-codex engine, homefeed and the legacy (non-V3) prompt', () => {
    const base = { flag: true, provider: 'agent-claude', isV3Prompt: false, mode: 'homefeed' };
    expect(resolveAgentHarmonyRequest(base)).toEqual({ mode: 'homefeed' });
    expect(resolveAgentHarmonyRequest({ ...base, provider: 'agent-codex' })).toEqual({ mode: 'homefeed' });
    for (const off of [{ flag: undefined }, { flag: false }, { flag: 'true' }, { provider: 'agent-gemini' }, { provider: 'gemini' }, { provider: 'claude' }, { isV3Prompt: true }, { mode: 'seo' }, { mode: 'affiliate' }]) {
      expect(resolveAgentHarmonyRequest({ ...base, ...off })).toBeUndefined();
    }
  });
});

describe('handleAgentHarmonyResponse', () => {
  const ctxOf = (userDataDir: string | null, extra: Record<string, unknown> = {}) => ({
    rawText: RAW, systemPrompt: `[작업 명세] ${TASK_SENTENCE}. 나머지 지시.`, engine: 'agent-claude', model: 'claude(구독)', mode: 'homefeed', runId: 'run-x', userDataDir, ...extra,
  });

  it('strips the fields, attaches a non-enumerable record and keeps the article text and payload clean', () => {
    const parsed = article(harmonyFields()) as Record<string, unknown>;
    const before = JSON.stringify(article());
    const logs: string[] = [];
    const record = handleAgentHarmonyResponse(parsed, ctxOf(null, { log: (m: string) => logs.push(m) }));
    expect(record.active).toBe(true);
    expect(record.packet?.titles.chosenId).toBe('c1');
    expect(record.report).toHaveLength(1);
    expect(record.report[0].quoteVerified).toBe(true);
    expect(readAgentHarmony(parsed)).toBe(record);
    expect(Object.keys(parsed)).not.toContain('_agentHarmony');
    expect(JSON.stringify(parsed)).toBe(before);
    expect(structuredClone(parsed)).not.toHaveProperty('_agentHarmony');
    expect({ ...parsed }).not.toHaveProperty('_agentHarmony');
    const text = contentTextOf(parsed as never);
    for (const needle of ['harmonyPacket', 'complementReport', '_agentHarmony', '관측 자료 없음', 'centralEvent']) expect(text).not.toContain(needle);
    expect(logs[0]).toMatch(/^\[AgentHarmony\] 패킷: 후보 3 · 선택 c1 · 앵커 원문 일치 3\/3 · 보상 문장 위치 \d+% · 보완보고 1건\(인용 확인 1\/1\)$/);
    expect(logs.some(line => /^\[AgentHarmony\]   - conflict\/payoff /.test(line))).toBe(true);
  });

  it('writes H-agent-harmony.json through the run artifact writer and the ledger line', () => {
    const dir = tmp();
    const written: Array<{ name: string; payload: any }> = [];
    handleAgentHarmonyResponse(article(harmonyFields()), ctxOf(dir, { run: { writeQualityArtifact: (name: string, payload: unknown) => written.push({ name, payload }) }, log: () => {} }));
    expect(written.map(w => w.name)).toEqual(['H-agent-harmony.json']);
    expect(written[0].payload).toMatchObject({ version: 1, runId: 'run-x', engine: 'agent-claude', mode: 'homefeed' });
    expect(written[0].payload.packet.titles.chosenId).toBe('c1');
    const rows = readFileSync(path.join(dir, 'agent-harmony', HARMONY_LEDGER_FILE), 'utf8').trim().split('\n').map(l => JSON.parse(l));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ runId: 'run-x', engine: 'agent-claude', kind: 'conflict', rule: 'payoff', quoteVerified: true });
  });

  it('records a missing / malformed packet as an observation and never throws', () => {
    const none = handleAgentHarmonyResponse(article(), ctxOf(null, { log: () => {} }));
    expect(none).toMatchObject({ active: true, packet: null, report: [] });
    expect(none.issues).toContain('no harmony fields in the response');
    const bad = article({ harmonyPacket: { version: 1 }, complementReport: 'nope' }) as Record<string, unknown>;
    const record = handleAgentHarmonyResponse(bad, ctxOf(null, { log: () => {} }));
    expect(record.packet).toBeNull();
    expect(record.issues.length).toBeGreaterThan(0);
    expect('harmonyPacket' in bad).toBe(false);
    expect(() => handleAgentHarmonyResponse(null, ctxOf(null, { log: () => {} }))).not.toThrow();
    expect(() => handleAgentHarmonyResponse(Object.freeze(article(harmonyFields())), ctxOf(null, { log: () => {} }))).not.toThrow();
  });

  it('draftBodyOf joins introduction, heading titles and content, conclusion in order', () => {
    const body = draftBodyOf(article());
    expect(body.indexOf('기부의 시작')).toBeGreaterThan(body.indexOf('독자가 가장 궁금해할'));
    expect(body.indexOf('이번 기부는')).toBeGreaterThan(body.indexOf('돈의 행방'));
    expect(draftBodyOf(null)).toBe('');
  });

  it('restoreAgentHarmony puts the record back on a clone made by later post-processing', () => {
    const run = {};
    const parsed = article(harmonyFields());
    const record = handleAgentHarmonyResponse(parsed, ctxOf(null, { run: Object.assign(run, { writeQualityArtifact: () => {} }), log: () => {} }));
    const clone = { ...parsed };
    expect(readAgentHarmony(clone)).toBeUndefined();
    restoreAgentHarmony(clone, run);
    expect(readAgentHarmony(clone)).toBe(record);
    const other = { selectedTitle: 'x' };
    restoreAgentHarmony(other, {});
    expect(readAgentHarmony(other)).toBeUndefined();
    const manual = { selectedTitle: 'y' };
    attachAgentHarmony(manual, record);
    expect(readAgentHarmony(manual)).toBe(record);
  });

  it('the article returned by generateWithHomefeedReview keeps _agentHarmony (identity hand-off to main)', async () => {
    const generated = article(harmonyFields());
    handleAgentHarmonyResponse(generated, ctxOf(null, { log: () => {} }));
    const out = await generateWithHomefeedReview({
      contentMode: 'homefeed', source: { rawText: RAW }, generate: async () => generated, createCaller: async () => null, log: () => {},
    });
    expect(out.article).toBe(generated);
    expect(readAgentHarmony(out.article)?.active).toBe(true);
    expect(JSON.stringify(out.article)).not.toContain('_agentHarmony');
  });
});

describe('end to end through generateStructuredContent (mocked agent CLI)', () => {
  const source = (flag: boolean | undefined): ContentSource => ({
    sourceType: 'custom_text', rawText: RAW, contentMode: 'homefeed', generator: 'agent-claude', ...(flag === undefined ? {} : { agentHarmony: flag }),
  } as ContentSource);
  const header = wrapAsAgenticTask('@@', 'homefeed').slice(0, -2);
  let runsDir = '';

  async function run(flag: boolean | undefined, response: Record<string, unknown>) {
    runsDir = tmp();
    process.env.GENERATION_RUNS_DIR = runsDir;
    generateWithAgentMock.mockReset().mockResolvedValue({ text: JSON.stringify(response), durationMs: 5 });
    let content: any, error: unknown;
    try { content = await generateStructuredContent(source(flag), { provider: 'agent-claude' } as never); } catch (e) { error = e; }
    // The pipeline also makes side calls (blueprint ...); the body call is the one that carries the envelope's [작업 명세] separator.
    const calls = generateWithAgentMock.mock.calls;
    const body = calls.find(call => String(call[0]?.prompt ?? '').includes('[작업 명세]'));
    return { content, error, prompt: String(body?.[0]?.prompt ?? ''), options: body?.[0], calls };
  }
  const artifacts = () => readdirSync(runsDir).flatMap(id => readdirSync(path.join(runsDir, id)));

  beforeEach(() => {
    loadConfigMock.mockReset().mockResolvedValue({});
    releaseLimiterMock.mockReset();
    acquireLimiterMock.mockReset().mockResolvedValue(releaseLimiterMock);
  });

  it('flag OFF: the agent receives exactly the plain agentic envelope and no harmony artifact exists', async () => {
    const off = await run(undefined, { ...article(), ...harmonyFields() });
    expect(off.calls.length).toBeGreaterThan(0);
    expect(off.prompt.startsWith(header)).toBe(true);
    expect(off.prompt).toBe(wrapAsAgenticTask(off.prompt.slice(header.length), 'homefeed'));
    for (const marker of ['[조화 절차]', '"harmonyPacket"', '[우선순위 사다리]', '[앱 검사 기준']) expect(off.prompt).not.toContain(marker);
    expect(off.options).not.toHaveProperty('harmony');
    expect(artifacts()).not.toContain('H-agent-harmony.json');
    expect(off.content ? Object.getOwnPropertyDescriptor(off.content, '_agentHarmony') : undefined).toBeUndefined();
    const explicitOff = await run(false, article());
    expect(explicitOff.prompt.startsWith(header)).toBe(true);
    expect(artifacts()).not.toContain('H-agent-harmony.json');
  });

  it('flag ON: same base prompt behind the harmony envelope, packet verified, artifact written, article clean', async () => {
    const off = await run(undefined, article());
    const base = off.prompt.slice(header.length);
    const on = await run(true, { ...article(), ...harmonyFields() });
    expect(on.error).toBeUndefined();
    expect(on.prompt).toContain('[조화 절차]');
    expect(on.prompt.endsWith(base.slice(-2000))).toBe(true);
    expect(on.prompt.length).toBeGreaterThan(off.prompt.length);
    expect(on.prompt).toContain('[작업 명세]\n');
    expect(artifacts()).toContain('H-agent-harmony.json');
    const dirName = readdirSync(runsDir).find(id => existsSync(path.join(runsDir, id, 'H-agent-harmony.json')))!;
    const artifact = JSON.parse(readFileSync(path.join(runsDir, dirName, 'H-agent-harmony.json'), 'utf8'));
    expect(artifact.packet.titles.chosenId).toBe('c1');
    expect(artifact.verification.sourceAnchors).toEqual({ matched: 3, total: 3 });
    const harmony = readAgentHarmony(on.content);
    expect(harmony?.active).toBe(true);
    expect(harmony?.packet?.titles.chosenId).toBe('c1');
    expect(JSON.stringify(on.content)).not.toMatch(/harmonyPacket|complementReport|_agentHarmony/);
    expect(String(on.content.bodyPlain)).not.toMatch(/harmonyPacket|complementReport|centralEvent/);
  });
});
