/**
 * Reviewed runtime identity. This value lives outside the hashed source set to
 * avoid a digest self-reference. Recompute only after the complete runtime
 * source closure is stable and before recording provider or human evidence.
 */
export const CONTENT_QUALITY_V3_CANDIDATE_RUNTIME_SHA256 =
  '60c62de74eebdaa8e0ebd83aa3f92d7d200f8335f1af4dbbb541d4e0e4bbf550' as const;
