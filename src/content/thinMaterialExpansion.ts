// src/content/thinMaterialExpansion.ts
// SPEC-EVENT-RETRIEVAL-2026 Phase 2 — 자료 부족 감지 · 키워드 분해 · 다리 엔티티.
// 전부 순수 함수. 네트워크·LLM 호출 없음. **이 커밋에서는 아무도 부르지 않는다**(배선 별건).
//
// 사장님 지적: "황금키워드는 검색량은 올라오는데 그 키워드를 제목으로 다룬 문서가 아직
// 적은 상태다. 그때 그대로 검색해 상위 문서를 긁으면 모델이 서로 다른 기사를 억지로
// 하나의 이야기로 조립한다."
//
// 사람의 검색은 이렇게 간다:
//   김서현 류현진 평행이론 → 김서현+류현진 / 김서현+플레이오프 / 류현진+김영웅 …
//   → 여러 문서에 공통으로 나오는 '김영웅' 발견 → 이틀 연속 스리런이 중심 사건
//
// 여기서 핵심은 **키워드 엔티티에는 NER 이 필요 없다**는 것이다. 키워드는 사용자가 준
// 짧은 문자열이라 띄어쓰기로 갈린다. Phase 0 이 막혔던 것은 자료 **본문**에서 인물을
// 뽑는 일이었지 키워드가 아니다.

import { extractKoreanFactTokens } from './koreanFactTokens.js';

/** 한 글자·조사만 남은 조각은 엔티티가 아니다. */
const MIN_ENTITY_CHARS = 2;
/** 분해 질의 상한. 늘리면 편당 검색 호출이 그만큼 늘어난다. */
const MAX_DECOMPOSED_QUERIES = 6;
/** 다리 후보 상한. 후보는 질의 힌트일 뿐이므로 적게 준다. */
const MAX_BRIDGES = 3;
// 문서 하나 안에서의 반복 하한(2회)은 extractKoreanFactTokens 가 이미 적용한다.

/** 문서 하나에서 볼 낱말 수 상한. */
const BRIDGE_TOKENS_PER_DOC = 40;

/** 자료를 문서 단위로 잇는 구분자 — eventCohesion 과 같은 값이어야 한다. */
const DOCUMENT_SEPARATOR = '\n\n---\n\n';

/**
 * 키워드만 쓰는 조사·꼬리. 키워드는 짧아서 사전이 커질 필요가 없다 —
 * 자료 본문용 불용어 사전과 혼동하지 말 것(그건 Phase 0 에서 실패했다).
 */
const KEYWORD_TAIL = new Set(['은', '는', '이', '가', '을', '를', '의', '도', '만', '와', '과', '에', '로']);

/** 키워드를 엔티티로 가른다. 띄어쓰기가 유일한 근거다. */
export function keywordEntities(keyword: string): string[] {
  const out: string[] = [];
  for (const raw of String(keyword ?? '').split(/\s+/)) {
    const token = raw.trim();
    if (token.length < MIN_ENTITY_CHARS) continue;
    if (KEYWORD_TAIL.has(token)) continue;
    if (!out.includes(token)) out.push(token);
  }
  return out;
}

export interface ThinMaterialVerdict {
  readonly thin: boolean;
  /** 수집된 문서 수. */
  readonly totalDocs: number;
  /** 키워드 엔티티를 2개 이상 동시에 담은 문서 수. */
  readonly matchedDocs: number;
  /** 부족으로 보지 않으려면 필요한 문서 수. */
  readonly requiredDocs: number;
  readonly entities: readonly string[];
}

/**
 * 자료가 마른 키워드인가.
 *
 * 판정: 키워드 엔티티 **2개 이상을 동시에** 담은 문서가 `requiredDocs` 미만이면 부족.
 * 하나만 담은 문서는 주변 자료다 — 그것만 모아 쓰면 억지 조립이 된다.
 *
 * 임계(requiredDocs=3)는 **잠정값**이다. Phase 0 에서 실데이터로 맞추려 했으나 자료
 * 원문이 저장되지 않아 확정하지 못했다. 배선할 때 로그로 실측한 뒤 조정한다.
 * 엔티티가 2개 미만인 키워드는 분해할 것이 없으므로 판정하지 않는다.
 */
export function detectThinMaterial(
  material: string,
  keyword: string,
  requiredDocs = 3,
): ThinMaterialVerdict {
  const entities = keywordEntities(keyword);
  const docs = String(material ?? '').split(DOCUMENT_SEPARATOR).filter((d) => d.trim().length > 0);
  const base = { totalDocs: docs.length, requiredDocs, entities };

  if (entities.length < 2) return { ...base, thin: false, matchedDocs: docs.length };

  const matchedDocs = docs.filter((doc) => entities.filter((e) => doc.includes(e)).length >= 2).length;
  return { ...base, thin: matchedDocs < requiredDocs, matchedDocs };
}

/**
 * 엔티티를 두 개씩 짝지어 2차 질의를 만든다.
 *
 * 계약 하나: **키워드 안의 낱말만 쓴다.** 바깥 낱말을 지어내면 엉뚱한 자료가 들어온다 —
 * `contentGeneration.ts:1149` 의 "다른 키워드 사용 금지" 결정이 지키려던 것이 그것이다.
 * 이 함수는 그 결정을 뒤집지 않는다. 범위를 "키워드 안의 조합" 으로 한정해 완화할 뿐이다.
 */
