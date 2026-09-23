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
  planSectionRoles,
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

function isThumbnailItem(item: RoleAssignmentItem): boolean {
  return item.isThumbnail === true || isMetaImageHeading(String(item.heading || ''));
}

/**
 * One role per item (null = keep today's behaviour for that item).
 *  - Plan from `sectionPlanHeadings` when at least one item heading is in it (guards against a
 *    stale list from another article).
 *  - Otherwise plan from this call's own section items, but only when there are two or more.
 *  - Thumbnails never get a section role.
 */
export function assignSectionRoles(
  items: readonly RoleAssignmentItem[],
  options: RoleAssignmentOptions = {},
): Array<SectionVisualRole | null> {
  const kind = inferArticleVisualKind(options.category, options.postTitle);
  const listed = (options.sectionPlanHeadings || []).map((h) => String(h || '')).filter((h) => h.trim());
  const sectionItems = items.filter((item) => !isThumbnailItem(item));

  let plan = listed.length > 0 ? planSectionRoles(listed, { kind }) : [];
  const listMatches = plan.length > 0 && sectionItems.some((item) => findPlannedRole(plan, item.heading) !== null);
  if (!listMatches) {
    const ownHeadings = sectionItems.map((item) => String(item.heading || ''));
    plan = ownHeadings.length >= 2 ? planSectionRoles(ownHeadings, { kind }) : [];
  }

  return items.map((item) => (isThumbnailItem(item) ? null : findPlannedRole(plan, item.heading)));
}
