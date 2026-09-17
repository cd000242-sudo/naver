/**
 * [2026-09-15 사장님] "API 비용이 최대한 안 들고 이미지를 수집하는 걸 원하는 거지.
 * 청구되더라도 지피티면 지피티, 클로드면 클로드, 에이전트면 에이전트로 비전이
 * 돌아가게 해줘야 정상이잖아."
 *
 * 수집기 Vision 게이트가 Gemini 로 박혀 있어서, GPT·Claude·에이전트를 골라도
 * Gemini 키만 있으면 Gemini 로 청구됐다. 고른 엔진이 벤더를 정한다.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveIssueVisionRoute } from '../crawler/issueHarness/visionRoute';
import { resolveIssueTextGenerator } from '../crawler/issueHarness/textRoute';

const OPENAI = 'sk-test-openai-key';
const CLAUDE = 'sk-ant-test-claude-key';
const GEMINI = 'AIzaSyDUMMYKEYFORTESTONLY_0123456789ab';

const allKeys = { openaiApiKey: OPENAI, claudeApiKey: CLAUDE, geminiApiKey: GEMINI };

// 실행 환경의 키가 판정에 섞이지 않게 한다 — 설정값만 본다.
beforeEach(() => {
  for (const name of ['GEMINI_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'CLAUDE_API_KEY']) {
    delete process.env[name];
  }
});

describe('resolveIssueVisionRoute — 고른 엔진이 비전 벤더를 정한다', () => {
  it('GPT 를 골랐으면 키가 셋 다 있어도 OpenAI 로 간다', () => {
    const route = resolveIssueVisionRoute({ ...allKeys, primaryGeminiTextModel: 'openai-gpt41' });
    expect(route?.vendor).toBe('openai');
    expect(route?.apiKey).toBe(OPENAI);
    expect(route?.free).toBe(false);
  });

  it('Claude 를 골랐으면 Claude 로 간다', () => {
    const route = resolveIssueVisionRoute({ ...allKeys, primaryGeminiTextModel: 'claude-sonnet' });
    expect(route?.vendor).toBe('claude');
    expect(route?.apiKey).toBe(CLAUDE);
  });

  it('Gemini 를 골랐으면 Gemini 로 간다', () => {
    const route = resolveIssueVisionRoute({ ...allKeys, primaryGeminiTextModel: 'gemini-3.5-flash' });
    expect(route?.vendor).toBe('gemini');
    expect(route?.apiKey).toBe(GEMINI);
  });

  it('에이전트 구독이면 API 키 없이 추가 과금 0 으로 돈다', () => {
    const codex = resolveIssueVisionRoute({ primaryGeminiTextModel: 'agent-codex' });
    expect(codex).toMatchObject({ vendor: 'agent-codex', free: true, apiKey: '' });
    const claude = resolveIssueVisionRoute({ primaryGeminiTextModel: 'agent-claude' });
    expect(claude).toMatchObject({ vendor: 'agent-claude', free: true, apiKey: '' });
  });

  it('agent-gemini 는 비전 불가 — Gemini 키가 있어도 몰래 API 로 청구하지 않는다', () => {
    expect(resolveIssueVisionRoute({ ...allKeys, primaryGeminiTextModel: 'agent-gemini' })).toBeNull();
  });

  it('고른 벤더의 키가 없으면 null — 다른 벤더로 건너뛰지 않는다', () => {
    // GPT 를 골랐는데 OpenAI 키만 없다. 예전이라면 Gemini 키로 청구됐다.
    const route = resolveIssueVisionRoute({
      claudeApiKey: CLAUDE,
      geminiApiKey: GEMINI,
      primaryGeminiTextModel: 'openai-gpt41',
    });
    expect(route).toBeNull();
  });

  it('암호화 저장본("enc:…")은 키가 아니다', () => {
    expect(resolveIssueVisionRoute({ openaiApiKey: 'enc:AAAA', primaryGeminiTextModel: 'openai-gpt41' })).toBeNull();
  });

  it('Perplexity 처럼 비전이 없는 엔진은 폴백 사실을 숨기지 않는다', () => {
    const route = resolveIssueVisionRoute({ ...allKeys, primaryGeminiTextModel: 'perplexity-sonar' });
    expect(route?.fellBack).toBe(true);
    expect(route?.reason).toBeTruthy();
  });
});

describe('resolveIssueTextGenerator — 검색어 플랜도 고른 엔진으로', () => {
  it('저장된 모델 키를 보조 호출 라우터의 벤더 이름으로 옮긴다', () => {
    expect(resolveIssueTextGenerator({ primaryGeminiTextModel: 'openai-gpt41' })).toBe('openai');
    expect(resolveIssueTextGenerator({ primaryGeminiTextModel: 'claude-sonnet' })).toBe('claude');
    expect(resolveIssueTextGenerator({ primaryGeminiTextModel: 'gemini-3.5-flash' })).toBe('gemini');
    expect(resolveIssueTextGenerator({ primaryGeminiTextModel: 'perplexity-sonar' })).toBe('perplexity');
  });

  it('에이전트 값은 그대로 넘긴다 — 텍스트는 agy 도 된다(비전만 막힌다)', () => {
    expect(resolveIssueTextGenerator({ primaryGeminiTextModel: 'agent-codex' })).toBe('agent-codex');
    expect(resolveIssueTextGenerator({ primaryGeminiTextModel: 'agent-gemini' })).toBe('agent-gemini');
  });

  it('고른 엔진이 없으면 빈 값 — 호출 측이 휴리스틱(무료)으로 내려간다', () => {
    expect(resolveIssueTextGenerator({})).toBe('');
    expect(resolveIssueTextGenerator(null)).toBe('');
  });
});

describe('게이트 배선 핀', () => {
  const read = (path: string) => readFileSync(resolve(__dirname, path), 'utf8');

  it('visionGate 는 더 이상 Gemini SDK 를 직접 import 하지 않는다', () => {
    const gate = read('../crawler/issueHarness/visionGate.ts');
    expect(gate).not.toMatch(/@google\/generative-ai/);
    expect(gate).toMatch(/judgeImagesWithRoute/);
  });

  it('벤더 디스패치에 GPT·Claude·에이전트 경로가 모두 있다', () => {
    const judges = read('../crawler/issueHarness/visionJudges.ts');
    expect(judges).toMatch(/api\.openai\.com\/v1\/chat\/completions/);
    expect(judges).toMatch(/api\.anthropic\.com\/v1\/messages/);
    expect(judges).toMatch(/runCodex/);
    expect(judges).toMatch(/runClaude/);
  });

  it('비용을 위해 배치 호출을 유지한다 — 한 장씩 보내면 호출 수가 8배다', () => {
    expect(read('../crawler/issueHarness/visionGate.ts')).toMatch(/BATCH_SIZE\s*=\s*8/);
  });

  it('검색어 플랜도 더 이상 Gemini SDK 를 직접 부르지 않는다', () => {
    const fanout = read('../crawler/issueHarness/queryFanout.ts');
    expect(fanout).not.toMatch(/@google\/generative-ai/);
    expect(fanout).toMatch(/planCaller/);
  });
});

describe('[2026-09-17] 검사 모델은 같은 벤더에서 제일 싼 비전 모델', () => {
  it('GPT → luna, Claude → haiku, Gemini → flash-lite (벤더는 그대로)', () => {
    expect(resolveIssueVisionRoute({ ...allKeys, primaryGeminiTextModel: 'openai-gpt41' })?.model).toBe('gpt-5.6-luna');
    expect(resolveIssueVisionRoute({ ...allKeys, primaryGeminiTextModel: 'claude-sonnet' })?.model).toBe('claude-haiku-4-5-20251001');
    expect(resolveIssueVisionRoute({ ...allKeys, primaryGeminiTextModel: 'gemini-3.5-flash' })?.model).toBe('gemini-3.1-flash-lite');
  });

  it('라벨도 실제 호출 모델을 보여 준다 — 화면·로그가 청구 모델과 어긋나지 않는다', () => {
    const route = resolveIssueVisionRoute({ ...allKeys, primaryGeminiTextModel: 'openai-gpt41' });
    expect(route?.label).toBe('openai · gpt-5.6-luna');
    expect(route?.free).toBe(false);
  });
});
