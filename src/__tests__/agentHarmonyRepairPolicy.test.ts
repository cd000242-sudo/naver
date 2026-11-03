import { describe, expect, it, vi } from 'vitest';
import {
  HARMONY_KEPT_REPAIR_KINDS,
  HARMONY_NO_PACKET_LOG,
  HARMONY_WARN_ONLY_REPAIR_KINDS,
  createHarmonyRepairGate,
  harmonyRepairDecision,
  harmonyRepairSkipLog,
  harmonyPreservesTitlePromise,
  type HarmonyRepairKind,
} from '../content/agentRepairPolicy.js';

/**
 * Release C2 (2026-11-04): with the harmony session active, the outer LLM loops that re-read the same material
 * are warn-only; fact-type regeneration and the JSON-completeness retry stay. Pure policy — no I/O.
 */
const WARN_ONLY: readonly HarmonyRepairKind[] = [
  'intro-patch',
  'quote-insertion-patch',
  'prompt-adherence-regenerate',
  'quality-gate-regenerate',
  'quality-gate-patch',
  'title-answer-regenerate',
  'distinctness-regenerate',
];
const KEPT: readonly HarmonyRepairKind[] = [
  'json-completeness-retry',
  'faithfulness-regenerate',
  'source-fidelity-regenerate',
  'defamation-correction',
  'issue-discipline-correction',
];

describe('harmonyRepairDecision', () => {
  it('turns every listed outer repair into warn-only when the harmony session is active', () => {
    for (const kind of WARN_ONLY) expect(harmonyRepairDecision(kind, { harmonyActive: true }), kind).toBe('warn-only');
  });

  it('runs every repair unchanged when the harmony session is not active', () => {
    for (const kind of [...WARN_ONLY, ...KEPT]) {
      expect(harmonyRepairDecision(kind, { harmonyActive: false }), kind).toBe('run');
      expect(harmonyRepairDecision(kind, { harmonyActive: undefined as never }), kind).toBe('run');
      expect(harmonyRepairDecision(kind, undefined as never), kind).toBe('run');
    }
  });

  it('keeps fact-type regeneration, JSON completeness and the correction calls running even under harmony', () => {
    for (const kind of KEPT) expect(harmonyRepairDecision(kind, { harmonyActive: true }), kind).toBe('run');
  });

  it('an unknown kind always runs (only the explicit list is ever skipped)', () => {
    expect(harmonyRepairDecision('something-new' as never, { harmonyActive: true })).toBe('run');
    expect(harmonyRepairDecision('' as never, { harmonyActive: true })).toBe('run');
  });

  it('the exported kind lists match the contract and never overlap', () => {
    expect([...HARMONY_WARN_ONLY_REPAIR_KINDS].sort()).toEqual([...WARN_ONLY].sort());
    expect([...HARMONY_KEPT_REPAIR_KINDS].sort()).toEqual([...KEPT].sort());
    for (const kind of HARMONY_WARN_ONLY_REPAIR_KINDS) expect(HARMONY_KEPT_REPAIR_KINDS).not.toContain(kind);
  });
});

describe('harmonyRepairSkipLog', () => {
  it('writes one Korean line: stage, why it is skipped, and the deterministic issue', () => {
    expect(harmonyRepairSkipLog('intro-patch', '첫 문장이 길다'))
      .toBe('[AgentHarmony] 도입부 보정 생략 — 조화 세션이 같은 기준으로 자기점검: 첫 문장이 길다');
    expect(harmonyRepairSkipLog('title-answer-regenerate', '응답 50%'))
      .toBe('[AgentHarmony] 제목 약속 재생성 생략 — 조화 세션이 같은 기준으로 자기점검: 응답 50%');
  });

  it('omits the trailing issue when there is none, and names every warn-only stage', () => {
    for (const kind of WARN_ONLY) {
      const line = harmonyRepairSkipLog(kind);
      expect(line, kind).toMatch(/^\[AgentHarmony\] .+ 생략 — 조화 세션이 같은 기준으로 자기점검$/);
      expect(line, kind).not.toContain(kind);
    }
    expect(harmonyRepairSkipLog('intro-patch', '   ')).toBe(harmonyRepairSkipLog('intro-patch'));
  });
});

