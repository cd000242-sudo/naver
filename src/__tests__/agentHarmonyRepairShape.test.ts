import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Release C2 source-shape pins for the god file (the QualityGate / Fidelity paths cannot run under vitest:
 * their `require('./content/...')` of TypeScript modules fails there, so their gating is pinned here).
 */
describe('contentGenerator harmony wiring (source shape)', () => {
  const gen = readFileSync(new URL('../contentGenerator.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

  it('the gate asks a lazy check: harmony request AND a packet extracted from THIS attempt\'s response', () => {
    expect(gen).toMatch(/let harmonyPacketSeen = false;/);
    expect(gen).toMatch(/const harmonyLive = \(\) => Boolean\(agentHarmonyRequest\) && harmonyPacketSeen;/);
    expect(gen).toMatch(/const harmonySkips = createHarmonyRepairGate\(harmonyLive\)\.skips;/);
    expect(gen).toMatch(/const harmonyRecord = handleAgentHarmonyResponse\(parsed, \{/);
    expect(gen).toMatch(/harmonyPacketSeen = Boolean\(harmonyRecord\.packet\);\n\s+if \(!harmonyPacketSeen\) console\.log\(HARMONY_NO_PACKET_LOG\);/);
  });

  it('[TitleSelect] preservePromise follows the same live check and keeps the shopping rule', () => {
    expect(gen).toMatch(/preservePromise: mode === 'affiliate' \|\| harmonyPreservesTitlePromise\(harmonyLive\(\)\)/);
  });

  it('gates each outer repair with its kind, right next to the call', () => {
    const near = (anchor: RegExp, kind: string, before = 900) => {
      const match = anchor.exec(gen);
      expect(match, `${kind}: anchor not found`).toBeTruthy();
      const window = gen.slice(Math.max(0, (match!.index ?? 0) - before), (match!.index ?? 0) + 900);
      expect(window, kind).toContain(`harmonySkips('${kind}'`);
    };
    near(/await generateHomefeedIntroOnlyPatch\(/, 'intro-patch');
    near(/await runQuoteInsertionPatch\(/, 'quote-insertion-patch');
    near(/\[PromptAdherence\] 🔁 자동 보정 재시도/, 'prompt-adherence-regenerate');
    near(/\[TitleAnswer\] 🔁 제목 약속 미이행/, 'title-answer-regenerate', 1500);
    near(/\[DistinctnessJudge\] 🔁 섹션 중복 감지/, 'distinctness-regenerate');
    near(/자동 재시도 트리거 \(decision=/, 'quality-gate-regenerate');
    near(/patch 후에도 90점 미달 — 추가 전체 재시도/, 'quality-gate-regenerate');
    near(/90점 미달 결과를 반환하지 않고 남은 동일 엔진 시도를 사용합니다/, 'quality-gate-regenerate');
    near(/selfCritique 자동 활성화/, 'quality-gate-patch', 3200);
  });

  it('never gates the fact-type regenerations or the JSON completeness retry', () => {
    expect(gen).not.toMatch(/harmonySkips\('(faithfulness|source-fidelity|json-completeness|defamation|issue-discipline)/);
    const kinds = [...gen.matchAll(/harmonySkips\('([a-z-]+)'/g)].map(m => m[1]);
    expect(new Set(kinds)).toEqual(new Set([
      'intro-patch', 'quote-insertion-patch', 'prompt-adherence-regenerate', 'title-answer-regenerate',
      'distinctness-regenerate', 'quality-gate-regenerate', 'quality-gate-patch',
    ]));
  });
});
