/**
 * Reviewed runtime identity. This value lives outside the hashed source set to
 * avoid a digest self-reference. Recompute only after the complete runtime
 * source closure is stable and before recording provider or human evidence.
 */
export const CONTENT_QUALITY_V3_CANDIDATE_RUNTIME_SHA256 =
  '19fb0c9ad75a3c5a3b1c8bd1f09fc1fa3ee80ce86a2c83892bf3497c823223f1' as const;