describe('createHarmonyRepairGate', () => {
  it('flag OFF: never skips, never logs, never evaluates the detail', () => {
    const log = vi.fn();
    const detail = vi.fn(() => 'x');
    const gate = createHarmonyRepairGate(false, log);
    for (const kind of [...WARN_ONLY, ...KEPT]) expect(gate.skips(kind, detail)).toBe(false);
    expect(log).not.toHaveBeenCalled();
    expect(detail).not.toHaveBeenCalled();
  });

  it('harmony ON: skips the listed kinds with one log line each and lets the kept kinds run silently', () => {
    const log = vi.fn();
    const gate = createHarmonyRepairGate(true, log);
    expect(gate.skips('intro-patch', '첫 문장이 길다')).toBe(true);
    expect(log).toHaveBeenLastCalledWith('[AgentHarmony] 도입부 보정 생략 — 조화 세션이 같은 기준으로 자기점검: 첫 문장이 길다');
    for (const kind of KEPT) expect(gate.skips(kind, 'x')).toBe(false);
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('logs a kind once per gate even when several call sites ask, but keeps answering true', () => {
    const log = vi.fn();
    const gate = createHarmonyRepairGate(true, log);
    expect(gate.skips('quality-gate-regenerate', 'a')).toBe(true);
    expect(gate.skips('quality-gate-regenerate', 'b')).toBe(true);
    expect(gate.skips('quality-gate-regenerate')).toBe(true);
    expect(log).toHaveBeenCalledTimes(1);
    expect(gate.skips('quality-gate-patch', 'c')).toBe(true);
    expect(log).toHaveBeenCalledTimes(2);
  });

  it('evaluates a lazy detail only when it is about to be logged, and survives a throwing detail', () => {
    const log = vi.fn();
    const gate = createHarmonyRepairGate(true, log);
    expect(gate.skips('prompt-adherence-regenerate', () => '금지어 포함')).toBe(true);
    expect(log).toHaveBeenLastCalledWith('[AgentHarmony] 사용자 프롬프트 준수 재생성 생략 — 조화 세션이 같은 기준으로 자기점검: 금지어 포함');
    expect(gate.skips('distinctness-regenerate', () => { throw new Error('boom'); })).toBe(true);
    expect(log).toHaveBeenLastCalledWith(harmonyRepairSkipLog('distinctness-regenerate'));
  });
});

describe('createHarmonyRepairGate with a lazy active check (the session only counts once a packet was extracted)', () => {
  it('evaluates the check at every skip decision: no packet yet / retry without a packet runs the repair, a packet skips it', () => {
    const log = vi.fn();
    let live = false;
    const active = vi.fn(() => live);
    const gate = createHarmonyRepairGate(active, log);
    expect(gate.skips('intro-patch', 'x')).toBe(false);
    expect(log).not.toHaveBeenCalled();
    live = true;
    expect(gate.skips('intro-patch', 'x')).toBe(true);
    expect(log).toHaveBeenCalledTimes(1);
    live = false;
    expect(gate.skips('title-answer-regenerate', 'y')).toBe(false);
    expect(active).toHaveBeenCalledTimes(3);
  });

  it('a throwing or non-boolean check means "not live" — the repair runs as today', () => {
    const log = vi.fn();
    expect(createHarmonyRepairGate(() => { throw new Error('boom'); }, log).skips('intro-patch')).toBe(false);
    expect(createHarmonyRepairGate((() => 'yes') as never, log).skips('intro-patch')).toBe(false);
    expect(log).not.toHaveBeenCalled();
  });

  it('the no-packet line is one fixed Korean sentence', () => {
    expect(HARMONY_NO_PACKET_LOG).toBe('[AgentHarmony] 패킷 없음 — 바깥 보정을 평소대로 실행합니다');
  });
});

describe('harmonyPreservesTitlePromise', () => {
  it('is true only for a live harmony session (the shopping rule stays at the call site)', () => {
    expect(harmonyPreservesTitlePromise(true)).toBe(true);
    for (const off of [false, undefined, null, 'true', 1]) expect(harmonyPreservesTitlePromise(off as never)).toBe(false);
  });
});
