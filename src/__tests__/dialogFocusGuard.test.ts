// src/__tests__/dialogFocusGuard.test.ts
// [2026-08-17] 네이티브 팝업/다이얼로그 포커스 스턱 가드 — 3계층 배선 잠금.
// 증상: alert/confirm 닫힌 뒤 입력 먹통, 바탕화면 클릭해야 복구 (사용자 실측).
// 이 테스트가 깨지면 가드 계층 중 하나가 끊긴 것 — 반드시 복구할 것.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'fs';

const read = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');

describe('1층 — 렌더러 alert/confirm/prompt 래퍼 (동작)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('원본 동작·반환값을 유지하며 닫힌 뒤 refocusWindow를 호출한다', async () => {
    vi.useFakeTimers();
    vi.resetModules();
    const refocusWindow = vi.fn();
    const g = globalThis as any;
    const origWindow = g.window;
    g.window = {
      alert: vi.fn(),
      confirm: vi.fn(() => true),
      prompt: vi.fn(() => '입력값'),
      api: { refocusWindow },
    };

    const { installDialogFocusGuard } = await import('../renderer/utils/dialogFocusGuard.js');
    installDialogFocusGuard();

    g.window.alert('안내');
    expect(g.window.confirm('진행?')).toBe(true);
    expect(g.window.prompt('이름?')).toBe('입력값');

    // 디바운스: 연속 3회 팝업 → 리셋 IPC는 1회만
    vi.advanceTimersByTime(200);
    expect(refocusWindow).toHaveBeenCalledTimes(1);

    // 이후 새 팝업이 닫히면 다시 리셋
    g.window.confirm('again?');
    vi.advanceTimersByTime(200);
    expect(refocusWindow).toHaveBeenCalledTimes(2);

    g.window = origWindow;
  });

  it('api 미배선(레거시/테스트 환경)이어도 팝업은 정상 동작하고 예외가 없다', async () => {
    vi.useFakeTimers();
    vi.resetModules();
    const g = globalThis as any;
    const origWindow = g.window;
    g.window = { alert: vi.fn(), confirm: vi.fn(() => false), prompt: vi.fn(() => null) };

    const { installDialogFocusGuard } = await import('../renderer/utils/dialogFocusGuard.js');
    installDialogFocusGuard();
    expect(() => g.window.alert('x')).not.toThrow();
    expect(g.window.confirm('y')).toBe(false);
    expect(() => vi.advanceTimersByTime(200)).not.toThrow();

    g.window = origWindow;
  });
});

describe('2층 — 메인 프로세스 배선 (source regression)', () => {
  it('main.ts가 refocus IPC 등록 + 네이티브 다이얼로그 패치를 설치한다', () => {
    const main = read('../main.ts');
    expect(main).toContain('registerWindowFocusHandlers()');
    expect(main).toContain('patchNativeDialogsForFocus()');
  });

  it('windowFocusHandlers가 open/save/messageBox 3종을 감싸고 finally에서 리셋한다', () => {
    const src = read('../main/ipc/windowFocusHandlers.ts');
    for (const m of ["'showOpenDialog'", "'showSaveDialog'", "'showMessageBox'"]) {
      expect(src).toContain(m);
    }
    expect(src).toMatch(/finally\s*\{\s*refocusWindow/);
    // 포커스 강탈 방지 가드
    expect(src).toMatch(/isVisible\(\)|isMinimized\(\)/);
  });

  it('preload가 window:refocus 브리지를 노출한다', () => {
    const preload = read('../preload.ts');
    expect(preload).toMatch(/refocusWindow[\s\S]{0,120}window:refocus/);
  });
});

describe('3층 — 부트스트랩/번들 배선 (source regression)', () => {
  it('renderer.ts가 가드를 설치하고, 인라인 리스트에 dialogFocusGuard가 있다', () => {
    const renderer = read('../renderer/renderer.ts');
    expect(renderer).toContain('installDialogFocusGuard()');
    const copyStatic = readFileSync(new URL('../../scripts/copy-static.mjs', import.meta.url), 'utf8');
    expect(copyStatic).toContain("'dialogFocusGuard.js'");
  });
});
