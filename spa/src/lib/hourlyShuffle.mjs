/*
 * 1시간마다 섞기(2026-10-10 사장님 "홈판 · 애드센스 벤치마킹은 워낙 많아서 상위만 본다 — 1시간 주기로 섞고, 수동으로 섞는 버튼" · "오늘의 글감도").
 * 같은 시간대엔 모든 방문자 · 새로고침에 같은 순서(시드 = KST 시각의 시간 번호), 정시마다 새 순서. 수동 섞기는 시드에 횟수를 더한다.
 * 묶음(증거 · ★ · 분야 우선 등) 순서는 지키고 묶음 안에서만 섞는다 — 표시 순서만 바뀌고 점수 · 등급과는 무관(CLAUDE.md: 셔플은 허용).
 */
const HOUR = 3_600_000;
const KST = 9 * HOUR;

/** KST 기준 시간 번호(정시마다 1 증가). */
export const kstHour = (nowMs) => Math.floor((nowMs + KST) / HOUR);
/** 다음 KST 정시까지 남은 밀리초. */
export const msToNextHour = (nowMs) => HOUR - ((nowMs + KST) % HOUR);
/** 시간 번호 + 수동 섞기 횟수 → 시드. */
export const shuffleSeed = (hour, bump = 0) => (Math.imul(hour, 2654435761) ^ Math.imul(bump + 1, 40503)) >>> 0;

function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(list, seed) {
  const out = [...list];
  const rand = prng(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** tierOf(항목) 이 작은 묶음부터, 묶음 안은 시드로 섞는다. 원본은 바꾸지 않는다. */
export function shuffleWithinTiers(items, tierOf, seed) {
  const groups = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const tier = Number(tierOf(item)) || 0;
    if (!groups.has(tier)) groups.set(tier, []);
    groups.get(tier).push(item);
  }
  return [...groups.keys()].sort((a, b) => a - b).flatMap((tier) => shuffled(groups.get(tier), (seed + Math.imul(tier + 1, 97)) >>> 0));
}
