/**
 * Reviewed runtime identity. This value lives outside the hashed source set to
 * avoid a digest self-reference. Recompute only after the complete runtime
 * source closure is stable and before recording provider or human evidence.
 */
export const CONTENT_QUALITY_V3_CANDIDATE_RUNTIME_SHA256 =
  '90d69fa4c90046e61b5df4083b2213bb96d2d88f81c0fb47ccdd8e6b3c71f6fe' as const;
