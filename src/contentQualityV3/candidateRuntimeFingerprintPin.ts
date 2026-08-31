/**
 * Reviewed runtime identity. This value lives outside the hashed source set to
 * avoid a digest self-reference. Recompute only after the complete runtime
 * source closure is stable and before recording provider or human evidence.
 */
export const CONTENT_QUALITY_V3_CANDIDATE_RUNTIME_SHA256 =
  '34af0e5d8e1999860ed2a0aeaed2d4a2cdfa1b6fcfb25c9287bd7a7de7f4e18b' as const;
