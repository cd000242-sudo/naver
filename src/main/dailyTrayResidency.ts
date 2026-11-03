/**
 * Tray residency for the daily auto-publisher: closing the window keeps the app (and the plans) running.
 *
 * Electron objects are injected so the decisions can be tested without a real window or tray:
 * - which choices the close-confirmation offers (the tray option only while a plan is on and a tray icon exists),
 * - what the owner answered ('tray' | true | false, plain booleans from the old dialog still work),
 * - the tray menu / tooltip text, and the one-time "still running in the tray" notice.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { dailyKst } from '../scheduler/dailyPublishingModel.js';

export type QuitChoice = 'tray' | 'quit' | 'cancel';

export const TRAY_NOTICE_TITLE = '매일 자동발행';
export const TRAY_NOTICE_BODY = '매일 자동발행이 트레이에서 계속 실행됩니다 — 트레이 아이콘을 누르면 창이 열립니다';
export const TRAY_IDLE_TOOLTIP = 'Leaders Pro - 네이버 블로그 자동화';

export interface TrayWindowLike {
  isDestroyed(): boolean;
  hide(): void;
  show(): void;
  focus(): void;
  isMinimized?(): boolean;
  restore?(): void;
}

export interface TrayMenuItem {
  label?: string;
  enabled?: boolean;
  type?: 'separator';
  click?: () => void;
}

export interface TrayResidencyDeps {
  planEnabled(): boolean;
  executing(): boolean;
  nextPublishAt(): string | null;
  /** A tray icon exists, so a hidden window can be brought back. */
  trayReady(): boolean;
  window(): TrayWindowLike | null | undefined;
  notify(title: string, body: string): void;
  noticeSeen(): boolean;
  markNoticeSeen(): void;
  /** Full exit without the confirmation window (runs the same cleanup as a confirmed quit). */
  quitApp(): void | Promise<void>;
}

/** The old dialog sent a boolean; the new one sends 'tray' | true | false. Anything else is a cancel. */
export function parseQuitChoice(value: unknown, trayOffered: boolean): QuitChoice {
  if (value === true || value === 'quit') return 'quit';
  if (value === 'tray') return trayOffered ? 'tray' : 'cancel';
  return 'cancel';
}

/** "MM/DD HH:MM" in KST, the clock the plans are written in. */
export function formatNextPublish(iso: string | null): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (!Number.isFinite(at.getTime())) return null;
  const { date, time } = dailyKst(at);
  return `${date.slice(5, 7)}/${date.slice(8, 10)} ${time}`;
}

export function trayStatusLine(input: { enabled: boolean; executing: boolean; nextAt: string | null }): string {
  if (!input.enabled) return '매일 자동발행: 꺼짐';
  if (input.executing) return '매일 자동발행: 켜짐 · 지금 발행 중';
  const next = formatNextPublish(input.nextAt);
  return next ? `매일 자동발행: 켜짐 · 다음 발행 ${next}` : '매일 자동발행: 켜짐';
}

export function createTrayResidency(deps: TrayResidencyDeps) {
  const statusLine = (): string => trayStatusLine({
    enabled: deps.planEnabled(), executing: deps.executing(), nextAt: deps.nextPublishAt(),
  });

  const showWindow = (): void => {
    const win = deps.window();
    if (!win || win.isDestroyed()) return;
    if (win.isMinimized?.()) win.restore?.();
    win.show();
    win.focus();
  };

  const hideToTray = (): void => {
    const win = deps.window();
    if (!win || win.isDestroyed()) return;
    win.hide();
    if (!deps.noticeSeen()) {
      deps.markNoticeSeen();
      deps.notify(TRAY_NOTICE_TITLE, TRAY_NOTICE_BODY);
    }
  };

  /** The tray option is only safe while a tray icon exists to bring the window back. */
  const offerTray = (): boolean => deps.planEnabled() && deps.trayReady();

  return {
    offerTray,
    statusLine,
    showWindow,
    hideToTray,
    tooltip: (): string => (deps.planEnabled() ? `Leaders Pro - ${statusLine()}` : TRAY_IDLE_TOOLTIP),
    /** Applies the dialog answer; the caller still performs the real quit for 'quit'. */
    applyChoice(raw: unknown): QuitChoice {
      const choice = parseQuitChoice(raw, offerTray());
      if (choice === 'tray') hideToTray();
      return choice;
    },
    menuTemplate(): TrayMenuItem[] {
      return [
        { label: statusLine(), enabled: false },
        { type: 'separator' },
        { label: '📺 창 열기', click: showWindow },
        { type: 'separator' },
        { label: '❌ 앱 완전 종료', click: () => { void deps.quitApp(); } },
      ];
    },
  };
}

export type TrayResidency = ReturnType<typeof createTrayResidency>;

/** "Already told the owner once" marker kept as a file in the user-data folder. */
export function createNoticeFlag(directory: string, fileName = 'tray-residency-notice-v1.flag') {
  const file = path.join(directory, fileName);
  return {
    seen: (): boolean => { try { return existsSync(file); } catch { return false; } },
    mark: (): void => {
      try { mkdirSync(directory, { recursive: true }); writeFileSync(file, new Date().toISOString()); }
      catch { /* a missing marker only repeats the notice */ }
    },
  };
}
