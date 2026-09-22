// Reopen an existing generation run by id (e.g. at publish time in BlogExecutor, which
// runs long after generateStructuredContent finished and cleared the active run).
// Best-effort: returns null when the run directory or meta.json cannot be read.

import * as fs from 'fs';
import * as path from 'path';
import { GenerationRun, resolveGenerationRunsRoot, setActiveGenerationRun } from './generationRunStore.js';
import type { GenerationRunMeta } from './generationRunTypes.js';

const RUN_ID_PATTERN = /^\d{8}-\d{6}-[a-z0-9]{6}$/;

export function openGenerationRun(runId: unknown, root?: string): GenerationRun | null {
  const id = String(runId || '').trim();
  if (!RUN_ID_PATTERN.test(id)) return null;
  try {
    const base = root || resolveGenerationRunsRoot();
    const metaPath = path.join(base, id, 'meta.json');
    if (!fs.existsSync(metaPath)) return null;
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as GenerationRunMeta;
    if (!meta || typeof meta !== 'object' || !meta.keyword) return null;
    return new GenerationRun({ ...meta, runId: id }, base);
  } catch (err) {
    console.warn(`[GenerationRun] reopen failed for ${id}:`, (err as Error)?.message ?? err);
    return null;
  }
}

/** Convenience: reopen and make active for the duration of `fn`, restoring the previous active run. */
export async function withReopenedRun<T>(
  runId: unknown,
  fn: (run: GenerationRun | null) => Promise<T>,
): Promise<T> {
  const run = openGenerationRun(runId);
  if (!run) return fn(null);
  setActiveGenerationRun(run);
  try {
    return await fn(run);
  } finally {
    setActiveGenerationRun(null);
  }
}
