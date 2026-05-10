/**
 * SPEC-CONVERSION-001 L4-2.2 — 전환 데이터 저장소
 *
 * 발행한 글의 클릭·전환·구매 이벤트를 ConversionEvent 형태로 누적 저장.
 * 추후 RLHF 프롬프트 튜닝(L4-2.3·2.4)의 입력 데이터로 활용.
 *
 * 저장소 인터페이스 + 인메모리/JSON 파일 두 가지 구현체 제공.
 * SQLite·외부 DB 어댑터는 별도 모듈로 추후 작성.
 *
 * 추적 수단(UTM·픽셀·네이버 애널리틱스)는 L4-2.1 결정 의존 — 본 모듈은
 * *저장 인터페이스*만 제공. 호출자가 이벤트 수집·매핑 책임.
 *
 * 메모리 [silent 폴백 금지]: 저장 실패는 명시 throw.
 * 메모리 [추정 효과 금지]: 전환률 약속 X — 누적 데이터로 calibrate.
 *
 * 파일 한도 250줄 준수.
 */

import * as fs from 'fs';
import * as path from 'path';

export type ConversionEventType = 'impression' | 'click' | 'add_to_cart' | 'purchase' | 'unknown';

export interface ConversionEvent {
  readonly postId: string;             // 발행 글 식별자 (URL hash 또는 내부 ID)
  readonly accountId?: string;         // 다계정 운영 시 브랜드 ID
  readonly category?: string;          // PersonaCategory
  readonly eventType: ConversionEventType;
  readonly timestamp: string;          // ISO 8601
  readonly value?: number;             // 구매 금액 (purchase일 때만)
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface ConversionAggregate {
  readonly postId: string;
  readonly impressionCount: number;
  readonly clickCount: number;
  readonly addToCartCount: number;
  readonly purchaseCount: number;
  readonly totalValue: number;
  readonly clickRate: number;          // click / impression
  readonly conversionRate: number;     // purchase / click
  readonly firstSeenAt: string;
  readonly lastSeenAt: string;
}

export interface ConversionQuery {
  readonly postId?: string;
  readonly accountId?: string;
  readonly category?: string;
  readonly eventType?: ConversionEventType;
  readonly fromIso?: string;
  readonly toIso?: string;
  readonly limit?: number;
}

export interface ConversionStore {
  record(event: ConversionEvent): Promise<void>;
  recordBatch(events: readonly ConversionEvent[]): Promise<void>;
  query(q: ConversionQuery): Promise<readonly ConversionEvent[]>;
  aggregateByPost(postId: string): Promise<ConversionAggregate | null>;
  size(): Promise<number>;
  clear(): Promise<void>;
}

function validateEvent(e: ConversionEvent): void {
  if (!e.postId || typeof e.postId !== 'string') {
    throw new Error('CONVERSION_POSTID_INVALID');
  }
  if (!e.eventType) {
    throw new Error('CONVERSION_EVENT_TYPE_MISSING');
  }
  if (!e.timestamp || Number.isNaN(new Date(e.timestamp).getTime())) {
    throw new Error(`CONVERSION_TIMESTAMP_INVALID: ${e.timestamp}`);
  }
  if (e.value !== undefined && (Number.isNaN(e.value) || e.value < 0)) {
    throw new Error(`CONVERSION_VALUE_INVALID: ${e.value}`);
  }
}

function eventMatches(e: ConversionEvent, q: ConversionQuery): boolean {
  if (q.postId && e.postId !== q.postId) return false;
  if (q.accountId && e.accountId !== q.accountId) return false;
  if (q.category && e.category !== q.category) return false;
  if (q.eventType && e.eventType !== q.eventType) return false;
  if (q.fromIso && e.timestamp < q.fromIso) return false;
  if (q.toIso && e.timestamp > q.toIso) return false;
  return true;
}

export class InMemoryConversionStore implements ConversionStore {
  protected readonly events: ConversionEvent[] = [];

  async record(event: ConversionEvent): Promise<void> {
    validateEvent(event);
    this.events.push(event);
  }

  async recordBatch(events: readonly ConversionEvent[]): Promise<void> {
    for (const e of events) validateEvent(e);
    this.events.push(...events);
  }

  async query(q: ConversionQuery): Promise<readonly ConversionEvent[]> {
    const matched = this.events.filter((e) => eventMatches(e, q));
    if (q.limit !== undefined && q.limit >= 0) return matched.slice(0, q.limit);
    return matched;
  }

  async aggregateByPost(postId: string): Promise<ConversionAggregate | null> {
    const matched = this.events.filter((e) => e.postId === postId);
    if (matched.length === 0) return null;

    let imp = 0, click = 0, cart = 0, purchase = 0, total = 0;
    let firstAt = matched[0].timestamp;
    let lastAt = matched[0].timestamp;
    for (const e of matched) {
      switch (e.eventType) {
        case 'impression': imp++; break;
        case 'click': click++; break;
        case 'add_to_cart': cart++; break;
        case 'purchase': purchase++; total += e.value ?? 0; break;
      }
      if (e.timestamp < firstAt) firstAt = e.timestamp;
      if (e.timestamp > lastAt) lastAt = e.timestamp;
    }
    return {
      postId,
      impressionCount: imp,
      clickCount: click,
      addToCartCount: cart,
      purchaseCount: purchase,
      totalValue: total,
      clickRate: imp > 0 ? click / imp : 0,
      conversionRate: click > 0 ? purchase / click : 0,
      firstSeenAt: firstAt,
      lastSeenAt: lastAt,
    };
  }

  async size(): Promise<number> {
    return this.events.length;
  }

  async clear(): Promise<void> {
    this.events.length = 0;
  }
}

/**
 * JSON 파일 기반 영속 구현. 단일 파일에 events 배열 저장.
 * 동시 접근·트랜잭션 미지원 — 단일 프로세스용. 운영은 SQLite 어댑터 권장.
 */
export class FileConversionStore extends InMemoryConversionStore {
  constructor(private readonly filePath: string) {
    super();
    this.loadSync();
  }

  private loadSync(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw) as ConversionEvent[];
        if (Array.isArray(parsed)) this.events.push(...parsed);
      }
    } catch (err) {
      throw new Error(`CONVERSION_STORE_LOAD_FAILED: ${(err as Error).message}`);
    }
  }

  private flushSync(): void {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.events, null, 2), 'utf-8');
    } catch (err) {
      throw new Error(`CONVERSION_STORE_FLUSH_FAILED: ${(err as Error).message}`);
    }
  }

  override async record(event: ConversionEvent): Promise<void> {
    await super.record(event);
    this.flushSync();
  }

  override async recordBatch(events: readonly ConversionEvent[]): Promise<void> {
    await super.recordBatch(events);
    this.flushSync();
  }

  override async clear(): Promise<void> {
    await super.clear();
    this.flushSync();
  }
}
