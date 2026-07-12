import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { buildFullPrompt, TONE_PERSONAS } from '../promptLoader';

const ROOT = path.resolve(__dirname, '..');

function read(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), 'utf-8');
}

describe('tone persona naturalness', () => {
  it('injects a human rhythm rule that prioritizes polite conversational Korean', () => {
    const prompt = buildFullPrompt('seo', 'life', false, 'sincere_exposure');

    expect(prompt).toContain('사람 말투 리듬');
    expect(prompt).toContain('존댓말 기반');
    expect(prompt).toContain('평어 단정형(~다/~이다/~한다) 남발');
    expect(prompt).toContain('~입니다/~합니다');
    expect(prompt).toContain('~요체');
    expect(prompt).toContain('입말 연결어');
    expect(prompt).toContain('사람보다 사람처럼');
  });

  it('keeps sincere exposure as a conversational disclosure tone, not stiff report prose', () => {
    const sincere = TONE_PERSONAS.sincere_exposure;

    expect(sincere.persona).toContain('광고에선 이렇게 말합니다');
    expect(sincere.persona).toContain('실제로 써보면');
    expect(sincere.rule).toContain('대화형');
    expect(sincere.rule).toContain('~입니다');
    expect(sincere.rule).toContain('~요');
    expect(sincere.rule).not.toContain('~다 단정');
  });

  it('all tone personas avoid prescribing plain-form endings as the main style', () => {
    for (const [toneName, tone] of Object.entries(TONE_PERSONAS)) {
      const guide = `${tone.persona}\n${tone.rule}`;

      expect(guide, toneName).toMatch(/~(해요|했어요|였어요|느껴졌어요|보세요|있어요|거예요|중요해요|이에요|예요|거든요|더라고요|입니다|합니다|습니다|죠|네요|답니다|확인됩니다)/);
      expect(guide, toneName).not.toMatch(/~다\(|~이다|~한다|~임|~함|평어 단정형/);
    }
  });

  it('base prompts do not reintroduce plain-form or nominal-ending catalogs', () => {
    const seoBase = read('prompts/seo/base.prompt');
    const homefeedBase = read('prompts/homefeed/base.prompt');
    const combined = `${seoBase}\n${homefeedBase}`;

    expect(combined).toContain('존댓말 기반');
    expect(combined).toContain('~요체');
    expect(combined).toContain('~입니다체');
    expect(combined).toContain('사람보다 사람처럼');
    expect(combined).not.toMatch(/강조형\s*\(명사형 종결\):\s*~임/);
    expect(combined).not.toMatch(/격식 혼용[\s\S]{0,80}~다,\s*~이다,\s*~한다/);
    expect(combined).not.toMatch(/~요체는\s*30% 이하/);
  });

  it('injects the human writing anti-pattern guard into major generation modes', () => {
    for (const mode of ['seo', 'homefeed', 'mate', 'affiliate', 'business'] as const) {
      const prompt = buildFullPrompt(mode, 'entertainment', false, 'community_fan');

      expect(prompt).toContain('HUMAN WRITING ANTI-PATTERN CONTRACT');
      expect(prompt).toContain('사람 말투는 감탄사를 늘리는 것이 아니다');
      expect(prompt).toContain('거든요/잖아요/더라고요는 양념');
      expect(prompt).toContain('문장 끝만 바꾸지 말고 생각을 전진시켜라');
    }
  });

  it('does not force fan/community tone into repeated crutch quotas', () => {
    const prompt = buildFullPrompt('homefeed', 'entertainment', false, 'community_fan');

    expect(prompt).toContain('같은 표현 반복은 실패');
    expect(prompt).toContain('커뮤니티 톤의 핵심은 유행어가 아니라');
    expect(prompt).not.toMatch(/매\s*단락\s*최소\s*1회/);
    expect(prompt).not.toMatch(/단락당\s*2개\s*이상/);
    expect(prompt).not.toMatch(/어미\s*분포\s*강제/);
    expect(prompt).not.toMatch(/~거든요\/~잖아요\s*30%/);
  });

  it('makes homefeed tone exposure-friendly without reverting to noisy slang', () => {
    const prompt = buildFullPrompt('homefeed', 'entertainment', false, 'friendly');

    expect(prompt).toContain('홈판에 유리한 말투');
    expect(prompt).toContain('내 얘기 같은 첫 화면');
    expect(prompt).toContain('저장할 이유');
    expect(prompt).toContain('댓글 달 거리');
    expect(prompt).toContain('구체적인 독자 상황 또는 판단 기준');
    expect(prompt).toContain('억지로 넣지 않는다');
    expect(prompt).toContain('모바일 피드 리듬');
    expect(prompt.lastIndexOf('■ 근거 제한 (페르소나보다 우선)'))
      .toBeGreaterThan(prompt.lastIndexOf('■ 페르소나:'));
    expect(prompt).not.toContain('이모지 3~5개');
    expect(prompt).not.toContain('격식 0%, 수다 리듬 우선');
  });
});
