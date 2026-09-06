/**
 * Recompute docs/content-quality-v3/legacy-baseline.json after an intentional prompt/evaluator
 * edit. Keeps the allowlist and metadata as-is; only the per-file hashes move. Prints which
 * files changed so the commit message can name them.
 *
 *   npx tsx tmp/refresh-legacy-baseline.ts
 */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createBaselineManifest, serializeBaselineManifest } from '../src/contentQualityV3/baselineManifest';

async function main(): Promise<void> {
  const root = process.cwd();
  const path = resolve(root, 'docs/content-quality-v3/legacy-baseline.json');
  const expected = JSON.parse(await readFile(path, 'utf8'));
  const actual = await createBaselineManifest({
    workspaceRoot: root,
    relativePaths: expected.files.map((f: { path: string }) => f.path),
    metadata: expected.metadata,
  });
  const before = new Map<string, string>(expected.files.map((f: { path: string; sha256: string }) => [f.path, f.sha256]));
  for (const f of actual.files) if (before.get(f.path) !== f.sha256) console.log('changed:', f.path);
  await writeFile(path, serializeBaselineManifest(actual), 'utf8');
  console.log('written', actual.files.length, 'files');
}

main().catch((error) => { console.error(error); process.exit(1); });
