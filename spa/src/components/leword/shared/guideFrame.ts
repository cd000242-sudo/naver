/**
 * Writing-guide frame model (2026-11-08, owner: "cards with and without 'must include / must avoid' look inconsistent").
 *
 * Every benchmark card draws the same guide frame. A card whose guide has not been made yet gets an empty frame with one
 * status label; a slot the finished guide left empty says so. No sentence is invented to fill a missing guide.
 */

/** Shown in every slot of a card whose guide has not been made yet. */
export const GUIDE_PENDING_TEXT = '작성 안내 준비 중';
/** Shown in a slot the finished guide itself left empty (e.g. nothing to avoid). */
export const GUIDE_NONE_TEXT = '없음';

export interface GuideSource {
    writingDirection?: string | null;
    searchTargets?: readonly string[] | null;
    mustInclude?: readonly string[] | null;
    mustAvoid?: readonly string[] | null;
}

export interface GuideSlot {
    items: string[];
    /** Text for an empty slot: the pending label, "none", or '' when the slot has items. */
    empty: string;
}

export interface GuideFrame {
    ready: boolean;
    direction: string;
    searchTargets: GuideSlot;
    include: GuideSlot;
    avoid: GuideSlot;
}

const clean = (list: readonly string[] | null | undefined): string[] =>
    (Array.isArray(list) ? list : []).map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean);

function slot(ready: boolean, list: readonly string[] | null | undefined): GuideSlot {
    // Items only count when the guide itself exists (a direction is the guide's anchor), so a stray list never half-fills the frame.
    const items = ready ? clean(list) : [];
    return { items, empty: items.length > 0 ? '' : ready ? GUIDE_NONE_TEXT : GUIDE_PENDING_TEXT };
}

export function guideFrame(card: GuideSource | null | undefined): GuideFrame {
    const direction = typeof card?.writingDirection === 'string' ? card.writingDirection.trim() : '';
    const ready = direction.length > 0;
    return {
        ready,
        direction,
        searchTargets: slot(ready, card?.searchTargets),
        include: slot(ready, card?.mustInclude),
        avoid: slot(ready, card?.mustAvoid),
    };
}
