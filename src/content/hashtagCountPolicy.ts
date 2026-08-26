// src/content/hashtagCountPolicy.ts
// 해시태그 개수 기준의 단일 출처.
//
// [2026-08-26 하네스 충돌 정리] 프롬프트와 발행 경로가 정반대로 동작하고 있었다.
//   shared/hashtag-strategy.prompt HT-3 : SEO 10~15 / 홈판 3~7 / 쇼핑 8~12
//   contentStructuredValidator          : 모드 무관 slice(0, 8)
//   automation/runOptionsPolicy         : 모드 무관 slice(0, 5)  ← 실제 발행 경로
// 모델이 조합 롱테일 태그를 12개 만들어도 네이버에는 5개만 올라갔다. 그 5개를 고르는
// 기준도 없어서(앞에서부터 자름) 조합형 롱테일이 먼저 날아가는 구조였다.
//
// 5라는 숫자는 최초 커밋부터 있던 값으로 근거 기록이 없다. 네이버 블로그의 실제
// 태그 상한은 30개이므로 플랫폼 제약도 아니다. 기준은 HT-3 하나로 모은다.
//
// 채우기(padding)는 하지 않는다. 예전 검증기는 5개를 못 채우면 #정보 #꿀팁 #생활팁
// 같은 일반 태그를 붙였는데, HT-2가 금지하는 "변형 채우기"가 바로 그것이다.
// 검색되지 않는 태그는 자리만 차지하고 노출에 기여하지 않는다.

export interface HashtagCountRange {
  readonly min: number;
  readonly max: number;
  readonly source: string;
}

/** 네이버 블로그 태그 상한 — 어떤 모드도 이 위로는 못 간다. */
export const NAVER_HASHTAG_HARD_LIMIT = 30;

const RANGES: Record<string, HashtagCountRange> = {
  seo: { min: 10, max: 15, source: 'hashtag-strategy HT-3 (SEO)' },
  mate: { min: 10, max: 15, source: 'hashtag-strategy HT-3 (SEO)' },
  homefeed: { min: 3, max: 7, source: 'hashtag-strategy HT-3 (홈판)' },
  affiliate: { min: 8, max: 12, source: 'hashtag-strategy HT-3 (쇼핑)' },
};

const DEFAULT_RANGE: HashtagCountRange = RANGES.seo;

export function resolveHashtagCountRange(mode: string | undefined): HashtagCountRange {
  return RANGES[String(mode || '').trim()] || DEFAULT_RANGE;
}

/**
 * 모드 기준을 넘는 만큼만 잘라낸다. 모자라도 채우지 않는다.
 *
 * 자를 때는 앞에서부터 남긴다 — 모델은 핵심 태그를 먼저 내놓고 조합 롱테일을
 * 뒤에 붙이므로, 뒤를 버리는 편이 핵심 노출을 지킨다.
 */
export function clampHashtags(
  hashtags: readonly string[] | undefined,
  mode: string | undefined,
): { readonly hashtags: string[]; readonly droppedCount: number; readonly max: number } {
  const list = Array.isArray(hashtags) ? hashtags.filter(Boolean) : [];
  const range = resolveHashtagCountRange(mode);
  const max = Math.min(range.max, NAVER_HASHTAG_HARD_LIMIT);
  if (list.length <= max) return { hashtags: [...list], droppedCount: 0, max };
  return { hashtags: list.slice(0, max), droppedCount: list.length - max, max };
}
