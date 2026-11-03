import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import {
  llmTitlePatchSkipLog,
  llmTitlePatchSkipReason,
  shouldRunLlmTitlePatch,
  type LlmTitlePatchContext,
} from '../content/agentRepairPolicy.js';

/**
 * Release B Phase 1 (2026-11-04): remove duplicate agent calls.
 *
 * Owner log 2026-11-03 (agent-claude homefeed): the TitleGate LLM rewrite ran 37 s and 66 s and was
 * rejected both times ("나아지지 않음 → 원래 제목 유지"). The 66 s one ran on the regeneration whose title was
 * LOCKED (manualTitleOverride); finalizeStructuredContent -> applyManualTitleOverride threw the result
 * away, for every engine. The policy below is the single place that decides whether such a call is worth it.
 */
const MODES = ['seo', 'mate', 'homefeed', 'affiliate'] as const;
const ctx = (over: Partial<LlmTitlePatchContext>): LlmTitlePatchContext => ({ isAgent: false, confirmedTitle: undefined, mode: 'homefeed', ...over });

describe('shouldRunLlmTitlePatch', () => {
  it('never runs when the title is already confirmed, for every engine and mode', () => {
    for (const mode of MODES) {
      for (const isAgent of [true, false]) {
        expect(shouldRunLlmTitlePatch(ctx({ isAgent, mode, confirmedTitle: '사용자가 고른 제목' }))).toBe(false);
        expect(llmTitlePatchSkipReason(ctx({ isAgent, mode, confirmedTitle: '사용자가 고른 제목' }))).toBe('confirmed-title');
      }
    }
  });

  it('skips the homefeed and SEO rewrites on agent engines (the session already picked the title)', () => {
    for (const mode of ['seo', 'mate', 'homefeed'] as const) {
      expect(shouldRunLlmTitlePatch(ctx({ isAgent: true, mode }))).toBe(false);
      expect(llmTitlePatchSkipReason(ctx({ isAgent: true, mode }))).toBe('agent-engine');
    }
  });

  it('keeps the existing behaviour for API engines without a confirmed title', () => {
    for (const mode of MODES) {
      expect(shouldRunLlmTitlePatch(ctx({ isAgent: false, mode }))).toBe(true);
      expect(llmTitlePatchSkipReason(ctx({ isAgent: false, mode }))).toBeNull();
    }
  });

  it('leaves the shopping (affiliate) title patch alone on agent engines — only a confirmed title stops it', () => {
    expect(shouldRunLlmTitlePatch(ctx({ isAgent: true, mode: 'affiliate' }))).toBe(true);
    expect(shouldRunLlmTitlePatch(ctx({ isAgent: true, mode: 'affiliate', confirmedTitle: '확정' }))).toBe(false);
  });

  it('treats blank, whitespace-only and missing titles as not confirmed', () => {
    for (const confirmedTitle of [undefined, null, '', '   ', '\n\t']) {
      expect(shouldRunLlmTitlePatch(ctx({ isAgent: false, confirmedTitle }))).toBe(true);
    }
  });

  it('reports a confirmed title ahead of the engine reason (the stronger reason wins)', () => {
    expect(llmTitlePatchSkipReason(ctx({ isAgent: true, mode: 'homefeed', confirmedTitle: '확정' }))).toBe('confirmed-title');
  });

  it('an unknown or missing mode never skips just because the engine is an agent', () => {
    expect(shouldRunLlmTitlePatch({ isAgent: true, confirmedTitle: undefined })).toBe(true);
    expect(shouldRunLlmTitlePatch({ isAgent: true, confirmedTitle: undefined, mode: 'custom' })).toBe(true);
  });
});

describe('llmTitlePatchSkipLog', () => {
  it('names the reason in Korean with the caller tag', () => {
    expect(llmTitlePatchSkipLog('TitleGate', ctx({ confirmedTitle: '확정' }))).toBe('[TitleGate] LLM 재작성 생략 — 확정 제목');
    expect(llmTitlePatchSkipLog('TitleGate', ctx({ isAgent: true }))).toBe('[TitleGate] LLM 재작성 생략 — 에이전트 엔진(세션 안에서 제목을 정함)');
  });

  it('appends the deterministic gate issues so the skipped rewrite stays visible in the log', () => {
    expect(llmTitlePatchSkipLog('TitlePatch', ctx({ isAgent: true, mode: 'seo' }), '제목 너무 김 / 키워드 없음'))
      .toBe('[TitlePatch] LLM 재작성 생략 — 에이전트 엔진(세션 안에서 제목을 정함): 제목 너무 김 / 키워드 없음');
  });
});

describe('contentGenerator wiring', () => {
  const gen = readFileSync(new URL('../contentGenerator.ts', import.meta.url), 'utf8');
  const calls = [...gen.matchAll(/await generateTitleOnlyPatch\(\s*source,\s*'(\w+)'/g)];

  it('has exactly the three known LLM title-patch call sites', () => {
    expect(calls.map(m => m[1])).toEqual(['seo', 'homefeed', 'affiliate']);
  });

  it('gates every call site with shouldRunLlmTitlePatch, fed by the confirmed title and the engine', () => {
    for (const m of calls) {
      const mode = m[1];
      const before = gen.slice(Math.max(0, (m.index ?? 0) - 1500), m.index);
      // The nearest gate before the call must belong to this mode and must precede the call directly.
      const gate = [...before.matchAll(/shouldRunLlmTitlePatch\((\w+)\)/g)].pop();
      expect(gate, `${mode}: no shouldRunLlmTitlePatch gate before the call`).toBeTruthy();
      const ctxName = gate![1];
      expect(gen).toMatch(new RegExp(`const ${ctxName}\\s*=\\s*\\{[^}]*isAgent:\\s*isAgentTextProvider\\(provider\\)[^}]*confirmedTitle:\\s*confirmedTitleForBody[^}]*mode:\\s*'${mode}'`));
    }
  });

  it('logs the skip through llmTitlePatchSkipLog instead of staying silent', () => {
    expect(gen.match(/llmTitlePatchSkipLog\(/g)?.length).toBe(3);
  });

  it('keeps the outer eligibility conditions other lock tests pin (no change to the repair budget)', () => {
    expect(gen).toMatch(/allowPaidPostGenerationRepair\s*&&\s*allowLegacyPostDraftLlm\s*&&\s*!_useKwTitle\s*&&\s*mode === 'homefeed'/);
    expect(gen).toMatch(/computeHomefeedTitleGateIssues\(parsed\.selectedTitle, hfKeyword\)/);
  });
});
