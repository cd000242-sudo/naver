import { describe, expect, it } from 'vitest';
import {
  HARMONY_EXCLUDED_MODES, HARMONY_MODES, harmonyFamilyOf, harmonyModeLabel, isHarmonyMode,
} from '../content/agentHarmony/harmonyModes';
import { agentHarmonyApplies, resolveAgentHarmonyRequest } from '../content/agentHarmony/harmonyRuntime';
import { verifyHarmonyPacket } from '../content/agentHarmony/harmonyPacketVerify';
import type { HarmonyPacket } from '../content/agentHarmony/harmonyPacketTypes';

/**
 * 2026-11-04: the harmony session is no longer homefeed-only. Every text mode the article call uses gets one;
 * photo (image-narrative) is excluded because it never reaches the article attempt loop.
 */
describe('harmony mode list', () => {
  it('covers every text PromptMode the article call uses and nothing else', () => {
    expect([...HARMONY_MODES].sort()).toEqual(['affiliate', 'business', 'custom', 'homefeed', 'mate', 'seo', 'traffic-hunter']);
    for (const mode of HARMONY_MODES) expect(isHarmonyMode(mode)).toBe(true);
    for (const other of ['image-narrative', 'photo', 'shopping', '', 'SEO', undefined, null, 3]) expect(isHarmonyMode(other)).toBe(false);
  });

  it('records why photo is excluded, next to the list', () => {
    expect(Object.keys(HARMONY_EXCLUDED_MODES)).toEqual(['image-narrative']);
    expect(HARMONY_EXCLUDED_MODES['image-narrative']).toMatch(/rawText|attempt loop|early/i);
    expect(HARMONY_MODES).not.toContain('image-narrative');
  });

  it('groups modes into criteria families: seo and affiliate have their own, the rest share the general one', () => {
    expect(harmonyFamilyOf('homefeed')).toBe('homefeed');
    expect(harmonyFamilyOf('seo')).toBe('seo');
    expect(harmonyFamilyOf('affiliate')).toBe('affiliate');
    for (const mode of ['business', 'mate', 'custom', 'traffic-hunter', 'image-narrative', undefined]) expect(harmonyFamilyOf(mode)).toBe('general');
  });

  it('has a distinct log label for every supported mode (homefeed keeps the wording the log always used)', () => {
    expect(harmonyModeLabel('homefeed')).toBe('홈판');
    for (const mode of HARMONY_MODES) expect(harmonyModeLabel(mode)).toMatch(/[가-힣A-Z]/);
    expect(new Set(HARMONY_MODES.map(harmonyModeLabel)).size).toBe(HARMONY_MODES.length);
    expect(harmonyModeLabel('image-narrative')).toBe('-');
  });
});

describe('resolveAgentHarmonyRequest matrix (modes x engines x V3 x flag)', () => {
  const AGENTS = ['agent-claude', 'agent-codex'];
  const NON_HARMONY_ENGINES = ['agent-gemini', 'gemini', 'claude', 'openai', 'perplexity', '', 'undefined'];

  it('returns { mode } with the real mode for every text mode on both subscription agent engines', () => {
    for (const mode of HARMONY_MODES) {
      for (const provider of AGENTS) {
        expect(resolveAgentHarmonyRequest({ flag: true, provider, isV3Prompt: false, mode }), `${mode}/${provider}`).toEqual({ mode });
      }
    }
  });

  it('stays undefined for every other engine, for the V3 prompt, and for a flag that is not exactly true', () => {
    for (const mode of HARMONY_MODES) {
      for (const provider of NON_HARMONY_ENGINES) expect(resolveAgentHarmonyRequest({ flag: true, provider, isV3Prompt: false, mode }), `${mode}/${provider}`).toBeUndefined();
      for (const provider of AGENTS) {
        expect(resolveAgentHarmonyRequest({ flag: true, provider, isV3Prompt: true, mode }), `${mode}/v3`).toBeUndefined();
        for (const flag of [undefined, false, 'true', 1, null]) expect(resolveAgentHarmonyRequest({ flag, provider, isV3Prompt: false, mode }), `${mode}/${String(flag)}`).toBeUndefined();
      }
    }
  });

  it('photo and unknown modes never get a session', () => {
    for (const mode of ['image-narrative', 'photo', '', 'shopping', 'unknown']) {
      for (const provider of AGENTS) expect(resolveAgentHarmonyRequest({ flag: true, provider, isV3Prompt: false, mode })).toBeUndefined();
    }
  });

  it('agentHarmonyApplies (the main.ts log helper) is flag-free: mode in the list AND a subscription agent engine', () => {
    for (const mode of HARMONY_MODES) {
      expect(agentHarmonyApplies(mode, 'agent-claude')).toBe(true);
      expect(agentHarmonyApplies(mode, 'agent-codex')).toBe(true);
      expect(agentHarmonyApplies(mode, 'agent-gemini')).toBe(false);
      expect(agentHarmonyApplies(mode, 'gemini')).toBe(false);
    }
    expect(agentHarmonyApplies('image-narrative', 'agent-claude')).toBe(false);
    expect(agentHarmonyApplies(undefined, 'agent-claude')).toBe(false);
    expect(agentHarmonyApplies('seo', undefined)).toBe(false);
  });
});

