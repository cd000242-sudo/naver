import { describe, expect, it } from 'vitest';
import {
  applyHomefeedNarrativeHookBlock,
  applySeoQualityHookBlock,
} from '../contentBodyHooks';
import { resolveHumanizeIntensity } from '../contentHumanizationPolicy';

describe('post-generation integrity', () => {
  it('applies strong humanization to every mode (2026-07-30 사용자 지시)', () => {
    // "사람보다 더 사람처럼" — light 강등이 어미 다양화까지 꺼서 ~합니다 단조
    // 어미가 AI 티의 주범이 됐다(라이브 실측). 전 모드 strong.
    expect(resolveHumanizeIntensity('seo')).toBe('strong');
    expect(resolveHumanizeIntensity('homefeed')).toBe('strong');
    expect(resolveHumanizeIntensity('mate')).toBe('strong');
    expect(resolveHumanizeIntensity('affiliate')).toBe('strong');
  });

  it('does not truncate a generated homefeed introduction', () => {
    const introduction = ['첫 문장', '둘째 문장', '셋째 문장', '넷째 문장', '다섯째 문장', '여섯째 문장'].join('\n');
    const content = { introduction, headings: [] } as any;

    applyHomefeedNarrativeHookBlock(content, { contentMode: 'homefeed' } as any);

    expect(content.introduction).toBe(introduction);
  });

  it('does not rewrite SEO prose after generation', () => {
    const original = '정리하자면 신청 조건부터 확인해야 합니다.';
    const content = {
      headings: [{ title: '신청 조건', body: original }],
    } as any;

    applySeoQualityHookBlock(content, { contentMode: 'seo' } as any);

    expect(content.headings[0].body).toBe(original);
  });
});
