/**
 * SPEC-BLUEPRINT-2026 — the short "설계도" produced before the body call.
 *
 * Why this exists (2026-09-04 measurements): the model follows *material* far better than *rules*.
 * "인용하라" as a rule produced 0 quotes in two generations; handing it five verbatim quotes produced
 * three. "첫 문장은 독자 상황으로" was ignored by three engines; a concrete fix note was applied at
 * once. So the pipeline extracts the ingredients first and hands them over as material.
 *
 * Every text field that claims to come from the material must be a verbatim substring of it — the
 * parser enforces that, so nothing here can smuggle a fabricated fact into the body prompt.
 */

export interface BlueprintQuote {
  /** Verbatim passage from the material (quotation marks stripped). */
  readonly text: string;
  /** Who said it, as the material names them; empty when unknown. */
  readonly speaker: string;
}

export interface BlueprintFact {
  /** The fact in the writer's words (may be shortened). */
  readonly claim: string;
  /** Verbatim excerpt from the material that supports the claim. */
  readonly snippet: string;
}

/**
 * [SPEC-EVENT-RETRIEVAL-2026] 자료가 말하는 중심 사건의 서명.
 *
 * 왜 여기인가: 한국어 인물명은 정규식으로 못 뽑는다(Phase 0 실측 — fabricationCheck 의
 * PEOPLE 은 인원수 "40명" 이고, 3자 토큰은 화장실·주차장을 뽑는다). "이 자료에 누가
 * 나오는가" 는 모델이 압도적으로 잘하고, 설계도 호출은 이미 돌고 있다. 새 호출이 아니라
 * 기존 요청의 필드 추가라 한계비용이 사실상 0이다.
 *
 * 모델은 **서명을 뽑을 뿐** 무엇을 버릴지 정하지 않는다 — 판정은 eventCohesion 의
 * 순수 함수 몫이다.
 */
export interface BlueprintCentralEvent {
  /** 이 사건의 등장 인물. */
  readonly people: readonly string[];
  /** 이 사건이 일어난 날짜. */
  readonly dates: readonly string[];
  /** 사건 유형 한 마디("스리런 피홈런"). 판정에는 쓰지 않고 로그에 남긴다. */
  readonly eventType: string;
}

export interface Blueprint {
  /** The one question this post answers. */
  readonly angle: string;
  /** The reader's concrete situation when they meet this post (first sentence of the intro). */
  readonly readerSituation: string;
  readonly quotes: readonly BlueprintQuote[];
  readonly facts: readonly BlueprintFact[];
  /** 3~6 heading candidates, each a distinct question axis. */
  readonly skeleton: readonly string[];
  /** Material subjects that are off the keyword's question and must stay out of the body. */
  readonly offTopic: readonly string[];
  /**
   * 중심 사건 서명. 모델이 안 채웠거나 옛 응답이면 undefined —
   * 그때는 판정을 건너뛴다(근거 없이 자료를 버리지 않는다).
   */
  readonly centralEvent?: BlueprintCentralEvent;
}

export const BLUEPRINT_LIMITS = Object.freeze({
  quotesMax: 5,
  factsMax: 10,
  skeletonMin: 3,
  skeletonMax: 6,
  offTopicMax: 6,
  readerSituationMaxChars: 120,
  angleMaxChars: 80,
  quoteMinChars: 8,
  quoteMaxChars: 160,
  snippetMinChars: 8,
  snippetMaxChars: 200,
  headingMaxChars: 30,
  centralPeopleMax: 8,
  centralDatesMax: 6,
  centralEventTypeMaxChars: 40,
});

/** JSON schema shared by the agent CLI (--output-schema) and the parser. */
export const BLUEPRINT_JSON_SCHEMA: Record<string, unknown> = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['angle', 'readerSituation', 'quotes', 'facts', 'skeleton', 'offTopic'],
  properties: {
    angle: { type: 'string' },
    readerSituation: { type: 'string' },
    quotes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'speaker'],
        properties: { text: { type: 'string' }, speaker: { type: 'string' } },
      },
    },
    facts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['claim', 'snippet'],
        properties: { claim: { type: 'string' }, snippet: { type: 'string' } },
      },
    },
    skeleton: { type: 'array', items: { type: 'string' } },
    offTopic: { type: 'array', items: { type: 'string' } },
    // [SPEC-EVENT-RETRIEVAL-2026] required 에는 넣지 않는다 — 옛 응답과 다른 모드가 깨지면 안 된다.
    centralEvent: {
      type: 'object',
      additionalProperties: false,
      properties: {
        people: { type: 'array', items: { type: 'string' } },
        dates: { type: 'array', items: { type: 'string' } },
        eventType: { type: 'string' },
      },
    },
  },
});
