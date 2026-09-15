/**
 * Reviewed runtime identity. This value lives outside the hashed source set to
 * avoid a digest self-reference. Recompute only after the complete runtime
 * source closure is stable and before recording provider or human evidence.
 */
export const CONTENT_QUALITY_V3_CANDIDATE_RUNTIME_SHA256 =
  '27d20d99baeddf26b9da7ba7e8a8e876ab2cdb2d8f9b9f912e39ba8d566dd065' as const;
