/**
 * SPEC-MIGRATION-2026 M2 P3 — browserAdapter pure-helper tests.
 *
 * launchAdaptedBrowser / createOptimizedAdaptedPage require a real Chromium
 * binary so they are not unit-testable in vitest. Coverage here focuses on
 * the pure resource-blocking policy and configuration helpers — the parts
 * that gate behavior parity with the legacy browserFactory.
 */

import { describe, it, expect } from 'vitest';
import {
  shouldBlockResource,
  getDefaultUserAgent,
  getDefaultViewport,
} from '../automation/browserAdapter';

describe('browserAdapter — shouldBlockResource', () => {
  it('aborts font requests regardless of URL', () => {
    expect(shouldBlockResource('font', 'https://example.com/font.woff2')).toBe(
      true,
    );
    expect(shouldBlockResource('font', 'https://cdn.example.com/x')).toBe(true);
  });

  it('aborts media requests regardless of URL', () => {
    expect(shouldBlockResource('media', 'https://example.com/video.mp4')).toBe(
      true,
    );
  });

  it('aborts any resource whose URL contains google-analytics', () => {
    expect(
      shouldBlockResource('script', 'https://www.google-analytics.com/ga.js'),
    ).toBe(true);
    expect(
      shouldBlockResource('image', 'https://www.google-analytics.com/pixel.gif'),
    ).toBe(true);
  });

  it('aborts any resource whose URL contains facebook', () => {
    expect(
      shouldBlockResource('script', 'https://connect.facebook.net/sdk.js'),
    ).toBe(true);
  });

  it('aborts any resource whose URL contains tracking', () => {
    expect(
      shouldBlockResource('script', 'https://example.com/tracking/pixel.gif'),
    ).toBe(true);
  });

  it('allows document, script, image, stylesheet on benign URLs', () => {
    expect(shouldBlockResource('document', 'https://example.com')).toBe(false);
    expect(shouldBlockResource('script', 'https://example.com/app.js')).toBe(
      false,
    );
    expect(shouldBlockResource('image', 'https://example.com/photo.jpg')).toBe(
      false,
    );
    expect(
      shouldBlockResource('stylesheet', 'https://example.com/site.css'),
    ).toBe(false);
  });
});

describe('browserAdapter — config parity helpers', () => {
  it('reports the Chrome 120 desktop user agent matching the legacy factory', () => {
    const ua = getDefaultUserAgent();
    expect(ua).toContain('Mozilla/5.0');
    expect(ua).toContain('Chrome/120');
    expect(ua).toContain('Windows NT 10.0');
  });

  it('reports the 1920x1080 viewport matching the legacy factory', () => {
    expect(getDefaultViewport()).toEqual({ width: 1920, height: 1080 });
  });

  it('returns a fresh viewport object on each call (immutability)', () => {
    const a = getDefaultViewport();
    const b = getDefaultViewport();
    expect(a).not.toBe(b);
    a.width = 0;
    expect(b.width).toBe(1920);
  });
});
