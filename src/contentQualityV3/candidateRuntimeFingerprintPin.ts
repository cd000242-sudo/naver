/**
 * Reviewed runtime identity. This value lives outside the hashed source set to
 * avoid a digest self-reference. Recompute only after the complete runtime
 * source closure is stable and before recording provider or human evidence.
 */
export const CONTENT_QUALITY_V3_CANDIDATE_RUNTIME_SHA256 =
  'dd2e8dbcbf9e394a585d2ff5df56f273c70a1f7cf6c1dce3f7395b4d3f25ce3f' as const;
