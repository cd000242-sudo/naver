import { describe, it, expect } from 'vitest';
import { HOMEFEED_HOOKS, buildHomefeedHookGuide } from '../content/ctrCombat.js';

// Flatten every hook string across all categories/emotion axes.
const allHooks: string[] = Object.values(HOMEFEED_HOOKS).flatMap(pack =>
  [...pack.empathy, ...pack.reversal, ...pack.utility, ...pack.discovery]
);

// Mirrors the `aiCliche` ban list inside scoreTitleForHomefeed — the hook
// library must not hand the LLM examples its own title scorer penalizes.
const AI_CLICHE = ['충격', '경악', '소름', '폭로', '반전 주의', '실화', '대박', '난리', '공개', '이럴 수가'];

describe('HOMEFEED_HOOKS — B1 신뢰 훅 회귀 가드', () => {
  it('어떤 훅도 aiCliche 금지어를 포함하지 않는다', () => {
    const offenders = allHooks.filter(h => AI_CLICHE.some(w => h.includes(w)));
    expect(offenders).toEqual([]);
  });

  it('모든 훅이 {kw} 키워드 앵커를 유지한다', () => {
    const missing = allHooks.filter(h => !h.includes('{kw}'));
    expect(missing).toEqual([]);
  });

  it('buildHomefeedHookGuide가 {kw}를 실제 키워드로 치환한다', () => {
    const guide = buildHomefeedHookGuide('맛집', '돈까스');
    expect(guide).toContain('돈까스');
    expect(guide).not.toContain('{kw}');
  });
});
