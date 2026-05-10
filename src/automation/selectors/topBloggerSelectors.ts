/**
 * SPEC-CONVERSION-001 L2-4.2 — 네이버 블로그 검색 결과 상위 블로거 셀렉터
 *
 * 위치: search.naver.com (블로그 탭) — section.sp_nreview 또는 section.sp_blog
 * 수집 항목: 블로그 글 제목·URL·블로거 ID·발행일·요약.
 *
 * spike(L2-4.2 사전 검증)에서 매칭률 ≥80% 확인 후 운영 투입.
 * 매칭 실패 시 fallback 다중 후보 시도.
 */
import type { SelectorEntry, SelectorMap } from './types';

export type TopBloggerSelectorKey =
  | 'searchTab'
  | 'resultList'
  | 'resultItem'
  | 'postTitle'
  | 'postLink'
  | 'bloggerId'
  | 'postDate'
  | 'postSummary'
  | 'paginationNext';

const entry = (primary: string, fallbacks: readonly string[], description: string): SelectorEntry => ({
  primary,
  fallbacks,
  description,
});

export const TOP_BLOGGER_SELECTORS: SelectorMap<TopBloggerSelectorKey> = {
  searchTab: entry(
    'a[role="tab"][href*="where=blog"]',
    ['li.tab a[href*="blog"]', 'a.tab[href*="blog"]'],
    '블로그 탭 링크',
  ),
  resultList: entry(
    'ul.lst_total',
    ['ul.list_news', 'div.api_subject_bx', 'section.sp_nreview ul'],
    '검색 결과 리스트 컨테이너',
  ),
  resultItem: entry(
    'li.bx',
    ['li.lst_total_item', 'div.total_wrap', 'div.api_txt_lines'],
    '개별 블로그 글 항목',
  ),
  postTitle: entry(
    'a.title_link',
    ['a.api_txt_lines.total_tit', 'a[class*="title"]'],
    '글 제목 링크',
  ),
  postLink: entry(
    'a.title_link',
    ['a[class*="title"][href*="blog.naver.com"]', 'a[href*="blog.naver.com"]'],
    '글 본문 URL',
  ),
  bloggerId: entry(
    'a.sub_txt.sub_name',
    ['a.name', 'span.user_name', 'a[class*="name"]'],
    '블로거 ID·이름',
  ),
  postDate: entry(
    'span.sub_time',
    ['span.date', 'span.sub_txt[class*="time"]'],
    '발행일',
  ),
  postSummary: entry(
    'div.api_txt_lines.dsc_txt',
    ['div.dsc_txt', 'div.api_txt_lines'],
    '검색 요약문',
  ),
  paginationNext: entry(
    'a.btn_next',
    ['a[class*="next"]', 'button[aria-label*="다음"]'],
    '다음 페이지 버튼',
  ),
};
