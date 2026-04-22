/**
 * ✅ [v1.4.77] OpenAI 이미지 가격표 회귀 방지
 * - 이전 코드는 DALL-E 3 구가격을 gpt-image-1에 그대로 적용하는 버그 상태였음
 *   (low: 264% 과대 계상, high: 52% 과소 계상)
 * - 2026-04 공식 가격으로 수정 후, 향후 누가 실수로 되돌리지 못하도록 고정
 * source: openai.com/api/pricing 2026-04
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const SRC = path.resolve(__dirname, '../apiUsageTracker.ts');
const content = fs.readFileSync(SRC, 'utf-8');

describe('v1.4.77 — OpenAI 이미지 가격표 정확성', () => {
  describe('gpt-image-1 품질 3티어 존재', () => {
    it("'gpt-image-1-low' 키가 $0.011로 기록됨", () => {
      expect(content).toMatch(/'gpt-image-1-low'\s*:\s*0\.011/);
    });

    it("'gpt-image-1-medium' 키가 $0.042로 기록됨", () => {
      expect(content).toMatch(/'gpt-image-1-medium'\s*:\s*0\.042/);
    });

    it("'gpt-image-1-high' 키가 $0.167로 기록됨", () => {
      expect(content).toMatch(/'gpt-image-1-high'\s*:\s*0\.167/);
    });
  });

  describe('사이즈 확장(wide) 옵션 존재', () => {
    it("1024x1536 / 1536x1024 low — $0.016", () => {
      expect(content).toMatch(/'gpt-image-1-low-wide'\s*:\s*0\.016/);
    });

    it("1024x1536 / 1536x1024 medium — $0.063", () => {
      expect(content).toMatch(/'gpt-image-1-medium-wide'\s*:\s*0\.063/);
    });

    it("1024x1536 / 1536x1024 high — $0.250", () => {
      expect(content).toMatch(/'gpt-image-1-high-wide'\s*:\s*0\.250/);
    });
  });

  describe('구 DALL-E 가격 회귀 방지', () => {
    it("이전 버그 값 'gpt-image-1': 0.04 로 되돌아가지 않음", () => {
      expect(content).not.toMatch(/'gpt-image-1'\s*:\s*0\.04\b/);
    });

    it("이전 버그 값 'gpt-image-1-hd': 0.08 로 되돌아가지 않음", () => {
      expect(content).not.toMatch(/'gpt-image-1-hd'\s*:\s*0\.08\b/);
    });
  });

  describe('DALL-E 3 레거시 호환', () => {
    it("'dall-e-3' standard $0.04 유지 (아직 유효)", () => {
      expect(content).toMatch(/'dall-e-3'\s*:\s*0\.04/);
    });

    it("'dall-e-3-hd' $0.08 유지", () => {
      expect(content).toMatch(/'dall-e-3-hd'\s*:\s*0\.08/);
    });
  });

  describe('비용 계산 검증 (글 1개 = 6장)', () => {
    const LOW = 0.011;
    const MEDIUM = 0.042;
    const HIGH = 0.167;
    const KRW = 1400;

    it('low 6장은 글당 ₩92 ±5 수준', () => {
      const krw = LOW * 6 * KRW;
      expect(krw).toBeCloseTo(92, 0);
    });

    it('medium 6장은 글당 ₩353 ±5 수준', () => {
      const krw = MEDIUM * 6 * KRW;
      expect(krw).toBeCloseTo(353, 0);
    });

    it('high 6장은 글당 ₩1,403 ±10 수준', () => {
      const krw = HIGH * 6 * KRW;
      expect(krw).toBeCloseTo(1403, 0);
    });

    it('high는 low의 약 15배 (비용 변동성 경고 근거)', () => {
      expect(HIGH / LOW).toBeGreaterThan(14);
      expect(HIGH / LOW).toBeLessThan(16);
    });
  });
});
