/**
 * Reviewed runtime identity. This value lives outside the hashed source set to
 * avoid a digest self-reference. Recompute only after the complete runtime
 * source closure is stable and before recording provider or human evidence.
 */
export const CONTENT_QUALITY_V3_CANDIDATE_RUNTIME_SHA256 =
  'ededd2849b4db1e8b8e64ad1b73f1e87561b9c5acfb0b19d1f3c6f60b7bc8be1' as const;
