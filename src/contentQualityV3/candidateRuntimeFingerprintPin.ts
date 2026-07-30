/**
 * Reviewed runtime identity. This value lives outside the hashed source set to
 * avoid a digest self-reference. Recompute only after the complete runtime
 * source closure is stable and before recording provider or human evidence.
 */
export const CONTENT_QUALITY_V3_CANDIDATE_RUNTIME_SHA256 =
  'a14c308360a8651bf92b0688b118e1d728f3bef28a445604402c5bda590499d0' as const;
