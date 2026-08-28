/**
 * 🕐 자료의 시점을 재료에 붙인다.
 *
 * ## 왜 필요한가 — 실측 사고 (2026-08-11, Orbit 에서 먼저 드러남)
 * "2026 부산 청년 게임개발자 정착지원사업" 글에 **2024년 조건이 섞여** 나갔다:
 *   · "임차보증금 이자와 월세의 최대 50%"  → 2024 조건 (2026 은 월세만)
 *   · "선정일로부터 2주 이내 임차계약"      → 2024 조건 (2026 은 협약일 1개월 내 전입)
 *   · "소득 수준·주택 소유 여부와 무관"     → 2024 보도자료 표현
 * 반대로 2026 핵심(만 18~39세 · 2024.1.1 이후 입사 · 전입신고)은 빠졌다.
 *
 * ## 원인은 모델이 아니라 재료다
 * 1) 본문 수집이 `sort=sim` 이라 글이 가장 많이 쓰인 **첫 시행 연도** 글이 상위로 온다
 * 2) 네이버 API 가 주는 `postdate` 를 버려서 **재료에 날짜가 없었다**
 * 3) 근거 대조는 "장부에 있는 값"만 통과시킨다 — 2024 조건이 장부에 있으니 통과한다
 * 4) 프롬프트가 "끝난 사업을 현재형으로 쓰지 말라" 고 해도, 모델이 그 자료가
 *    작년 것인지 **알 방법이 없었다**
 *
 * 이 앱도 같은 구조다(sourceAssembler.collectTopArticleFullTexts 가 'sim' 을 쓴다).
 * 그래서 Orbit 에 넣은 방어를 그대로 옮긴다.
 */

/** 이보다 오래되면 "지금 조건과 다를 수 있다" 고 경고한다 */
export const STALE_AFTER_MONTHS = 12;

/** 네이버 검색 API 의 postdate 형식(YYYYMMDD)을 ISO 날짜로 */
export function parseNaverPostDate(postdate: unknown): string {
  const raw = String(postdate ?? '').replace(/\D/g, '');
  if (raw.length !== 8) return '';
  const year = Number(raw.slice(0, 4));
  const month = Number(raw.slice(4, 6));
  const day = Number(raw.slice(6, 8));
  if (year < 1990 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) return '';
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
}

/**
 * 뉴스 검색 API 의 pubDate(RFC 822, "Mon, 23 Jun 2026 09:00:00 +0900")를 ISO 날짜로.
 *
 * [2026-08-28] 블로그의 postdate 만 읽고 뉴스의 pubDate 는 버리고 있었다. 그래서
 * 뉴스 재료에 시점이 없었고, 모델은 기사 속 "오는 29일"이 몇 월인지 알 수 없었다.
 * 실측(스트레이 키즈 키워드)에서 월 없는 날짜 5건이 그대로 본문에 실렸다.
 */
export function parseNaverPubDate(pubDate: unknown): string {
  const raw = String(pubDate ?? '').trim();
  if (!raw) return '';
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  const year = parsed.getUTCFullYear();
  if (year < 1990 || year > 2200) return '';
  const month = String(parsed.getUTCMonth() + 1).padStart(2, '0');
  const day = String(parsed.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** postdate(YYYYMMDD) 든 pubDate(RFC 822) 든 있는 쪽을 쓴다. */
export function resolveSourceDate(item: { postdate?: unknown; pubDate?: unknown }): string {
  return parseNaverPostDate(item?.postdate) || parseNaverPubDate(item?.pubDate);
}

/** 두 시점 사이 개월 수 (미래면 0) */
export function monthsBetween(isoDate: string, now: Date = new Date()): number {
  const then = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(then.getTime())) return 0;
  const months = (now.getUTCFullYear() - then.getUTCFullYear()) * 12
    + (now.getUTCMonth() - then.getUTCMonth());
  return Math.max(0, months);
}

/** 사람이 읽는 경과 표현 — "2년 5개월 전" */
function elapsedLabel(months: number): string {
  if (months < 1) return '이번 달';
  if (months < 12) return `${months}개월 전`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return rest === 0 ? `${years}년 전` : `${years}년 ${rest}개월 전`;
}

/** 오래된 자료인가 */
export function isStaleSource(isoDate: string, now: Date = new Date()): boolean {
  if (!isoDate) return false;
  return monthsBetween(isoDate, now) >= STALE_AFTER_MONTHS;
}

/**
 * 자료 앞에 붙일 시점 표시.
 * 날짜를 모르면 빈 문자열 — 없는 날짜를 지어내지 않는다.
 */
export function buildFreshnessLabel(isoDate: string, now: Date = new Date()): string {
  if (!isoDate) return '';
  const months = monthsBetween(isoDate, now);
  if (months < STALE_AFTER_MONTHS) return `[${isoDate} 작성 · ${elapsedLabel(months)}]`;
  return `[${isoDate} 작성 · ${elapsedLabel(months)} ⚠️ 오래된 자료입니다. `
    + `여기 적힌 금액·기간·조건은 그 시점 기준이라 지금과 다를 수 있습니다. `
    + `현재 기준으로 확인되지 않은 값은 본문에 옮기지 마세요]`;
}

/**
 * 자료 본문 앞에 시점 표시를 붙인다.
 * 날짜가 없으면 원문 그대로 — 동작이 나빠지지 않는다.
 */
export function withFreshnessLabel(content: string, isoDate: string, now: Date = new Date()): string {
  const label = buildFreshnessLabel(isoDate, now);
  const body = String(content ?? '');
  if (!label) return body;
  return `${label}\n${body}`;
}

/**
 * 재료를 최신순과 유사도순으로 섞는다.
 *
 * 유사도순 단독이면 글이 가장 많이 쓰인 연도가 상위를 독점한다. 지원사업은 첫 시행
 * 연도에 글이 몰리므로 몇 년 전 공고가 재료 전부가 된다. 최신 쪽에 하나 더 주는 것은
 * **제도 글에서 틀린 정보의 비용이 관련성 저하보다 크기** 때문이다.
 * 최신을 앞에 둔다 — 프롬프트 예산이 잘릴 때 살아남아야 할 쪽이다.
 */
export function mergeRecentFirst<T>(
  recent: T[],
  similar: T[],
  limit: number,
  keyOf: (item: T) => string,
): T[] {
  const recentQuota = Math.min(similar.length > 0 ? Math.ceil(limit / 2) : limit, limit);
  const seen = new Set<string>();
  const merged: T[] = [];

  const take = (list: T[], quota: number): void => {
    let left = quota;
    for (const item of list) {
      if (merged.length >= limit || left <= 0) break;
      const key = keyOf(item);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
      left -= 1;
    }
  };

  take(recent, recentQuota);      // 최신을 앞에
  take(similar, limit);           // 남는 자리는 유사도로
  take(recent, limit);            // 유사도가 모자라면 최신으로 마저 채운다
  return merged;
}
