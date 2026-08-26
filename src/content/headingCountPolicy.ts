// src/content/headingCountPolicy.ts
// 소제목 개수 기준의 단일 출처.
//
// [2026-08-26 하네스 충돌 정리] 같은 SEO 글 하나를 두고 두 검증기가 반대로 말했다.
//   contentSeoValidator : "⚠️ 소제목 3개 (SEO 권장: 5~7개)"
//   contentBodyHooks    : "✅ 소제목 3개 — 구조 변동 엔진 허용 범위"
// 로그를 읽는 사람은 어느 쪽이 맞는지 알 수 없고, 5~7이라는 숫자는 어떤 SEO
// 프롬프트에도 없다. seo/base R0-2·R0-3는 개수를 고정하지 않고 정보량에 맞추라고 한다.
//
// 그래서 기준은 프롬프트가 실제로 요구하는 값을 그대로 옮겨 왔다.
//   mate/base.prompt:73                 5~7
//   business/base.prompt:82             5~7
//   affiliate/shopping_expert_review:18 4~7
//   homefeed/base.prompt:72             3~7 ("정확한 개수를 맞추지 않는다")
//   homefeed/issue-story.prompt:35      0~3 (인물·근황 글은 소제목 없이 흐름으로)
//   seo/base.prompt                     개수 고정 없음 → 구조 변동 허용 폭 3~8
//
// 프롬프트가 개수를 바꾸면 여기도 같이 바꾼다. 검증기가 독자적으로 숫자를 만들지 않는다.

export interface HeadingCountRange {
  readonly min: number;
  readonly max: number;
  /** 로그에 그대로 쓸 근거 — 어느 프롬프트에서 온 숫자인지. */
  readonly source: string;
}

const RANGES: Record<string, HeadingCountRange> = {
  seo: { min: 3, max: 8, source: 'seo/base R0-3 (개수 고정 없음, 구조 변동 허용)' },
  mate: { min: 5, max: 7, source: 'mate/base.prompt' },
  business: { min: 5, max: 7, source: 'business/base.prompt' },
  affiliate: { min: 4, max: 7, source: 'affiliate/shopping_expert_review.prompt' },
  homefeed: { min: 3, max: 7, source: 'homefeed/base.prompt' },
  'homefeed-issue': { min: 0, max: 3, source: 'homefeed/issue-story.prompt' },
};

const DEFAULT_RANGE: HeadingCountRange = RANGES.seo;

/**
 * 모드별 소제목 개수 범위.
 *
 * issueStory 가 true 면 홈판 이슈 서사 골격이 적용된 글이라 개수 기준이 따로 있다.
 */
export function resolveHeadingCountRange(
  mode: string | undefined,
  options: { issueStory?: boolean } = {},
): HeadingCountRange {
  if (options.issueStory === true) return RANGES['homefeed-issue'];
  return RANGES[String(mode || '').trim()] || DEFAULT_RANGE;
}

export type HeadingCountVerdict = 'ok' | 'too-few' | 'too-many';

export function judgeHeadingCount(count: number, range: HeadingCountRange): HeadingCountVerdict {
  if (count < range.min) return 'too-few';
  if (count > range.max) return 'too-many';
  return 'ok';
}

/** 로그 한 줄. 두 검증기가 같은 문장을 쓰게 해서 모순된 메시지가 안 나오게 한다. */
export function describeHeadingCount(count: number, range: HeadingCountRange): string {
  const verdict = judgeHeadingCount(count, range);
  if (verdict === 'ok') return `✅ 소제목 ${count}개 — 허용 범위 ${range.min}~${range.max}개`;
  if (verdict === 'too-few') {
    return `⚠️ 소제목 ${count}개 — 최소 ${range.min}개 (${range.source})`;
  }
  return `⚠️ 소제목 ${count}개 — 최대 ${range.max}개 (${range.source})`;
}
