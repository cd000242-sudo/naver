import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildMobileRichHtml } from '../automation/richTextPaste';
import { pickDeviceToggleTarget, type DeviceToggleButtonMeta } from '../automation/editorHelpers';

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
    // 스캔 폴백: 수집→판정(순수함수)→클릭 구조 + frame/page 양쪽 스캔
    expect(editorHelpers).toContain('[스캔 폴백] 기기전환 버튼 클릭');
    expect(editorHelpers).toContain('pickDeviceToggleTarget(metas)');
    expect(editorHelpers).toContain('[frame, page].filter(Boolean)');
  });

  // [v2.11.144b] 클릭 판정 순수 함수 — 함정 케이스까지 잠금
  const meta = (index: number, cls: string, title = '', aria = '', visible = true): DeviceToggleButtonMeta =>
    ({ index, cls, title, aria, visible });

  it('구 UI(device-tablet 클래스)와 신 UI(모바일 라벨) 모두 올바른 버튼을 고른다', () => {
    // 구 UI: device 클래스 명시
    expect(pickDeviceToggleTarget([
      meta(0, 'se-util-button-device-desktop', 'PC 화면'),
      meta(1, 'se-util-button-device-tablet', '테블릿 화면'),
    ])).toEqual({ index: 1, reason: 'class-device-tablet' });
    // 신 UI 가정: 클래스는 바뀌었지만 라벨에 모바일
    expect(pickDeviceToggleTarget([
      meta(0, 'se-toolbar-x1', '', '데스크탑 화면으로 보기'),
      meta(1, 'se-toolbar-x2', '', '모바일 화면으로 보기'),
    ])).toEqual({ index: 1, reason: 'label-mobile' });
    // 모바일 > 태블릿 우선
    expect(pickDeviceToggleTarget([
      meta(0, 'se-device-tablet-btn'),
      meta(1, 'se-device-mobile-btn'),
    ])?.index).toBe(1);
  });

  it('함정 버튼(발행 미리보기/데스크탑/숨김)은 절대 클릭하지 않는다', () => {
    // 발행 미리보기 버튼에 "모바일 미리보기" 라벨 — 모달 오픈 사고 방지
    expect(pickDeviceToggleTarget([
      meta(0, 'publish-preview-btn', '모바일 미리보기'),
    ])).toBeNull();
    // 데스크탑 전환 버튼만 있는 경우
    expect(pickDeviceToggleTarget([
      meta(0, 'se-toolbar-y', '', '데스크탑 화면으로 보기'),
    ])).toBeNull();
    // 숨겨진 모바일 버튼
    expect(pickDeviceToggleTarget([
      meta(0, 'se-util-button-device-mobile', '', '', false),
    ])).toBeNull();
    // 아무 후보 없음
    expect(pickDeviceToggleTarget([])).toBeNull();
  });
});
