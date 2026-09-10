// src/main/ipc/lewordBoardHandlers.ts
// [2026-09-10] leword 의 "오늘의 글감"(실검 틈새 보드)을 앱으로 가져오는 창구.
//
// 사장님 지적: "오늘의 글감 사이트까지 줬는데 이럴래?"
// 앱에 leword 데이터를 읽는 코드가 한 줄도 없었다. 브라우저로 열기만 했다.
//
// 메인 프로세스에서 가져오는 이유: 렌더러에서 직접 fetch 하면 CSP·CORS 에 걸린다.
// 공개 JSON 이라 인증은 없다.

import { ipcMain } from 'electron';
import axios from 'axios';
import { LEWORD_BOARD_URL, parseLewordBoard, type LewordBoard } from '../../analytics/lewordBoard.js';

export interface LewordBoardResult {
  readonly success: boolean;
  readonly board?: LewordBoard;
  readonly message?: string;
}

/** 보드는 하루 3번 갱신된다 — 그 사이에 다시 받을 이유가 없다. */
const CACHE_TTL_MS = 10 * 60 * 1000;
let cache: { at: number; board: LewordBoard } | null = null;

export function registerLewordBoardHandlers(): void {
  ipcMain.handle('leword:board', async (): Promise<LewordBoardResult> => {
    if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
      return { success: true, board: cache.board };
    }
    try {
      const response = await axios.get(LEWORD_BOARD_URL, {
        timeout: 15_000,
        // leaderspro.kr → leaderspro.kr 리디렉션이 있다(www 제거).
        maxRedirects: 3,
        headers: { Accept: 'application/json' },
        validateStatus: (status) => status === 200,
      });
      const board = parseLewordBoard(response.data);
      if (board.picks.length === 0) {
        // 보드는 받았는데 고를 것이 없는 날이 있다(niche 1 · preemption 6 실측).
        // 실패가 아니다 — 그대로 돌려주고 화면이 "오늘은 없습니다" 를 말하게 한다.
        console.log('[LewordBoard] 보드 수신 — 오늘 추천 0건');
      } else {
        console.log(`[LewordBoard] ✅ ${board.picks.length}건 수신 (갱신 ${board.publishedAt || '시각 미상'})`);
      }
      cache = { at: Date.now(), board };
      return { success: true, board };
    } catch (error) {
      const message = (error as Error)?.message ?? '알 수 없는 오류';
      console.warn('[LewordBoard] 보드 수신 실패:', message);
      return { success: false, message: `오늘의 글감을 가져오지 못했습니다 — ${message}` };
    }
  });
}
