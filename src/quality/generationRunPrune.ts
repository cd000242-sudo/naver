// src/quality/generationRunPrune.ts
//
// Deletes old generation-run snapshot directories beyond a retention count.
// Split out of generationRunStore.ts to keep that file under the project's
// 300-line limit — no other reason for the split.

import * as fs from 'fs';
import * as path from 'path';

/** Delete the oldest run directories under `root` beyond `keep` (sorted by name). */
export function pruneGenerationRuns(root: string, keep = 200): void {
  try {
    if (!fs.existsSync(root)) return;
    const entries = fs
      .readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
    if (entries.length <= keep) return;
    const toRemove = entries.slice(0, entries.length - keep);
    for (const name of toRemove) {
      try {
        fs.rmSync(path.join(root, name), { recursive: true, force: true });
      } catch (err) {
        console.warn(`[GenerationRun] prune failed for ${name}:`, (err as Error)?.message ?? err);
      }
    }
  } catch (err) {
    console.warn('[GenerationRun] prune failed:', (err as Error)?.message ?? err);
  }
}
