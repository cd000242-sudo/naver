/**
 * Reviewed runtime identity. This value lives outside the hashed source set to
 * avoid a digest self-reference. Recompute only after the complete runtime
 * source closure is stable and before recording provider or human evidence.
 */
export const CONTENT_QUALITY_V3_CANDIDATE_RUNTIME_SHA256 =
  '078226aafb64ed515cd8b1f9e4bc804e09d8e7d0705d6f3a7c470fa6c8e4d98b' as const;
