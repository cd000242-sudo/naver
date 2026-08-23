import { describe, expect, it } from 'vitest';
import {
  buildUrlModeDirective,
  shouldApplyUrlModeDirective,
} from '../contentUrlModeDirective';

describe('contentUrlModeDirective', () => {
  it('applies only to URL/news sources with enough crawled text', () => {
    expect(shouldApplyUrlModeDirective({ url: 'https://example.com', rawText: 'x'.repeat(200) })).toBe(true);
    expect(shouldApplyUrlModeDirective({ sourceType: 'naver_news', rawText: 'x'.repeat(200) })).toBe(true);
    expect(shouldApplyUrlModeDirective({ sourceType: 'custom_text', rawText: 'x'.repeat(200) })).toBe(false);
    expect(shouldApplyUrlModeDirective({ url: 'https://example.com', rawText: 'x'.repeat(199) })).toBe(false);
  });

  it('builds a stable directive prefix for URL-based generation', () => {
    const directive = buildUrlModeDirective({ url: 'https://example.com', rawText: 'x'.repeat(200) });

    expect(directive.startsWith('[URL')).toBe(true);
    expect(directive).toContain('AI');
    expect(buildUrlModeDirective({ sourceType: 'custom_text', rawText: 'x'.repeat(200) })).toBe('');
  });

  // [2026-08-23] 이 지시문은 시스템 프롬프트 맨 앞에 붙어 모드 프롬프트보다 위에서 작동한다.
  //   모드를 무시하고 "원본 100% 보존 / 길이 85% 이상"을 절대 규칙으로 걸던 이전 계약은,
  //   홈판 모드로 URL 글을 뽑아도 기사 재구성체가 나오게 만들었다(사용자 실측).
  //   사실 보존은 모든 모드 공통이고, 형식(제목·구성·길이) 권한만 모드로 넘긴다.
  describe('모드별 형식 권한', () => {
    const withMode = (contentMode: string): string =>
      buildUrlModeDirective({ url: 'https://example.com', rawText: 'x'.repeat(200), contentMode });

    it('사실 보존과 환각 금지는 모든 모드에서 유지된다', () => {
      for (const mode of ['seo', 'homefeed', 'traffic-hunter', 'affiliate', '']) {
        const d = withMode(mode);
        expect(d).toContain('빠짐없이');
        expect(d).toContain('환각 절대 금지');
        expect(d).toContain('지어내지');
      }
    });

    it('홈판은 원문 형식이 아니라 홈판 규칙을 따른다 — 길이 85% 강제 없음', () => {
      const d = withMode('homefeed');
      expect(d).toContain('홈피드 규칙을 따른다');
      expect(d).toContain('원문 기사 제목·구성을 그대로 옮기지 마라');
      expect(d).not.toContain('85%');
    });

    it('트래픽헌터도 원문 제목을 따라가지 않는다', () => {
      const d = withMode('traffic-hunter');
      expect(d).toContain('원문 기사 제목을 그대로 옮기지 마라');
      expect(d).not.toContain('85%');
    });

    it('SEO는 원문 제목 대신 검색어를 제목 앞에 세운다', () => {
      const d = withMode('seo');
      expect(d).toContain('검색창에 칠 말');
      expect(d).toContain('원문 기사 제목을 따라가지 마라');
      expect(d).toContain('85%');
    });

    it('모르는 모드는 기존 동작(원문 길이 추종)을 유지한다', () => {
      expect(withMode('affiliate')).toContain('85%');
      expect(withMode('')).toContain('85%');
    });
  });
});
