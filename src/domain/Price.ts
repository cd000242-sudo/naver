/**
 * ✅ [v1.4.77 P2] Price Value Object
 *
 * 목적 (Opus/S19 권고):
 *   - price의 "0 / NaN / '0원' / null" 상태를 타입 시스템이 거부하게 만든다
 *   - 모든 가격 표시는 Price.display()를 통해서만 — 원시 toLocaleString()+'원' 금지
 *   - amount()는 isValid() 확인 후에만 호출 가능 (타입 가드)
 *
 * 설계:
 *   - Price.from(raw) → 항상 성공 (유효하지 않으면 absent 상태)
 *   - Price.isValid() → type predicate (user-defined type guard)
 *   - amount() / display() → absent면 throw (의도적 실패)
 *
 * 사용:
 *   const price = Price.from(rawInput);
 *   if (price.isValid()) {
 *     send(`현재 ${price.display()}에 판매 중`);
 *   } else {
 *     send('가격 문의');  // absent 상태
 *   }
 */

import { parsePrice } from '../services/priceNormalizer.js';

type PriceState =
  | { kind: 'valid'; amount: number }
  | { kind: 'absent'; reason?: string };

export class Price {
  private constructor(private readonly state: PriceState) {}

  /** 원시 입력을 Price로 변환. null/0/NaN/"0원" 전부 absent 상태로 흡수. */
  static from(raw: unknown, reason?: string): Price {
    const normalized = parsePrice(raw as any);
    if (normalized === null || !Number.isFinite(normalized) || normalized <= 0) {
      return new Price({ kind: 'absent', reason: reason ?? `invalid: ${JSON.stringify(raw)}` });
    }
    return new Price({ kind: 'valid', amount: normalized });
  }

  /** absent 상태를 명시적으로 생성 (가격 없음 시그널) */
  static absent(reason: string = 'no price available'): Price {
    return new Price({ kind: 'absent', reason });
  }

  /** 명시적 양의 정수로 생성 — 단 0/NaN이 들어오면 여전히 absent */
  static of(amount: number): Price {
    return Price.from(amount);
  }

  /** 타입 가드: isValid() 확인 후에만 amount/display 호출 가능 */
  isValid(): this is Price & { readonly _validBrand: true } {
    return this.state.kind === 'valid';
  }

  isAbsent(): boolean {
    return this.state.kind === 'absent';
  }

  /** 양의 정수 금액 반환. absent면 throw. */
  amount(): number {
    if (this.state.kind !== 'valid') {
      throw new Error(
        `Price.amount() called on absent Price (reason: ${this.state.reason ?? 'unknown'})`,
      );
    }
    return this.state.amount;
  }

  /** 한국어 통화 포맷 "15,370원". absent면 throw. */
  display(): string {
    if (this.state.kind !== 'valid') {
      throw new Error(
        `Price.display() called on absent Price (reason: ${this.state.reason ?? 'unknown'})`,
      );
    }
    return `${this.state.amount.toLocaleString('ko-KR')}원`;
  }

  /** 안전한 표시: absent면 fallback 문자열 반환 ("가격 문의") */
  displayOr(fallback: string = '가격 문의'): string {
    return this.isValid() ? this.display() : fallback;
  }

  /** 안전한 숫자: absent면 undefined 반환 (0 폴백 금지) */
  amountOrUndefined(): number | undefined {
    return this.state.kind === 'valid' ? this.state.amount : undefined;
  }

  /** 디버그용 reason (absent 상태의 원인) */
  absentReason(): string | undefined {
    return this.state.kind === 'absent' ? this.state.reason : undefined;
  }
}
