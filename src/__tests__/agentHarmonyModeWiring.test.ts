import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { loadConfigMock, generateWithAgentMock, releaseLimiterMock, acquireLimiterMock } = vi.hoisted(() => ({ loadConfigMock: vi.fn(), generateWithAgentMock: vi.fn(), releaseLimiterMock: vi.fn(), acquireLimiterMock: vi.fn() }));

vi.mock('../configManager.js', async (importOriginal) => ({ ...(await importOriginal<typeof import('../configManager.js')>()), loadConfig: loadConfigMock }));
vi.mock('../runtime/adaptiveLimiter', () => ({ globalLimiter: { acquire: acquireLimiterMock } }));
vi.mock('../agentCli/index.js', () => ({ generateWithAgent: generateWithAgentMock }));

import { generateStructuredContent, type ContentSource } from '../contentGenerator';
import { wrapAsAgenticTask } from '../agentCli/agenticEnvelope';
import { readAgentHarmony } from '../content/agentHarmony/harmonyRuntime';

/**
 * 2026-11-04: the harmony session for the non-homefeed text modes, through generateStructuredContent with a mocked agent
 * CLI. Packet extraction, the C2 repair gating (warn-only vs kept fact regeneration) and the [TitleSelect] promise guard
 * all key on "harmony requested AND the response carried a packet" — never on the mode name.
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
const B2 = '김씨는 "그냥 오래 전부터 하려던 일이었다"고 말했다.';
const B3 = '기부금은 소아 환자 치료비로 쓰인다고 병원 관계자는 전했다.';
const B4 = '기부는 병원 소아병동 환자 가족들의 치료비 부담을 덜기 위한 것이라고 관계자는 덧붙였다.';
const TITLE = '70세 배우가 1억 원을 병원에 건넨 이유';
const BETTER = '김모씨가 병원에 건넨 1억 원, 왜 하필 소아병동이었을까';
const QUOTED = '"오래 전부터 하려던 일"이라는 말 뒤에 숨은 1억 원 기부의 이유';

type Json = Record<string, unknown>;
const article = (extra: Json = {}): Json => ({
  selectedTitle: TITLE,
  titleCandidates: [{ text: TITLE, score: 80 }, { text: '다른 후보 제목입니다 정말로', score: 70 }, { text: '세 번째 후보 제목입니다 정말로', score: 60 }],
  introduction: `${B1}\n독자가 가장 궁금해할 점부터 짚어 본다.`,
  headings: [
    { title: '기부의 시작', content: `${B1}\n${B2}`, summary: 's', keywords: ['기부'], imagePrompt: 'p' },
    { title: '돈의 행방', content: `${B3}\n${B4}`, summary: 's', keywords: ['치료비'], imagePrompt: 'p' },
  ],
  conclusion: '이번 기부는 올해 병원에 전달된 개인 기부 가운데 가장 큰 금액으로 알려졌다.',
  hashtags: ['#기부'], ...extra,
});
const cand = (id: string, title: string, q: string, anchor: string, body: string) => ({ id, title, readerQuestion: q, expectedBelief: '통상 예상', surprisingFact: '자료 속 실제 행동', clickReason: '지금 확인할 이유', sourceAnchors: [anchor], bodyAnchors: [body] });
const harmonyFields = (title = TITLE, answer = B4): Json => ({
  harmonyPacket: {
    version: 1,
    material: { centralEvent: '배우가 병원에 기부', readerSituation: '기부 소식을 본 독자', notInSource: ['동기'] },
    strategy: { readerQuestion: '왜 병원이었나', angle: '기부 행선지', exposureNote: '관측 자료 없음' },
    titles: { chosenId: 'c1', comparison: 'c1 이 가장 구체적', candidates: [cand('c1', title, '왜 병원이었나', RAW_LINES[0], B1), cand('c2', '"오래 전부터 하려던 일"이라는 말의 뒷이야기', '무슨 일인가', RAW_LINES[1], B2), cand('c3', '소아 환자 치료비로 쓰이는 기부금의 행방', '돈은 어디로', RAW_LINES[2], B3)] },
    payoff: { promise: '병원에 기부한 이유', answerSentence: answer },
  },
  complementReport: { version: 1, items: [] },
});

const dirs: string[] = [];
afterAll(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });

interface Scenario { readonly mode: 'seo' | 'affiliate'; readonly harmony: boolean | undefined; readonly body: Json; readonly source?: Json; readonly env?: Record<string, string> }

async function run(scenario: Scenario) {
  const runsDir = mkdtempSync(path.join(tmpdir(), 'bln-harmony-mode-'));
  dirs.push(runsDir);
  const previous = Object.fromEntries(Object.keys({ GENERATION_RUNS_DIR: 1, CONTENT_BLUEPRINT: 1, ...scenario.env }).map(key => [key, process.env[key]]));
  process.env.GENERATION_RUNS_DIR = runsDir;
  process.env.CONTENT_BLUEPRINT = '0';
  for (const [key, value] of Object.entries(scenario.env ?? {})) process.env[key] = value;
  generateWithAgentMock.mockReset().mockResolvedValue({ text: JSON.stringify(scenario.body), durationMs: 5 });
  const logs: string[] = [];
  const spies = (['log', 'warn', 'error'] as const).map(level => vi.spyOn(console, level).mockImplementation((...args: unknown[]) => { logs.push(args.map(String).join(' ')); }));
  let content: any, error: unknown;
  try {
    const source = { sourceType: 'custom_text', rawText: RAW, contentMode: scenario.mode, generator: 'agent-claude', ...(scenario.harmony === undefined ? {} : { agentHarmony: scenario.harmony }), ...scenario.source } as ContentSource;
    content = await generateStructuredContent(source, { provider: 'agent-claude' } as never);
  } catch (e) { error = e; } finally {
    spies.forEach(spy => spy.mockRestore());
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
  const bodyCalls = generateWithAgentMock.mock.calls.filter(call => String(call[0]?.prompt ?? '').includes('[작업 명세]'));
  const artifactDir = readdirSync(runsDir).find(id => existsSync(path.join(runsDir, id, 'H-agent-harmony.json')));
  const artifact = artifactDir ? JSON.parse(readFileSync(path.join(runsDir, artifactDir, 'H-agent-harmony.json'), 'utf8')) : undefined;
  const has = (pattern: RegExp) => logs.some(line => pattern.test(line));
  const skipLogs = logs.filter(line => line.startsWith('[AgentHarmony]') && line.includes('생략 —'));
  return { content, error, logs, has, skipLogs, artifact, bodyCalls, prompt: String(bodyCalls[0]?.[0]?.prompt ?? ''), options: bodyCalls[0]?.[0] };
}

describe('harmony session in seo mode (mocked agent CLI)', () => {
  beforeEach(() => {
    loadConfigMock.mockReset().mockResolvedValue({});
    releaseLimiterMock.mockReset();
    acquireLimiterMock.mockReset().mockResolvedValue(releaseLimiterMock);
  });
  const header = wrapAsAgenticTask('@@', 'seo').slice(0, -2);
  const env = { CONTENT_ALLOW_EXTRA_LLM_PATCHES: '0' };

  it('flag OFF: the agent receives exactly the plain seo agentic envelope, no harmony option, no artifact, no log line', async () => {
    for (const harmony of [undefined, false]) {
      const off = await run({ mode: 'seo', harmony, body: { ...article(), ...harmonyFields() } });
      expect(off.error).toBeUndefined();
      expect(off.prompt.startsWith(header)).toBe(true);
      expect(off.prompt).toBe(wrapAsAgenticTask(off.prompt.slice(header.length), 'seo'));
      for (const marker of ['[조화 절차]', '[SEO 조화 기준', '[우선순위 사다리]']) expect(off.prompt).not.toContain(marker);
      expect(off.options).not.toHaveProperty('harmony');
      expect(off.artifact).toBeUndefined();
      expect(off.logs.some(line => line.startsWith('[AgentHarmony]'))).toBe(false);
      expect(Object.getOwnPropertyDescriptor(off.content ?? {}, '_agentHarmony')).toBeUndefined();
    }
  });

  it('flag ON: seo harmony envelope in front of the same base prompt, packet verified, artifact says seo, article clean', async () => {
    const off = await run({ mode: 'seo', harmony: undefined, body: article() });
    const on = await run({ mode: 'seo', harmony: true, body: { ...article(), ...harmonyFields() } });
    expect(on.error).toBeUndefined();
    for (const marker of ['[조화 절차]', '[SEO 조화 기준', '검색 의도에 직접 답하는가', '"harmonyPacket"']) expect(on.prompt).toContain(marker);
    expect(on.prompt).not.toContain('[독립 제목 검수 기준');
    expect(on.prompt.endsWith(off.prompt.slice(header.length).slice(-2000))).toBe(true);
    expect(on.options.prompt).toContain('[작업 명세]\n');
    expect(on.artifact).toMatchObject({ version: 1, mode: 'seo', engine: 'agent-claude' });
    expect(on.artifact.packet.titles.chosenId).toBe('c1');
    expect(on.artifact.verification.sourceAnchors).toEqual({ matched: 3, total: 3 });
    expect(readAgentHarmony(on.content)?.packet?.titles.chosenId).toBe('c1');
    expect(JSON.stringify(on.content)).not.toMatch(/harmonyPacket|complementReport|_agentHarmony/);
    expect(on.has(/^\[AgentHarmony\] 패킷: 후보 3 · 선택 c1/)).toBe(true);
  });

  it('flag ON: a late answer sentence is recorded as a position only (no "comes late" issue outside homefeed)', async () => {
    // The answer sentence is the conclusion's: it sits at the very end of the body.
    const on = await run({ mode: 'seo', harmony: true, body: { ...article(), ...harmonyFields(TITLE, '이번 기부는 올해 병원에 전달된 개인 기부 가운데 가장 큰 금액으로 알려졌다.') } });
    expect(on.error).toBeUndefined();
    expect(on.artifact.verification.payoff.found).toBe(true);
    expect(on.artifact.verification.payoff.positionPct).toBeGreaterThan(36);
    expect(on.artifact.issues.some((issue: string) => issue.includes('comes late'))).toBe(false);
  });

  it('C2: a violated user prompt regenerates once with the flag OFF; under harmony it is warn-only and stays in quality.warnings', async () => {
    const source = { customPrompt: "'병원' 단어는 쓰지 말아주세요." };
    const off = await run({ mode: 'seo', harmony: undefined, body: article(), source, env });
    expect(off.bodyCalls).toHaveLength(2);
    expect(off.has(/\[PromptAdherence\] 🔁 자동 보정 재시도/)).toBe(true);
    const on = await run({ mode: 'seo', harmony: true, body: { ...article(), ...harmonyFields() }, source, env });
    expect(on.error).toBeUndefined();
    expect(on.bodyCalls).toHaveLength(1);
    expect(on.skipLogs.some(line => line.includes('사용자 프롬프트 준수 재생성 생략'))).toBe(true);
    expect((on.content.quality?.warnings ?? []).some((w: string) => w.startsWith('사용자 프롬프트 준수 경고'))).toBe(true);
  });

  it('C2: the fact-type (Faithfulness) regeneration is kept under harmony — it runs exactly once, like the flag OFF run', async () => {
    const source = { factCheckRawSource: '전혀 다른 주제의 자료입니다. 기후 변화와 해수면 상승 그리고 극지방 빙하 감소에 관한 장문의 설명이 이어집니다. 연구진은 관측 위성 자료를 바탕으로 수십 년간의 추세를 분석했다고 밝혔다.' };
    const off = await run({ mode: 'seo', harmony: undefined, body: article(), source });
    const on = await run({ mode: 'seo', harmony: true, body: { ...article(), ...harmonyFields() }, source });
    expect(off.logs.filter(line => /Faithfulness 실패\(자료 무시/.test(line))).toHaveLength(1);
    expect(on.logs.filter(line => /Faithfulness 실패\(자료 무시/.test(line))).toHaveLength(1);
    expect(on.artifact?.packet).toBeTruthy(); // the session really ran (packet extracted) while the fact regeneration still happened
    expect(on.has(/패킷 없음 — 바깥 보정을 평소대로/)).toBe(false);
    expect(on.bodyCalls).toHaveLength(off.bodyCalls.length);
    expect(on.bodyCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('C2: a response without a packet runs every repair as today (one fallback line, no skip)', async () => {
    const source = { customPrompt: "'병원' 단어는 쓰지 말아주세요." };
    const noPacket = await run({ mode: 'seo', harmony: true, body: article(), source, env });
    expect(noPacket.bodyCalls).toHaveLength(2);
    expect(noPacket.skipLogs).toEqual([]);
    expect(noPacket.logs.filter(line => line === '[AgentHarmony] 패킷 없음 — 바깥 보정을 평소대로 실행합니다')).toHaveLength(2);
  });

  it('[TitleSelect] keeps the session title in seo under harmony; the flag OFF run still swaps; an echo of the keyword is still replaced', async () => {
    const titled = (selectedTitle: string, withHarmony: boolean): Json => article({
      ...(withHarmony ? harmonyFields(selectedTitle) : {}), selectedTitle,
      titleCandidates: [{ text: selectedTitle, score: 70 }, { text: BETTER, score: 90 }, { text: '세 번째 후보 제목입니다 정말로', score: 60 }],
    });
    const off = await run({ mode: 'seo', harmony: undefined, body: titled(QUOTED, false), env });
    expect(off.has(/\[TitleSelect\] 제목 교체\(higher-score/)).toBe(true);
    const on = await run({ mode: 'seo', harmony: true, body: titled(QUOTED, true), env });
    expect(on.error).toBeUndefined();
    expect(on.has(/\[TitleSelect\] 제목 교체/)).toBe(false);
    const echo = await run({ mode: 'seo', harmony: true, body: titled('병원 기부', true), source: { metadata: { keywords: ['병원 기부'] } }, env });
    expect(echo.has(/\[TitleSelect\] 제목 교체\(keyword-echo/)).toBe(true);
  });
});

describe('harmony session in affiliate (shopping) mode (mocked agent CLI)', () => {
  beforeEach(() => {
    loadConfigMock.mockReset().mockResolvedValue({});
    releaseLimiterMock.mockReset();
    acquireLimiterMock.mockReset().mockResolvedValue(releaseLimiterMock);
  });

  it('flag ON sends the shopping envelope with the speaker-rule pointer and records an affiliate packet; flag OFF sends today\'s prompt', async () => {
    const header = wrapAsAgenticTask('@@', 'affiliate').slice(0, -2);
    const off = await run({ mode: 'affiliate', harmony: undefined, body: article() });
    expect(off.prompt.startsWith(header)).toBe(true);
    expect(off.options).not.toHaveProperty('harmony');
    const on = await run({ mode: 'affiliate', harmony: true, body: { ...article(), ...harmonyFields() } });
    expect(on.prompt).toContain('[쇼핑 조화 기준');
    expect(on.prompt).toContain('이 봉투는 그 규칙을 바꾸지 않으며');
    expect(on.artifact).toMatchObject({ mode: 'affiliate' });
    expect(on.artifact.packet.titles.chosenId).toBe('c1');
    expect(readAgentHarmony(on.content)?.active).toBe(true);
  });
});
