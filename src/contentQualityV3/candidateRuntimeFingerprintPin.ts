/**
 * Reviewed runtime identity. This value lives outside the hashed source set to
 * avoid a digest self-reference. Recompute only after the complete runtime
 * source closure is stable and before recording provider or human evidence.
 */
export const CONTENT_QUALITY_V3_CANDIDATE_RUNTIME_SHA256 =
  '9d70ca031e5ad17fa6b6575b5a5e8b67bcb3ac7bb38edef77078dc6acc56a08e' as const;
