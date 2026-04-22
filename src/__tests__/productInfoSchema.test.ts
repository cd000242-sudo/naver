/**
 * ✅ [v1.4.77 P1] ProductInfo 경계 스키마 검증
 *
 * Opus/S19 아키텍트 권고:
 *   "0이 metadata를 통해 우회하는 비상구" 를 타입 시스템으로 원천 차단
 *
 * 검증 범위:
 *   - 0 / "0" / "0원" / NaN / 음수 / null / undefined 모두 price=undefined로 정규화
 *   - name 누락 시 ok=false 반환
 *   - 유효한 양의 정수만 통과
 */
import { describe, it, expect } from 'vitest';
import {
  validateProductInfo,
  assertValidProductInfo,
} from '../schemas/productInfoSchema';

describe('v1.4.77 P1 — ProductInfo 스키마 타입 벽', () => {
  describe('0원 비상구 원천 차단', () => {
    it("price: 0 (숫자) → undefined로 정규화", () => {
      const result = validateProductInfo({ name: '테스트', price: 0 });
      expect(result.ok).toBe(true);
      expect(result.data?.price).toBeUndefined();
      expect(result.issues.length).toBeGreaterThan(0);
    });

    it("price: '0' (문자열) → undefined", () => {
      const result = validateProductInfo({ name: '테스트', price: '0' });
      expect(result.data?.price).toBeUndefined();
    });

    it("price: '0원' → undefined", () => {
      const result = validateProductInfo({ name: '테스트', price: '0원' });
      expect(result.data?.price).toBeUndefined();
    });

    it("price: NaN → undefined", () => {
      const result = validateProductInfo({ name: '테스트', price: NaN });
      expect(result.data?.price).toBeUndefined();
    });

    it("price: -100 (음수) → undefined", () => {
      const result = validateProductInfo({ name: '테스트', price: -100 });
      expect(result.data?.price).toBeUndefined();
    });

    it("price: null → undefined (이슈 없음)", () => {
      const result = validateProductInfo({ name: '테스트', price: null });
      expect(result.ok).toBe(true);
      expect(result.data?.price).toBeUndefined();
    });

    it("price 누락 → undefined (정상)", () => {
      const result = validateProductInfo({ name: '테스트' });
      expect(result.ok).toBe(true);
      expect(result.data?.price).toBeUndefined();
    });
  });

  describe('유효 가격 통과', () => {
    it("price: 15370 → 15370 (정상)", () => {
      const result = validateProductInfo({ name: '테스트', price: 15370 });
      expect(result.data?.price).toBe(15370);
    });

    it("price: '15,370원' → 15370", () => {
      const result = validateProductInfo({ name: '테스트', price: '15,370원' });
      expect(result.data?.price).toBe(15370);
    });

    it("price: '₩15,370' → 15370", () => {
      const result = validateProductInfo({ name: '테스트', price: '₩15,370' });
      expect(result.data?.price).toBe(15370);
    });
  });

  describe('name 필수 검증', () => {
    it("name 누락 → ok=false", () => {
      const result = validateProductInfo({ price: 15370 });
      expect(result.ok).toBe(false);
      expect(result.issues).toContain('name 필드 누락 또는 빈 문자열');
    });

    it("name이 빈 문자열 → ok=false", () => {
      const result = validateProductInfo({ name: '', price: 15370 });
      expect(result.ok).toBe(false);
    });

    it("name이 공백만 → ok=false", () => {
      const result = validateProductInfo({ name: '   ', price: 15370 });
      expect(result.ok).toBe(false);
    });
  });

  describe('assertValidProductInfo 엄격 모드', () => {
    it("유효한 입력은 ValidatedProductInfo 반환", () => {
      const data = assertValidProductInfo({ name: '테스트', price: 15370 });
      expect(data.name).toBe('테스트');
      expect(data.price).toBe(15370);
    });

    it("name 누락 시 throw", () => {
      expect(() => assertValidProductInfo({ price: 15370 })).toThrow(
        /ProductInfoSchema/,
      );
    });

    it("0원 입력은 throw 안 함 (price만 undefined로 정규화)", () => {
      const data = assertValidProductInfo({ name: '테스트', price: 0 });
      expect(data.name).toBe('테스트');
      expect(data.price).toBeUndefined();
    });
  });

  describe('brand / description 선택 필드', () => {
    it("brand 정상 저장", () => {
      const result = validateProductInfo({ name: '테스트', brand: '삼성' });
      expect(result.data?.brand).toBe('삼성');
    });

    it("brand 빈 문자열 → undefined", () => {
      const result = validateProductInfo({ name: '테스트', brand: '' });
      expect(result.data?.brand).toBeUndefined();
    });

    it("description trim 적용", () => {
      const result = validateProductInfo({
        name: '테스트',
        description: '  상품 설명  ',
      });
      expect(result.data?.description).toBe('상품 설명');
    });
  });
});
