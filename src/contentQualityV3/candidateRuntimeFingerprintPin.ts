/**
 * Reviewed runtime identity. This value lives outside the hashed source set to
 * avoid a digest self-reference. Recompute only after the complete runtime
 * source closure is stable and before recording provider or human evidence.
 */
export const CONTENT_QUALITY_V3_CANDIDATE_RUNTIME_SHA256 =
  '13f1a6b0c902025f84a6cbf2fb6d4a53e5e93e671f3e63a9edf57b23570fd6a6' as const;
