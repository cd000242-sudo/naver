import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  CONTENT_QUALITY_V3_LEGACY_BASELINE_RELATIVE_PATH,
} from '../contentQualityV3/currentEvidenceBindings.js';

const PROJECT_ROOT = resolve(__dirname, '../..');
const BASELINE_PACKAGE_PATH = 'docs/content-quality-v3/legacy-baseline.json';
const BASELINE_EOL_RULE = `${BASELINE_PACKAGE_PATH} text eol=lf`;
const LEGACY_SOURCE_EOL_RULES = Object.freeze([
  'src/prompts/** text eol=lf',
  'src/content/evaluators/** text eol=lf',
  'src/content/quality90Gate.ts text eol=lf',
  'src/content/qualityEvaluator.ts text eol=lf',
  'src/contentJsonPromptFormat.ts text eol=lf',
  'src/promptLoader.ts text eol=lf',
  'src/runtime/modelRegistry.ts text eol=lf',
] as const);

interface LegacyBaselineManifest {
  readonly files: readonly { readonly path: string }[];
}

function isCoveredByLegacySourceEolRule(path: string): boolean {
  return path.startsWith('src/prompts/')
    || path.startsWith('src/content/evaluators/')
    || LEGACY_SOURCE_EOL_RULES.some(rule => rule.startsWith(`${path} `));
}

interface PackageManifest {
  readonly build?: {
    readonly files?: readonly unknown[];
  };
}

describe('Content Quality V3 evidence packaging', () => {
  it('packages the exact baseline at the path used by compiled dev and Electron modules', () => {
    const manifest = JSON.parse(readFileSync(
      resolve(PROJECT_ROOT, 'package.json'),
      'utf8',
    )) as PackageManifest;

    expect(manifest.build?.files).toContain(BASELINE_PACKAGE_PATH);
    expect(CONTENT_QUALITY_V3_LEGACY_BASELINE_RELATIVE_PATH).toBe(
      '../../docs/content-quality-v3/legacy-baseline.json',
    );

    for (const packagedAppDirectory of [
      resolve(PROJECT_ROOT, 'tmp/packaged/resources/app.asar'),
      resolve(PROJECT_ROOT, 'tmp/packaged/resources/app'),
    ]) {
      const compiledModuleDirectory = resolve(
        packagedAppDirectory,
        'dist/contentQualityV3',
      );
      expect(resolve(
        compiledModuleDirectory,
        CONTENT_QUALITY_V3_LEGACY_BASELINE_RELATIVE_PATH,
      )).toBe(resolve(packagedAppDirectory, BASELINE_PACKAGE_PATH));
    }
  });

  it('locks the raw baseline and all 108 manifest inputs to LF checkout bytes', () => {
    const rules = readFileSync(resolve(PROJECT_ROOT, '.gitattributes'), 'utf8')
      .split(/\r?\n/u)
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'));
    const eolRules = rules.filter(line => line.includes('eol='));
    const baselineBytes = readFileSync(resolve(PROJECT_ROOT, BASELINE_PACKAGE_PATH));
    const baseline = JSON.parse(baselineBytes.toString('utf8')) as LegacyBaselineManifest;

    expect(eolRules).toEqual([BASELINE_EOL_RULE, ...LEGACY_SOURCE_EOL_RULES]);
    expect(baselineBytes.includes(13)).toBe(false);
    expect(baseline.files).toHaveLength(108);
    expect(baseline.files.every(file => isCoveredByLegacySourceEolRule(file.path))).toBe(true);

    for (const file of baseline.files) {
      const sourceBytes = readFileSync(resolve(PROJECT_ROOT, ...file.path.split('/')));
      expect(sourceBytes.includes(13), file.path).toBe(false);
    }
  });
});
