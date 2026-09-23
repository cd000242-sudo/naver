/**
 * SPEC-NAVER-IMAGE-2026 — roles for the items of one generateImages call.
 *
 * Callers often send one item per IPC call, so the call alone cannot see its siblings. The renderer
 * wrapper therefore sends the article's full heading list (`sectionPlanHeadings`). The plan is a pure
 * function of that list, so a lone-item call gets the same role it would get inside a batch.
 */
import {
  findPlannedRole,
  inferArticleVisualKind,
  isMetaImageHeading,
  normalizePlanHeading,
  planSectionRoles,
  type SectionRolePlanEntry,
  type SectionVisualRole,
} from './sectionRolePlanner.js';

export interface RoleAssignmentItem {
  readonly heading?: string;
  readonly isThumbnail?: boolean;
}

export interface RoleAssignmentOptions {
  readonly sectionPlanHeadings?: readonly string[];
  readonly category?: string;
  readonly postTitle?: string;
}

/** One item's planned role plus the roles already used by the sections before it in the article. */
export interface RoleAssignmentWithHistory {
  readonly role: SectionVisualRole | null;
  /** Roles of the sections before this one in the plan, oldest first; empty when unknown or a thumbnail. */
  readonly previousRoles: readonly SectionVisualRole[];
}

function isThumbnailItem(item: RoleAssignmentItem): boolean {
  return item.isThumbnail === true || isMetaImageHeading(String(item.heading || ''));
}

/**
 * The set-level plan this call's items resolve against.
 *  - Plan from `sectionPlanHeadings` when at least one item heading is in it (guards against a
 *    stale list from another article).
 *  - Otherwise plan from this call's own section items, but only when there are two or more.
 */
function resolveSectionPlan(
  items: readonly RoleAssignmentItem[],
  options: RoleAssignmentOptions,
): SectionRolePlanEntry[] {
  const kind = inferArticleVisualKind(options.category, options.postTitle);
  const listed = (options.sectionPlanHeadings || []).map((h) => String(h || '')).filter((h) => h.trim());
  const sectionItems = items.filter((item) => !isThumbnailItem(item));

  const listPlan = listed.length > 0 ? planSectionRoles(listed, { kind }) : [];
  const listMatches = listPlan.length > 0 && sectionItems.some((item) => findPlannedRole(listPlan, item.heading) !== null);
  if (listMatches) return listPlan;

  const ownHeadings = sectionItems.map((item) => String(item.heading || ''));
  return ownHeadings.length >= 2 ? planSectionRoles(ownHeadings, { kind }) : [];
}

/** Index of a heading inside the plan, matched the same way `findPlannedRole` does; -1 when absent. */
function findPlanIndex(plan: readonly SectionRolePlanEntry[], heading: string | undefined): number {
  const key = normalizePlanHeading(String(heading || ''));
  if (!key) return -1;
  return plan.findIndex((entry) => entry.heading === key);
}

/**
 * One role per item plus the roles already used earlier in the article (V1 extension).
 *  - `previousRoles` lists the planned roles of the sections BEFORE this item's section, oldest first.
 *  - Thumbnails and items whose section position is unknown get an empty `previousRoles`.
 */
export function assignSectionRolesWithHistory(
  items: readonly RoleAssignmentItem[],
  options: RoleAssignmentOptions = {},
): RoleAssignmentWithHistory[] {
  const plan = resolveSectionPlan(items, options);

  return items.map((item) => {
    if (isThumbnailItem(item)) return { role: null, previousRoles: [] };
    const index = findPlanIndex(plan, item.heading);
    if (index < 0) return { role: null, previousRoles: [] };
    return { role: plan[index].role, previousRoles: plan.slice(0, index).map((entry) => entry.role) };
  });
}

/**
 * One role per item (null = keep today's behaviour for that item). Thumbnails never get a section role.
 */
export function assignSectionRoles(
  items: readonly RoleAssignmentItem[],
  options: RoleAssignmentOptions = {},
): Array<SectionVisualRole | null> {
  return assignSectionRolesWithHistory(items, options).map((entry) => entry.role);
}
