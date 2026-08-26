/**
 * Reviewed runtime identity. This value lives outside the hashed source set to
 * avoid a digest self-reference. Recompute only after the complete runtime
 * source closure is stable and before recording provider or human evidence.
 */
export const CONTENT_QUALITY_V3_CANDIDATE_RUNTIME_SHA256 =
  '6b2d2fb1dfa987dec16e5b2a7e6c3af822325e8beb1dc4fdbbf8ded5426c7745' as const;
