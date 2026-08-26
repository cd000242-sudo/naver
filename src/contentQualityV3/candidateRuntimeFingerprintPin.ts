/**
 * Reviewed runtime identity. This value lives outside the hashed source set to
 * avoid a digest self-reference. Recompute only after the complete runtime
 * source closure is stable and before recording provider or human evidence.
 */
export const CONTENT_QUALITY_V3_CANDIDATE_RUNTIME_SHA256 =
  '11eb67719276bc3a18c43f4730bed49554d61cb251c596a8f6ea86905891a8f8' as const;
