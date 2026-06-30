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

  it('enforces quantitative self-critique gates (interjection cap, no section repetition, honor app settings)', () => {
    const wrapped = wrapAsAgenticTask(base);
    expect(wrapped).toContain('3회를 넘지 않는가'); // interjection cap
    expect(wrapped).toContain('서로 다른 정보 단위'); // no section repetition
    expect(wrapped).toContain('카테고리·글톤·금지어'); // honor app category/tone settings
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

  it('injects a mode-specific focus block per content mode', () => {
    expect(wrapAsAgenticTask(base, 'homefeed')).toContain('홈피드 노출');
    expect(wrapAsAgenticTask(base, 'seo')).toContain('검색 노출(SEO)');
    expect(wrapAsAgenticTask(base, 'affiliate')).toContain('구매 전환');
    expect(wrapAsAgenticTask(base, 'photo')).toContain('사진');
  });

  it('homefeed focus references the base body skeleton (no duplication) for self-critique', () => {
    const hf = wrapAsAgenticTask(base, 'homefeed');
    expect(hf).toContain('홈판 상위노출 본문 골격'); // self-critique against the base-prompt skeleton
    expect(hf).toContain('추임새 절제');
    expect(hf).toContain('댓글 CTA');
  });

  it('normalizes mode aliases (shopping -> affiliate, image-narrative -> photo)', () => {
    expect(wrapAsAgenticTask(base, 'shopping')).toContain('구매 전환');
    expect(wrapAsAgenticTask(base, 'image-narrative')).toContain('사진');
  });

  it('omits the focus block for unknown/blank modes (generic writing envelope)', () => {
    const wrapped = wrapAsAgenticTask(base, 'something-else');
    expect(wrapped).not.toContain('이 모드에서 특히 끌어올릴 것');
    expect(wrapped).toContain('자율 작업 절차'); // still the writing envelope
    expect(wrapAsAgenticTask(base)).not.toContain('이 모드에서 특히 끌어올릴 것');
  });

  it('does not leak one mode focus into another', () => {
    const seo = wrapAsAgenticTask(base, 'seo');
    expect(seo).not.toContain('홈피드 노출');
    expect(seo).not.toContain('구매 전환');
  });

  it('exposes a longer deadline than the one-shot default (internal iteration is slower)', () => {
    expect(AGENTIC_TIMEOUT_MS).toBeGreaterThan(180_000);
  });
});
