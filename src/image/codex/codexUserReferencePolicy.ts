// src/image/codex/codexUserReferencePolicy.ts
// [2026-11-11] Tiny, dependency-free rules shared by the image generator (loaded eagerly, unlike the Codex pipeline):
// which roles the user's reference photos have, and whether the prompt builder may use its "reference product photo"
// wording. Kept apart from codexUserReferences.ts so importing it does not pull in the image-cleaning libraries.

export type UserReferenceRoleName = 'person' | 'product';

/** Lenient read of the renderer's option: only well-formed entries count (the strict check runs later and stops the call). */
export function userReferenceRolesOf(raw: unknown): UserReferenceRoleName[] {
  if (!Array.isArray(raw)) return [];
  const roles: UserReferenceRoleName[] = [];
  for (const entry of raw) {
    const role = entry && typeof entry === 'object' ? (entry as Record<string, unknown>).role : undefined;
    if (role === 'person' || role === 'product') roles.push(role);
  }
  return roles;
}

/**
 * Without user photos the answer is exactly what the shopping path decided. With user photos it must match what is
 * really attached: a product photo gets the "keep this product" wording, a person-only set does not, and a thumbnail
 * card gets no user photos at all.
 */
export function resolveHasReferenceImage(request: {
  userRoles: readonly UserReferenceRoleName[];
  isThumbnail: boolean;
  shoppingHasReference: boolean;
}): boolean {
  if (request.userRoles.length === 0) return request.shoppingHasReference;
  if (request.isThumbnail) return false;
  return request.userRoles.includes('product');
}
