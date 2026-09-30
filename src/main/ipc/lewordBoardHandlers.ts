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
import {
  LEWORD_BOARD_URL,
  LEWORD_BRIEFS_URL,
  LEWORD_PREEMPTION_URL,
  parseLewordBoard,
  parsePreemptionBoard,
  parseTopicBriefs,
  type LewordBoard,
  type LewordBoardSection,
} from '../../analytics/lewordBoard.js';

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
    const fetchJson = async (url: string): Promise<unknown> => {
      const response = await axios.get(url, {
        timeout: 15_000,
        // www.leaderspro.kr → leaderspro.kr 리디렉션이 있다.
        maxRedirects: 3,
        headers: { Accept: 'application/json' },
        validateStatus: (status) => status === 200,
      });
      return response.data;
    };
    try {
      /*
       * [2026-09-10 심층분석] 보드가 둘이다.
       *   실검 틈새 — 지금 뜨는 말 중 문서가 적은 것
       *   선점 보드 — 키워드마다 **어느 채널이 이기는 화면인지**를 재 둔 것
       * 선점 보드에서 naver-blog 가 이기는 자리만 앞에 놓는다. 실측 43건 중 33% 는
       * 워드프레스가 이기는 자리라, 그걸 모르고 쓰면 이길 수 없는 곳에 힘을 쓴다.
       * 한쪽이 실패해도 다른 쪽은 보여 준다 — 둘 다 실패해야 실패다.
       */
      /*
       * [2026-09-30 사장님] "오늘의 글감 불러오기 클릭하면 저번부터 안바뀌는데"
       * 사이트의 오늘의 글감(topic-briefs, 매시 갱신)을 셋째 보드로 읽어 맨 앞에 놓는다.
       * 선점 보드는 2~3일에 한 번 갱신되는데 그게 앞에 서 있으니 윗줄이 며칠째 같았다.
       * 출처마다 갱신 시각이 다르므로 한 줄로 섞지 않고 묶음(sections)으로 따로 준다.
       */
      const [briefsRaw, nicheRaw, preemptionRaw] = await Promise.allSettled([
        fetchJson(LEWORD_BRIEFS_URL),
        fetchJson(LEWORD_BOARD_URL),
        fetchJson(LEWORD_PREEMPTION_URL),
      ]);
      const briefs = briefsRaw.status === 'fulfilled' ? parseTopicBriefs(briefsRaw.value) : null;
      const niche = nicheRaw.status === 'fulfilled' ? parseLewordBoard(nicheRaw.value) : null;
      const preemption = preemptionRaw.status === 'fulfilled' ? parsePreemptionBoard(preemptionRaw.value) : null;
      if (!briefs && !niche && !preemption) throw new Error('세 보드 모두 받지 못했습니다');
      const sections: LewordBoardSection[] = ([
        { key: 'briefs', label: '오늘의 글감', board: briefs },
        // 블로그가 이기는 자리를 먼저 — 이길 수 있는가가 먼저고 돈은 그 다음이다.
        { key: 'preemption', label: '블로그가 이기는 자리', board: preemption },
        { key: 'niche', label: '실검 틈새', board: niche },
      ] as const).flatMap((s) => (
        s.board ? [{ key: s.key, label: s.label, publishedAt: s.board.publishedAt, picks: s.board.picks }] : []
      ));
      const board: LewordBoard = {
        picks: sections.flatMap((s) => [...s.picks]),
        publishedAt: briefs?.publishedAt || niche?.publishedAt || preemption?.publishedAt || '',
        schedule: niche?.schedule || preemption?.schedule || '',
        measured: { ...(niche?.measured ?? {}), blogWinnable: preemption?.picks.length ?? 0, briefs: briefs?.picks.length ?? 0 },
        sections,
      };
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
