/**
 * Reviewed runtime identity. This value lives outside the hashed source set to
 * avoid a digest self-reference. Recompute only after the complete runtime
 * source closure is stable and before recording provider or human evidence.
 */
export const CONTENT_QUALITY_V3_CANDIDATE_RUNTIME_SHA256 =
  '2fd5b4ab00c3c7d3db0dd0dbaa25cbb0d12b41f93f6b3eef83b3880a28320db7' as const;
