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
});
