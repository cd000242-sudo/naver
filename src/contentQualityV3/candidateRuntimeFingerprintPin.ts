/**
 * Reviewed runtime identity. This value lives outside the hashed source set to
 * avoid a digest self-reference. Recompute only after the complete runtime
 * source closure is stable and before recording provider or human evidence.
 */
export const CONTENT_QUALITY_V3_CANDIDATE_RUNTIME_SHA256 =
  '9f74d1f1800a60d0e302b555e84b5b18ad6a9c1a09506a20ad1c6cc5f7f2ee32' as const;
