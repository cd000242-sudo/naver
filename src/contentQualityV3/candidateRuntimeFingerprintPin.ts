/**
 * Reviewed runtime identity. This value lives outside the hashed source set to
 * avoid a digest self-reference. Recompute only after the complete runtime
 * source closure is stable and before recording provider or human evidence.
 */
export const CONTENT_QUALITY_V3_CANDIDATE_RUNTIME_SHA256 =
  'a1f6f2cf6815fe7ce8c022fdbd706be0199bcfec367c2860dbc0e4a48a4f1f1c' as const;
