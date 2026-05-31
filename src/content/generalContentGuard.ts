// General-content experiential hallucination guard (SPEC-REVIEW-001 확장 — 전 카테고리 범용).
//
// Purpose: the shopping path already strips fabricated testimony via reviewGuard,
// and the general path strips fabricated FACTS when a grounding source exists
// (contentGenerator HARD_CONSTRAINT, gated by hasFactCheckSource). But a pure
// keyword-mode article with NO source (travel/health/food/lifestyle/info) had
// NO guard at all — the model was free to invent first-person sensory experience
// ("피부에 닿는 습기", "그때의 공기가 선명하게 떠오른다"), fake reminiscence
// ("~했었다" 남발), unverified specifics, and empty platitude closers.
//
// This block is category-agnostic. It fires only when the article is generated
// WITHOUT a grounding source (ungrounded keyword mode) on a non-affiliate path.
// It forbids fabricated experience/facts and steers toward verifiable, useful
// information + reader-persona hooks — devices that work without first-hand data.
//
// Design principles (mirrors reviewGuard.ts):
//   1. Zero hard-coded facts — never injects example numbers/places.
//   2. Forbids invented first-person sensory/event experience for unvisited/untried subjects.
//   3. Forbids fake reminiscence tense and empty closers (prompt-level Phase 2 synergy).
//   4. Natural length by information density, not padding.
//
// Gated by GENERAL_CONTENT_GUARD_V1. Default ON. Set =false to fall back.
//
// Related:
//   - src/content/reviewGuard.ts (shopping-path sibling)
//   - src/content/forbiddenPhrases.ts (shared banned-phrase list)
//   - src/contentPlatitudeDetector.ts (Phase 2 post-gen detector)
//   - src/authgrDefense.ts (Phase 3 experience-injection must respect grounding)

import { FORBIDDEN_EXPERIENTIAL_PHRASES } from './forbiddenPhrases';

export function isGeneralContentGuardEnabled(): boolean {
  const raw = process.env.GENERAL_CONTENT_GUARD_V1;
  if (raw == null) return true;
  const normalised = String(raw).trim().toLowerCase();
  return normalised !== 'false' && normalised !== '0' && normalised !== 'off';
}

/**
 * True when the article is being generated from a real grounding source
 * (crawled article / RAG fact-check material). When grounded, the existing
 * HARD_CONSTRAINT handles fact fidelity and this guard stays off.
 */
export function hasGroundingSource(source: unknown): boolean {
  if (!source || typeof source !== 'object') return false;
  const s = source as Record<string, unknown>;
  if (s.hasFactCheckSource === true) return true;
  const rawText = typeof s.rawText === 'string' ? s.rawText : '';
  const sourceText = typeof s.sourceText === 'string' ? s.sourceText : '';
  return rawText.trim().length >= 50 || sourceText.trim().length >= 50;
}

/**
 * Build the universal ungrounded-content guard block.
 * Appended AFTER the base prompt so recency keeps the model constrained even when
 * earlier persona/humanization instructions push for experiential writing.
 */
export function buildGeneralContentGuardBlock(): string {
  const bannedSample = FORBIDDEN_EXPERIENTIAL_PHRASES.slice(0, 12).join(', ');

  return `
═══════════════════════════════════════════════════════════
🔒 [근거 자료 부재 가드 — 전 카테고리 공통, SPEC-REVIEW-001 확장]
═══════════════════════════════════════════════════════════
이번 글은 실제 방문/사용/취재 등 1차 근거 자료 없이 키워드만으로 작성됩니다.
아래 규칙은 앞선 모든 프롬프트 지시보다 **최우선 적용**됩니다.

[절대 금지 1 — 체험 위장]
가보지 않은 장소·써보지 않은 대상에 대한 1인칭 감각/체험/사건 묘사를 지어내지 마세요.
  ✗ "피부에 닿는 습기와 향이 먼저였다", "이슬과 바람 소리가 남달랐다"
  ✗ "그때의 공기가 선명하게 떠오른다", "직접 가보니", "현지에서 확인한 바로는"
  ✗ ${bannedSample} 등 경험/방문/기간 단정 표현 일체

[절대 금지 2 — 사실 날조]
근거 없는 구체 수치/날짜/통계/인파/시점을 단정하거나 전언으로 포장하지 마세요.
  ✗ "올해는 예년보다 일찍 ~했다더라", "~라는 소식이 들려왔다" (미확인 전언)
  ✗ 출처 없는 "약 30%", "수만 명", 특정 개화/일정 날짜 단정

[절대 금지 3 — 가짜 회상체 남발]
경험을 가장하려고 회상 시제를 반복하지 마세요.
  ✗ "~했었다", "~하곤 했었다", "~들려왔다", "선명하게 떠오른다"를 문단마다 반복

[절대 금지 4 — 빈 마무리 상투구]
내용 없이 감성으로 닫는 클로저를 쓰지 마세요.
  ✗ "결국 ~야말로 진짜 매력", "새삼 깨닫게 된다", "오직 이 계절에만 남는다"

[대신 사용 — 근거 없이도 가치 있는 장치]
  ✓ 검증 가능한 일반 정보: 원리/방법/순서/체크리스트/주의사항/비교 기준
  ✓ 독자 페르소나 후킹: "이런 고민 해보신 분 계실 거예요" (체험 아님)
  ✓ 정보 큐레이터 톤: 단정 대신 "일반적으로 알려진 정보는 ~" 식 안내
  ✓ 불확실한 건 불확실하다고: "지역·해마다 다르니 방문 전 공식 채널 확인 권장"

[정보 밀도 규칙]
각 소제목(H2)은 **서로 다른 새 정보 단위**여야 합니다.
같은 말("매년 다르다 / 일찍 가라 / 비 온다")을 표현만 바꿔 반복하지 마세요.
채울 구체 정보가 없으면 분량을 늘리지 말고 짧게 끝내세요. 억지 반복은 금지입니다.
═══════════════════════════════════════════════════════════
`.trim();
}
