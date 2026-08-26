import { decideKeywordPrefix } from './content/keywordTitlePrefixPolicy';

export interface HeadingKeywordPatchHeading {
  title?: string;
  [key: string]: unknown;
}

export interface HeadingKeywordCoreResult {
  core: string;
  shouldPatch: boolean;
  reason: string;
}

export interface HeadingKeywordPatchOptions {
  maxPatches?: number;
}

/**
 * How many headings may receive a forced main-keyword prefix, by content mode.
 *
 * Search modes (seo/mate) are matched against a query, so a heading carrying the
 * keyword is a real ranking surface (smart block / longtail). Homefeed is not: it is
 * scanned in a feed with no query behind it, and a mechanically prefixed keyword
 * ("제습기 하루 얼마나 돌려야 할까") reads as an ad — which is exactly what
 * prompts/homefeed/base.prompt and shared/headings-homefeed.prompt forbid. The cleanup
 * passes (조사 prefix 제거, 선두 중복 collapse) still run at 0; only the forced prefix stops.
 */
export function resolveHeadingKeywordPatchMax(mode: string | undefined): number {
  return mode === 'homefeed' ? 0 : 2;
}

export interface HeadingKeywordPatchResult<T extends HeadingKeywordPatchHeading> {
  headings: T[];
  core: string;
  shouldPatch: boolean;
  reason: string;
  patchedCount: number;
  dedupedCount: number;
  targetPrefixCleanedCount: number;
}

const PERSON_ISSUE_TERMS = [
  '악플',
  '비난',
  '논란',
  '루머',
  '열애설',
  '사망',
  '별세',
  '추모',
  '폭로',
  '해명',
  '입장',
  '불똥',
  '사건',
  '이슈',
  '사이버',
  '불링',
  // [2026-08-05] 인물 정체 질의("○○ 누구")도 이름 조각 접두가 부자연스럽다 — 접두 스킵.
  '누구',
];

