import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  TRAY_IDLE_TOOLTIP, TRAY_NOTICE_BODY, createTrayResidency, formatNextPublish, parseQuitChoice, trayStatusLine,
  type TrayResidencyDeps,
} from '../main/dailyTrayResidency.js';
import { collectNewMissedJobs, missedNoticeText } from '../main/services/dailyMissedNotice.js';

// A fresh checkout writes CRLF (core.autocrlf): compare the source text with LF line ends.
const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const html = readFileSync(new URL('../../public/quit-confirm.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

function fixture(over: Partial<TrayResidencyDeps> = {}) {
  let seen = false;
  const win = { isDestroyed: () => false, hide: vi.fn(), show: vi.fn(), focus: vi.fn() };
  const deps: TrayResidencyDeps = {
    planEnabled: () => true, executing: () => false, nextPublishAt: () => '2026-11-04T00:00:00.000Z', trayReady: () => true,
    window: () => win, notify: vi.fn(), noticeSeen: () => seen, markNoticeSeen: () => { seen = true; }, quitApp: vi.fn(),
    ...over,
  };
  return { residency: createTrayResidency(deps), deps, win };
}

describe('tray residency decisions', () => {
  it('offers the tray option only while a plan is on and a tray icon exists', () => {
    expect(fixture().residency.offerTray()).toBe(true);
    expect(fixture({ planEnabled: () => false }).residency.offerTray()).toBe(false);
    expect(fixture({ trayReady: () => false }).residency.offerTray()).toBe(false);
  });

  it("answer 'tray' hides the window without quitting and tells the owner once", () => {
    const { residency, deps, win } = fixture();
    expect(residency.applyChoice('tray')).toBe('tray');
    expect(win.hide).toHaveBeenCalledTimes(1);
    expect(deps.quitApp).not.toHaveBeenCalled();
    expect(deps.notify).toHaveBeenCalledWith('매일 자동발행', TRAY_NOTICE_BODY);
    residency.applyChoice('tray');
    expect(win.hide).toHaveBeenCalledTimes(2);
    expect(deps.notify).toHaveBeenCalledTimes(1);
  });

  it('keeps the old confirmation when no plan is on: a tray answer is refused, booleans still work', () => {
    const { residency, win } = fixture({ planEnabled: () => false });
    expect(residency.applyChoice('tray')).toBe('cancel');
    expect(win.hide).not.toHaveBeenCalled();
    expect(parseQuitChoice(true, false)).toBe('quit');
    expect(parseQuitChoice(false, false)).toBe('cancel');
    expect(parseQuitChoice(undefined, true)).toBe('cancel');
    expect(parseQuitChoice('tray', true)).toBe('tray');
  });

  it('quit and cancel answers never hide the window', () => {
    const { residency, win } = fixture();
    expect(residency.applyChoice(true)).toBe('quit');
    expect(residency.applyChoice(false)).toBe('cancel');
    expect(win.hide).not.toHaveBeenCalled();
  });

  it('shows the status line with the next publish time (KST) or the off state', () => {
    expect(formatNextPublish('2026-11-04T00:00:00.000Z')).toBe('11/04 09:00');
    expect(trayStatusLine({ enabled: true, executing: false, nextAt: '2026-11-04T00:00:00.000Z' })).toBe('매일 자동발행: 켜짐 · 다음 발행 11/04 09:00');
    expect(trayStatusLine({ enabled: false, executing: false, nextAt: null })).toBe('매일 자동발행: 꺼짐');
    expect(trayStatusLine({ enabled: true, executing: true, nextAt: null })).toBe('매일 자동발행: 켜짐 · 지금 발행 중');
  });

  it('builds the tray menu: status line first (disabled), open window, full quit without a confirmation', () => {
    const { residency, deps, win } = fixture();
    const menu = residency.menuTemplate();
    expect(menu[0]).toEqual({ label: '매일 자동발행: 켜짐 · 다음 발행 11/04 09:00', enabled: false });
    menu.find(item => item.label === '📺 창 열기')?.click?.();
    expect(win.show).toHaveBeenCalled();
    expect(win.focus).toHaveBeenCalled();
    menu.find(item => item.label === '❌ 앱 완전 종료')?.click?.();
    expect(deps.quitApp).toHaveBeenCalledTimes(1);
    expect(residency.tooltip()).toBe('Leaders Pro - 매일 자동발행: 켜짐 · 다음 발행 11/04 09:00');
    expect(fixture({ planEnabled: () => false }).residency.tooltip()).toBe(TRAY_IDLE_TOOLTIP);
  });
});

describe('main.ts wiring contracts', () => {
  it('close dialog: tray flag in the URL, parsed answer, tray hides, quit shares one cleanup path', () => {
    expect(main).toContain("{ query: { tray: '1' } }");
    expect(main).toContain('parseQuitChoice(response, offerTray)');
    expect(main).toContain('trayResidency.hideToTray()');
    const quit = main.slice(main.indexOf('async function quitAppConfirmed'), main.indexOf('const trayResidency = createTrayResidency'));
    expect(quit).toContain("(globalThis as any).isQuitting = true");
    expect(quit).toContain('AutomationService.requestCancel()');
    expect(quit).toContain('app.quit()');
    expect(main).toContain('quitApp: quitAppConfirmed');
  });

  it('tray menu comes from the residency module and is refreshed; no more app.isQuitting mismatch', () => {
    expect(main).toContain('Menu.buildFromTemplate(trayResidency.menuTemplate())');
    expect(main).toContain('setInterval(refreshTray, 30_000)');
    expect(main).not.toContain('(app as any).isQuitting');
  });

  it('second instance and policy dialogs bring a hidden window back', () => {
    const secondInstance = main.slice(main.indexOf("app.on('second-instance'"), main.indexOf('// 로그인 창이 있으면 포커스'));
    expect(secondInstance).toContain('trayResidency.showWindow()');
    expect(main).toContain('trayResidency.showWindow();\n  const response = mainWindow');
  });

  it('daily lease is named daily:<job>, manual multi-account queues first, and a manual claim counts as busy for the daily publisher', () => {
    expect(main).toContain('dailyContext ? dailyLeaseOwner(dailyContext.jobId) : `multi-account:${Date.now()}`');
    expect(main.indexOf("publishLane.enterAsUser({ label: 'multi-account'")).toBeLessThan(main.indexOf('dailyLeaseOwner(dailyContext.jobId)'));
    expect(main).toContain('|| publishLane.isUserClaimed())');
    expect(main).toContain("publishLane.enterAsUser({ label: 'automation:run'");
  });

  it('[중지] separation: both cancel IPCs ask the lane first and return before any global cancel when the daily run owns it', () => {
    const run = main.slice(main.indexOf("ipcMain.handle('automation:cancel'"), main.indexOf("ipcMain.handle('automation:resetImageState'"));
    expect(run.indexOf('publishLane.cancelForUser()')).toBeGreaterThan(-1);
    expect(run.indexOf('publishLane.cancelForUser()')).toBeLessThan(run.indexOf('abortImageGeneration()'));
    expect(run.indexOf('publishLane.cancelForUser()')).toBeLessThan(run.indexOf('AutomationService.requestCancel()'));
    expect(run.indexOf('publishLane.cancelForUser()')).toBeLessThan(run.indexOf('AutomationService.stopRunning()'));
    const multi = main.slice(main.indexOf("ipcMain.handle('multiAccount:cancel'"), main.indexOf('// ✅ [Phase 5A.2] title:*'));
    expect(multi.indexOf('publishLane.cancelForUser()')).toBeLessThan(multi.indexOf('AutomationService.requestCancel()'));
    expect(multi.indexOf('publishLane.cancelForUser()')).toBeLessThan(multi.indexOf('currentInstance.closeBrowser()'));
  });
});

describe('quit-confirm.html', () => {
  it('keeps the ids the E2E drives and adds the tray answer with the new theme colors', () => {
    for (const id of ['btnQuit', 'btnCancel', 'btnTray']) expect(html).toContain(`id="${id}"`);
    expect(html).toContain("send('tray')");
    expect(html).toContain("get('tray') === '1'");
    expect(html).toContain('#00873C');
    expect(html).toContain('#7B61FF');
    expect(html).toContain('#F3EFFF');
    expect(html).not.toContain('linear-gradient(145deg, rgba(30, 32, 48');
  });
});

describe('missed daily slot notice', () => {
  const job = (key: string, over: Record<string, unknown> = {}) => ({ key, accountId: 'a', date: '2026-11-03', time: '07:00', ordinal: 1,
    status: 'cancelled' as const, reason: 'deadline_missed' as const, createdAt: '', updatedAt: '', ...over });

  it('announces each missed slot once and not other endings', () => {
    const seen = new Set<string>();
    const runs = [job('k1'), job('k2', { status: 'confirmed', reason: undefined }), job('k3', { reason: 'stopped' })];
    expect(collectNewMissedJobs(runs, seen).map(run => run.key)).toEqual(['k1']);
    expect(collectNewMissedJobs(runs, seen)).toEqual([]);
  });

  it('gives a reason the owner can act on', () => {
    expect(missedNoticeText([job('k1')], true).body).toBe('매일 자동발행 07:00 글을 놓쳤습니다 — 다른 발행이 오래 이어졌습니다. 매일 발행 화면에서 기록을 확인해 주세요.');
    expect(missedNoticeText([job('k1')], false).body).toContain('예약 시각이 지나 발행하지 못했습니다');
  });
});
