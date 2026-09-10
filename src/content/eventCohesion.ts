// src/content/eventCohesion.ts
// SPEC-EVENT-RETRIEVAL-2026 Phase 1 — 사건 동일성 판정. 순수 함수, 네트워크 없음.
//
// 왜 필요한가 (사장님 실측): 키워드 "김서현 류현진 평행이론" 으로 쓴 글에 류현진 평행이론 /
// 송영진 151km / 김서현 플레이오프 세 사건이 한 글로 조립됐다. 사람이라면 "김영웅" 이라는
// 다리 인물을 찾아 "이틀 연속 김영웅에게 스리런" 이라는 중심 사건에 도달한다.
//
// 지금 주제 게이트 4곳(sourceAssembler 1611·1788·7636·8120)은 전부 **어휘 겹침**이다.
// 그래서 같은 낱말을 쓰는 다른 사건은 구조적으로 통과한다 — 송영진 기사에도 야구 어휘가
// 다 들어 있다. 어휘를 더 조여도 못 푼다(조이면 자료가 마른다,
// supplementTopicGuard.ts:215 주석이 이미 겪었다). **축을 바꾼다.**
//
//   사건의 동일성은 낱말이 아니라 (인물 집합 × 날짜) 로 정해진다.
//
// 인물은 정규식으로 못 뽑는다는 것이 Phase 0 실측 결론이다(fabricationCheck 의 PEOPLE 은
// 인원수 "40명" 이고, 3자 토큰은 화장실·주차장을 뽑는다). 그래서 서명은 이미 도는 설계도
// LLM 호출의 필드로 받고, **무엇을 버릴지는 이 파일의 순수 함수가 정한다** — 판정을
// 모델에게 맡기지 않는다.

/** 한 자료(또는 글)가 말하는 사건의 서명. */
export interface EventSignature {
  /** 등장 인물. 설계도가 채운다. 폴백 경로에서는 빈 배열이다. */
  readonly people: readonly string[];
  /** 사건 날짜. 정규식으로도 뽑을 수 있는 유일한 축이다. */
  readonly dates: readonly string[];
  /** 사건 유형 한 마디("스리런 피홈런"). 판정에는 쓰지 않고 로그·설계도에 남긴다. */
  readonly eventType: string;
}

export interface MaterialLike {
  readonly id: string;
  readonly text: string;
}

export interface CentralEventSplit<T extends MaterialLike> {
  /** 중심 사건과 이어지는 자료. */
  readonly kept: readonly T[];
  /** 중심 사건과 인물·날짜가 하나도 안 이어지는 자료. 버리지 않고 강등한다. */
  readonly demoted: readonly T[];
  /** id → 강등 사유. 근거 없는 제외는 진단이 불가능하다. */
  readonly reasons: ReadonlyMap<string, string>;
}

/** 날짜 표기 흔들림을 흡수한다 — "10월 22일" 과 "10월22일" 을 같게 본다. */
function normalize(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, '').trim();
}

function normalizedSet(values: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const value of values) {
    const key = normalize(value);
    if (key) out.add(key);
  }
  return out;
}

function intersects(a: Set<string>, b: Set<string>): boolean {
  for (const value of a) if (b.has(value)) return true;
  return false;
}

/**
 * 두 서명이 같은 사건을 말하는가.
 *
 * 인물이든 날짜든 **하나라도 이어지면** 같은 사건으로 본다. 느슨해 보이지만 의도한 것이다 —
 * 조이면 자료가 마르고, 이 도구는 자료를 넣는 것이 강점이다. 걸러내려는 것은
 * "겹치는 것이 하나도 없는" 자료뿐이다.
 *
 * 어느 한쪽 서명이 비면 **같은 사건으로 본다**. 근거가 없을 때 버리는 쪽으로 기울면
 * 판정 못 한 자료가 전부 사라진다.
 */
export function isSameEvent(central: EventSignature, candidate: EventSignature): boolean {
  const centralPeople = normalizedSet(central.people);
  const centralDates = normalizedSet(central.dates);
  if (centralPeople.size === 0 && centralDates.size === 0) return true;

  const people = normalizedSet(candidate.people);
  const dates = normalizedSet(candidate.dates);
  if (people.size === 0 && dates.size === 0) return true;

  return intersects(centralPeople, people) || intersects(centralDates, dates);
}

/**
 * 자료를 중심 사건 기준으로 가른다.
 *
 * 계약 하나: **전부 강등될 상황이면 강등을 포기한다.** 그런 결과는 중심 사건이 잘못
 * 잡혔다는 뜻이지 자료가 전부 무관하다는 뜻이 아니다. 그대로 두면 글에 쓸 자료가
 * 하나도 남지 않아, 자료를 안 넣는 LLM 보다 못한 글이 나온다.
 */