export function decomposeKeyword(keyword: string): string[] {
  const entities = keywordEntities(keyword);
  if (entities.length < 2) return [];

  const original = entities.join(' ');
  const queries: string[] = [];
  for (let i = 0; i < entities.length; i += 1) {
    for (let j = i + 1; j < entities.length; j += 1) {
      const query = `${entities[i]} ${entities[j]}`;
      if (query === original) continue; // 이미 검색했다
      if (!queries.includes(query)) queries.push(query);
      if (queries.length >= MAX_DECOMPOSED_QUERIES) return queries;
    }
  }
  return queries;
}

/**
 * 서로 다른 키워드 엔티티를 잇는 말(다리)을 찾는다.
 *
 * 실측 사례의 `김영웅` 이 이것이다 — 원래 키워드에는 없지만, 김서현 문서와 류현진 문서
 * 양쪽에 나온다. 그 교차점이 중심 사건이다.
 *
 * **후보일 뿐 사실이 아니다.** 여기서 나온 말은 3차 질의의 힌트로만 쓴다. 잘못 골라도
 * 질의 한 번을 버릴 뿐, 글에 들어가지 않는다(Phase 1 의 사건 동일성 게이트가 남아 있다).
 * 그래서 정밀도보다 재현율을 택했다 — 한국어 고유명사 판별은 Phase 0 에서 불가능함이
 * 확인됐으므로, "여러 문서를 잇는가" 라는 구조만 본다.
 */
export function findBridgeCandidates(
  documents: readonly string[],
  entities: readonly string[],
): string[] {
  const docs = documents.map((d) => String(d ?? '')).filter((d) => d.trim().length > 0);
  if (docs.length < 2) return [];

  const keywordSet = new Set(entities.map((e) => String(e ?? '').trim()).filter(Boolean));

  /*
   * 문서마다 "충분히 반복된 낱말" 을 모은다. 반복은 그 문서의 뼈대라는 뜻이다.
   *
   * 직접 쪼개면 안 된다 — 한국어는 조사가 붙어 "김영웅에게 / 김영웅의 / 김영웅이" 가
   * 전부 다른 낱말로 갈린다(실측: 김영웅이 한 번도 안 잡혔다). extractKoreanFactTokens 는
   * 조사를 떼고 2회 이상 나온 말만 돌려준다 — 이미 있는 것을 쓴다.
   */
  const perDoc = docs.map((doc) => new Set(
    extractKoreanFactTokens(doc, BRIDGE_TOKENS_PER_DOC)
      .filter((token) => token.length >= 3 && !keywordSet.has(token)),
  ));

  // 여러 문서에 걸치는 낱말만 다리 후보다.
  const spread = new Map<string, number>();
  for (const set of perDoc) for (const token of set) spread.set(token, (spread.get(token) ?? 0) + 1);

  return [...spread.entries()]
    .filter(([, docCount]) => docCount >= 2)
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, MAX_BRIDGES)
    .map(([token]) => token);
}

/** 확장 검색으로 추가할 수 있는 질의 수 상한. 편당 검색 호출이 그만큼 늘어난다. */
const MAX_EXPANDED_QUERIES = 3;

export interface ExpandedRetrievalPlan {
  readonly shouldExpand: boolean;
  /** 추가로 던질 질의. 전부 키워드 안의 낱말 조합이다. */
  readonly queries: readonly string[];
  /** 왜 이렇게 정했는지 — 숫자를 담는다. 로그로 실측해야 임계를 조정할 수 있다. */
  readonly reason: string;
}

/**
 * 확장 검색을 할지, 무엇을 더 검색할지 정한다.
 *
 * 기본은 **끔**이다. 켜지 않으면 호출이 한 번도 늘지 않는다(회귀 없음).
 * 켜져 있어도 자료가 충분하면 확장하지 않는다 — 이길 수 있는 싸움에 돈을 더 쓰지 않는다.
 *
 * 확장해도 못 찾으면 호출자가 있는 자료로 진행한다(SPEC F12). 글을 막는 것은 이 함수의
 * 권한이 아니다 — "왜 글이 안 나오냐" 가 되면 도구를 안 쓰게 된다.
 */
export function planExpandedRetrieval(
  material: string,
  keyword: string,
  options: { enabled?: boolean; requiredDocs?: number } = {},
): ExpandedRetrievalPlan {
  if (options.enabled !== true) {
    return { shouldExpand: false, queries: [], reason: '확장 검색 꺼짐(기본값)' };
  }

  const verdict = detectThinMaterial(material, keyword, options.requiredDocs ?? 3);
  if (verdict.entities.length < 2) {
    return { shouldExpand: false, queries: [], reason: `키워드 엔티티 ${verdict.entities.length}개 — 분해할 것이 없음` };
  }
  if (!verdict.thin) {
    return {
      shouldExpand: false,
      queries: [],
      reason: `자료 충분 — 문서 ${verdict.totalDocs}개 중 ${verdict.matchedDocs}개가 엔티티 2개 이상 포함(기준 ${verdict.requiredDocs})`,
    };
  }

  const queries = decomposeKeyword(keyword).slice(0, MAX_EXPANDED_QUERIES);
  return {
    shouldExpand: queries.length > 0,
    queries,
    reason: `자료 부족 — 문서 ${verdict.totalDocs}개 중 ${verdict.matchedDocs}개만 엔티티 2개 이상 포함(기준 ${verdict.requiredDocs}) → 추가 질의 ${queries.length}개`,
  };
}
