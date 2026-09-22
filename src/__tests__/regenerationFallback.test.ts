/**
 * [2026-09-23 실사고 20260923-000352-221hos] 품질 개선 재생성 실패가 **이미 완성된 글**을 파괴했다.
 *
 * 실측: 본문 1차 성공(115.1초) → 후처리 5단계(82.6초) → 품질게이트 재생성 → 2차 타임아웃(123.6초)
 *      → GENERATION_FAILED, outputChars=0. 사용자는 5분 22초를 기다리고 아무것도 못 받았다.
 *
 * 제품 원칙: 선택적 품질 개선 단계의 실패가 이미 성공한 사용자 결과물을 파괴해서는 안 된다.
 * 이 파일은 그 원칙과 "품질 판정은 조작하지 않는다"는 계약을 잠근다.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import {
  buildRegenerationFallbackMetadata,
  classifyRegenerationFailure,
  describeRegenerationFallback,
  describeRegenerationStart,
  isUserAbortFailure,
} from '../content/regenerationFallback';
import {
  getClaudeContentTimeoutMs,
  getContentProviderTimeoutMs,
  CLAUDE_ADAPTIVE_MIN_TIMEOUT_MS,
} from '../contentProviderTimeoutPolicy';

const source = (): string => readFileSync(new URL('../contentGenerator.ts', import.meta.url), 'utf8');
const liveTimeout = 'Claude API 호출 시간 초과 (123.624초)';

describe('재생성 실패 분류 (item 1)', () => {
  it('실사고의 타임아웃을 TIMEOUT 으로 분류한다', () => {
    expect(classifyRegenerationFailure(new Error(liveTimeout))).toBe('TIMEOUT');
    expect(classifyRegenerationFailure(new Error('ETIMEDOUT'))).toBe('TIMEOUT');
  });
  it('공급자·네트워크·HTTP·파싱·절단을 각각 구분한다', () => {
    expect(classifyRegenerationFailure(new Error('[OPENAI_REQUEST_FAILED:BILLING_OR_CREDIT]'))).toBe('HTTP_ERROR');
    expect(classifyRegenerationFailure(new Error('529 overloaded'))).toBe('HTTP_ERROR');
    expect(classifyRegenerationFailure(new Error('fetch failed ECONNRESET'))).toBe('PROVIDER_ERROR');
    expect(classifyRegenerationFailure(new Error('JSON 파싱 실패: Unexpected token'))).toBe('PARSE_ERROR');
    expect(classifyRegenerationFailure(new Error('응답이 잘렸습니다 (max_tokens)'))).toBe('TRUNCATED');
    expect(classifyRegenerationFailure(new Error('전혀 다른 문제'))).toBe('UNKNOWN');
  });
  it('사용자 중지는 복구 대상이 아니다 — 멈춘 것을 결과로 되살리지 않는다', () => {
    const aborted = classifyRegenerationFailure(new Error('사용자가 생성을 중지했습니다'));
    expect(aborted).toBe('ABORTED');
    expect(isUserAbortFailure(aborted)).toBe(true);
    expect(isUserAbortFailure('TIMEOUT')).toBe(false);
  });
});

describe('fallback 메타데이터 계약 (item 1)', () => {
  it('상태를 명시적으로 남기고 품질 판정 필드는 만들지 않는다', () => {
    const meta = buildRegenerationFallbackMetadata({
      error: new Error(liveTimeout), attempt: 2, regenerationTrigger: 'QualityGate finalScore 52 < 60',
    });
    expect(meta.generationStatus).toBe('SUCCESS_WITH_REGEN_FALLBACK');
    expect(meta.qualityRegeneration).toBe('FAILED');
    expect(meta.fallbackUsed).toBe(true);
    expect(meta.fallbackReason).toBe('TIMEOUT');
    expect(meta.attempt).toBe(2);
    expect(meta.regenerationTrigger).toContain('QualityGate');
    expect(meta.failureMessage).toContain('123.624');
    // 품질을 PASS 로 승격하는 필드가 없어야 한다.
    expect(Object.keys(meta)).not.toContain('publishDecision');
    expect(Object.keys(meta)).not.toContain('quality');
    expect(JSON.stringify(meta)).not.toMatch(/"PASS"/);
  });
  it('로그는 실패와 복구를 두 줄로 구분하고 보존된 판정을 적는다', () => {
    const meta = buildRegenerationFallbackMetadata({ error: new Error(liveTimeout), attempt: 2, regenerationTrigger: 'QualityGate90' });
    const [failLine, fallbackLine] = describeRegenerationFallback(meta, 'MANUAL_REVIEW');
    expect(failLine).toContain('REGENERATION_FAILED');
    expect(failLine).toContain('reason=TIMEOUT');
    expect(fallbackLine).toContain('FALLBACK_TO_LAST_SUCCESS');
    expect(fallbackLine).toContain('MANUAL_REVIEW');
    expect(describeRegenerationStart({
      attempt: 1, hasPreviousArtifact: true, trigger: 'QualityGate finalScore 52 < 60',
      timeoutMs: 240_000, provider: 'claude', model: 'claude-sonnet-5',
    })).toMatch(/attempt=1.*직전성공=있음.*창=240초.*claude\/claude-sonnet-5/);
  });
});

describe('생성 루프 배선 (item 1) — 소스 계약', () => {
  const gen = source();

  it('네 개의 품질 재생성 지점 모두에서 직전 성공본을 보존한다', () => {
    const captures = gen.split('keepArtifactBeforeRegeneration(optimized').length - 1;
    expect(captures).toBe(5); // Fidelity / TitleAnswer / QualityGate / QualityGate90 x2
    // 보존은 반드시 continue(재생성) 직전에 일어난다.
    for (const block of gen.split('keepArtifactBeforeRegeneration(optimized').slice(1)) {
      expect(block.slice(0, 200)).toContain('continue');
    }
  });

  it('두 실패 출구 모두에서 직전 성공본을 먼저 확인한다 (GENERATION_FAILED 로 끝내지 않는다)', () => {
    const lines = gen.split(String.fromCharCode(10));
    const throwAt = lines.map((l, i) => (l.includes('콘텐츠 생성 실패 (엔진:') ? i : -1)).filter((i) => i >= 0);
    expect(throwAt.length).toBe(2);
    for (const at of throwAt) {
      const before = lines.slice(Math.max(0, at - 10), at).join(String.fromCharCode(10));
      expect(before).toContain('recoverLastSuccessfulArtifact');
    }
  });

  it('복구 경로가 품질 판정을 건드리지 않는다 — 콘텐츠만 살린다', () => {
    const start = gen.indexOf('const recoverLastSuccessfulArtifact');
    const fn = gen.slice(start, gen.indexOf('for (let attempt = 0;', start));
    expect(fn).toContain('_regenerationFallback');
    expect(fn).toContain('isUserAbortFailure');
    // 성공 경로와 같은 최종 정리를 거치되, 모델을 부르는 소제목 보정은 부르지 않는다.
    expect(fn).toContain('finalizeStructuredContent(kept.content, source, promptVariant)');
    expect(fn).not.toMatch(/await repairHeadingsBeforeFinalize\(/);
    // 판정을 바꾸는 대입이 없어야 한다.
    expect(fn).not.toMatch(/publishDecision\s*=/);
    expect(fn).not.toMatch(/\.quality\s*=/);
    expect(fn).not.toMatch(/AUTO_PUBLISH|'PASS'/);
  });

  it('재생성 횟수를 늘리지 않는다 — 시도 상한 정의는 그대로다', () => {
    expect(gen).toContain('const QUALITY_ATTEMPT_LIMIT = allowPaidPostGenerationRepair ? MAX_ATTEMPTS + 1 : MAX_ATTEMPTS;');
    expect(gen).toContain('for (let attempt = 0; attempt <= QUALITY_ATTEMPT_LIMIT; attempt += 1)');
  });
});

describe('Claude adaptive-thinking 타임아웃 하한 (item 2)', () => {
  it('실사고 조건에서 창이 240초 이상으로 넓어진다 (1차 성공 115.1초 / 옛 창 123.6초)', () => {
    const live = { minChars: 2500, promptChars: 64_833 };
    expect(getContentProviderTimeoutMs(live.minChars, 0, live.promptChars)).toBe(123_624);
    expect(getClaudeContentTimeoutMs(live.minChars, 'claude-sonnet-5', 0, live.promptChars)).toBe(240_000);
  });

  it('대상 모델에만 적용한다 — opus-5 / sonnet-5 / fable-5(-1)', () => {
    for (const model of ['claude-opus-5', 'claude-sonnet-5', 'claude-fable-5', 'claude-fable-5-1']) {
      expect(getClaudeContentTimeoutMs(2500, model), model).toBe(CLAUDE_ADAPTIVE_MIN_TIMEOUT_MS);
    }
  });

  it('비대상 모델(haiku 등)은 기존 창 그대로 — 회귀 0', () => {
    for (const model of ['claude-haiku-4-5', 'claude-haiku-4-5-20251001', 'claude-sonnet-4-5', 'claude-opus-4-5']) {
      expect(getClaudeContentTimeoutMs(2500, model), model).toBe(getContentProviderTimeoutMs(2500));
    }
  });

  it('이미 더 긴 창이면 줄이지 않는다 (max 규칙)', () => {
    const long = getContentProviderTimeoutMs(12_000, 2, 500_000); // 최대 베이스 + 입력 가산
    expect(long).toBeGreaterThan(CLAUDE_ADAPTIVE_MIN_TIMEOUT_MS);
    expect(getClaudeContentTimeoutMs(12_000, 'claude-sonnet-5', 2, 500_000)).toBe(long);
    expect(getClaudeContentTimeoutMs(12_000, 'claude-haiku-4-5', 2, 500_000)).toBe(long);
  });

  it('렌더러 상위 예산(360초) 안에 남는다', () => {
    expect(getClaudeContentTimeoutMs(12_000, 'claude-fable-5', 2, 500_000)).toBeLessThan(360_000);
  });

  it('호출부가 중앙 resolver 를 쓰고 모델별로 계산한다', () => {
    const gen = source();
    expect(gen).toContain('const effectiveTimeoutMs = getClaudeContentTimeoutMs(minChars, modelName, 0, prompt.length);');
    expect(gen).toContain('`Claude API 호출 시간 초과 (${effectiveTimeoutMs / 1000}초)`');
  });
});