export function splitByCentralEvent<T extends MaterialLike>(
  materials: readonly T[],
  central: EventSignature,
  signatureOf: (material: T) => EventSignature,
): CentralEventSplit<T> {
  const empty = { kept: materials, demoted: [] as T[], reasons: new Map<string, string>() };
  if (materials.length === 0) return empty;
  if (normalizedSet(central.people).size === 0 && normalizedSet(central.dates).size === 0) return empty;

  const kept: T[] = [];
  const demoted: T[] = [];
  const reasons = new Map<string, string>();

  for (const material of materials) {
    const signature = signatureOf(material);
    if (isSameEvent(central, signature)) {
      kept.push(material);
      continue;
    }
    demoted.push(material);
    reasons.set(
      material.id,
      `중심 사건과 인물·날짜가 하나도 겹치지 않음 `
      + `(자료 인물: ${signature.people.join('·') || '없음'} / 날짜: ${signature.dates.join('·') || '없음'})`,
    );
  }

  if (kept.length === 0) return empty;
  return { kept, demoted, reasons };
}

/** 날짜만 뽑는 폴백 서명 — 설계도가 실패했을 때 쓴다. */
const DATE_RE = /\d{1,2}\s*월\s*\d{1,2}\s*일|\d{4}\s*년\s*\d{1,2}\s*월(?:\s*\d{1,2}\s*일)?/gu;

/**
 * 자료 텍스트에서 서명을 뽑는다 — **날짜뿐이다.**
 *
 * 인물을 비우는 것은 게으름이 아니라 Phase 0 결론이다. 정규식으로 한국어 인물명을
 * 뽑으려던 시도는 화장실·주차장·소속사를 뽑았다. 잘못 뽑은 인물로 판정하면 맞는 자료를
 * 버린다 — 빈 인물 집합은 isSameEvent 에서 "판정하지 않음" 으로 안전하게 흐른다.
 */
export function materialEventSignature(text: string): EventSignature {
  const body = String(text ?? '');
  const dates = [...new Set((body.match(DATE_RE) || []).map((d) => d.trim()))];
  return { people: [], dates, eventType: '' };
}

/** 자료를 문서 단위로 잇는 구분자 — sourceAssembler.ts:8183 의 join 과 같아야 한다. */
export const MATERIAL_DOCUMENT_SEPARATOR = '\n\n---\n\n';

/** 중심 사건 판정에 필요한 최소 단서 수. 단서 1개로 자료를 버리면 오탐이 너무 비싸다. */
const MIN_CENTRAL_CLUES = 2;

export interface MentionSplit {
  readonly kept: readonly string[];
  readonly demoted: readonly string[];
  readonly reasons: readonly string[];
}

/**
 * 중심 인물·날짜가 **언급조차 되지 않는** 문서를 강등한다.
 *
 * 핵심: 문서마다 인물을 뽑을 필요가 없다. 한국어 인물명 추출이 불가능하다는 것이 Phase 0
 * 결론이었는데, 중심 인물은 설계도가 이미 알려주므로 각 문서에 대해서는 **그 이름이
 * 나오는지**만 보면 된다. 추출(어려움)을 조회(쉬움)로 바꾼 것이다.
 *
 * 안전장치 셋 — 전부 "자료가 마르는 쪽으로 기울지 않는다" 는 한 원칙에서 나온다:
 *   1. 중심 단서가 2개 미만이면 판정하지 않는다 (근거가 약하다)
 *   2. 문서가 하나뿐이면 판정하지 않는다 (비교 대상이 없다)
 *   3. 전부 강등될 상황이면 강등을 포기한다 (중심 사건이 잘못 잡힌 것이다)
 */
export function splitByCentralMention(material: string, central: EventSignature): MentionSplit {
  const text = String(material ?? '');
  const documents = text.split(MATERIAL_DOCUMENT_SEPARATOR).filter((doc) => doc.trim().length > 0);
  const none: MentionSplit = { kept: documents, demoted: [], reasons: [] };
  if (documents.length < 2) return none;

  const clues = [...central.people, ...central.dates]
    .map((clue) => String(clue ?? '').trim())
    .filter((clue) => clue.length >= 2);
  if (clues.length < MIN_CENTRAL_CLUES) return none;

  // 날짜는 "10월 22일" 과 "10월22일" 이 같은 날이다 — 공백을 지운 본문에서도 찾는다.
  const compact = (value: string): string => value.replace(/\s+/g, '');
  const kept: string[] = [];
  const demoted: string[] = [];
  const reasons: string[] = [];

  for (const doc of documents) {
    const docCompact = compact(doc);
    const hit = clues.some((clue) => doc.includes(clue) || docCompact.includes(compact(clue)));
    if (hit) {
      kept.push(doc);
      continue;
    }
    demoted.push(doc);
    reasons.push(
      `중심 사건 단서(${clues.join('·')})가 하나도 언급되지 않음 — "${doc.trim().slice(0, 40)}…"`,
    );
  }

  if (kept.length === 0) return none;
  return { kept, demoted, reasons };
}
