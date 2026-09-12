/**
 * 이 판이 늦었나 — 방문자에게 할 말을 정하는 순수 계산.
 *
 * 사장님 2026-09-12: "그럼 사이트에도 설명해줘 업데이트안됫다고 사람들이물어보자나".
 *
 * 화면은 지금까지 "09-12 08:40 발행" 만 보여 줬다. 오후 회차가 늦으면 방문자는
 * 고장인지 원래 그런 건지 알 길이 없다. 실제로 늦는다 — 2026-09-12 실측:
 *   06:23 예약이 08:18 · 07:23 이 09:23 · 08:23 이 10:13 에 떴다(1시간 50분~2시간).
 *
 * 화면 부품(BoardFreshness.tsx)과 나눠 둔 이유는 하나다: **거짓말을 하면 안 되는 계산**이라
 * 테스트로 잠가야 한다. "늦었다"를 잘못 말하면 멀쩡한 판을 고장난 것처럼 보이게 만든다.
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 예약이 이만큼 늦어야 "늦고 있다"고 말한다. 조금 늦는 것은 늘 있는 일이라 넉넉히 둔다. */
export const LATE_AFTER_MIN = 40;
/**
 * 이만큼을 넘으면 "보통 1~2시간 늦습니다" 라고 말하면 안 된다.
 *
 * 실측에서 드러난 문제(2026-09-12): 선점 보드가 30시간 42분 늦은 상태였는데 화면이
 * "몰리는 시간대에는 1~2시간 늦게 시작되는 일이 잦습니다" 라고 적고 있었다.
 * 숫자와 설명이 서로를 부정하면 방문자는 둘 다 안 믿는다. 많이 늦은 것은 많이 늦었다고 한다.
 */
export const VERY_LATE_AFTER_MIN = 4 * 60;

/** 하루 회차 예정 시각(한국). 워크플로 크론과 같은 값이어야 한다. */
export interface BoardRoundTime {
  hour: number;
  minute: number;
  /** '아침' 처럼 부를 이름. 하루 한 번이면 비워 둔다. */
  label?: string;
}

function kstParts(ms: number) {
  const d = new Date(ms + KST_OFFSET_MS);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    weekday: d.getUTCDay(),
  };
}

/** '9월 12일 08:40' — 한국 시각으로 읽는다. */
export function formatKst(ms: number): string {
  const p = kstParts(ms);
  return `${p.month}월 ${p.day}일 ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

/**
 * 지금 기준 **가장 가까운 지난 회차**의 예정 시각(UTC ms).
 *
 * 오늘 회차가 아직 안 왔으면 지난 회차일의 마지막 회차를 돌려준다 — 한국 새벽에 들어온
 * 방문자에게 "오늘 아침 회차가 늦었다"고 말하면 안 된다. 아직 올 때가 안 된 것이다.
 * 요일 제한이 있으면(선점 보드 월·금) 그 요일만 센다.
 */
export function lastDueAt(
  rounds: readonly BoardRoundTime[],
  nowMs: number,
  days?: readonly number[],
): { at: number; label: string } | null {
  const sorted = [...rounds].sort((a, b) => (a.hour - b.hour) || (a.minute - b.minute));
  if (sorted.length === 0) return null;
  // 주 2회 보드도 반드시 하나는 걸리도록 8일까지 거슬러 본다.
  for (let back = 0; back <= 8; back += 1) {
    const p = kstParts(nowMs - back * DAY_MS);
    const midnightUtc = Date.UTC(p.year, p.month - 1, p.day) - KST_OFFSET_MS;
    if (days && !days.includes(kstParts(midnightUtc).weekday)) continue;
    for (let i = sorted.length - 1; i >= 0; i -= 1) {
      const at = midnightUtc + (sorted[i].hour * 60 + sorted[i].minute) * 60_000;
      if (at <= nowMs) return { at, label: sorted[i].label || '' };
    }
  }
  return null;
}

export interface Freshness {
  /** 이번 회차 예정 시각(UTC ms). 아직 첫 회차 전이면 null. */
  dueAt: number | null;
  /** 이번 회차 이름('아침' 등). 하루 한 번이면 빈 문자열. */
  dueLabel: string;
  /** 마지막 갱신(UTC ms). 못 읽었으면 null. */
  builtAt: number | null;
  /** 예정보다 몇 분 늦었나. 늦지 않았거나 알 수 없으면 0. */
  lateMinutes: number;
  /** 방문자에게 "늦고 있다"고 말해도 되나. */
  isLate: boolean;
  /** 흔한 지연(1~2시간)으로 설명하면 안 될 만큼 늦었나. */
  isVeryLate: boolean;
}

/**
 * 늦었는지 가른다.
 *
 * **늦었다고 말할 수 있는 경우는 하나뿐이다**: 이번 회차 예정 시각이 지났는데(넉넉히 40분)
 * 마지막 갱신이 그 시각보다 앞설 때. 시각을 못 읽었으면 늦었는지 아닌지도 모른다 —
 * 그때는 아무 말도 하지 않는다. 모르는 것을 고장이라고 말하지 않는다.
 */
export function judgeFreshness(
  rounds: readonly BoardRoundTime[],
  lastBuiltAt: string | null | undefined,
  nowMs: number,
  days?: readonly number[],
): Freshness {
  const due = lastDueAt(rounds, nowMs, days);
  const parsed = lastBuiltAt ? Date.parse(lastBuiltAt) : NaN;
  const builtAt = Number.isFinite(parsed) ? parsed : null;
  const lateMinutes = due && builtAt !== null && builtAt < due.at
    ? Math.max(0, Math.floor((nowMs - due.at) / 60_000))
    : 0;
  return {
    dueAt: due ? due.at : null,
    dueLabel: due ? due.label : '',
    builtAt,
    lateMinutes,
    isLate: lateMinutes >= LATE_AFTER_MIN,
    isVeryLate: lateMinutes >= VERY_LATE_AFTER_MIN,
  };
}

/** '2시간 5분' · '35분'. */
export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}분`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}
