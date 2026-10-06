/**
 * 홈판 실시간 판 계산 작업 스레드(2026-10-06 "벤치마크 자료가 엄청 오래 걸리네").
 * 글 1만 5천 개를 소재로 묶는 계산이 19초라 화면 스레드에서 돌면 그동안 화면이 멈췄다. 규칙은 homefeedLive.mjs 그대로.
 */
import { mergeLiveBoard } from './homefeedLive.mjs';

self.onmessage = (event) => {
  const { raw, feeds, fetchedAt } = event.data || {};
  try {
    self.postMessage({ ok: true, board: mergeLiveBoard(raw, feeds, fetchedAt) });
  } catch (error) {
    self.postMessage({ ok: false, error: String((error && error.message) || error) });
  }
};
