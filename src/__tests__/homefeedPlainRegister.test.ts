import { describe, expect, it } from 'vitest';
import { buildFullPrompt, resolveHomefeedPlainRegister } from '../promptLoader';
import { resolveHomefeedPlainKind } from '../content/homefeedPlainRegister';
import { buildVoiceProfileBlock, sampleVoiceProfile } from '../contentVoiceProfile';
import { assessQuality90Gate, toPlainRegisterDirective } from '../content/quality90Gate';
import { ENDING_VARIETY_SUGGESTION } from '../content/evaluators/humanlikeEval';

// [2026-11-16] Homefeed guide v5.2: broadcast / celebrity / sports / IT·car posts use plain endings ("~다"),
// polite endings banned. Health / fashion / living keep the polite register. Other modes are untouched.
describe('homefeed plain register - which posts', () => {
  it.each([
    ['연예', 'broadcast'], ['드라마', 'broadcast'], ['스포츠', 'sports'], ['IT', 'tech'], ['자동차', 'tech'],
  ])('homefeed %s -> %s', (hint, kind) => {
    expect(resolveHomefeedPlainRegister('homefeed', hint)).toBe(kind);
  });

  it.each(['건강', '패션', '리빙', '인테리어', '사회', '경제', '', undefined])('homefeed %s stays polite', (hint) => {
    expect(resolveHomefeedPlainRegister('homefeed', hint)).toBeNull();
  });

  it.each(['seo', 'affiliate', 'business', 'custom'] as const)('%s mode never switches, even for 연예', (mode) => {
    expect(resolveHomefeedPlainRegister(mode, '연예')).toBeNull();
    expect(resolveHomefeedPlainRegister(mode, '자동차')).toBeNull();
  });

  it('reads the raw hint for cars because they resolve to the life category', () => {
    expect(resolveHomefeedPlainKind('homefeed', 'life', '자동차')).toBe('tech');
    expect(resolveHomefeedPlainKind('homefeed', 'life', '리빙')).toBeNull();
  });
});

describe('homefeed plain register - prompt', () => {
  const plain = buildFullPrompt('homefeed', '연예', false, 'community_fan');
  const polite = buildFullPrompt('homefeed', '건강', false, 'friendly');

  it('ends the plain prompt with the final plain-register rule', () => {
    const at = plain.lastIndexOf('[말투 최종 규칙 — 평서체');
    expect(at).toBeGreaterThan(plain.length * 0.5);
    expect(plain).toContain('존댓말(~요/~습니다/~입니다/~죠/~네요/~거든요/~더라고요) 종결은 한 문장도 쓰지 않는다');
    expect(plain).toContain('평서체는 기사체가 아니다');
  });

  it('swaps the dynamic polite-register rules instead of leaving both', () => {
    expect(plain).not.toContain('모든 글톤은 존댓말 기반이다');
    expect(plain).not.toContain('기본은 낮은 존댓말. ~해요/~네요/~죠/~입니다를 자연스럽게 섞는다');
    expect(plain).not.toContain('홈판은 자동으로 낮은 존댓말과 모바일 피드 리듬으로 완화한다');
    expect(plain).toContain('■ 사람 말투 리듬 (평서체 주제):');
    expect(plain).toContain('■ 홈판에 유리한 말투 (평서체 주제):');
    expect(plain).not.toMatch(/자주 쓰는 어미 후보: [^\n]*~해요/);
    expect(plain).toMatch(/자주 쓰는 어미 후보: [^\n]*~했다/);
  });

  it('uses the voice of the topic', () => {
    expect(plain).toContain('카톡으로 썰 풀듯');
    expect(buildFullPrompt('homefeed', '스포츠', false, 'friendly')).toContain('친구에게 중계하듯');
    expect(buildFullPrompt('homefeed', 'IT', false, 'friendly')).toContain('쉽게 말하면 ~이다');
    expect(buildFullPrompt('homefeed', '자동차', false, 'friendly')).toContain('[말투 최종 규칙 — 평서체');
  });

  it('applies without a tone style too (intro rewrite path)', () => {
    const noTone = buildFullPrompt('homefeed', '연예');
    expect(noTone).toContain('[말투 최종 규칙 — 평서체');
    expect(noTone).toContain('■ 홈판에 유리한 말투 (평서체 주제):');
  });

  it('leaves polite homefeed topics and other modes exactly as before', () => {
    expect(polite).not.toContain('평서체 주제');
    expect(polite).not.toContain('[말투 최종 규칙 — 평서체');
    expect(polite).toContain('모든 글톤은 존댓말 기반이다');
    expect(polite).toContain('기본은 낮은 존댓말');
    const seo = buildFullPrompt('seo', '연예', false, 'friendly');
    expect(seo).not.toContain('평서체 주제');
    expect(seo).not.toContain('[말투 최종 규칙 — 평서체');
  });
});

