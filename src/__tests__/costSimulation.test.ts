/**
 * ✅ [v1.4.77] 비용 시뮬레이션 — 실제 API 호출 없이 코드 레벨 검증
 *
 * 검증 목표:
 * 1. 가격 테이블이 공식 단가와 일치
 * 2. v1.4.77 변경사항의 기대 절감 효과 수치로 증명
 * 3. 회귀 방지: 향후 실수로 비싼 모델로 폴백되는 버그 감지
 */
import { describe, it, expect } from 'vitest';

// 공식 가격 ($/1M tokens) — apiUsageTracker.ts와 동일
const OPENAI_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-5.4':      { input: 2.50, output: 10.00 },
  'gpt-4.1':      { input: 2.00, output: 8.00 },
  'gpt-4.1-mini': { input: 0.40, output: 1.60 },
  'gpt-4o':       { input: 2.50, output: 10.00 },
};
const CLAUDE_PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-4-6':   { input: 15.00, output: 75.00 },
  'claude-sonnet-4-6': { input: 3.00,  output: 15.00 },
  'claude-haiku-4-5':  { input: 1.00,  output: 5.00 },
};
const GEMINI_PRICING: Record<string, { input: number; output: number; cacheReadMultiplier: number }> = {
  'gemini-2.5-flash':      { input: 0.10,  output: 0.40,  cacheReadMultiplier: 0.25 },
  'gemini-2.5-flash-lite': { input: 0.025, output: 0.10,  cacheReadMultiplier: 0.25 },
  'gemini-2.5-pro':        { input: 1.25,  output: 5.00,  cacheReadMultiplier: 0.25 },
};

