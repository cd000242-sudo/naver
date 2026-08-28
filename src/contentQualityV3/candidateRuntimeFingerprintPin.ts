/**
 * Reviewed runtime identity. This value lives outside the hashed source set to
 * avoid a digest self-reference. Recompute only after the complete runtime
 * source closure is stable and before recording provider or human evidence.
 */
export const CONTENT_QUALITY_V3_CANDIDATE_RUNTIME_SHA256 =
  '3c11ea14b13ae0a785b4ad8095f4b88dd3cf8aa35576bb5d2b5130a2e3aedae8' as const;
