import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { buildIdentityBlock, DEFAULT_IDENTITY } from '../promptLoader.js';
import { resolveFtcModeTransition } from '../renderer/utils/ftcModeTransition.js';
import { resolveFtcSetting } from '../renderer/utils/ftcResolver.js';
import { DEFAULT_AFFILIATE_FTC_DISCLOSURE, FTC_DISCLOSURE_PRESETS } from '../automation/ftcDisclosurePresets.js';

const APPROVED_AFFILIATE_DISCLOSURE = '[광고] 이 글에는 제휴 링크가 포함될 수 있습니다.';

const PRESETS = {
  affiliate: '기본 제휴 문구',
  experience: '제품 제공 문구',
  custom: '',
} as const;

describe('FTC disclosure ownership', () => {
  it('uses the approved affiliate disclosure as the byte-exact fallback, without asking the model to write it', () => {
    expect(DEFAULT_AFFILIATE_FTC_DISCLOSURE).toBe(APPROVED_AFFILIATE_DISCLOSURE);
    expect(FTC_DISCLOSURE_PRESETS.affiliate).toBe(APPROVED_AFFILIATE_DISCLOSURE);
  });

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

  it('preserves user-owned disclosure whitespace instead of normalizing it during resolver handoff', () => {
    const userOwnedText = `  ${APPROVED_AFFILIATE_DISCLOSURE}  `;

    expect(resolveFtcSetting({
      contentMode: 'affiliate',
      uiCheckboxChecked: true,
      uiTextValue: userOwnedText,
    }).text).toBe(userOwnedText);
  });

  it('keeps publisher-owned disclosure copy intact through snapshot, form, and editor insertion paths', () => {
    const root = process.cwd();
    const pipelineConfig = readFileSync(join(root, 'src/renderer/modules/pipelineConfig.ts'), 'utf8');
    const formAndAutomation = readFileSync(join(root, 'src/renderer/modules/formAndAutomation.ts'), 'utf8');
    const editorHelpers = readFileSync(join(root, 'src/automation/editorHelpers.ts'), 'utf8');

    expect(pipelineConfig).toContain("text: raw.ftcDisclosureText || ''");
    expect(pipelineConfig).not.toContain("text: (raw.ftcDisclosureText || '').trim()");
    expect(formAndAutomation).toContain("const ftcText = ftcTextarea?.value || '';");
    expect(formAndAutomation).not.toContain("const ftcText = ftcTextarea?.value?.trim() || '';");
    expect(editorHelpers).toContain('const ftcText = structured.ftcDisclosure!;');
    expect(editorHelpers).toContain('const ftcTextNoIntro = structured.ftcDisclosure!;');
    expect(editorHelpers).not.toContain('structured.ftcDisclosure!.trim()');
  });

  it('forbids the writing model from generating or rewriting disclosure copy', () => {
    const prompt = buildIdentityBlock(DEFAULT_IDENTITY);
    expect(prompt).toContain('공정위·광고·제휴 고지 문구는 앱이 확정 원문을 별도로 삽입');
    expect(prompt).toContain('생성·요약·변형·중복 삽입하지 마세요');
    expect(prompt).not.toContain('광고는 [광고] 표기');
  });
});
