import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateIssueCollectPayload } from '../main/ipc/validators';
import { buildIssueCollectSources } from '../main/services/issueCollectSources';
import { COLLECT_PHOTOS_SCOPE, COLLECT_PHOTOS_SOURCES } from '../main/services/collectPhotosEngine';

const read = (rel: string) => readFileSync(resolve(__dirname, '..', rel), 'utf8');
const payload = { title: '제목', headings: [{ title: '소제목' }] };

describe('이미지 탭 AI 자동 수집 범위', () => {
  it('breadth 를 안 주면 news, wide 일 때만 wide', () => {
    const plain = validateIssueCollectPayload(payload);
    const wide = validateIssueCollectPayload({ ...payload, breadth: 'wide' });
    const junk = validateIssueCollectPayload({ ...payload, breadth: 'everything' });
    expect(plain.ok && plain.value.breadth).toBe('news');
    expect(wide.ok && wide.value.breadth).toBe('wide');
    expect(junk.ok && junk.value.breadth).toBe('news');
  });

  it('news 범위는 관련 사진 찾기와 같은 상수(네이버·다음·뉴스 og, 공식·뉴스·통신사·방송사만)를 쓴다', () => {
    expect(COLLECT_PHOTOS_SCOPE.allowedSources).toBe(COLLECT_PHOTOS_SOURCES);
    expect([...COLLECT_PHOTOS_SOURCES].sort()).toEqual(['daum', 'naver', 'naver-date', 'news-og']);
    expect(typeof COLLECT_PHOTOS_SCOPE.candidateFilter).toBe('function');
    const handler = read('main/ipc/issueCollectHandlers.ts');
    expect(handler).toContain("v.value.breadth === 'wide'");
    expect(handler).toContain('scope: wide ? undefined : COLLECT_PHOTOS_SCOPE');
  });

  it('렌더러: 넓게 찾기 체크 시 wide, 기본은 news, 동의는 config 에도 기록', () => {
    const mode = read('renderer/modules/issueCollectMode.ts');
    expect(mode).toContain("breadth: issueCollectWide ? 'wide' : 'news'");
    expect(mode).toContain("localStorage.getItem('issueCollectWide') === 'true'");
    expect(mode).toContain('result.sources?.[placedUrl]');
    expect(read('renderer/modules/issueCollectConsent.ts')).toContain('imageCollectConsent: { version: ISSUE_CONSENT_CONFIG_MIN_VERSION');
    const html = readFileSync(resolve(__dirname, '../../public/index.html'), 'utf8');
    expect(html).toContain('id="issue-collect-wide-checkbox"');
    expect(html).not.toMatch(/id="issue-collect-wide-checkbox"[^>]*checked/);
  });
});

describe('수집 사진 출처 캡션', () => {
  const images = { 소제목: ['https://img.example/a.jpg', 'https://img.example/b.jpg', 'https://img.example/c.jpg'] };
  const candidates = {
    소제목: [
      { url: 'https://img.example/a.jpg', pageUrl: 'https://www.yna.co.kr/view/1' },
      { url: 'https://img.example/b.jpg', pageUrl: 'https://news.example.com/x' },
      { url: 'https://img.example/c.jpg' },
    ],
  };

  it('og:site_name 이 있으면 언론사 이름, 없으면 도메인, 기사 페이지가 없으면 항목 없음', async () => {
    const sources = await buildIssueCollectSources(images, candidates, async (page) => (page?.includes('yna') ? '연합뉴스' : undefined));
    expect(sources['https://img.example/a.jpg']).toEqual({ sourceUrl: 'https://www.yna.co.kr/view/1', caption: '출처: 연합뉴스' });
    expect(sources['https://img.example/b.jpg']).toEqual({ sourceUrl: 'https://news.example.com/x', caption: '출처: news.example.com' });
    expect(sources['https://img.example/c.jpg']).toBeUndefined();
  });
});
