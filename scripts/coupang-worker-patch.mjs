/** Surgical patch of the CURRENT deployed Worker; never upload an old local copy. */
export const oldSelection = 'const accumulatorRows = merged.slice(0, 80);\n  const board = merged.filter((row) => verdictGroup(row) !== 2).slice(0, 60);';
export const discoverySelection = `// Search competition is a UI-specific route, never a product deletion gate.
  // Keep at most 80 observations from the last 24h, newest first, without extra fetches.
  const poolNow = Date.now();
  const accumulatorRows = merged.filter((row) => {
    const age = poolNow - Date.parse(row.measuredAt);
    return Number.isFinite(age) && age >= 0 && age <= 86400000;
  }).sort((a, b) => Date.parse(b.measuredAt) - Date.parse(a.measuredAt)).slice(0, 80);
  const board = accumulatorRows;`;

export function patchCoupangWorker(source) {
  const normalized = source.replace(/\r\n/g, '\n');
  const oldKey = 'https://leword-cache.invalid/coupang-board-v10';
  const newKey = 'https://leword-cache.invalid/coupang-board-v11-discovery';
  if (normalized.includes(newKey) && normalized.includes(discoverySelection)) return normalized;
  for (const target of [oldKey, oldSelection]) {
    if (normalized.split(target).length !== 2) throw new Error('Worker structure changed; inspect current code before patching');
  }
  return normalized.replace(oldKey, newKey).replace(oldSelection, discoverySelection);
}
