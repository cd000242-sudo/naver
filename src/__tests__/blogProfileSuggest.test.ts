import { describe, expect, it, vi } from 'vitest';
import { fetchRecentPublicTitles, buildProfileSuggestionPrompt, parseProfileSuggestion } from '../account/blogProfileSuggest.js';

const item = (logNo: number, title: string, extra: Record<string, unknown> = {}) => ({
  logNo, titleWithInspectMessage: title, addDate: Date.parse('2026-10-20T00:00:00Z'), allOpenPost: true, domainIdOrBlogId: 'car_blog', notOpen: false, postBlocked: false, ...extra,
});
const response = (items: unknown[]) => ({ ok: true, status: 200, json: async () => ({ isSuccess: true, result: { items } }) });

describe('recent public titles', () => {
  it('reads only public posts of this blog from the public list, newest first', async () => {
    const fetchImpl = vi.fn(async () => response([
      item(224450000003, '트렁크 경고음 원인'), item(224450000002, '비공개 글', { allOpenPost: false }),
      item(224450000001, '다른 블로그 글', { domainIdOrBlogId: 'someone' }), item(224450000004, '충전 커넥터 녹 제거'),
    ]));
    const titles = await fetchRecentPublicTitles('car_blog', { fetchImpl: fetchImpl as never, now: Date.parse('2026-10-21T00:00:00Z') });
    expect(titles.map(t => t.title)).toEqual(['트렁크 경고음 원인', '충전 커넥터 녹 제거']);
    expect(String(fetchImpl.mock.calls[0][0])).toContain('m.blog.naver.com/api/blogs/car_blog/post-list');
    expect(String(fetchImpl.mock.calls[0][0])).toContain('categoryNo=0');
  });
  it('refuses an invalid blog id without calling the network', async () => {
    const fetchImpl = vi.fn();
    await expect(fetchRecentPublicTitles('연예 이슈', { fetchImpl: fetchImpl as never })).rejects.toThrow('BLOG_PROFILE_BLOG_UNKNOWN');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('profile suggestion', () => {
  const titles = [{ postId: '224450000003', title: '트렁크 경고음 원인' }, { postId: '224450000004', title: '충전 커넥터 녹 제거' }];
  it('prompt carries titles and performance as untrusted data and asks for evidence', () => {
    const prompt = buildProfileSuggestionPrompt({ titles, performance: { windows: [], caveats: [] } });
    expect(prompt).toContain('UNTRUSTED_BLOG_DATA');
    expect(prompt).toContain('트렁크 경고음 원인');
    expect(prompt).toContain('evidence');
  });
  it('a suggestion is an initial hypothesis marked inferred, and evidence must cite the real titles', () => {
    const raw = JSON.stringify({ intent: 'search', subject: { topics: ['자동차 고장'], exclusions: [] }, reader: { who: '차를 처음 산 30대', situations: ['경고등이 켜짐'], questions: ['트렁크 경고음 원인'] },
      purpose: '고장 상황 해결', evidence: ['트렁크 경고음 원인', '지어낸 제목'] });
    const result = parseProfileSuggestion(raw, titles);
    expect(result.profile.status).toBe('initial');
    expect(result.profile.provenance).toMatchObject({ intent: 'inferred', subject: 'inferred', reader: 'inferred' });
    expect(result.evidence).toEqual(['트렁크 경고음 원인']);
  });
  it('broken or invalid suggestions are refused', () => {
    expect(() => parseProfileSuggestion('문장', titles)).toThrow('BLOG_PROFILE_SUGGEST_INVALID');
    expect(() => parseProfileSuggestion(JSON.stringify({ intent: 'viral' }), titles)).toThrow('BLOG_PROFILE_INVALID');
  });
});
