/**
 * Reviewed runtime identity. This value lives outside the hashed source set to
 * avoid a digest self-reference. Recompute only after the complete runtime
 * source closure is stable and before recording provider or human evidence.
 */
export const CONTENT_QUALITY_V3_CANDIDATE_RUNTIME_SHA256 =
  'cc3d2cf5c8456e9c0d2d4182ccb821ccec407cbf53d5edf3fd1f5b1c233b595d' as const;
