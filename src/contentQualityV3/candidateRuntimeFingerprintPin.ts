/**
 * Reviewed runtime identity. This value lives outside the hashed source set to
 * avoid a digest self-reference. Recompute only after the complete runtime
 * source closure is stable and before recording provider or human evidence.
 */
export const CONTENT_QUALITY_V3_CANDIDATE_RUNTIME_SHA256 =
  'b71d80d94a0e72b405e75d9515ef9ec7aa5a6a1d1747820dcbf87a8c8855a058' as const;