describe('verifyHarmonyPacket payoff position is homefeed-specific', () => {
  const ANSWER = '그가 병원을 고른 이유는 어머니가 그곳에서 치료를 받았기 때문이라고 밝혔다.';
  const SRC = '배우 김모씨는 서울의 한 병원에 기부했다고 밝혔다.';
  const BODY_SENTENCE = '김모씨가 서울의 한 병원에 기부했다.';
  const candidate = (id: string, q: string) => ({
    id, title: `${id} 병원에 기부한 이유`, readerQuestion: q, expectedBelief: '예상', surprisingFact: '사실', clickReason: '이유', sourceAnchors: [SRC], bodyAnchors: [BODY_SENTENCE],
  });
  const packet = (): HarmonyPacket => ({
    version: 1,
    material: { centralEvent: '기부', readerSituation: '독자', notInSource: [] },
    strategy: { readerQuestion: '왜', angle: '각도', exposureNote: '관측 자료 없음' },
    titles: { chosenId: 'c1', candidates: [candidate('c1', '질문1'), candidate('c2', '질문2'), candidate('c3', '질문3')], comparison: '비교' },
    payoff: { promise: '약속', answerSentence: ANSWER },
  });
  /** A whitespace-free-length-1000 body whose answer sentence starts at `pct` percent. */
  const bodyAt = (pct: number) => {
    const prefix = Math.round(pct * 10), used = prefix + ANSWER.replace(/s/g, '').length + BODY_SENTENCE.replace(/s/g, '').length;
    return `${'가'.repeat(prefix)}${ANSWER}${'나'.repeat(Math.max(0, 1000 - used))}${BODY_SENTENCE}`;
  };
  const verify = (mode: string | undefined, pct: number) => verifyHarmonyPacket({ packet: packet(), report: null }, {
    rawText: SRC, body: bodyAt(pct), title: 'c1 병원에 기부한 이유', systemPrompt: '', ...(mode === undefined ? {} : { mode }),
  });

  it('homefeed (and a missing mode, as before) flags a late answer sentence and evaluates the windows', () => {
    for (const mode of ['homefeed', undefined]) {
      const v = verify(mode, 60);
      expect(v.issues.some(issue => issue.startsWith('answer sentence comes late')), String(mode)).toBe(true);
      expect(v.payoff).toMatchObject({ found: true, inStandardWindow: false });
    }
    expect(verify('homefeed', 15).payoff).toMatchObject({ found: true, inHiddenSubjectWindow: true, inStandardWindow: true });
  });

  it('every other mode records the position only: no late issue, no window verdict', () => {
    for (const mode of HARMONY_MODES.filter(m => m !== 'homefeed')) {
      for (const pct of [5, 15, 60]) {
        const v = verify(mode, pct);
        expect(v.issues.some(issue => issue.includes('comes late')), `${mode}@${pct}`).toBe(false);
        expect(v.payoff?.found).toBe(true);
        expect(v.payoff?.positionPct).not.toBeNull();
        expect(v.payoff).toMatchObject({ inHiddenSubjectWindow: false, inStandardWindow: false });
      }
    }
    // The position itself is still measured and recorded (a late answer in seo is data, not an issue).
    expect(verify('seo', 60).payoff?.positionPct ?? 0).toBeGreaterThan(36);
    expect(verify('seo', 5).payoff?.positionPct ?? 100).toBeLessThan(36);
  });

  it('a missing answer sentence is still an issue in every mode', () => {
    const missing = { ...packet(), payoff: { promise: '약속', answerSentence: '본문에 없는 문장이라서 찾을 수 없다' } };
    for (const mode of HARMONY_MODES) {
      const v = verifyHarmonyPacket({ packet: missing, report: null }, { rawText: SRC, body: bodyAt(10), title: 'c1 병원에 기부한 이유', systemPrompt: '', mode });
      expect(v.issues).toContain('answer sentence is not in the body');
    }
  });
});
