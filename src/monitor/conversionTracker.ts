/**
 * SPEC-CONVERSION-001 L4-2.1 — 전환 추적 어댑터 추상화
 *
 * UTM 파라미터·픽셀·네이버 애널리틱스 3종 추적 수단을 *공통 인터페이스*로
 * 추상화. 사용자 결정 후 1줄 변경으로 활성화 가능.
 *
 * 사용 흐름:
 *   1. tracker.buildLink(postId, target) → UTM 또는 픽셀 링크 생성
 *   2. tracker.recordEvent(event) → conversionStore에 누적
 *
 * 본 모듈은 *인터페이스 + UTM/Noop 구현*만 제공. 픽셀·애널리틱스는 별도 어댑터.
 *
 * 메모리 [silent 폴백 금지]: 잘못된 입력은 throw, fallbackReason 명시.
 *
 * 파일 한도 200줄 준수.
 */

import type {
  ConversionEvent,
  ConversionEventType,
  ConversionStore,
} from './conversionStore';

export interface TrackingLinkInput {
  readonly postId: string;
  readonly targetUrl: string;
  readonly accountId?: string;
  readonly category?: string;
  readonly campaign?: string;
}

export interface TrackingLinkResult {
  readonly url: string;
  readonly trackerType: 'utm' | 'pixel' | 'analytics' | 'noop';
  readonly addedParams: readonly string[];
}

export interface ConversionTracker {
  readonly type: 'utm' | 'pixel' | 'analytics' | 'noop';
  buildLink(input: TrackingLinkInput): TrackingLinkResult;
  recordEvent(event: ConversionEvent): Promise<void>;
}

// ── UTM 어댑터 ──

export interface UtmTrackerOptions {
  readonly source?: string;
  readonly medium?: string;
  readonly defaultCampaign?: string;
}

export class UtmConversionTracker implements ConversionTracker {
  readonly type = 'utm' as const;

  constructor(
    private readonly store: ConversionStore,
    private readonly options: UtmTrackerOptions = {},
  ) {}

  buildLink(input: TrackingLinkInput): TrackingLinkResult {
    if (!input.targetUrl || !input.postId) {
      throw new Error('UTM_LINK_INPUT_INVALID: targetUrl·postId 필수');
    }
    let url: URL;
    try {
      url = new URL(input.targetUrl);
    } catch {
      throw new Error(`UTM_TARGET_URL_INVALID: ${input.targetUrl}`);
    }
    const addedParams: string[] = [];
    const setIfMissing = (key: string, value: string): void => {
      if (!url.searchParams.has(key) && value) {
        url.searchParams.set(key, value);
        addedParams.push(key);
      }
    };
    setIfMissing('utm_source', this.options.source ?? 'naver-blog');
    setIfMissing('utm_medium', this.options.medium ?? 'affiliate');
    setIfMissing('utm_campaign', input.campaign ?? this.options.defaultCampaign ?? input.postId);
    setIfMissing('utm_content', input.postId);
    if (input.accountId) setIfMissing('utm_term', input.accountId);
    return { url: url.toString(), trackerType: 'utm', addedParams };
  }

  async recordEvent(event: ConversionEvent): Promise<void> {
    await this.store.record(event);
  }
}

// ── Pixel 어댑터 (skeleton — 픽셀 엔드포인트 결정 시 endpoint 주입) ──

export interface PixelTrackerOptions {
  readonly endpoint: string;          // 픽셀 수집 서버 URL
  readonly apiKey?: string;
}

export class PixelConversionTracker implements ConversionTracker {
  readonly type = 'pixel' as const;

  constructor(
    private readonly store: ConversionStore,
    private readonly options: PixelTrackerOptions,
  ) {
    if (!options.endpoint) throw new Error('PIXEL_ENDPOINT_REQUIRED');
  }

  buildLink(input: TrackingLinkInput): TrackingLinkResult {
    if (!input.targetUrl || !input.postId) {
      throw new Error('PIXEL_LINK_INPUT_INVALID');
    }
    // 픽셀은 본문 안에 1px 이미지 태그로 삽입. buildLink은 *redirect URL* 반환 형태.
    const params = new URLSearchParams();
    params.set('p', input.postId);
    params.set('u', input.targetUrl);
    if (input.accountId) params.set('a', input.accountId);
    const url = `${this.options.endpoint}?${params.toString()}`;
    return { url, trackerType: 'pixel', addedParams: ['p', 'u'] };
  }

  async recordEvent(event: ConversionEvent): Promise<void> {
    // 픽셀 서버에서 webhook으로 수집 → 본 함수는 webhook handler에서 호출
    await this.store.record(event);
  }
}

// ── Noop 어댑터 (개발·테스트·미결정 단계) ──

export class NoopConversionTracker implements ConversionTracker {
  readonly type = 'noop' as const;

  constructor(private readonly store: ConversionStore) {}

  buildLink(input: TrackingLinkInput): TrackingLinkResult {
    if (!input.targetUrl) throw new Error('NOOP_TARGET_URL_INVALID');
    return { url: input.targetUrl, trackerType: 'noop', addedParams: [] };
  }

  async recordEvent(event: ConversionEvent): Promise<void> {
    await this.store.record(event);
  }
}

// ── 팩토리 ──

export type TrackerKind = 'utm' | 'pixel' | 'analytics' | 'noop';

export interface CreateTrackerInput {
  readonly kind: TrackerKind;
  readonly store: ConversionStore;
  readonly utm?: UtmTrackerOptions;
  readonly pixel?: PixelTrackerOptions;
}

export function createConversionTracker(input: CreateTrackerInput): ConversionTracker {
  switch (input.kind) {
    case 'utm':
      return new UtmConversionTracker(input.store, input.utm ?? {});
    case 'pixel':
      if (!input.pixel) throw new Error('PIXEL_OPTIONS_REQUIRED');
      return new PixelConversionTracker(input.store, input.pixel);
    case 'analytics':
      throw new Error('ANALYTICS_TRACKER_NOT_IMPLEMENTED: 네이버 애널리틱스 어댑터 미구현');
    case 'noop':
      return new NoopConversionTracker(input.store);
    default:
      throw new Error(`UNKNOWN_TRACKER_KIND: ${(input as any).kind as string}`);
  }
}

/**
 * 호출자 편의 — eventType + postId만으로 이벤트 객체 생성.
 */
export function makeConversionEvent(
  postId: string,
  eventType: ConversionEventType,
  extras?: Partial<ConversionEvent>,
): ConversionEvent {
  return {
    postId,
    eventType,
    timestamp: new Date().toISOString(),
    ...extras,
  };
}
