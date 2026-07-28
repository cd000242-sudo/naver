import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

import { buildCustomModeOverridePrompt } from '../contentCustomModePrompt';
import { buildEvidenceAndIntentFinalContract, buildEvidenceMetaLeakRule } from '../content/evidenceIntegrity';
import { buildContentJsonOutputFormat } from '../contentJsonPromptFormat';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

/**
 * [2026-07-30] 사용자 지시 잠금: "적용 안 되는 모드가 있으면 안 된다."
 * 커버리지 감사에서 발견된 공백(P0~P3)의 봉인 상태를 모드 단위로 고정한다.
 */
describe('mode coverage completeness (품질 레이어 전 모드 도달)', () => {
  it('P0: custom(페러프레이징) 오버라이드에도 어미 팔레트 계약이 들어간다', () => {
    const prompt = buildCustomModeOverridePrompt({ customPrompt: '이 글을 더 생생하게 다듬어줘' });
    expect(prompt).toContain('[어미 팔레트 — 필수]');
    expect(prompt).toContain('~잖아요');
    // 사용자 프롬프트 최우선 원칙은 유지
    expect(prompt).toContain('사용자 요청과 충돌 시 사용자 요청이 우선');
  });

  it('P0: customPrompt 없는 custom 모드도 안티패턴 오버레이 화이트리스트에 포함', () => {
    const loader = read('promptLoader.ts');
    expect(loader).toMatch(/mode === 'business' \|\| mode === 'custom'\) \{\s*\n\s*const humanWritingOverlay/);
  });

  it('P0: 사진 모드(image-narrative)가 휴머나이저를 통과하고 보이스 프로필을 받는다', () => {
    const gen = read('contentGenerator.ts');
    expect(gen).toContain('applyNarrativeHumanizePass(narrativeContent, source.toneStyle)');
    const pass = read('imageNarrative/narrativeBuilder/humanizePass.ts');
    expect(pass).toMatch(/humanizeContent\(content\.bodyPlain, intensity/);
    const builder = read('imageNarrative/narrativeBuilder/builder.ts');
    expect(builder).toContain('buildVoiceProfileBlock(sampleVoiceProfile())');
    expect(builder).toContain('[어미 팔레트]');
  });

  it('P1: 쇼핑커넥트 finalContract에 근거 메타 노출 금지가 포함된다 (SPEC_ONLY·전문가형 포함)', () => {
    const gen = read('contentGenerator.ts');
    expect(gen).toMatch(/\[근거 메타 노출 금지\]\\n\$\{buildEvidenceMetaLeakRule\(\)\}/);
    expect(buildEvidenceMetaLeakRule()).toContain('자료의 존재·부족·범위를 독자에게 말하지 않는다');
  });

  it('P1~P2: 제목 payoff가 seo/mate/business/custom 전부에 존재한다', () => {
    for (const mode of ['seo', 'mate', 'business', 'custom']) {
      const contract = buildEvidenceAndIntentFinalContract({ rawText: '근거 텍스트 '.repeat(20) } as any, mode);
      expect(contract, `mode=${mode}`).toContain('제목이 던진 질문·숫자·조건·방법은 도입부 첫 3~5문장 안에서 직접 답한다');
    }
    // 홈판은 자체 문구 유지
    const hf = buildEvidenceAndIntentFinalContract({ rawText: '근거 텍스트 '.repeat(20) } as any, 'homefeed');
    expect(hf).toContain('제목이 던진 질문·숫자·정체·방법은 도입부 첫 3~5문장 안에서 직접 답한다');
  });

  it('P3: business/custom에 SEO 전용 규칙이 오배정되지 않는다', () => {
    const buildFor = (mode: string) => buildContentJsonOutputFormat({
      contentMode: mode,
      mode,
      source: { rawText: '테스트 원문' },
      minChars: 2000,
    } as any);
    for (const mode of ['business', 'custom']) {
      const format = buildFor(mode);
      expect(format, `mode=${mode}`).not.toContain('[SEO 모드 필수 규칙]');
      expect(format, `mode=${mode}`).toContain('[공통 구조 규칙]');
    }
    expect(buildFor('seo')).toContain('[SEO 모드 필수 규칙]');
  });

  it('메타 누설 유발 지시문("확인되지 않습니다"라고 처리)이 프롬프트에서 사라졌다', () => {
    const jsonFormat = read('contentJsonPromptFormat.ts');
    expect(jsonFormat).not.toContain('"자료 기준으로는 확인되지 않습니다"라고 처리');
    expect(jsonFormat).toContain('자료 부족 안내 문장을 독자에게 노출 금지');
  });
});
