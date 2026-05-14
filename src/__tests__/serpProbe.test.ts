/**
 * serpProbe + benchmarkAnalyzer 단위 테스트
 *
 * 네트워크 호출 없는 *순수 함수*만 테스트. 실제 검색 API/HTML fetch는
 * 통합 테스트 영역 (사용자 운영 환경에서만 검증).
 */

import { describe, it, expect } from 'vitest';
import { normalizeNaverBlogUrl, extractBodyFromHtml } from '../analytics/serpProbe';
import { analyzeBenchmark, formatBenchmarkReport } from '../analytics/benchmarkAnalyzer';

describe('normalizeNaverBlogUrl', () => {
  it('blog.naver.com/{id}/{logNo} → PostView URL', () => {
    const url = 'https://blog.naver.com/exampleblog/223456789';
    const normalized = normalizeNaverBlogUrl(url);
    expect(normalized).toContain('PostView.naver');
    expect(normalized).toContain('blogId=exampleblog');
    expect(normalized).toContain('logNo=223456789');
  });

  it('PostView URL은 그대로 반환', () => {
    const url = 'https://blog.naver.com/PostView.naver?blogId=test&logNo=123';
    expect(normalizeNaverBlogUrl(url)).toBe(url);
  });

  it('blog.naver.com 형식 아니면 null', () => {
    expect(normalizeNaverBlogUrl('https://example.com/post/123')).toBeNull();
  });
});

describe('extractBodyFromHtml', () => {
  it('script/style 태그 제거', () => {
    const html = '<html><head><script>alert("x")</script><style>.a{}</style></head><body>본문 내용</body></html>';
    expect(extractBodyFromHtml(html)).toBe('본문 내용');
  });

  it('HTML 태그 제거', () => {
    const html = '<div><p>안녕하세요</p><span>세상</span></div>';
    const result = extractBodyFromHtml(html);
    expect(result).toContain('안녕하세요');
    expect(result).toContain('세상');
    expect(result).not.toContain('<');
  });

  it('HTML entity 정규화', () => {
    const html = '<p>&quot;테스트&quot; &amp; &nbsp;공백</p>';
    expect(extractBodyFromHtml(html)).toContain('"테스트"');
    expect(extractBodyFromHtml(html)).toContain('&');
  });

  it('se-text-paragraph 우선 추출', () => {
    const html = `
      <html><body>
        <header>헤더 무시</header>
        <div class="se-text-paragraph">첫 단락</div>
        <div class="se-text-paragraph">두번째 단락</div>
        <div class="se-text-paragraph">세번째 단락</div>
        <footer>푸터 무시</footer>
      </body></html>
    `;
    const result = extractBodyFromHtml(html);
    expect(result).toContain('첫 단락');
    expect(result).toContain('두번째 단락');
    expect(result).toContain('세번째 단락');
    expect(result).not.toContain('헤더 무시');
    expect(result).not.toContain('푸터 무시');
  });

  it('빈 입력은 빈 문자열', () => {
    expect(extractBodyFromHtml('')).toBe('');
    expect(extractBodyFromHtml(null as any)).toBe('');
  });
});

describe('analyzeBenchmark', () => {
  const mockOurEval = {
    mode: 'seo' as const,
    finalScore: 65,
    modeScore: {
      score: 70,
      details: { concreteNumberCount: 2 },
      issues: [],
      suggestions: [],
    },
    safetyScore: {
      score: 85,
      details: {},
      issues: [],
      suggestions: [],
    },
    humanlikeScore: {
      score: 50,
      details: { directExperience: 5 },
      issues: [],
      suggestions: [],
    },
    decision: 'patch' as const,
    retryDirective: null,
    weights: { mode: 0.6, safety: 0.25, humanlike: 0.15 },
  };

  const mockSerpReport = {
    keyword: '무선 충전기',
    mode: 'seo' as const,
    probedAt: '2026-05-14',
    itemCount: 10,
    successCount: 8,
    posts: [],
    baseline: {
      avgFinalScore: 75,
      avgModeScore: 78,
      avgSafetyScore: 80,
      avgHumanlikeScore: 70,
      avgBodyLength: 2000,
      avgConcreteNumbers: 5,
      avgDirectExperience: 12,
      avgAiClicheCount: 1,
      medianFinalScore: 76,
    },
  };

  it('우리 점수 < 상위 평균이면 below_median', () => {
    const report = analyzeBenchmark(mockOurEval, 1500, 2, 5, mockSerpReport);
    expect(report.ranking).toBe('below_median');
    expect(report.ourFinalScore).toBe(65);
    expect(report.serpAvgFinalScore).toBe(75);
  });

  it('각 신호별 gap 계산 정확', () => {
    const report = analyzeBenchmark(mockOurEval, 1500, 2, 5, mockSerpReport);
    const humanGap = report.signalGaps.find(g => g.signal === '사람다움');
    expect(humanGap?.gap).toBe(-20); // 50 - 70
    expect(humanGap?.recommendation).toBe('urgent');
  });

  it('우선순위 보완 항목은 최대 3개', () => {
    const report = analyzeBenchmark(mockOurEval, 1500, 2, 5, mockSerpReport);
    expect(report.topPriorityFix.length).toBeLessThanOrEqual(3);
  });

  it('baseline 없으면 비교 불가 메시지', () => {
    const noBaseReport = { ...mockSerpReport, baseline: null };
    const report = analyzeBenchmark(mockOurEval, 1500, 2, 5, noBaseReport);
    expect(report.summary).toContain('비교 불가');
  });

  it('formatBenchmarkReport는 정상 문자열 반환', () => {
    const report = analyzeBenchmark(mockOurEval, 1500, 2, 5, mockSerpReport);
    const formatted = formatBenchmarkReport(report);
    expect(formatted).toContain('통합 점수');
    expect(formatted).toContain('우선순위');
    expect(typeof formatted).toBe('string');
  });
});
