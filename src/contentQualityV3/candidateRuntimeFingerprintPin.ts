/**
 * Reviewed runtime identity. This value lives outside the hashed source set to
 * avoid a digest self-reference. Recompute only after the complete runtime
 * source closure is stable and before recording provider or human evidence.
 */
export const CONTENT_QUALITY_V3_CANDIDATE_RUNTIME_SHA256 =
  '45ee31e6ca3fcb4f526a0c18ad51ad9cccb50c6b696ba94e45b3fc4a591fbb4e' as const;