describe('homefeed plain register - voice profile', () => {
  const profile = sampleVoiceProfile(() => 0.5);

  it('replaces the polite ending ratio line for plain posts only', () => {
    const plainBlock = buildVoiceProfileBlock(profile, { plainRegister: true });
    expect(plainBlock).toContain('평서체(~했다/~였다/~보인다/~싶다)가 기본');
    expect(plainBlock).not.toContain('해요체가 기본');
    expect(plainBlock).not.toContain('즐겨 쓰는 구어 종결');
    for (const ending of profile.signatureEndings) expect(plainBlock).not.toContain(ending);
    expect(buildVoiceProfileBlock(profile)).toContain('해요체가 기본');
  });
});

describe('homefeed plain register - regeneration directive', () => {
  const failing = () => ({
    mode: 'homefeed' as const,
    modeScore: { score: 60, details: {}, issues: [], suggestions: [] },
    humanlikeScore: { score: 55, details: {}, issues: ['어미 다양성 30%'], suggestions: [ENDING_VARIETY_SUGGESTION] },
    safetyScore: { score: 95, details: {}, issues: [], suggestions: [] },
    finalScore: 62,
    decision: 'retry' as const,
    retryDirective: null,
  });

  it('never pushes a plain-register post back toward polite endings', () => {
    const { directive } = assessQuality90Gate(failing() as never, 'homefeed', { plainRegister: true });
    expect(directive).toContain('존댓말로 바꾸지 않는다');
    expect(directive).toContain('평서체 안에서 어미를 다양하게');
    expect(directive).not.toContain('딱딱한 ~다 종결을 줄이고');
    expect(directive).not.toContain('~요/~네요/~답니다');
  });

  it('keeps the existing directive for polite posts', () => {
    const { directive } = assessQuality90Gate(failing() as never, 'homefeed');
    expect(directive).toContain('딱딱한 ~다 종결을 줄이고');
    expect(directive).toContain('~요/~네요/~답니다');
  });
});

describe('homefeed plain register - evaluator retry directive', () => {
  it('swaps the polite-ending advice inside an evaluator retry directive too', () => {
    const evaluatorDirective = `[Quality Gate — 재생성 지시 (homefeed 모드)]\n구체 개선 지시:\n  → ${ENDING_VARIETY_SUGGESTION}`;
    expect(toPlainRegisterDirective(evaluatorDirective)).not.toContain('~요/~네요/~답니다');
    expect(toPlainRegisterDirective(evaluatorDirective)).toContain('평서체 안에서 어미를 다양하게');
    const { directive } = assessQuality90Gate({
      mode: 'homefeed',
      modeScore: { score: 60, details: {}, issues: [], suggestions: [] },
      humanlikeScore: { score: 55, details: {}, issues: [], suggestions: [] },
      safetyScore: { score: 95, details: {}, issues: [], suggestions: [] },
      finalScore: 62,
      decision: 'retry',
      retryDirective: evaluatorDirective,
    } as never, 'homefeed', { plainRegister: true });
    expect(directive).not.toContain('~요/~네요/~답니다');
  });
});
