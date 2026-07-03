/**
 * [Phase 3-14/v2.10.160] contentGenerator god file decomposition — title prefix helpers.
 *
 * 제품명/제목 prefix 처리 — review 글에서 소제목이 전체 제목으로 시작할 때 prefix 제거.
 * 의존: contentTextHelpers (removeEmojis, normalizeTitleWhitespace), StructuredContent type.
 */

import type { StructuredContent } from './contentGenerator';
import { removeEmojis, normalizeTitleWhitespace } from './contentTextHelpers';

export function buildTitlePrefixCandidates(selectedTitle: string, productName: string): string[] {
  const title = String(selectedTitle || '').trim();
  const prod = String(productName || '').trim();
  if (!title) return [];

  const candidates = new Set<string>();
  candidates.add(title);

  const titleWords = title
    .replace(/[!?]+/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .split(/\s+/)
    .map((w) => String(w || '').trim())
    .filter(Boolean);
  for (let n = 3; n <= Math.min(12, titleWords.length); n++) {
    const wp = titleWords.slice(0, n).join(' ').trim();
    if (wp) candidates.add(wp);
  }

  if (prod && title.startsWith(prod)) {
    let rest = title.slice(prod.length).trim();
    rest = rest.replace(/^[\s\-–—:|·•,]+/, '').trim();
    if (rest) {
      const segs = rest
        .split(/[\-|–—:|·•,]+/)
        .map((s) => String(s || '').trim())
        .filter(Boolean);

      for (let i = 1; i <= segs.length; i++) {
        const joined = segs.slice(0, i).join(', ').trim();
        if (joined) candidates.add(`${prod} ${joined}`.trim());
      }

      if (segs.length >= 2) {
        const seg2 = String(segs[1] || '').trim();
        const words = seg2.split(/\s+/).filter(Boolean);
        for (let w = 1; w <= Math.min(5, words.length); w++) {
          const wordPrefix = words.slice(0, w).join(' ').trim();
          if (wordPrefix) {
            candidates.add(`${prod} ${segs[0]}, ${wordPrefix}`.trim());
          }
        }
      }

      if (segs.length >= 2) {
        const seg2Short = segs[1].replace(/(된다니|된다면|된다|된).*$/g, '').trim();
        if (seg2Short) {
          candidates.add(`${prod} ${segs[0]}, ${seg2Short}`.trim());
        }
      }
    }
  }

  return Array.from(candidates.values()).sort((a, b) => b.length - a.length);
}

export function stripReviewTitlePrefixFromHeading(headingTitle: string, selectedTitle: string, productName: string): string {
  let h = String(headingTitle || '').trim();
  if (!h) return h;

  // ✅ [2026-02-02] 조사로 시작하면 잘못된 제거로 간주 (주어가 잘린 것)
  const startsWithParticle = (s: string): boolean => {
    const particles = ['의', '이', '가', '를', '을', '은', '는', '에', '와', '과', '로', '으로', '에서', '까지', '부터', '도', '만'];
    const trimmed = s.trim();
    return particles.some(p => trimmed.startsWith(p + ' ') || trimmed === p);
  };

  const candidates = buildTitlePrefixCandidates(selectedTitle, productName);
  const normalizeForPrefixMatch = (s: string): string => {
    const cleaned = removeEmojis(String(s || ''));
    return normalizeTitleWhitespace(cleaned).trim();
  };
  const normalizedHeading = normalizeForPrefixMatch(h);
  for (const prefix of candidates) {
    if (!prefix) continue;

    const normalizedPrefix = normalizeForPrefixMatch(prefix);
    if (!normalizedPrefix) continue;

    if (normalizedHeading.startsWith(normalizedPrefix)) {
      let remainder = normalizedHeading.slice(normalizedPrefix.length).trim();
      remainder = remainder.replace(/^[\s\-–—:|·•,]+/, '').trim();

      // ✅ [2026-02-02] 잘린 결과가 조사로 시작하면 원본 유지 (주어 보호)
      if (remainder && startsWithParticle(remainder)) {
        console.warn(`[stripReviewTitlePrefix] 조사로 시작하는 결과 감지 → 원본 유지: "${h}"`);
        return h;  // 원본 유지
      }

      h = remainder;
      break;
    }
  }

  return h;
}


// ✅ [2026-07-03] 소제목 앞에 붙은 "{화제 주어}까지 " 낚시 훅 제거.
//   원인: homefeed 프롬프트가 "모든 H2에 실명 1개"를 강제 → 단일 인물 글에서 모델이 화제 인물명을
//   "{인물}까지"(심지어 ~까지) 훅으로 소제목 앞에 덧붙인다(예: "박지성까지 박지성 공동위원장" 중복,
//   "박지성까지 팬들이 꼽은..." 매달린 훅). stripSelectedTitlePrefixFromHeadings는 '제목 전체' 접두어만
//   잡아 이 부분 훅을 놓친다.
//   (a) 즉시 반복("{W}까지 {W}...")은 컨텍스트 무관 제거(오탐 0).
//   (b) 제목 주어와 일치하는 선행 "{주어}까지 "는 인물/이슈 중심 글(personCentric)에서만 제거
//       — 맛집/제품의 통합형 "{대상}까지 맛있는..."(까지=포함) 오탐 방지.
export function stripLeadingSubjectHookFromHeadings(content: StructuredContent, personCentric = false): void {
  if (!content || !Array.isArray(content.headings) || content.headings.length === 0) return;

  const title = normalizeTitleWhitespace(removeEmojis(String(content.selectedTitle || ''))).trim();

  const startsWithParticle = (s: string): boolean => {
    const particles = ['의', '이', '가', '를', '을', '은', '는', '에', '와', '과', '로', '으로', '에서', '까지', '부터', '도', '만'];
    const t = s.trim();
    return particles.some((p) => t.startsWith(p + ' ') || t === p);
  };

  content.headings = content.headings.map((h) => {
    const original = String(h.title || '').trim();
    // 맨 앞 "{공백 없는 토큰}까지" + 공백/쉼표. "까지만/까지는"(조사 결합)은 [\s,] 요구로 제외.
    const m = original.match(/^(\S{2,15}?)까지[\s,]+/);
    if (!m) return h;
    const lead = m[1];
    const rest = original.slice(m[0].length).trim();
    if (!rest || rest.length < 6 || startsWithParticle(rest)) return h; // 주어 보호·과다제거 방지

    const isRepeat = rest.startsWith(lead);                 // (a) 즉시 반복 — 오탐 0
    const isSubjectHook = personCentric && lead.length >= 2 && title.includes(lead); // (b) 인물 중심 한정

    return (isRepeat || isSubjectHook) ? { ...h, title: rest } : h;
  });
}

// ✅ 공통: 소제목이 전체 제목으로 시작하는 경우 제목 부분만 1회 잘라내기
// - 리뷰형 여부와 무관하게 동작
// - heading 이 제목과 완전히 동일한 경우는 건드리지 않고, 아래 "1번 소제목 중복 제거" 로직에 맡긴다.
export function stripSelectedTitlePrefixFromHeadings(content: StructuredContent): void {
  if (!content || !content.selectedTitle || !Array.isArray(content.headings) || content.headings.length === 0) {
    return;
  }

  const normalizeForCompare = (s: string): string => {
    const cleaned = removeEmojis(String(s || ''));
    return normalizeTitleWhitespace(cleaned).trim();
  };

  // ✅ [2026-01-20] 조사로 시작하면 잘못된 제거로 간주 (주어가 잘린 것)
  const startsWithParticle = (s: string): boolean => {
    const particles = ['의', '이', '가', '를', '을', '은', '는', '에', '와', '과', '로', '으로', '에서', '까지', '부터', '도', '만'];
    const trimmed = s.trim();
    return particles.some(p => trimmed.startsWith(p + ' ') || trimmed === p);
  };

  const normalizedTitle = normalizeForCompare(content.selectedTitle);
  if (!normalizedTitle) return;

  content.headings = content.headings.map((h) => {
    const original = String(h.title || '').trim();
    if (!original) return h;

    const normalizedHeading = normalizeForCompare(original);
    if (!normalizedHeading || normalizedHeading.length <= normalizedTitle.length) {
      return h;
    }

    if (normalizedHeading.startsWith(normalizedTitle)) {
      let remainder = normalizedHeading.slice(normalizedTitle.length).trim();
      remainder = remainder.replace(/^[\s\-–—:|·•,]+/, '').trim();

      // ✅ [2026-01-20] 잘린 결과가 조사로 시작하면 원본 유지 (주어 보호)
      if (remainder && startsWithParticle(remainder)) {
        console.log(`[HeadingProtection] 소제목 보호: "${original}" (조사로 시작하는 잔여물 감지)`);
        return h; // 원본 유지
      }

      // ✅ [2026-01-20] 잘린 결과가 너무 짧으면 원본 유지 (최소 5자)
      if (remainder && remainder.length < 5) {
        console.log(`[HeadingProtection] 소제목 보호: "${original}" (잔여물 너무 짧음: ${remainder.length}자)`);
        return h; // 원본 유지
      }

      if (remainder) {
        return {
          ...h,
          title: remainder,
        };
      }
    }

    return h;
  });
}
