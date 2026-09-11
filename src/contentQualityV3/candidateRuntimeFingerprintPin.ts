/**
 * Reviewed runtime identity. This value lives outside the hashed source set to
 * avoid a digest self-reference. Recompute only after the complete runtime
 * source closure is stable and before recording provider or human evidence.
 */
export const CONTENT_QUALITY_V3_CANDIDATE_RUNTIME_SHA256 =
  '7dbaa2619fd9e8185f2e3cb2c92197103c1f2c71ca8ab3a0805f0d4d38be6b84' as const;