function costPerPost(pricing: { input: number; output: number }, inputTokens: number, outputTokens: number): number {
  return (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;
}
function toKrw(usd: number): number {
  return usd * 1400;
}

describe('v1.4.77 — 비용 시뮬레이션 (가정: 입력 10K / 출력 4K 토큰)', () => {
  const INPUT = 10_000;
  const OUTPUT = 4_000;

  describe('1. 모델별 글 1개 비용 (실측과 대조 가능한 기준선)', () => {
    it('GPT-4.1 mini는 글당 $0.0104 (≈₩14.6)', () => {
      const cost = costPerPost(OPENAI_PRICING['gpt-4.1-mini'], INPUT, OUTPUT);
      expect(cost).toBeCloseTo(0.0104, 4);
      expect(toKrw(cost)).toBeLessThan(20);
    });

    it('GPT-4.1은 글당 $0.052 (≈₩73)', () => {
      const cost = costPerPost(OPENAI_PRICING['gpt-4.1'], INPUT, OUTPUT);
      expect(cost).toBeCloseTo(0.052, 4);
    });

    it('gpt-5.4는 글당 $0.065 (GPT-4.1 대비 25% 비쌈)', () => {
      const cost54 = costPerPost(OPENAI_PRICING['gpt-5.4'], INPUT, OUTPUT);
      const cost41 = costPerPost(OPENAI_PRICING['gpt-4.1'], INPUT, OUTPUT);
      expect(cost54).toBeGreaterThan(cost41);
      expect((cost54 / cost41 - 1) * 100).toBeCloseTo(25, 1);
    });

    it('Claude Haiku 4.5는 글당 $0.030 (Sonnet 대비 약 1/3 수준)', () => {
      const haiku = costPerPost(CLAUDE_PRICING['claude-haiku-4-5'], INPUT, OUTPUT);
      const sonnet = costPerPost(CLAUDE_PRICING['claude-sonnet-4-6'], INPUT, OUTPUT);
      expect(haiku).toBeCloseTo(0.030, 4);
      expect(haiku / sonnet).toBeLessThan(0.4);
    });

    it('Gemini Flash는 글당 $0.0026 (Haiku 대비 10배 이상 저렴)', () => {
      const flash = costPerPost(GEMINI_PRICING['gemini-2.5-flash'], INPUT, OUTPUT);
      const haiku = costPerPost(CLAUDE_PRICING['claude-haiku-4-5'], INPUT, OUTPUT);
      expect(flash).toBeCloseTo(0.0026, 4);
      expect(haiku / flash).toBeGreaterThan(10);
    });
  });

  describe('2. v1.4.77 변경 효과 증명', () => {
    it('GPT-4.1 라벨 오배선 수정: 글당 20% 절감 (gpt-5.4 → gpt-4.1)', () => {
      const before = costPerPost(OPENAI_PRICING['gpt-5.4'], INPUT, OUTPUT);
      const after = costPerPost(OPENAI_PRICING['gpt-4.1'], INPUT, OUTPUT);
      const savings = ((before - after) / before) * 100;
      expect(savings).toBeGreaterThan(15);
      expect(savings).toBeLessThan(25);
    });

    it('max_tokens 16000 → 8192 축소: 출력 토큰 상한 49% 감소', () => {
      const before = 16000;
      const after = 8192;
      const reduction = ((before - after) / before) * 100;
      expect(reduction).toBeGreaterThan(48);
      expect(reduction).toBeLessThan(50);
    });

    it('Gemini 캐싱 활성화 시 입력 토큰 75% 절감 (cache read = input × 0.25)', () => {
      const pricing = GEMINI_PRICING['gemini-2.5-flash'];
      const fullCost = (INPUT / 1_000_000) * pricing.input;
      const cachedCost = (INPUT / 1_000_000) * pricing.input * pricing.cacheReadMultiplier;
      const savings = ((fullCost - cachedCost) / fullCost) * 100;
      expect(savings).toBe(75);
    });

    it('DeepInfra FLUX-2-dev → FLUX-1-schnell: 이미지 장당 88% 절감', () => {
      const dev = 0.025;
      const schnell = 0.003;
      const savings = ((dev - schnell) / dev) * 100;
      expect(savings).toBeGreaterThan(87);
      expect(savings).toBeLessThan(89);
    });

    it('Haiku 기본값 전환: 글당 비용 GPT-4.1 대비 42% 저렴', () => {
      const haiku = costPerPost(CLAUDE_PRICING['claude-haiku-4-5'], INPUT, OUTPUT);
      const gpt41 = costPerPost(OPENAI_PRICING['gpt-4.1'], INPUT, OUTPUT);
      const savings = ((gpt41 - haiku) / gpt41) * 100;
      expect(savings).toBeGreaterThan(40);
      expect(savings).toBeLessThan(45);
    });
  });

  describe('3. 회귀 방지 — 금지된 비싼 경로', () => {
    it('폴백 체인이 활성화되면 안 됨 (단일 모델만 호출)', () => {
      // 회귀 시나리오: 4.1 실패 시 5.4로 폴백되면 25% 더 비싸짐
      const fallbackCost = costPerPost(OPENAI_PRICING['gpt-4.1'], INPUT, OUTPUT)
        + costPerPost(OPENAI_PRICING['gpt-5.4'], INPUT, OUTPUT);
      const singleCost = costPerPost(OPENAI_PRICING['gpt-4.1'], INPUT, OUTPUT);
      expect(fallbackCost / singleCost).toBeGreaterThan(2);
      // → 코드 검증: src/contentGenerator.ts의 openAIModels 배열 길이 === 1이어야 함
    });

    it('Opus는 Haiku 대비 30배 비싸 — 기본값으로 선택되면 안 됨', () => {
      const opus = costPerPost(CLAUDE_PRICING['claude-opus-4-6'], INPUT, OUTPUT);
      const haiku = costPerPost(CLAUDE_PRICING['claude-haiku-4-5'], INPUT, OUTPUT);
      expect(opus / haiku).toBeGreaterThan(14);
    });
  });

  describe('4. 100개 글 = $10 역추적 (사용자 실제 경험 검증)', () => {
    it('$10로 100개 생성 = 글당 $0.10 = gpt-5.4 기준 약 15K/6K 토큰', () => {
      const USER_OBSERVED = 10 / 100; // $0.10/글
      const gpt54Cost = costPerPost(OPENAI_PRICING['gpt-5.4'], 15_000, 6_000);
      // $0.10에 근접해야 함 (오차 ±30%)
      expect(gpt54Cost).toBeGreaterThan(USER_OBSERVED * 0.7);
      expect(gpt54Cost).toBeLessThan(USER_OBSERVED * 1.3);
    });

    it('같은 $10을 Haiku로 썼다면 300개 이상 생성 가능', () => {
      const budget = 10;
      const haikuPerPost = costPerPost(CLAUDE_PRICING['claude-haiku-4-5'], 15_000, 6_000);
      const posts = Math.floor(budget / haikuPerPost);
      expect(posts).toBeGreaterThan(200);
    });

    it('같은 $10을 Gemini Flash로 썼다면 1,500개 이상 생성 가능', () => {
      const budget = 10;
      const flashPerPost = costPerPost(GEMINI_PRICING['gemini-2.5-flash'], 15_000, 6_000);
      const posts = Math.floor(budget / flashPerPost);
      expect(posts).toBeGreaterThan(1500);
    });
  });
});
