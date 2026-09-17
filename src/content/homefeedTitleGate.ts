// src/content/homefeedTitleGate.ts
//
// 홈판 제목 판정의 단일 출처.
//
// [2026-09-17 실측 사고] 게이트가 미달을 잡아 재작성을 돌렸는데, 돌아온 제목이 원래보다
// 더 나빴다. 그런데도 비교 없이 그대로 받아들였고, 예산(attempt)이 소진돼 고칠 기회도 없었다.
//
//   [TitleGate] "60분에 빠져도 부상은 아니었다, …"  미달 2건 · attempt=0/1
//     → 폭 30.5 · 장치 1개(결론차단)
//   [TitleGate] "60분대에 멈추던 이강인, …"        미달 3건 · attempt=1/1
//     → 폭 31 · 장치 0개          ← 재작성 결과가 더 나빠졌다
//
// 재작성은 확률적이라 가끔 더 나쁜 것을 내놓는다. 그것까지는 막을 수 없지만,
// **더 나쁜 것을 받아들이는 일**은 결정적으로 막을 수 있다.

import {
  computeHomefeedTitleCriticalIssues,
  computeHomefeedTitleHookFloorIssues,
} from '../contentTitleValidators.js';
import { computeHomefeedTitleQuoteIssues } from './homefeedTitleQuoteUse.js';
import { countHomefeedTitleHookSignals } from './homefeedTitleHookFloor.js';

/*
 * [2026-09-17 실측] '독자 가치/판단 기준이 제목에 드러나지 않음' 은 재작성 트리거에서 뺀다.
 *
 * 이 검사는 제목에 '이유·조건·차이·기준' 같은 단어가 있는지를 본다. 홈판 1,283편 vs
 * 미진입 793편으로 재 보면 **양쪽 다 77%** 가 걸려 통과 lift 가 1.02 였다 — 변별력이 없다.
 * 재작성 트리거에 넣어 두면 실제 홈판 승자 4편 중 3편을 근거 없이 다시 쓰게 만든다.
 * 자동 발행에서 근거 없는 재작성은 비용이자 품질 위험이므로, 경고로만 남기고 게이트에서 뺀다.
 */
const NON_DISCRIMINATING = /독자 가치\/판단 기준/;

/** 홈판 제목이 어긴 항목 전부. 빈 배열이면 통과. */
export function computeHomefeedTitleGateIssues(title: string, keyword?: string): string[] {
  return [
    ...computeHomefeedTitleCriticalIssues(title, keyword),
    ...computeHomefeedTitleHookFloorIssues(title),
    ...computeHomefeedTitleQuoteIssues({ title }),
  ].filter(issue => !NON_DISCRIMINATING.test(issue));
}

export interface TitleReplacementVerdict {
  readonly accept: boolean;
  readonly beforeCount: number;
  readonly afterCount: number;
  readonly reason: string;
}

/**
 * 재작성된 제목을 받아들일지 판정한다.
 *
 * 미달 건수가 줄어들 때만 받는다. 같거나 늘면 원래 제목을 지킨다 —
 * 둘 다 미달이라도, 최소한 나빠지지는 않게 한다.
 */
export function judgeTitleReplacement(
  original: string,
  replacement: string | undefined,
  keyword?: string,
): TitleReplacementVerdict {
  const before = computeHomefeedTitleGateIssues(original, keyword);
  const candidate = String(replacement || '').trim();

  if (!candidate) {
    return { accept: false, beforeCount: before.length, afterCount: before.length, reason: '재작성 결과 없음' };
  }
  if (candidate === original.trim()) {
    return { accept: false, beforeCount: before.length, afterCount: before.length, reason: '제목이 그대로' };
  }

  const after = computeHomefeedTitleGateIssues(candidate, keyword);
  if (after.length < before.length) {
    return {
      accept: true,
      beforeCount: before.length,
      afterCount: after.length,
      reason: `미달 ${before.length}건 → ${after.length}건`,
    };
  }

  /*
   * 건수가 같으면 후킹 장치 개수로 가른다.
   * 실측 사고가 정확히 이 경우였다 — 둘 다 미달 2건이지만 장치는 1개에서 0개로 줄었다.
   * 장치 개수별 배수는 0개 0.44 · 1개 0.84 · 2개 1.14 · 3개 이상 1.88 로 단조 증가라,
   * 같은 미달이라도 장치가 적은 쪽이 분명히 나쁘다.
   */
  if (after.length === before.length) {
    const beforeHooks = countHomefeedTitleHookSignals(original);
    const afterHooks = countHomefeedTitleHookSignals(candidate);
    if (afterHooks > beforeHooks) {
      return {
        accept: true,
        beforeCount: before.length,
        afterCount: after.length,
        reason: `미달 ${before.length}건 동률이지만 후킹 장치 ${beforeHooks}개 → ${afterHooks}개`,
      };
    }
    return {
      accept: false,
      beforeCount: before.length,
      afterCount: after.length,
      reason: `나아지지 않음(미달 ${before.length}건 동률 · 장치 ${beforeHooks}개 → ${afterHooks}개) — 원래 제목 유지`,
    };
  }

  return {
    accept: false,
    beforeCount: before.length,
    afterCount: after.length,
    reason: `재작성이 나아지지 않음(${before.length}건 → ${after.length}건) — 원래 제목 유지`,
  };
}
