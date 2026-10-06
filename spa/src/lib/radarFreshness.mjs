/**
 * 외부유입 레이더 작성일 표시(2026-10-06). 서버(워커)가 작성일을 실제로 읽어 14일 안의 글만 보낸다 —
 * 화면은 그 값을 '3일 전 · 10월 3일' 처럼 보여 줄 뿐 다시 거르지 않는다. 순수 함수.
 */
const koDay = (ymd) => { const m = /^\d{4}-(\d{2})-(\d{2})/.exec(String(ymd || '')); return m ? `${Number(m[1])}월 ${Number(m[2])}일` : ''; };

export function radarAgeLabel(item, now = Date.now()) {
  const day = koDay(item && item.postdate);
  const at = Date.parse(item && item.postedAt);
  if (!Number.isFinite(at)) return day;
  const minutes = Math.max(0, Math.floor((now - at) / 60000));
  const ago = minutes < 60 ? '방금' : minutes < 1440 ? `${Math.floor(minutes / 60)}시간 전` : `${Math.floor(minutes / 1440)}일 전`;
  return day ? `${ago} · ${day}` : ago;
}
