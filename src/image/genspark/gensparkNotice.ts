// src/image/genspark/gensparkNotice.ts
// [2026-11-12 실측] 젠스파크가 /ai_image 위에 안내 창('Media Studio 사용해 보기')을 띄우면 화면을 덮는 .mar-backdrop 이
//   마우스 누름을 가로챘다. 좌표 클릭은 오류 없이 배경만 눌러서, 보내기 단추를 눌렀는데도 작업 주소가 생기지 않았다.
//   눌러야 하는 단계 앞에서 이 창을 먼저 닫는다. Orbit(genspark-image.ts dismissGensparkNotice)과 같은 규칙:
//   '나중에/Later/Not now' 단추가 있으면 그것만 누르고, 없으면 Escape. "다시 표시하지 않음" 같은 계정 설정은 건드리지 않는다.
import type { GensparkPageLike } from './gensparkTypes';

export interface GensparkNoticeState {
  visible: boolean;
  /** '나중에' 류 단추의 중심 좌표(없으면 null) */
  later: { x: number; y: number } | null;
}

export interface GensparkNoticeDeps {
  now(): number;
  sleep(ms: number): Promise<void>;
  log(message: string): void;
}

const NOTICE_CLOSE_WAIT_MS = 5_000;
const NOTICE_POLL_MS = 250;

/** 화면을 덮는 안내 창(.mar-backdrop)과 그 안의 '나중에' 단추. page.evaluate 로 직렬화되므로 자기완결. */
export function readGensparkNotice(): GensparkNoticeState {
  const shown = (el: Element): boolean => {
    const r = (el as HTMLElement).getBoundingClientRect();
    const style = getComputedStyle(el as HTMLElement);
    return r.width > 0 && r.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  };
  const backdrop = Array.from(document.querySelectorAll('.mar-backdrop')).find(shown);
  if (!backdrop) return { visible: false, later: null };
  for (const button of Array.from(backdrop.querySelectorAll('button, [role="button"]'))) {
    if (!/나중에|Later|Not now/i.test(button.textContent || '') || !shown(button)) continue;
    const r = (button as HTMLElement).getBoundingClientRect();
    return { visible: true, later: { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } };
  }
  return { visible: true, later: null };
}

/** 안내 창이 보이면 닫는다. 닫았으면 true, 창이 없었거나 못 닫았으면 false. 닫기는 최선 노력이라 던지지 않는다. */
export async function gensparkDismissNotice(page: GensparkPageLike, deps: GensparkNoticeDeps): Promise<boolean> {
  try {
    const notice = await page.evaluate(readGensparkNotice);
    if (!notice.visible) return false;
    if (notice.later) await page.mouse.click(notice.later.x, notice.later.y);
    else await page.keyboard.press('Escape');
    const deadline = deps.now() + NOTICE_CLOSE_WAIT_MS;
    for (;;) {
      if (!(await page.evaluate(readGensparkNotice)).visible) {
        deps.log('[젠스파크] 안내 창을 닫고 이어서 진행합니다.');
        return true;
      }
      if (deps.now() >= deadline) break;
      await deps.sleep(NOTICE_POLL_MS);
    }
    deps.log('[젠스파크] 안내 창을 닫지 못했습니다 — 그대로 이어서 진행합니다.');
    return false;
  } catch {
    return false;
  }
}
