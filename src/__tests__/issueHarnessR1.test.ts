// src/__tests__/issueHarnessR1.test.ts
// 이슈 끝판왕 수집 R1 — URL 정책 / 쿼리 팬아웃 폴백 / payload 검증

import { describe, it, expect } from 'vitest';
import {
  isIssueBlockedUrl,
  normalizeIssueUrl,
  filterIssueCandidates,
} from '../crawler/issueHarness/urlPolicy.js';
import {
  generalizeIssueQuery,
  buildFallbackQueryPlan,
} from '../crawler/issueHarness/queryFanout.js';
import { validateIssueCollectPayload } from '../main/ipc/validators.js';

describe('issueHarness urlPolicy', () => {
  it('뉴스 CDN은 이슈 모드에서 허용된다 (쇼핑 필터와 반대)', () => {
    expect(isIssueBlockedUrl('https://imgnews.pstatic.net/image/311/2026/08/photo.jpg')).toBe(false);
    expect(isIssueBlockedUrl('https://mimgnews.pstatic.net/image/076/2026/news.jpg')).toBe(false);
    expect(isIssueBlockedUrl('https://dispatch.cdnser.be/wp-content/photo.jpg')).toBe(false);
  });

  it('스톡/워터마크 도메인은 항상 차단된다', () => {
    expect(isIssueBlockedUrl('https://media.gettyimages.com/photos/x.jpg')).toBe(true);
    expect(isIssueBlockedUrl('https://www.shutterstock.com/image/y.jpg')).toBe(true);
    expect(isIssueBlockedUrl('https://cdn.example.com/watermark/z.jpg')).toBe(true);
  });

  it('UI 가비지/초소형 이미지는 차단된다', () => {
    expect(isIssueBlockedUrl('https://example.com/img/sprite.png')).toBe(true);
    expect(isIssueBlockedUrl('https://example.com/logo.svg')).toBe(true);
    expect(isIssueBlockedUrl('https://example.com/photo_thumb.jpg')).toBe(true);
    expect(isIssueBlockedUrl('https://example.com/pic.jpg?type=f80')).toBe(true);
    expect(isIssueBlockedUrl('data:image/png;base64,abc')).toBe(true);
  });

  it('일반 사진 URL은 통과한다', () => {
    expect(isIssueBlockedUrl('https://blogfiles.pstatic.net/photo/scene.jpg')).toBe(false);
  });

  it('normalizeIssueUrl은 같은 사진의 크기 변형을 통합한다', () => {
    const a = normalizeIssueUrl('https://cdn.x.com/photo_640x480.jpg?type=f640');
    const b = normalizeIssueUrl('https://cdn.x.com/photo.jpg');
    expect(a).toBe(b);
  });

  it('filterIssueCandidates는 차단+중복 제거 후 cap을 지킨다', () => {
    const cands = [
      { url: 'https://imgnews.pstatic.net/a.jpg' },
      { url: 'https://imgnews.pstatic.net/a.jpg?w=200' }, // 중복 (정규화 동일)
      { url: 'https://media.gettyimages.com/b.jpg' },     // 차단
      { url: 'https://cdn.x.com/c.jpg' },
      { url: 'https://cdn.x.com/d.jpg' },
    ];
    const out = filterIssueCandidates(cands, 2);
    expect(out.map((c) => c.url)).toEqual([
      'https://imgnews.pstatic.net/a.jpg',
      'https://cdn.x.com/c.jpg',
    ]);
  });
});

describe('issueHarness queryFanout fallback', () => {
  it('generalizeIssueQuery는 후킹어/조사를 제거하고 앞 토큰만 남긴다', () => {
    const q = generalizeIssueQuery('손흥민 결승골 소식에 팬들이 진짜 놀란 이유?', 4);
    expect(q).toContain('손흥민');
    expect(q).not.toContain('이유');
    expect(q).not.toContain('진짜');
  });

  it('buildFallbackQueryPlan은 소제목 수만큼 쿼리셋을 만들고 직찍 변형을 포함한다', () => {
    const plan = buildFallbackQueryPlan('손흥민 이적설 총정리', [
      { title: '이적설의 시작' },
      { title: '구단 반응', body: '토트넘 구단은...' },
    ]);
    expect(plan.aiGenerated).toBe(false);
    expect(plan.querySets).toHaveLength(2);
    expect(plan.querySets[0].fandomQuery).toContain('직찍');
    expect(plan.querySets[0].koreanQuery.length).toBeGreaterThan(0);
    expect(plan.querySets[0].broaderQuery.length).toBeGreaterThan(0);
    // 기본 이미지 권장 수는 1장 (AI가 명시할 때만 2~3)
    expect(plan.querySets[0].recommendedImages).toBe(1);
  });
});

describe('validateIssueCollectPayload', () => {
  it('정상 payload를 통과시킨다', () => {
    const v = validateIssueCollectPayload({
      title: '손흥민 이적설',
      headings: [{ title: '개요', body: '본문' }, { title: '반응' }],
      mainKeyword: '손흥민',
    });
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.value.headings).toHaveLength(2);
      expect(v.value.headings[1].body).toBeUndefined();
    }
  });

  it('비정상 payload를 거부한다', () => {
    expect(validateIssueCollectPayload(null).ok).toBe(false);
    expect(validateIssueCollectPayload({ title: 'x', headings: [] }).ok).toBe(false);
    expect(validateIssueCollectPayload({ title: 'x', headings: [{ title: 123 }] }).ok).toBe(false);
    expect(validateIssueCollectPayload({ headings: [{ title: 'a' }] }).ok).toBe(false);
  });
});
