import { describe, expect, it } from 'vitest';

import { resolveSourceName } from '../content/sourceName';

describe('resolveSourceName', () => {
  it('API 가 준 퍼블리셔 이름을 최우선으로 쓴다', () => {
    const result = resolveSourceName({
      url: 'https://n.news.naver.com/mnews/article/011/0001234567',
      sourceType: 'news',
      apiPublisher: '서울경제',
    });
    expect(result.sourceName).toBe('서울경제');
    expect(result.domain).toBe('n.news.naver.com');
  });

  it('뉴스 제목의 " - 매체명" 접미사를 인식한다', () => {
    const result = resolveSourceName({
      url: 'https://www.hankyung.com/article/1',
      title: '청약통장 금리 인상 소식 - 한국경제',
      sourceType: 'news',
    });
    expect(result.sourceName).toBe('한국경제');
  });

  it('블로그/카페 제목의 접미사는 매체명으로 취급하지 않는다', () => {
    const result = resolveSourceName({
      url: 'https://blog.naver.com/someone/1',
      title: '오늘의 일상 - 티스토리',
      sourceType: 'blog',
    });
    expect(result.sourceName).toBeNull();
  });

  it('알려진 언론사 도메인은 표에서 채운다', () => {
    const result = resolveSourceName({ url: 'https://www.yna.co.kr/view/AKR20260920', sourceType: 'news' });
    expect(result.sourceName).toBe('연합뉴스');
    expect(result.domain).toBe('yna.co.kr');
  });

  it('go.kr 등 공공기관 도메인은 기관명을 지어내지 않고 null', () => {
    const result = resolveSourceName({ url: 'https://www.molit.go.kr/notice/1', sourceType: 'official' });
    expect(result.sourceName).toBeNull();
    expect(result.domain).toBe('molit.go.kr');
  });

  it('알 수 없는 도메인은 null — 절대 추측하지 않는다', () => {
    const result = resolveSourceName({ url: 'https://unknown-random-site.example', sourceType: 'web' });
    expect(result.sourceName).toBeNull();
    expect(result.domain).toBe('unknown-random-site.example');
  });

  it('www. 접두어는 도메인에서 제거한다', () => {
    const result = resolveSourceName({ url: 'https://www.chosun.com/article/1', sourceType: 'news' });
    expect(result.domain).toBe('chosun.com');
    expect(result.sourceName).toBe('조선일보');
  });

  it('originalLink 가 있으면 url 대신 사용한다', () => {
    const result = resolveSourceName({
      url: 'https://n.news.naver.com/mnews/article/001/0001',
      originalLink: 'https://www.yna.co.kr/view/AKR2026',
      sourceType: 'news',
    });
    expect(result.domain).toBe('yna.co.kr');
    expect(result.sourceName).toBe('연합뉴스');
  });

  it('URL 이 없으면 도메인은 빈 문자열, 이름은 null', () => {
    const result = resolveSourceName({ url: '', sourceType: 'web' });
    expect(result.domain).toBe('');
    expect(result.sourceName).toBeNull();
  });
});
