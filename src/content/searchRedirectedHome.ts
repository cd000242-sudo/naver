/**
 * 검색 페이지가 홈으로 튕긴 리디렉션 판정.
 *
 * 사장님 실측: 냉장고 정리 글에 그날의 뉴스 헤드라인(네팔 대홍수 · 개각 · 공소취소)이
 * 통째로 실렸다. 로그가 원인을 그대로 보여줬다.
 *
 *   [크롤링] 리디렉션됨:
 *     https://news.google.com/search?q=추석+연휴+대비:+냉장고+파먹기...
 *     → https://news.google.com/home?hl=ko&gl=KR&ceid=KR:ko
 *
 * 그 키워드로 검색 결과가 없자 구글 뉴스가 홈으로 튕겼고, 크롤러는 그 홈 화면의
 * 오늘자 헤드라인을 자료로 긁어왔다. 리디렉션은 로그만 찍고 그대로 진행했다.
 *
 * 더 나쁜 것은 그다음이다. 헤드라인 옆 상대 시각이 본문의 사실 수치로 둔갑했다.
 *   "46분 전 개각 보도"    -> "불과 46분 만에 성에 결정이 형성될 수 있습니다"
 *   "10시간 전 / 11시간 전" -> "10시간에서 11시간 지나야 내부 온도가 안정됩니다"
 *
 * 근거 게이트로는 못 잡는다 — 그 숫자가 실제로 자료에 있기 때문이다.
 * 자료가 들어오는 문에서 막아야 한다.
 */

/** 검색 결과 페이지를 가리키는 경로 · 질의 꼴. */
const SEARCH_LIKE = /(?:\/search|\/find|[?&](?:q|query|keyword|kw)=)/iu;

/** 홈 · 루트로 볼 경로. 검색 페이지가 여기로 가면 결과가 없었다는 뜻이다. */
const HOME_LIKE = /^\/(?:home|index\.[a-z]+|main)?\/?$/iu;

function parse(url: string): URL | null {
  try {
    return new URL(String(url || ''));
  } catch {
    return null;
  }
}

export function isSearchRedirectedToHome(
  requestedUrl: string | undefined,
  finalUrl: string | undefined,
): boolean {
  const from = parse(requestedUrl ?? '');
  const to = parse(finalUrl ?? '');
  if (!from || !to) return false;
  if (from.href === to.href) return false;

  // 애초에 검색 페이지를 요청한 경우에만 본다.
  if (!SEARCH_LIKE.test(from.pathname + from.search)) return false;

  // 도착지에 질의가 남아 있으면 결과 페이지다 — 홈이 아니다.
  if (SEARCH_LIKE.test(to.pathname + to.search)) return false;

  return HOME_LIKE.test(to.pathname);
}

/**
 * "결과 없음" 검색 페이지 판정.
 *
 * [2026-09-01 2차] 홈 리디렉션만 막았더니 다음 글에서 다른 얼굴로 나왔다.
 * 이번에는 홈으로 튕기지 않고 검색 페이지에 머물렀는데, 그 페이지가
 * "표시할 항목이 없습니다" + 사이드바 헤드라인이었다. 모델은 그 화면을
 * 해설하는 글을 썼다 — 냉장고 정리법 대신 검색 화면 설명이 나왔다.
 *
 * URL 로 쫓으면 계속 새 얼굴이 나온다. 내용으로 판정한다.
 */
const EMPTY_RESULT_PHRASES = [
  /표시할\s*항목이\s*없습니다/u,
  /검색\s*결과가?\s*없습니다/u,
  /조건에\s*맞는\s*검색\s*결과/u,
  /일치하는\s*정보가?\s*없습니다/u,
  /검색된\s*내용이\s*없습니다/u,
  /no\s+results?\s+(?:found|were\s+found)/iu,
  /did\s+not\s+match\s+any/iu,
];

/**
 * 이 문구가 의미를 갖는 길이 상한.
 *
 * 결과 없음 페이지는 짧다. 긴 본문에 같은 표현이 한 번 나오는 것은
 * 대개 인용이므로 잡지 않는다.
 */
const MAX_EMPTY_PAGE_CHARS = 1200;

export function looksLikeEmptySearchResult(text: string | undefined): boolean {
  const body = String(text ?? '').trim();
  if (!body) return false;
  if (body.length > MAX_EMPTY_PAGE_CHARS) return false;
  return EMPTY_RESULT_PHRASES.some((phrase) => phrase.test(body));
}
