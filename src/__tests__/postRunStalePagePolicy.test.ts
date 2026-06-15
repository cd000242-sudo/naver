import { describe, expect, it } from 'vitest';
import { resolveStalePageCleanupPlan } from '../automation/postRunStalePagePolicy.js';

describe('resolveStalePageCleanupPlan', () => {
  it('keeps the current page and marks all other pages as stale', () => {
    const current = { id: 'current' };
    const staleA = { id: 'stale-a' };
    const staleB = { id: 'stale-b' };

    const plan = resolveStalePageCleanupPlan([current, staleA, staleB], current);

    expect(plan.stalePages).toEqual([staleA, staleB]);
    expect(plan.staleCount).toBe(2);
    expect(plan.shouldLogCleanup).toBe(true);
  });

  it('treats every page as stale when the current page reference is missing', () => {
    const pages = [{ id: 'a' }, { id: 'b' }];

    const plan = resolveStalePageCleanupPlan(pages, null);

    expect(plan.stalePages).toEqual(pages);
    expect(plan.staleCount).toBe(2);
    expect(plan.shouldLogCleanup).toBe(true);
  });

  it('does not log cleanup when there are no stale pages', () => {
    const current = { id: 'current' };

    const plan = resolveStalePageCleanupPlan([current], current);

    expect(plan.stalePages).toEqual([]);
    expect(plan.staleCount).toBe(0);
    expect(plan.shouldLogCleanup).toBe(false);
  });
});
