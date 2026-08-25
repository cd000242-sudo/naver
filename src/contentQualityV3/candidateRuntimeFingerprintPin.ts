/**
 * Reviewed runtime identity. This value lives outside the hashed source set to
 * avoid a digest self-reference. Recompute only after the complete runtime
 * source closure is stable and before recording provider or human evidence.
 */
export const CONTENT_QUALITY_V3_CANDIDATE_RUNTIME_SHA256 =
  '2297a3a8ae6fe1a09d36b56a866ebe2d9cad4c03e18fd02c0c3b8ccf4b2f19c2' as const;
