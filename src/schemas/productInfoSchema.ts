/**
 * ✅ [v1.4.77] ProductInfo 경계 스키마 — 쇼핑커넥트 데이터 파이프라인 타입 벽
 *
 * 목적:
 *   - 크롤러 출력을 메타데이터로 확정하기 전에 "0" / "0원" / 음수 / NaN 차단
 *   - TypeScript 컴파일만으로는 숫자 0이 number 타입을 통과해 metadata에 저장되던 버그 원천 차단
 *   - Opus/S19 아키텍트 권고: Zod 대신 경량 타입 가드로 구현 (런타임 의존성 0)
 *
 * 사용처:
 *   - sourceAssembler.ts: metadata.productInfo 확정 직전
 *   - productSpecCrawler.ts: 크롤러 반환값 검증
 *   - bestProductCollector.ts: 수집기 출력 검증
 */

import { parsePrice } from '../services/priceNormalizer.js';

export interface RawProductInfoCandidate {
  name?: unknown;
  price?: unknown;
  brand?: unknown;
  description?: unknown;
  [key: string]: unknown;
}

/** 검증 통과한 ProductInfo — price는 반드시 양의 정수 또는 undefined */
export interface ValidatedProductInfo {
  name: string;
  /** 양의 정수만 허용. 0 / NaN / 음수 / "0원" / null 전부 undefined로 정규화됨 */
  price?: number;
  brand?: string;
  description?: string;
}

export interface ProductInfoValidationResult {
  ok: boolean;
  data?: ValidatedProductInfo;
  issues: string[];
}

/**
 * 크롤러/수집기 출력을 ValidatedProductInfo로 정규화.
 * price에 0·NaN·"0원"이 들어와도 undefined로 교체.
 * name이 비어있으면 실패.
 */
export function validateProductInfo(raw: RawProductInfoCandidate): ProductInfoValidationResult {
  const issues: string[] = [];

  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (!name) {
    issues.push('name 필드 누락 또는 빈 문자열');
    return { ok: false, issues };
  }

  // price는 parsePrice로 정규화 — 0/NaN/"0원"/null 전부 null 반환
  const normalizedPrice = parsePrice(raw.price as any);
  const priceForSchema: number | undefined =
    normalizedPrice !== null && Number.isFinite(normalizedPrice) && normalizedPrice > 0
      ? normalizedPrice
      : undefined;

  if (raw.price !== undefined && raw.price !== null && raw.price !== '' && priceForSchema === undefined) {
    issues.push(`price가 유효하지 않음 (입력: ${JSON.stringify(raw.price)}) → undefined로 정규화`);
  }

  const brand = typeof raw.brand === 'string' ? raw.brand.trim() || undefined : undefined;
  const description =
    typeof raw.description === 'string' ? raw.description.trim() || undefined : undefined;

  const data: ValidatedProductInfo = {
    name,
    price: priceForSchema,
    brand,
    description,
  };

  return { ok: true, data, issues };
}

/**
 * 엄격 모드 — 검증 실패 시 throw. Value Object 초기화 자리에 사용.
 * sourceAssembler, bestProductCollector에서 호출.
 */
export function assertValidProductInfo(raw: RawProductInfoCandidate): ValidatedProductInfo {
  const result = validateProductInfo(raw);
  if (!result.ok || !result.data) {
    throw new Error(
      `[ProductInfoSchema] 검증 실패: ${result.issues.join(' | ')}\n입력: ${JSON.stringify(raw).substring(0, 200)}`,
    );
  }
  return result.data;
}
