/**
 * Reviewed runtime identity. This value lives outside the hashed source set to
 * avoid a digest self-reference. Recompute only after the complete runtime
 * source closure is stable and before recording provider or human evidence.
 */
export const CONTENT_QUALITY_V3_CANDIDATE_RUNTIME_SHA256 =
  '0dc30ca0497475261e561378b3afe1734d9ad58693c55e4d4240f43ebb634923' as const;
