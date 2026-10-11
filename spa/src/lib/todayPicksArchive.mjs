/*
 * 추천키워드 날짜 탭(2026-10-11 사장님 "어제 꺼는 어떻게 보니?") — 판이 매일 새 키워드로 바뀌니(어제 실린 말 금지) 지난 판을 날짜별로 본다.
 * 앱 레포 scripts/today-picks-archive.js 가 /data/today-picks-archive/YYYY-MM-DD.json + index.json 을 7일 남긴다.
 */
const KST = 9 * 3_600_000;
const DAY = 86_400_000;
const DOW = ['일', '월', '화', '수', '목', '금', '토'];

/** 오늘(KST)보다 앞선 날짜만 최신순 — 1일 전 '어제', 2일 전 '그제', 그 전은 'M/D(요)'. */
export function archiveDays(index, nowMs = Date.now()) {
  const today = new Date(nowMs + KST).toISOString().slice(0, 10);
  const todayMs = Date.parse(`${today}T00:00:00Z`);
  const list = Array.isArray(index?.days) ? index.days : [];
  return [...new Set(list.filter((d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && d < today))]
    .sort().reverse()
    .map((day) => {
      const ms = Date.parse(`${day}T00:00:00Z`);
      const ago = Math.round((todayMs - ms) / DAY);
      const date = new Date(ms);
      return { day, label: ago === 1 ? '어제' : ago === 2 ? '그제' : `${date.getUTCMonth() + 1}/${date.getUTCDate()}(${DOW[date.getUTCDay()]})` };
    });
}
