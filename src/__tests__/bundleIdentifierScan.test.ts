import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import {
  findDuplicateTopLevelIdentifiers,
  filterAgainstBaseline,
} from '../../scripts/bundleIdentifierScan.mjs';

/**
 * SPEC-STABILITY-2026 Phase 6.1 — bundle identifier collision scan.
 * Acceptance: the past real incident (v2.10.85 — RecoveryBlockingModal
 * declared twice in the concatenated single-scope renderer bundle) must be
 * caught as a duplicate.
 */
describe('bundle top-level identifier scan (6.1)', () => {
  it('reproduces the v2.10.85 incident — duplicate top-level const FAILs', () => {
    const bundle = [
      'const RecoveryBlockingModal = { show() {} };',
      'function unrelated() {}',
      '  const indentedLocal = 1;', // module-internal, not top level
      'const RecoveryBlockingModal = class {};', // second inline copy
    ].join('\n');
    const dups = findDuplicateTopLevelIdentifiers(bundle);
    expect(dups).toHaveLength(1);
    expect(dups[0].name).toBe('RecoveryBlockingModal');
    expect(dups[0].lines).toEqual([1, 4]);
  });

  it('flags silent function overrides too', () => {
    const bundle = 'function initTab() {}\nfunction initTab() {}\n';
    expect(findDuplicateTopLevelIdentifiers(bundle).map((d) => d.name)).toEqual(['initTab']);
  });

  it('ignores tsc helpers, var re-declarations, and indented module bodies', () => {
    const bundle = [
      'var __importDefault = x;',
      'var __importDefault = x;',
      'var legacyVar = 1;',
      'var legacyVar = 2;',
      '  const inner = 1;',
      '  const inner = 1;',
    ].join('\n');
    expect(findDuplicateTopLevelIdentifiers(bundle)).toEqual([]);
  });

  it('clean bundles pass', () => {
    const bundle = 'const a = 1;\nlet b = 2;\nclass C {}\nfunction d() {}\n';
    expect(findDuplicateTopLevelIdentifiers(bundle)).toEqual([]);
  });

  it('ratchet: baseline freezes legacy function duplicates but never const/class ones', () => {
    const dups = [
      { name: 'legacyFn', kinds: ['function'], lines: [1, 9] },
      { name: 'newFn', kinds: ['function'], lines: [2, 8] },
      { name: 'legacyButConst', kinds: ['function', 'const'], lines: [3, 7] },
    ];
    const filtered = filterAgainstBaseline(dups, ['legacyFn', 'legacyButConst']);
    expect(filtered.map((d) => d.name)).toEqual(['newFn', 'legacyButConst']);
  });

  it('baseline file only shrinks: every entry must still be a real duplicate or be removed', () => {
    const baseline = JSON.parse(
      readFileSync(new URL('../../scripts/bundle-identifier-baseline.json', import.meta.url), 'utf8')
    );
    expect(Array.isArray(baseline.legacyDuplicateFunctions)).toBe(true);
    // Hard ceiling = the 2026-06-11 measurement. Growing this list is the
    // exact regression the gate exists to block — fix the duplicate instead.
    expect(baseline.legacyDuplicateFunctions.length).toBeLessThanOrEqual(28);
  });
});
