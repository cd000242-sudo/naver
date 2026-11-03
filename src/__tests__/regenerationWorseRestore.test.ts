// [2026-11-04] Owner full-auto log (agent-claude SEO "제네시스 생산 중단"): attempt 1 passed QualityGate90 (96/100, safety 100),
// TitleAnswer (a verbatim-match false positive) asked for a full rewrite, attempt 2 came back at 67/100 with safety 35
// ("근거 없는 구체 수치 10분", EVIDENCE_INTEGRITY) and was PUBLISHED via "QualityGate90 경고 후 계속" — although the passing
// draft had been kept ("직전 성공본 보존"). The kept draft was only restored when the rewrite threw, never when it got worse.
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { shouldRestoreKeptDraft } from '../content/regenerationRestorePolicy';

const src = readFileSync(join(__dirname, '..', 'contentGenerator.ts'), 'utf-8').replace(/\r\n/g, '\n');

describe('restore the kept draft when a repair rewrite got worse', () => {
  it('policy: restore only when the kept draft passed the gate and the rewrite misses it', () => {
    expect(shouldRestoreKeptDraft({ passedGate: true }, true)).toBe(true);
    expect(shouldRestoreKeptDraft({ passedGate: true }, false)).toBe(false);
    expect(shouldRestoreKeptDraft({ passedGate: false }, true)).toBe(false);
    expect(shouldRestoreKeptDraft(null, true)).toBe(false);
    expect(shouldRestoreKeptDraft(undefined, true)).toBe(false);
  });

  it('the kept draft remembers whether it passed the 90-point gate; the TitleAnswer keep passes that state', () => {
    expect(src).toMatch(/const keepArtifactBeforeRegeneration = \(content: StructuredContent, at: number, trigger: string, passedGate = false\)/);
    expect(src).toMatch(/keepArtifactBeforeRegeneration\(optimized, attempt, 'TitleAnswer 제목 약속 미이행', Boolean\(_quality90Assessment\) && !_quality90Assessment\?\.miss\)/);
  });

  it('a gate miss after a rewrite returns the kept passing draft before "경고 후 계속"', () => {
    const at = src.indexOf('if (_quality90Assessment?.miss) {');
    const warn = src.indexOf('[QualityGate90] 경고 후 계속', at);
    const block = src.slice(at, warn);
    expect(at).toBeGreaterThan(0);
    expect(block).toMatch(/shouldRestoreKeptDraft\(getKeptArtifact\(\), true\)/);
    expect(block).toMatch(/recoverLastSuccessfulArtifact\(/);
    expect(block).toMatch(/return restoredBetter;/);
  });
});
