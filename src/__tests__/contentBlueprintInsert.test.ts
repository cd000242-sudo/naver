/** SPEC-BLUEPRINT-2026 Phase 2 — 설계도 블록은 [원본 텍스트] 마커 뒤(user 파트)에만 들어간다. */
import { describe, expect, it } from 'vitest';
import { insertBlueprintIntoPrompt, PROMPT_SOURCE_MARKER } from '../content/blueprint/insertBlueprintIntoPrompt';
import { splitPromptByMarker } from '../promptSplitter';

describe('insertBlueprintIntoPrompt', () => {
  const prompt = `[규칙 A]\n규칙 본문\n\n${PROMPT_SOURCE_MARKER}\n[필수 키워드 정보]\n키워드: 청년월세`;

  it('system 파트는 바이트 단위로 그대로, 블록은 user 파트 맨 앞', () => {
    const out = insertBlueprintIntoPrompt(prompt, '[설계도]\n- 독자 상황: …');
    const before = splitPromptByMarker(prompt);
    const after = splitPromptByMarker(out);
    expect(after.system).toBe(before.system);
    expect(after.user.startsWith(`${PROMPT_SOURCE_MARKER}\n[설계도]`)).toBe(true);
    expect(after.user).toContain('[필수 키워드 정보]');
  });

  it('$ 문자가 든 블록도 치환 특수문자로 해석되지 않는다', () => {
    const out = insertBlueprintIntoPrompt(prompt, '가격 $12 · $& · $1');
    expect(out).toContain('가격 $12 · $& · $1');
  });

  it('빈 블록은 프롬프트를 바꾸지 않고, 마커가 없으면 끝에 붙인다', () => {
    expect(insertBlueprintIntoPrompt(prompt, '  ')).toBe(prompt);
    const noMarker = insertBlueprintIntoPrompt('[규칙만]', '[설계도]');
    expect(noMarker.startsWith('[규칙만]')).toBe(true);
    expect(noMarker.trimEnd().endsWith('[설계도]')).toBe(true);
  });
});
