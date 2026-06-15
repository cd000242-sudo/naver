export interface StalePageCleanupPlan<TPage> {
  stalePages: TPage[];
  staleCount: number;
  shouldLogCleanup: boolean;
}

export function resolveStalePageCleanupPlan<TPage>(
  pages: readonly TPage[],
  currentPage: TPage | null | undefined
): StalePageCleanupPlan<TPage> {
  const stalePages = pages.filter(page => page !== currentPage);

  return {
    stalePages,
    staleCount: stalePages.length,
    shouldLogCleanup: stalePages.length > 0,
  };
}
