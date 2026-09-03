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
  },
});
