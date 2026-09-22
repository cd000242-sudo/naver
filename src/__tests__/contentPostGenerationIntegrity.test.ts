import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applyHomefeedNarrativeHookBlock,
  applySeoQualityHookBlock,
} from '../contentBodyHooks';
import { resolveHumanizeIntensity } from '../contentHumanizationPolicy';

describe('post-generation integrity', () => {
  // [2026-09-22 P1 확정 — DEFAULT = LIGHT] 사장님 결정. 2026-07-30 "전 모드 strong" 지침 폐기.
  // 어떤 모드도 기본값을 올리지 않는다. 'strong' 은 사용자가 config.humanizerIntensity /
  // source.humanizerIntensity / HUMANIZER_INTENSITY 로 명시한 경우에만 (contentGenerator 호출부가
  // 이 순서로 configured 를 넘긴다). 이 테스트가 깨지면 기본값이 되돌아간 것이다.
  it('기본값은 light이고, configured로 명시하면 그 값을 따른다', () => {
    expect(resolveHumanizeIntensity('seo')).toBe('light');
    expect(resolveHumanizeIntensity('homefeed')).toBe('light');
    expect(resolveHumanizeIntensity('mate')).toBe('light');
    expect(resolveHumanizeIntensity('affiliate')).toBe('light');
    expect(resolveHumanizeIntensity('seo', 'strong')).toBe('strong');
    expect(resolveHumanizeIntensity('seo', 'off')).toBe('off');
    // 알 수 없는 값/빈 값은 strong 으로 승격되지 않는다.
    expect(resolveHumanizeIntensity('seo', '' as any)).toBe('light');
    expect(resolveHumanizeIntensity('seo', 'max' as any)).toBe('light');
  });

  it('contentGenerator 호출부는 config.humanizerIntensity 를 명시 선택으로만 읽는다 (기본 light 잠금)', () => {
    const code = readFileSync(resolve(__dirname, '../contentGenerator.ts'), 'utf8');
    expect(code).toMatch(/DEFAULT = LIGHT/);
    expect(code).toMatch(/humanizerIntensity \|\| configuredHumanizerIntensity \|\| process\.env\.HUMANIZER_INTENSITY/);
    // 모드에 따라 strong 을 강제하는 코드가 부활하면 안 된다.
    expect(code).not.toMatch(/resolveHumanizeIntensity\([^)]*,\s*'strong'\)/);
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
