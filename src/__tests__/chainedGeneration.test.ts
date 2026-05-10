/**
 * SPEC-CONVERSION-001 L2-1.1 — 체인드 파이프라인 오케스트레이터 단위 테스트.
 */

import { describe, it, expect } from 'vitest';
import {
  runChainedGeneration,
  isChainedGenEnabled,
  buildStage3Context,
  summarizeMetrics,
} from '../content/chainedGeneration';

describe('isChainedGenEnabled — feature flag', () => {
  it('forceFlag=true는 즉시 ON', () => {
    expect(isChainedGenEnabled(true)).toBe(true);
  });

  it('forceFlag=false는 즉시 OFF', () => {
    expect(isChainedGenEnabled(false)).toBe(false);
  });

  it('환경변수 미설정 시 OFF (기본 안전 정책)', () => {
    delete process.env.CHAINED_GEN_V1;
    expect(isChainedGenEnabled()).toBe(false);
  });

  it('환경변수 1/true/on은 ON', () => {
    for (const v of ['1', 'true', 'on', 'TRUE', 'On']) {
      process.env.CHAINED_GEN_V1 = v;
      expect(isChainedGenEnabled()).toBe(true);
    }
    delete process.env.CHAINED_GEN_V1;
  });
});

describe('runChainedGeneration — flag OFF 폴백', () => {
  it('flag OFF면 enabled=false + fallbackReason 명시 (silent X)', async () => {
    const r = await runChainedGeneration({ forceFlag: false, title: '테스트' });
    expect(r.enabled).toBe(false);
    expect(r.fallbackReason).toContain('CHAINED_GEN_V1');
  });
});

describe('runChainedGeneration — flag ON 5단계 실행', () => {
  it('stage 1·2는 성공, stage 3·4·5는 placeholder', async () => {
    const r = await runChainedGeneration({
      forceFlag: true,
      title: '맛집 김치찌개 후기',
    });
    expect(r.enabled).toBe(true);
    expect(r.category).toBe('food');
    expect(r.persona.tone).toBe('casual');
    expect(r.metrics).toHaveLength(5);
    expect(r.metrics[0].stage).toBe('classify');
    expect(r.metrics[0].success).toBe(true);
    expect(r.metrics[1].stage).toBe('persona');
    expect(r.metrics[1].success).toBe(true);
    // stage 3-5는 placeholder
    expect(r.metrics[2].success).toBe(false);
    expect(r.metrics[3].success).toBe(false);
    expect(r.metrics[4].success).toBe(false);
  });

  it('userVoice가 페르소나에 통합', async () => {
    const r = await runChainedGeneration({
      forceFlag: true,
      title: '쿠션 발색 비교',
      userVoice: ['진짜 발색 좋아요'],
    });
    expect(r.persona.vocabularyHints.some((v) => v.includes('발색') || v.includes('진짜'))).toBe(true);
  });

  it('classifyCategory 결과가 persona 카테고리와 일치', async () => {
    const r = await runChainedGeneration({
      forceFlag: true,
      title: '아이폰 15 Pro 노트북 비교',
    });
    expect(r.category).toBe('tech');
    expect(r.persona.category).toBe('tech');
  });
});

describe('buildStage3Context — Stage 3 LLM 프롬프트 입력', () => {
  it('stage 1·2 결과를 프롬프트 블록으로 조립', async () => {
    const r = await runChainedGeneration({
      forceFlag: true,
      title: '제주도 호텔 추천',
    });
    const ctx = buildStage3Context(r);
    expect(ctx).toContain('카테고리');
    expect(ctx).toContain('travel');
    expect(ctx).toContain('이름');
    expect(ctx).toContain('연령대');
  });

  it('additionalContext 주입', async () => {
    const r = await runChainedGeneration({
      forceFlag: true,
      title: '갤럭시 S24 후기',
    });
    const ctx = buildStage3Context(r, '경쟁 데이터: 아이폰 15 Pro 가격 1,550,000원');
    expect(ctx).toContain('경쟁 데이터');
    expect(ctx).toContain('1,550,000원');
  });
});

describe('summarizeMetrics — operationsDashboard 노출용', () => {
  it('총 시간·성공 stage 카운트', async () => {
    const r = await runChainedGeneration({ forceFlag: true, title: '맛집' });
    const s = summarizeMetrics(r);
    expect(s.totalStages).toBe(5);
    expect(s.successfulStages).toBe(2); // classify + persona만
    expect(s.totalElapsedMs).toBeGreaterThanOrEqual(0);
  });
});

describe('SPEC 메모리 원칙', () => {
  it('silent 폴백 부재 — 결과에 imageSource·subWorkProvider 없음', async () => {
    const r = await runChainedGeneration({ forceFlag: true, title: '맛집' });
    const blob = JSON.stringify(r);
    expect(blob).not.toContain('imageSource');
    expect(blob).not.toContain('subWorkProvider');
  });

  it('flag OFF는 명시 fallbackReason 반환 (silent 진행 금지)', async () => {
    const r = await runChainedGeneration({ forceFlag: false });
    expect(r.fallbackReason).toBeDefined();
    expect(r.fallbackReason!.length).toBeGreaterThan(10);
  });
});
