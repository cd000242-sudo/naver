import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildMobileRichHtml } from '../automation/richTextPaste';
import {
  isMobileViewActive,
  pickDeviceToggleTarget,
  type DeviceToggleButtonMeta,
} from '../automation/editorHelpers';

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
  it('흐름 모드 기본: 33자 문장은 한 줄 — 옛 청킹(flowParagraphs:false)에서만 22자 이하로 분할', () => {
    const sentence = '소상공인 경영안정 바우처 카드가 바뀌지 않거나 결제가 거절됐다면 먼저 분리해야 합니다.';
    const flow = buildMobileRichHtml(sentence, { highlight: false });
    expect(flow.plainText.split('\n').map((l) => l.trim()).filter(Boolean)).toHaveLength(1);
    const rich = buildMobileRichHtml(sentence, { highlight: false, flowParagraphs: false });
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

  it('기기전환 셀렉터는 "PC 상태 버튼"만 매칭하고, 스캔 폴백 구조가 존재한다', () => {
    const selectors = readFileSync(resolve(__dirname, '../automation/selectors/editorSelectors.ts'), 'utf8');
    const editorHelpers = readFileSync(resolve(__dirname, '../automation/editorHelpers.ts'), 'utf8');
    // [2026-07-25 실측] 클릭 대상 = PC 상태 토글(data-log=flbbtn.vmobile → 모바일行).
    expect(selectors).toContain('button[data-log="flbbtn.vmobile"]');
    expect(selectors).toContain('se-util-button-device-desktop');
    // 함정 셀렉터 금지: 모바일 "상태" 버튼을 클릭하면 태블릿으로 이탈한다.
    expect(selectors).not.toContain('button.se-util-button-device-mobile');
    expect(selectors).not.toContain('button[title*="모바일"]');
    // 스캔 폴백: 수집→판정(순수함수)→클릭 + frame/page 양쪽 + 수렴 루프
    expect(editorHelpers).toContain('[스캔 폴백] 기기전환 클릭');
    expect(editorHelpers).toContain('pickDeviceToggleTarget(metas)');
    expect(editorHelpers).toContain('[frame, page].filter(Boolean)');
    expect(editorHelpers).toContain('isMobileViewActive(metas)');
  });

  // ── 판정 순수 함수: 2026-07-25 Playwright 실측 DOM 그대로 잠금 ──
  const meta = (
    index: number, cls: string,
    opts: Partial<Omit<DeviceToggleButtonMeta, 'index' | 'cls'>> = {},
  ): DeviceToggleButtonMeta => ({
    index, cls, title: '', aria: '', dataLog: '', text: '', visible: true, ...opts,
  });
  const LIVE_PC = meta(0, 'se-util-button __mode-button se-util-button-device-desktop',
    { dataLog: 'flbbtn.vmobile', text: 'PC 화면' });
  const LIVE_MOBILE = meta(0, 'se-util-button __mode-button se-util-button-device-mobile',
    { dataLog: 'flbbtn.vtablet', text: '모바일 화면' });
  const LIVE_TABLET = meta(0, 'se-util-button __mode-button se-util-button-device-tablet',
    { dataLog: 'flbbtn.vdesktop', text: '테블릿 화면' });

  it('실측 사이클: PC 상태=1클릭, 태블릿 상태=사이클 진행, 모바일 상태=클릭 금지', () => {
    // PC 화면 상태 → 클릭 (한 번이면 모바일 도달)
    expect(pickDeviceToggleTarget([LIVE_PC])).toEqual({ index: 0, reason: 'datalog-vmobile' });
    // 태블릿 상태 → 클릭 (→PC, 다음 반복에서 →모바일로 수렴)
    expect(pickDeviceToggleTarget([LIVE_TABLET])).toEqual({ index: 0, reason: 'state-tablet-cycle' });
    // 이미 모바일 상태 → 절대 클릭 금지 (누르면 태블릿으로 이탈)
    expect(pickDeviceToggleTarget([LIVE_MOBILE])).toBeNull();
    expect(isMobileViewActive([LIVE_MOBILE])).toBe(true);
    expect(isMobileViewActive([LIVE_PC])).toBe(false);
    // data-log 없는 변형에도 상태 클래스로 판정
    expect(pickDeviceToggleTarget([
      meta(3, 'se-util-button __mode-button se-util-button-device-desktop', { text: 'PC 화면' }),
    ])).toEqual({ index: 3, reason: 'state-pc' });
  });

  it('함정 버튼(발행 미리보기/데스크탑 라벨/숨김/라벨 오독)은 절대 클릭하지 않는다', () => {
    // 발행 미리보기 버튼에 "모바일 미리보기" 라벨 — 모달 오픈 사고 방지
    expect(pickDeviceToggleTarget([
      meta(0, 'publish-preview-btn', { title: '모바일 미리보기' }),
    ])).toBeNull();
    // 데스크탑 전환 라벨만 있는 경우 (device 클래스 없음)
    expect(pickDeviceToggleTarget([
      meta(0, 'se-toolbar-y', { aria: '데스크탑 화면으로 보기' }),
    ])).toBeNull();
    // 숨겨진 PC 상태 버튼 — 보이는 것만 클릭
    expect(pickDeviceToggleTarget([
      meta(0, 'se-util-button __mode-button se-util-button-device-desktop',
        { dataLog: 'flbbtn.vmobile', visible: false }),
    ])).toBeNull();
    // 사이클 토글이 존재하면 라벨 휴리스틱 봉인 — "모바일 화면" 텍스트는 현재 상태 표시
    expect(pickDeviceToggleTarget([LIVE_MOBILE, meta(1, 'se-x', { aria: '모바일로 보기' })])).toBeNull();
    // 아무 후보 없음
    expect(pickDeviceToggleTarget([])).toBeNull();
  });

  it('미지의 UI(사이클 토글 부재)에서만 라벨 휴리스틱이 열린다', () => {
    expect(pickDeviceToggleTarget([
      meta(0, 'se-toolbar-x1', { aria: '데스크탑 화면으로 보기' }),
      meta(1, 'se-toolbar-x2', { aria: '모바일 화면으로 보기' }),
    ])).toEqual({ index: 1, reason: 'label-mobile' });
    expect(pickDeviceToggleTarget([
      meta(0, 'se-toolbar-x3', { title: '태블릿 화면' }),
    ])).toEqual({ index: 0, reason: 'label-tablet' });
  });
});
