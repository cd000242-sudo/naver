import { describe, expect, it } from 'vitest';
import { buildIdentityBlock, DEFAULT_IDENTITY } from '../promptLoader.js';
import { resolveFtcModeTransition } from '../renderer/utils/ftcModeTransition.js';

const PRESETS = {
  affiliate: '기본 제휴 문구',
  experience: '제품 제공 문구',
  custom: '',
} as const;

describe('FTC disclosure ownership', () => {
  it('preserves a custom disclosure byte-for-byte when entering affiliate mode', () => {
    const customText = '[공정위 원문]  사용자가 직접 정한 문구입니다.  ';
    const current = { enabled: false, preset: 'custom', text: customText };

    const next = resolveFtcModeTransition(current, 'affiliate', PRESETS);

    expect(next).toEqual({ enabled: true, preset: 'custom', text: customText });
    expect(next).not.toBe(current);
  });

  it('keeps the selected preset and text while disabling disclosure outside affiliate mode', () => {
    const current = { enabled: true, preset: 'experience', text: PRESETS.experience };

    expect(resolveFtcModeTransition(current, 'seo', PRESETS)).toEqual({
      enabled: false,
      preset: 'experience',
      text: PRESETS.experience,
    });
  });

  it('uses a preset default only when no saved wording exists', () => {
    expect(resolveFtcModeTransition(
      { enabled: false, preset: 'affiliate', text: '' },
      'affiliate',
      PRESETS,
    )).toEqual({ enabled: true, preset: 'affiliate', text: PRESETS.affiliate });
  });

  it('forbids the writing model from generating or rewriting disclosure copy', () => {
    const prompt = buildIdentityBlock(DEFAULT_IDENTITY);
    expect(prompt).toContain('공정위·광고·제휴 고지 문구는 앱이 확정 원문을 별도로 삽입');
    expect(prompt).toContain('생성·요약·변형·중복 삽입하지 마세요');
    expect(prompt).not.toContain('광고는 [광고] 표기');
  });
});
