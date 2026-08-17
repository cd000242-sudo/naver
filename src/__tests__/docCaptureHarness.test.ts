// src/__tests__/docCaptureHarness.test.ts
// 공식문서 캡처 — 도메인 정책/캡처 계획/판정 파싱/소제목별 선정 (순수 로직)

import { describe, it, expect } from 'vitest';
import {
  classifyOfficialDomain,
  isCapturablePage,
  rankOfficialPages,
  buildFallbackSourcePlan,
} from '../crawler/docCapture/officialSourceFinder.js';
import { planScrollOffsets } from '../crawler/docCapture/pageCapturer.js';
import { parseMatcherVerdicts } from '../crawler/docCapture/captureMatcher.js';
import { pickBestPerHeading } from '../crawler/docCapture/harness.js';

describe('공식 도메인 정책', () => {
  it('정부 직할 도메인은 1티어', () => {
    expect(classifyOfficialDomain('https://www.gov.kr/portal/svc/123')).toBe(1);
    expect(classifyOfficialDomain('https://www.moel.go.kr/news/notice.do')).toBe(1);
    expect(classifyOfficialDomain('https://www.korea.kr/briefing/press/1')).toBe(1);
    expect(classifyOfficialDomain('https://www.bokjiro.go.kr/ssis-tbu/1')).toBe(1);
  });

  it('공단·공사(or.kr)는 2티어, 비공식은 제외', () => {
    expect(classifyOfficialDomain('https://www.nps.or.kr/jsppage/1')).toBe(2);
    expect(classifyOfficialDomain('https://blog.naver.com/x/1')).toBeNull();
    expect(classifyOfficialDomain('https://n.news.naver.com/article/1')).toBeNull();
    expect(classifyOfficialDomain('not-a-url')).toBeNull();
  });

  it('PDF/한글파일 링크는 캡처 대상에서 제외', () => {
    expect(isCapturablePage('https://www.moel.go.kr/notice.do')).toBe(true);
    expect(isCapturablePage('https://www.moel.go.kr/file/공고문.pdf')).toBe(false);
    expect(isCapturablePage('https://x.go.kr/download.hwp?id=1')).toBe(false);
  });

  it('rankOfficialPages는 티어 우선 정렬 + 중복 제거 + cap', () => {
    const pages = rankOfficialPages(
      [
        { url: 'https://www.nps.or.kr/a', title: '공단' },
        { url: 'https://www.gov.kr/a', title: '정부24' },
        { url: 'https://www.gov.kr/a#section', title: '정부24 중복' },
        { url: 'https://blog.naver.com/x', title: '블로그' },
        { url: 'https://www.moel.go.kr/b.pdf', title: 'PDF' },
      ],
      2,
    );
    expect(pages).toHaveLength(2);
    expect(pages[0].url).toBe('https://www.gov.kr/a');
    expect(pages[0].domainTier).toBe(1);
    expect(pages[1].domainTier).toBe(2);
  });
});

describe('세그먼트 캡처 계획', () => {
  it('짧은 페이지는 1컷', () => {
    expect(planScrollOffsets(800, 1000, 5)).toEqual([0]);
  });

  it('긴 페이지는 겹침 있는 오프셋으로 최대 N컷', () => {
    const offsets = planScrollOffsets(5000, 1000, 5);
    expect(offsets.length).toBeLessThanOrEqual(5);
    expect(offsets[0]).toBe(0);
    expect(Math.max(...offsets)).toBeLessThanOrEqual(4000);
    for (let i = 1; i < offsets.length; i++) expect(offsets[i]).toBeGreaterThan(offsets[i - 1]);
  });
});

describe('매칭 판정 파싱 (fail-closed)', () => {
  it('정상 응답 매핑 + 범위 밖 headingIndex는 0 처리', () => {
    const text = JSON.stringify({
      results: [
        { index: 1, headingIndex: 2, isOfficial: true, legible: true, summary: '지원 대상 표' },
        { index: 2, headingIndex: 99, isOfficial: true, legible: true, summary: '범위 밖' },
      ],
    });
    const v = parseMatcherVerdicts(text, 2, 3);
    expect(v[0]?.headingIndex).toBe(2);
    expect(v[1]?.headingIndex).toBe(0);
  });

  it('파싱 불가·누락 인덱스는 null', () => {
    expect(parseMatcherVerdicts('그냥 텍스트', 2, 3).every((x) => x === null)).toBe(true);
    const partial = parseMatcherVerdicts('{"results":[{"index":1,"headingIndex":1,"isOfficial":true,"legible":true,"summary":"a"}]}', 2, 3);
    expect(partial[0]).not.toBeNull();
    expect(partial[1]).toBeNull();
  });
});

describe('소제목별 최적 캡처 선정', () => {
  const seg = (sourceUrl: string, segmentIndex: number) => ({
    buffer: Buffer.alloc(0), sourceUrl, pageTitle: '', segmentIndex,
  });
  it('1티어 페이지 → 문서 상단 컷 우선, official/legible 아닌 컷은 제외', () => {
    const segments = [
      seg('https://a.or.kr/x', 0),   // tier2
      seg('https://b.go.kr/y', 2),   // tier1, 아래쪽
      seg('https://b.go.kr/y', 1),   // tier1, 위쪽 → 최우선
      seg('https://b.go.kr/y', 0),   // tier1이지만 non-official
    ];
    const verdicts = [
      { headingIndex: 1, isOfficial: true, legible: true, summary: 'a' },
      { headingIndex: 1, isOfficial: true, legible: true, summary: 'b' },
      { headingIndex: 1, isOfficial: true, legible: true, summary: 'c' },
      { headingIndex: 1, isOfficial: false, legible: true, summary: 'd' },
    ];
    const tierOf = (u: string) => (u.includes('go.kr') ? 1 : 2);
    const picked = pickBestPerHeading(segments, verdicts, 2, tierOf);
    const list = picked.get(1)!;
    expect(list[0]).toBe(2); // tier1 + segmentIndex 1 (상단)
    expect(list).not.toContain(3); // non-official 제외
  });

  it('버팀목: headingIndex 0/null 판정은 어느 소제목에도 배치되지 않는다', () => {
    const segments = [seg('https://b.go.kr/y', 0)];
    expect(pickBestPerHeading(segments, [null], 3, () => 1).size).toBe(0);
    expect(
      pickBestPerHeading(segments, [{ headingIndex: 0, isOfficial: true, legible: true, summary: '' }], 3, () => 1).size,
    ).toBe(0);
  });
});

describe('폴백 소스 플랜', () => {
  it('키 없이도 검색어·목표가 채워진다', () => {
    const plan = buildFallbackSourcePlan('소상공인 전기요금 지원 신청', [{ title: '지원 대상' }, { title: '신청 방법' }]);
    expect(plan.aiGenerated).toBe(false);
    expect(plan.officialQueries.length).toBeGreaterThanOrEqual(3);
    expect(plan.headingGoals).toHaveLength(2);
  });
});
