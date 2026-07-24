import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildMobileRichHtml } from '../automation/richTextPaste';

/**
 * [v2.11.144] 모바일 가독성 회귀 잠금 (사용자 실측 스샷 2건).
 *
 * 1. 줄폭: 호출부 2곳이 maxChunkChars:38로 기본 22를 덮어써, 33자 문장이 분할 없이
 *    나가 모바일(19px ~20자/줄)에서 단어 중간 꺾임("…바뀌/지") 발생. 38 오버라이드
 *    제거 → 기본 22자(2026-06-11 실측 레퍼런스)로 통일.
 * 2. 화면 모드: viewModeTablet 셀렉터 전멸로 PC 화면에서 작성됨 → 모바일 변형
 *    셀렉터 추가 + 스캔 폴백(후보 로깅).
 */
describe('mobile line width + view mode (v2.11.144)', () => {
  it('실측 문장(33자)이 기본 청킹으로 22자 이하 줄로 분할된다', () => {
    const sentence = '소상공인 경영안정 바우처 카드가 바뀌지 않거나 결제가 거절됐다면 먼저 분리해야 합니다.';
    const rich = buildMobileRichHtml(sentence, { highlight: false });
    // 렌더된 plainText의 각 줄이 22+여유(구두점 수용 2자) 이내
    const lines = rich.plainText.split('\n').map((l) => l.trim()).filter(Boolean);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(24);
    }
  });

  it('호출부에 38자 오버라이드가 없다 (기본 22자 단일 진실)', () => {
    const editorHelpers = readFileSync(resolve(__dirname, '../automation/editorHelpers.ts'), 'utf8');
    const automation = readFileSync(resolve(__dirname, '../naverBlogAutomation.ts'), 'utf8');
    expect(editorHelpers).not.toContain('maxChunkChars: 38');
    expect(automation).not.toContain('maxChunkChars: 38');
  });

  it('기기전환 셀렉터에 모바일 변형이 있고, 전멸 시 스캔 폴백이 존재한다', () => {
    const selectors = readFileSync(resolve(__dirname, '../automation/selectors/editorSelectors.ts'), 'utf8');
    const editorHelpers = readFileSync(resolve(__dirname, '../automation/editorHelpers.ts'), 'utf8');
    expect(selectors).toContain('se-util-button-device-mobile');
    expect(selectors).toContain('button[title*="모바일"]');
    // 스캔 폴백: 후보 로깅 + 모바일 우선 클릭
    expect(editorHelpers).toContain('[스캔 폴백] 기기전환 버튼 클릭');
    expect(editorHelpers).toMatch(/device\|태블릿\|테블릿\|모바일\|mobile\|tablet/);
  });
});
