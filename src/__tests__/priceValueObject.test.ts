/**
 * ✅ [v1.4.77 P2] Price Value Object 검증
 *
 * Opus/S19 아키텍트 최종 권고 반영:
 *   - 0 / NaN / "0원" 입력은 타입 수준에서 거부
 *   - amount() / display()는 isValid() 확인 후에만 호출 가능
 *   - 모든 가격 표시는 Price 경유로만 허용 (원시 toLocaleString()+'원' 금지)
 */
import { describe, it, expect } from 'vitest';
import { Price } from '../domain/Price';

describe('v1.4.77 P2 — Price Value Object', () => {
  describe('Price.from() — 원시 입력 변환', () => {
    it("정상 숫자 입력 → isValid()=true", () => {
      const p = Price.from(15370);
      expect(p.isValid()).toBe(true);
      expect(p.amount()).toBe(15370);
    });

    it("포맷 문자열 입력 → 숫자로 정규화", () => {
      const p = Price.from('15,370원');
      expect(p.isValid()).toBe(true);
      expect(p.amount()).toBe(15370);
    });

    it("₩ 접두어 입력 → 정상 처리", () => {
      const p = Price.from('₩15,370');
      expect(p.isValid()).toBe(true);
      expect(p.amount()).toBe(15370);
    });
  });

  describe('absent 상태 흡수 (0원 비상구 차단)', () => {
    it("0 → absent", () => {
      const p = Price.from(0);
      expect(p.isValid()).toBe(false);
      expect(p.isAbsent()).toBe(true);
    });

    it("'0' 문자열 → absent", () => {
      expect(Price.from('0').isAbsent()).toBe(true);
    });

    it("'0원' 문자열 → absent", () => {
      expect(Price.from('0원').isAbsent()).toBe(true);
    });

    it("NaN → absent", () => {
      expect(Price.from(NaN).isAbsent()).toBe(true);
    });

    it("음수 → absent", () => {
      expect(Price.from(-100).isAbsent()).toBe(true);
    });

    it("null → absent", () => {
      expect(Price.from(null).isAbsent()).toBe(true);
    });

    it("undefined → absent", () => {
      expect(Price.from(undefined).isAbsent()).toBe(true);
    });

    it("빈 문자열 → absent", () => {
      expect(Price.from('').isAbsent()).toBe(true);
    });

    it("'가격 문의' → absent", () => {
      expect(Price.from('가격 문의').isAbsent()).toBe(true);
    });

    it("'품절' → absent", () => {
      expect(Price.from('품절').isAbsent()).toBe(true);
    });
  });

  describe('absent 상태에서 amount()/display() 호출 시 throw', () => {
    it("absent에서 amount() → throw", () => {
      const p = Price.from(0);
      expect(() => p.amount()).toThrow(/called on absent Price/);
    });

    it("absent에서 display() → throw", () => {
      const p = Price.absent('test reason');
      expect(() => p.display()).toThrow(/called on absent Price/);
    });
  });

  describe('display() 포맷팅', () => {
    it("15370 → '15,370원'", () => {
      expect(Price.of(15370).display()).toBe('15,370원');
    });

    it("1000000 → '1,000,000원'", () => {
      expect(Price.of(1000000).display()).toBe('1,000,000원');
    });

    it("99 → '99원'", () => {
      expect(Price.of(99).display()).toBe('99원');
    });
  });

  describe('안전 API — displayOr() / amountOrUndefined()', () => {
    it("absent.displayOr() → 기본 '가격 문의' 반환", () => {
      expect(Price.from(0).displayOr()).toBe('가격 문의');
    });

    it("absent.displayOr(custom) → 커스텀 폴백 반환", () => {
      expect(Price.from(0).displayOr('문의 요망')).toBe('문의 요망');
    });

    it("valid.displayOr() → 정상 표시", () => {
      expect(Price.of(15370).displayOr()).toBe('15,370원');
    });

    it("absent.amountOrUndefined() → undefined (0 폴백 금지)", () => {
      expect(Price.from(0).amountOrUndefined()).toBeUndefined();
    });

    it("valid.amountOrUndefined() → 숫자 반환", () => {
      expect(Price.of(15370).amountOrUndefined()).toBe(15370);
    });
  });

  describe('absentReason — 디버깅 지원', () => {
    it("Price.absent('test reason')에 이유 저장", () => {
      expect(Price.absent('test reason').absentReason()).toBe('test reason');
    });

    it("Price.from(0)의 이유는 'invalid:' 접두어 포함", () => {
      expect(Price.from(0).absentReason()).toMatch(/invalid:/);
    });

    it("valid Price는 absentReason이 undefined", () => {
      expect(Price.of(15370).absentReason()).toBeUndefined();
    });
  });

  describe('실전 사용 패턴', () => {
    it("타입 가드 패턴: isValid() 분기 후 안전 접근", () => {
      const p = Price.from('15,370원');
      if (p.isValid()) {
        expect(p.amount()).toBeGreaterThan(0);
        expect(p.display()).toMatch(/원$/);
      } else {
        throw new Error('should not reach here');
      }
    });

    it("absent 경로: 가격 문의 폴백", () => {
      const p = Price.from('0원');
      const text = p.isValid() ? `현재 ${p.display()}에 판매 중` : '가격 문의';
      expect(text).toBe('가격 문의');
    });

    it("체이닝: Price.from → displayOr (한 줄 안전 표시)", () => {
      expect(Price.from(undefined).displayOr('N/A')).toBe('N/A');
      expect(Price.from(15370).displayOr('N/A')).toBe('15,370원');
    });
  });
});
