import { describe, expect, it } from 'vitest';
import {
  applyHomefeedNarrativeHookBlock,
  applySeoQualityHookBlock,
} from '../contentBodyHooks';
import { resolveHumanizeIntensity } from '../contentHumanizationPolicy';

describe('post-generation integrity', () => {
  it('uses meaning-preserving humanization for SEO and homefeed', () => {
    expect(resolveHumanizeIntensity('seo')).toBe('light');
    expect(resolveHumanizeIntensity('homefeed')).toBe('light');
    expect(resolveHumanizeIntensity('mate')).toBe('light');
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
