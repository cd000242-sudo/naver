import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  compareBaselineManifests,
  createBaselineManifest,
  type BaselineManifest,
} from '../contentQualityV3/baselineManifest';

const BASELINE_PATH = resolve(
  process.cwd(),
  'docs',
  'content-quality-v3',
  'legacy-baseline.json',
);

async function readExpectedBaseline(): Promise<BaselineManifest> {
  return JSON.parse(await readFile(BASELINE_PATH, 'utf8')) as BaselineManifest;
}

describe('legacy content G0 baseline', () => {
  it('pins every legacy prompt, model registry, prompt assembler, and evaluator byte', async () => {
    const expected = await readExpectedBaseline();
    const actual = await createBaselineManifest({
      workspaceRoot: process.cwd(),
      relativePaths: expected.files.map(file => file.path),
    });

    expect(expected.files.length).toBeGreaterThan(100);
    expect(compareBaselineManifests(expected, actual)).toEqual({
      matches: true,
      code: 'BASELINE_MATCH',
      added: [],
      removed: [],
      changed: [],
    });
  });

  it('contains hashes and provenance only, never source content or absolute paths', async () => {
    const raw = await readFile(BASELINE_PATH, 'utf8');
    const expected = JSON.parse(raw) as BaselineManifest;

    expect(raw).not.toContain(process.cwd());
    expect(expected.algorithm).toBe('sha256');
    expect(expected.metadata).toMatchObject({
      platform: 'win32',
      repositoryHead: expect.stringMatching(/^[a-f0-9]{40}$/),
      nodeVersion: expect.stringMatching(/^v\d+\.\d+\.\d+/),
    });
    expect(expected.files.every(file => /^[a-f0-9]{64}$/.test(file.sha256))).toBe(true);
  });
});
