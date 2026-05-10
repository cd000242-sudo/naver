/**
 * SPEC-CONVERSION-001 L4-2.1 — conversionTracker 단위 테스트.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  UtmConversionTracker,
  PixelConversionTracker,
  NoopConversionTracker,
  createConversionTracker,
  makeConversionEvent,
} from '../monitor/conversionTracker';
import { InMemoryConversionStore } from '../monitor/conversionStore';

describe('UtmConversionTracker', () => {
  let store: InMemoryConversionStore;
  let tracker: UtmConversionTracker;

  beforeEach(() => {
    store = new InMemoryConversionStore();
    tracker = new UtmConversionTracker(store, { source: 'naver-blog', medium: 'affiliate' });
  });

  it('UTM 파라미터 자동 부여', () => {
    const r = tracker.buildLink({
      postId: 'p1',
      targetUrl: 'https://shop.example.com/product/123',
      accountId: 'brandA',
      campaign: 'summer-sale',
    });
    expect(r.trackerType).toBe('utm');
    expect(r.url).toContain('utm_source=naver-blog');
    expect(r.url).toContain('utm_medium=affiliate');
    expect(r.url).toContain('utm_campaign=summer-sale');
    expect(r.url).toContain('utm_content=p1');
    expect(r.url).toContain('utm_term=brandA');
  });

  it('이미 utm_source 있으면 덮어쓰지 않음', () => {
    const r = tracker.buildLink({
      postId: 'p1',
      targetUrl: 'https://shop.example.com?utm_source=existing',
    });
    expect(r.url).toContain('utm_source=existing');
    expect(r.url).not.toContain('utm_source=naver-blog');
  });

  it('잘못된 URL은 throw', () => {
    expect(() => tracker.buildLink({ postId: 'p1', targetUrl: 'not-a-url' }))
      .toThrow(/UTM_TARGET_URL_INVALID/);
  });

  it('빈 postId·targetUrl은 throw', () => {
    expect(() => tracker.buildLink({ postId: '', targetUrl: 'https://x' }))
      .toThrow(/INPUT_INVALID/);
    expect(() => tracker.buildLink({ postId: 'p1', targetUrl: '' }))
      .toThrow(/INPUT_INVALID/);
  });

  it('recordEvent → store 누적', async () => {
    await tracker.recordEvent(makeConversionEvent('p1', 'click'));
    expect(await store.size()).toBe(1);
  });
});

describe('PixelConversionTracker', () => {
  let store: InMemoryConversionStore;
  let tracker: PixelConversionTracker;

  beforeEach(() => {
    store = new InMemoryConversionStore();
    tracker = new PixelConversionTracker(store, { endpoint: 'https://pixel.x.com/track' });
  });

  it('픽셀 redirect URL 생성', () => {
    const r = tracker.buildLink({
      postId: 'p1',
      targetUrl: 'https://shop.example.com/product/123',
    });
    expect(r.trackerType).toBe('pixel');
    expect(r.url).toContain('https://pixel.x.com/track');
    expect(r.url).toContain('p=p1');
    expect(r.url).toContain('u=https');
  });

  it('endpoint 누락은 throw', () => {
    expect(() => new PixelConversionTracker(store, { endpoint: '' }))
      .toThrow(/PIXEL_ENDPOINT_REQUIRED/);
  });
});

describe('NoopConversionTracker', () => {
  it('targetUrl 그대로 반환', () => {
    const t = new NoopConversionTracker(new InMemoryConversionStore());
    const r = t.buildLink({ postId: 'p1', targetUrl: 'https://shop.example.com' });
    expect(r.url).toBe('https://shop.example.com');
    expect(r.addedParams).toEqual([]);
  });

  it('빈 targetUrl은 throw', () => {
    const t = new NoopConversionTracker(new InMemoryConversionStore());
    expect(() => t.buildLink({ postId: 'p', targetUrl: '' })).toThrow(/TARGET_URL_INVALID/);
  });
});

describe('createConversionTracker — factory', () => {
  it('utm/pixel/noop 분기', () => {
    const store = new InMemoryConversionStore();
    expect(createConversionTracker({ kind: 'utm', store }).type).toBe('utm');
    expect(createConversionTracker({ kind: 'pixel', store, pixel: { endpoint: 'https://x' } }).type).toBe('pixel');
    expect(createConversionTracker({ kind: 'noop', store }).type).toBe('noop');
  });

  it('analytics는 미구현 throw (silent 폴백 X)', () => {
    expect(() => createConversionTracker({ kind: 'analytics', store: new InMemoryConversionStore() }))
      .toThrow(/ANALYTICS_TRACKER_NOT_IMPLEMENTED/);
  });

  it('pixel 옵션 미주입은 throw', () => {
    expect(() => createConversionTracker({ kind: 'pixel', store: new InMemoryConversionStore() }))
      .toThrow(/PIXEL_OPTIONS_REQUIRED/);
  });

  it('알 수 없는 kind는 throw', () => {
    expect(() => createConversionTracker({ kind: 'invalid' as any, store: new InMemoryConversionStore() }))
      .toThrow(/UNKNOWN_TRACKER_KIND/);
  });
});

describe('makeConversionEvent', () => {
  it('postId + eventType + 현재 시각', () => {
    const e = makeConversionEvent('p1', 'click');
    expect(e.postId).toBe('p1');
    expect(e.eventType).toBe('click');
    expect(new Date(e.timestamp).getTime()).toBeGreaterThan(0);
  });

  it('extras로 value·metadata 주입', () => {
    const e = makeConversionEvent('p1', 'purchase', { value: 12500, metadata: { sku: 'X' } });
    expect(e.value).toBe(12500);
    expect(e.metadata?.sku).toBe('X');
  });
});
