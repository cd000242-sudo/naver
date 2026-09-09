/**
 * Reviewed runtime identity. This value lives outside the hashed source set to
 * avoid a digest self-reference. Recompute only after the complete runtime
 * source closure is stable and before recording provider or human evidence.
 */
export const CONTENT_QUALITY_V3_CANDIDATE_RUNTIME_SHA256 =
  '5c0dad0d7ff80d9d283f576c7ae7535a7b3a81a86b9e389d85b8aff21dd9a8ee' as const;