function escapeRegex(value: string): string {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeForMatch(value: string): string {
  return String(value || '').replace(/[\s\-–—:|·•.,!?()\[\]{}"']/g, '').toLowerCase();
}

function removeLeadingTargetParticlePrefix(title: string, core: string): string {
  if (!title || !core) return title;
  const targetPrefixPattern = new RegExp(
    `^\\s*${escapeRegex(core)}(?:에게는|에게도|에게|한테는|한테도|한테|께서는|께서|께)\\s+`,
    'i',
  );
  return String(title).replace(targetPrefixPattern, '').trim();
}

function stripKoreanTargetParticle(token: string): string {
  let normalized = String(token || '')
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .replace(/[^\p{L}\p{N}]+$/u, '')
    .trim();

  const particles = [
    '에게는',
    '에게도',
    '에게',
    '한테는',
    '한테도',
    '한테',
    '께서는',
    '께서',
    '께',
  ];

  for (const particle of particles) {
    if (normalized.endsWith(particle) && normalized.length > particle.length + 1) {
      normalized = normalized.slice(0, -particle.length);
      break;
    }
  }

  return normalized.trim();
}

function isLikelyShortKoreanName(value: string): boolean {
  return /^[가-힣]{2,4}$/.test(value);
}

function hasPersonIssueTerm(tokens: string[]): boolean {
  const joined = tokens.join(' ');
  return PERSON_ISSUE_TERMS.some((term) => joined.includes(term));
}

// [2026-08-05] 지시관형사(이런/그런/어떤 …)도 핵심어가 될 수 없다.
//   실측 버그: 키워드 "이런 엿같은 사랑 하영 누구"에서 "이런"이 핵심어로 뽑혀
//   소제목 2개에 "이런 " 접두가 붙어 발행됨. 닫힌 목록이라 오탐 없음.
const DETERMINER_TOKENS = new Set([
  '이런', '그런', '저런', '요런', '어떤', '무슨', '어느', '웬만한',
]);

// [2026-07-04] 동사 관형형(-는: 오는/하는/되는/없는 …)은 키워드 '핵심어'가 될 수 없다.
//   실측 버그: 키워드 "비 오는 날 수건 쉰내"에서 첫 토큰 "비"(1글자)가 스킵되고 "오는"이
//   핵심어로 뽑혀 소제목 2개에 "오는 " 접두가 붙어 발행됨. 명사 토큰을 우선 선택한다.
// [2026-08-05] ~같은/~스러운/~로운 형용사 관형형 추가("엿같은" 실측).
//   ~은 전체를 거르면 은으로 끝나는 사람 이름(지은·하은)을 오판하므로 접미사 한정.
function isVerbalModifierToken(token: string): boolean {
  if (DETERMINER_TOKENS.has(token)) return true;
  return /[가-힣]는$/.test(token) || /(같은|스러운|로운)$/.test(token);
}

export function resolveHeadingKeywordCore(primaryKeyword: string): HeadingKeywordCoreResult {
  const raw = String(primaryKeyword || '').trim();
  if (!raw) return { core: '', shouldPatch: false, reason: 'empty-keyword' };

  const tokens = raw.split(/[\s,/\-]+/).map((token) => token.trim()).filter(Boolean);
  const meaningful = tokens.filter((token) => stripKoreanTargetParticle(token).length >= 2);
  // 관형형이 아닌 토큰 우선(명사 후보). 전부 관형형이면 기존 동작 폴백(첫 유의미 토큰).
  const firstRaw = meaningful.find((token) => !isVerbalModifierToken(stripKoreanTargetParticle(token)))
    || meaningful[0]
    || raw;
  const core = stripKoreanTargetParticle(firstRaw);

  if (!core) return { core: '', shouldPatch: false, reason: `empty-core:${firstRaw}` };

  if (isLikelyShortKoreanName(core) && hasPersonIssueTerm(tokens.slice(1))) {
    return { core, shouldPatch: false, reason: 'person-issue-keyword' };
  }

  return { core, shouldPatch: true, reason: 'generic-keyword' };
}

export function applyHeadingKeywordPatch<T extends HeadingKeywordPatchHeading>(
  headings: T[],
  primaryKeyword: string,
  options: HeadingKeywordPatchOptions = {},
): HeadingKeywordPatchResult<T> {
  const resolved = resolveHeadingKeywordCore(primaryKeyword);
  const maxPatches = Math.max(0, options.maxPatches ?? 2);
  let patchedCount = 0;
  let dedupedCount = 0;
  let targetPrefixCleanedCount = 0;
  const coreNorm = normalizeForMatch(resolved.core);
  const dupPattern = resolved.core
    ? new RegExp(`^(${escapeRegex(resolved.core)})\\s+\\1(?=\\s|$)`, 'i')
    : null;

  const patchedHeadings = (Array.isArray(headings) ? headings : []).map((heading) => {
    if (!heading?.title || !resolved.core) return heading;

    const nextHeading = { ...heading };
    const originalTitle = String(heading.title);
    let nextTitle = removeLeadingTargetParticlePrefix(originalTitle, resolved.core);
    if (nextTitle !== originalTitle) {
      targetPrefixCleanedCount++;
    }

    // [2026-08-26] 접두 판정은 제목과 같은 계약을 쓴다(decideKeywordPrefix).
    // 핵심어 한 토큰만 보면, 키워드가 흩어진 형태로 이미 들어 있는 소제목
    // ("해지 방법 정리" ← 키워드 "청약통장 해지 방법")에도 접두가 붙어 중복이 생긴다.
    // 두 조건을 모두 통과해야 붙인다: 핵심어가 없고 + 키워드 커버리지도 부족할 때만.
    const coreAbsent = !!coreNorm && !normalizeForMatch(originalTitle).includes(coreNorm);
    const keywordDecision = decideKeywordPrefix(primaryKeyword, originalTitle);
    if (
      resolved.shouldPatch &&
      patchedCount < maxPatches &&
      coreAbsent &&
      keywordDecision.shouldPrefix
    ) {
      nextTitle = `${resolved.core} ${originalTitle}`.trim();
      patchedCount++;
    }

    if (dupPattern) {
      const deduped = nextTitle.replace(dupPattern, '$1').trim();
      if (deduped !== nextTitle) {
        nextTitle = deduped;
        dedupedCount++;
      }
    }

    nextHeading.title = nextTitle;
    return nextHeading;
  });

  return {
    headings: patchedHeadings,
    core: resolved.core,
    shouldPatch: resolved.shouldPatch,
    reason: resolved.reason,
    patchedCount,
    dedupedCount,
    targetPrefixCleanedCount,
  };
}
