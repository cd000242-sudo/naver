/**
 * Exposure Checker — 끝판왕 Phase 3.18.2 (v2.10.198)
 *
 * 발행한 글이 *실제로* 네이버 검색 결과에 노출됐는지 검증.
 *   - 입력: keyword + blogId + logNo
 *   - 동작: 통합탭 검색 결과 fetch → 우리 글 URL 매칭 → 노출 위치 산출
 *   - 출력: position (1~10 = top10, >10 = 그 외, null = 미노출)
 *
 * 추정 0 — 네이버 통합탭 실제 HTML에서 직접 매칭.
 */

import { probeDynamicSerp } from './dynamicSerpProbe';

export interface ExposureCheckResult {
  readonly checkedAt: string;             // ISO 8601
  readonly searchedKeyword: string;
  readonly position: number | null;       // 통합탭 노출 위치 (null = 미노출)
  readonly hasSmartblock: boolean;
  readonly notes?: string;
  readonly fetchSuccess: boolean;
}

/**
 * 통합탭에서 우리 글 URL이 노출됐는지 확인.
 *   - blogId + logNo를 URL 패턴으로 매칭 (PostView 또는 일반 URL 모두)
 *   - 정확 일치 또는 URL 내 포함 둘 다 매칭
 */
export function matchPostInCards(
  cards: ReadonlyArray<{ position: number; url: string }>,
  blogId: string,
  logNo: string,
): number | null {
  if (!blogId || !logNo) return null;
  const blogPattern = blogId.toLowerCase();
  const logPattern = logNo.toString();
  for (const card of cards) {
    const url = (card.url || '').toLowerCase();
    if (url.includes(blogPattern) && url.includes(logPattern)) {
      return card.position;
    }
  }
  return null;
}

/**
 * 발행한 글의 노출 위치 검증.
 *   - 통합탭 동적 fetch + 매칭
 *   - 실패 시 fetchSuccess=false (silent — 정상 흐름 유지)
 */
export async function checkPostExposure(
  keyword: string,
  blogId: string,
  logNo: string,
  options: { maxCards?: number; timeout?: number } = {},
): Promise<ExposureCheckResult> {
  const checkedAt = new Date().toISOString();

  try {
    const dynamicReport = await probeDynamicSerp(keyword, {
      maxCards: options.maxCards ?? 30,
      timeout: options.timeout ?? 10000,
    });

    if (!dynamicReport.fetchSuccess) {
      return {
        checkedAt,
        searchedKeyword: keyword,
        position: null,
        hasSmartblock: false,
        notes: 'fetch 실패',
        fetchSuccess: false,
      };
    }

    const position = matchPostInCards(dynamicReport.cards, blogId, logNo);

    return {
      checkedAt,
      searchedKeyword: keyword,
      position,
      hasSmartblock: dynamicReport.hasSmartblock,
      notes: position === null
        ? `상위 ${dynamicReport.totalCards}개 중 미발견`
        : `통합탭 ${position}위 노출`,
      fetchSuccess: true,
    };
  } catch (err) {
    return {
      checkedAt,
      searchedKeyword: keyword,
      position: null,
      hasSmartblock: false,
      notes: `오류: ${err instanceof Error ? err.message : String(err)}`,
      fetchSuccess: false,
    };
  }
}

/**
 * 여러 글을 일괄 검증 — exposure 폴링용.
 *   각 글 사이 1초 딜레이 (네이버 봇 차단 회피).
 */
export async function checkBatchExposure(
  posts: ReadonlyArray<{ id: string; keyword: string; blogId: string; logNo: string; hoursAfter: number }>,
  options: { delayMs?: number } = {},
): Promise<Array<{ id: string; hoursAfter: number; result: ExposureCheckResult }>> {
  const delayMs = options.delayMs ?? 1500;
  const results: Array<{ id: string; hoursAfter: number; result: ExposureCheckResult }> = [];

  for (let i = 0; i < posts.length; i++) {
    const p = posts[i];
    const result = await checkPostExposure(p.keyword, p.blogId, p.logNo);
    results.push({ id: p.id, hoursAfter: p.hoursAfter, result });
    if (i < posts.length - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  return results;
}
