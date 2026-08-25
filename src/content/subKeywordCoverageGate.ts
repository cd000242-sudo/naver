/**
 * subKeywordCoverageGate.ts — SPEC-KEYWORD-ENDGAME Phase 3 (세부키워드 커버리지 게이트).
 *
 * 서브키워드(사용자 추가분 + 블루오션 자동선정분)는 지금까지 프롬프트 권고만 있어서 생성물에
 * 실제로 들어갔는지 아무도 확인하지 않았다(롱테일 다면 노출 누수). 이 게이트는 SEO 모드
 * finalize에서 각 서브키워드가 본문 어딘가(소제목·서론·본문·결론)에 실제로 존재하는지 검사하고,
 * 완전히 빠진 것만 가장 관련 있는 소제목에 선두 prepend로 패치한다(메인키워드
 * applyHeadingKeywordPatch와 동일한 검증된 방식 — 소제목 = 스마트블록/롱테일 매칭면).
 *
 * 안전장치:
 *  - 완전 부재일 때만 패치(본문 어디든 있으면 자연 커버로 보고 무변경) — 왜곡 최소화.
 *  - 소제목당 1개 키워드만(스택 방지), 서브키워드 최대 3개, 멱등.
 *  - 인물+이슈 조합은 스킵(resolveHeadingKeywordCore 가드 재사용 — defamation 정합).
 */

import { resolveHeadingKeywordCore } from '../contentHeadingKeywordPatch.js';

export interface SubKeywordCoverageItem {
  keyword: string;
  inHeadings: boolean;
  inBody: boolean;
  patched: boolean;
  skippedReason?: string;
}

export interface SubKeywordCoverageResult {
  items: SubKeywordCoverageItem[];
  patchedCount: number;
}

interface CoverageContent {
  introduction?: string;
  conclusion?: string;
  headings?: Array<{ title?: string; content?: string; [key: string]: unknown }>;
}

function normalizeForMatch(value: string): string {
  return String(value || '').replace(/[\s\-–—:|·•.,!?()\[\]{}"']/g, '').toLowerCase();
}

function tokenOverlap(a: string, b: string): number {
  const tokensA = String(a || '').split(/\s+/).map((t) => t.trim()).filter((t) => t.length >= 2);
  const bNorm = normalizeForMatch(b);
  return tokensA.filter((t) => bNorm.includes(normalizeForMatch(t))).length;
}

/**
 * 서브키워드 커버리지를 검사한다.
 *
 * [2026-08-26 사용자 실측] 예전에는 빠진 서브키워드를 소제목 앞에 그냥 붙였다.
 * 그 결과 이런 소제목이 발행됐다.
 *   "카자흐스탄 렌터카 공증 전현무 렌터카 대여 장면에서 시작된 논란"
 *   "나혼산 알마티 여행 제작진이 밝힌 대여 과정과 대사관 확인 결과"
 * 앞쪽이 강제로 붙은 키워드다. 읽으면 바로 어색하고, 그 로그가 실측에서
 * "자연커버 0 · 패치 3" 이었다 — 셋 다 억지로 넣은 것이다.
 *
 * 한국어에서 명사구를 문장형 소제목 앞에 얹으면 자연스러워질 방법이 없다.
 * 붙였다가 중복 제거로 되돌리는 헛수고만 남는다. 그래서 기본값을 "보고만" 으로 바꾼다.
 * 롱테일 노출은 이제 해시태그 전략(HT-1 두 층)이 본문을 건드리지 않고 담당한다.
 *
 * 그래도 붙이길 원하면 allowHeadingPatch 로 명시해야 한다 — 조용히 문장을 바꾸지 않는다.
 */
export function enforceSubKeywordCoverage(
  content: CoverageContent,
  subKeywords: string[],
  options: { maxKeywords?: number; allowHeadingPatch?: boolean } = {},
): SubKeywordCoverageResult {
  const result: SubKeywordCoverageResult = { items: [], patchedCount: 0 };
  const headings = Array.isArray(content?.headings) ? content.headings : [];
  const maxKeywords = Math.max(0, options.maxKeywords ?? 3);

  const candidates = (Array.isArray(subKeywords) ? subKeywords : [])
    .map((k) => String(k || '').trim())
    .filter((k) => k.length >= 2)
    .slice(0, maxKeywords);
  if (candidates.length === 0 || headings.length === 0) return result;

  const bodyNorm = normalizeForMatch(
    [
      content.introduction || '',
      ...headings.map((h) => h?.content || ''),
      content.conclusion || '',
    ].join(' '),
  );
  const patchedHeadingIdx = new Set<number>();

  for (const keyword of candidates) {
    const kwNorm = normalizeForMatch(keyword);
    const inHeadings = headings.some((h) => normalizeForMatch(String(h?.title || '')).includes(kwNorm));
    const inBody = bodyNorm.includes(kwNorm);
    const item: SubKeywordCoverageItem = { keyword, inHeadings, inBody, patched: false };
    result.items.push(item);

    // 어디든 있으면 자연 커버 — 무변경(왜곡 최소화).
    if (inHeadings || inBody) continue;

    // 인물+이슈 조합 스킵(메인 패치와 동일 가드 — 실존인물 이슈 소제목 강제 조합 방지).
    const guard = resolveHeadingKeywordCore(keyword);
    if (!guard.shouldPatch) {
      item.skippedReason = guard.reason;
      continue;
    }

    // 타깃 소제목: 토큰 겹침 최대(관련성) → 동률이면 뒤쪽(보완 섹션에 자연스러움). 게이트가 이미
    // 패치한 소제목은 제외(소제목당 1키워드).
    let bestIdx = -1;
    let bestScore = -1;
    for (let i = 0; i < headings.length; i += 1) {
      if (patchedHeadingIdx.has(i) || !headings[i]?.title) continue;
      const score = tokenOverlap(keyword, String(headings[i].title));
      if (score >= bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    if (bestIdx < 0) continue;

    // 기본값은 보고만 — 소제목 문장을 조용히 바꾸지 않는다.
    if (options.allowHeadingPatch !== true) {
      item.skippedReason = 'heading-patch-disabled';
      continue;
    }

    headings[bestIdx] = {
      ...headings[bestIdx],
      title: `${keyword} ${String(headings[bestIdx].title).trim()}`.trim(),
    };
    patchedHeadingIdx.add(bestIdx);
    item.patched = true;
    result.patchedCount += 1;
  }

  return result;
}
