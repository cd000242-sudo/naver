/**
 * Agentic envelope — wraps a one-shot prompt as an autonomous-reasoning task.
 *
 * These guard the invariants the upgrade depends on: the base prompt (materials + rubric)
 * is never lost, the autonomous workflow is requested, and the final-message-is-pure-JSON
 * contract that safeParseJson relies on is stated unambiguously.
 */

import { describe, it, expect } from 'vitest';
import { wrapAsAgenticTask, AGENTIC_TIMEOUT_MS } from '../agentCli/agenticEnvelope';

describe('wrapAsAgenticTask', () => {
  const base = '키워드: 제주도 여행\n자료: ...\n출력: {"title":"string"}';

  it('preserves the base prompt verbatim (materials must not be lost)', () => {
    const wrapped = wrapAsAgenticTask(base);
    expect(wrapped).toContain(base);
  });

  it('prepends the directive ahead of the base prompt', () => {
    const wrapped = wrapAsAgenticTask(base);
    expect(wrapped.indexOf('자율 작업 절차')).toBeLessThan(wrapped.indexOf(base));
  });

  it('requests the autonomous loop: analyze -> draft -> self-critique -> revise -> submit', () => {
    const wrapped = wrapAsAgenticTask(base);
    expect(wrapped).toContain('1. 분석');
    expect(wrapped).toContain('2. 초안');
    expect(wrapped).toContain('3. 자기비평');
    expect(wrapped).toContain('4. 수정');
    expect(wrapped).toContain('5. 제출');
  });

  it('names the quality rubric the agent must self-critique against', () => {
    const wrapped = wrapAsAgenticTask(base);
    expect(wrapped).toContain('상투어');
    expect(wrapped).toContain('E-E-A-T');
    expect(wrapped).toContain('JSON 스키마');
  });

  it('states the final-message-is-pure-JSON contract (so safeParseJson keeps working)', () => {
    const wrapped = wrapAsAgenticTask(base);
    expect(wrapped).toContain('오직');
    expect(wrapped).toContain('JSON');
    expect(wrapped).toContain('코드펜스');
  });

  it('returns empty/blank input unchanged (no wrapping on nothing to do)', () => {
    expect(wrapAsAgenticTask('')).toBe('');
    expect(wrapAsAgenticTask('   ')).toBe('   ');
  });

  it('exposes a longer deadline than the one-shot default (internal iteration is slower)', () => {
    expect(AGENTIC_TIMEOUT_MS).toBeGreaterThan(180_000);
  });
});
