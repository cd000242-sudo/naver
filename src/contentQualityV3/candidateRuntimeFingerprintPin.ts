/**
 * Reviewed runtime identity. This value lives outside the hashed source set to
 * avoid a digest self-reference. Recompute only after the complete runtime
 * source closure is stable and before recording provider or human evidence.
 */
export const CONTENT_QUALITY_V3_CANDIDATE_RUNTIME_SHA256 =
  '7eaacd9ddf0dca083bd9cf80fc5afe88db324d0b9d4c60cf0d4c4f88bfa35c65' as const;
