import { describe, expect, it } from 'vitest';
import {
  applyHomefeedNarrativeHookBlock,
  applySeoQualityHookBlock,
} from '../contentBodyHooks';
import { resolveHumanizeIntensity } from '../contentHumanizationPolicy';

describe('post-generation integrity', () => {
  // [2026-09-22 SPEC — 후처리 결정론화, supersedes 2026-07-30 지시] aiHumanizer의 'strong'은
  // 더 이상 Math.random 기반 어미/동의어 변주를 하지 않는다(결정론적 안전 변환만). 그 전제가
  // 바뀌었으므로 "항상 strong"이라는 기본값도 재검토 대상이다 — 기본값은 'light'로 낮추고,
  // 강한 변환이 필요한 호출자는 `resolveHumanizeIntensity(mode, 'strong')`으로 명시하게 했다.
  // ⚠️ src/contentGenerator.ts:7932 호출부는 아직 configured를 넘기지 않는다 — 통합 담당자 확인 필요.
  it('기본값은 light이고, configured로 명시하면 그 값을 따른다', () => {
    expect(resolveHumanizeIntensity('seo')).toBe('light');
    expect(resolveHumanizeIntensity('homefeed')).toBe('light');
    expect(resolveHumanizeIntensity('mate')).toBe('light');
    expect(resolveHumanizeIntensity('affiliate')).toBe('light');
    expect(resolveHumanizeIntensity('seo', 'strong')).toBe('strong');
    expect(resolveHumanizeIntensity('seo', 'off')).toBe('off');
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
