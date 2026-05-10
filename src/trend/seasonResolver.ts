/**
 * SPEC-CONVERSION-001 L3-2.2 — 시즌 분기 판정 유틸
 *
 * 한국 기준 날짜 → 계절 + 시즌 이벤트(입학/추석/연말 등) 매핑.
 * 결정론. 외부 API 미사용. LLM 호출 X.
 *
 * 메모리 [silent 폴백 금지]: invalid date는 명시 reason.
 * 메모리 [추정 효과 금지]: "시즌 반영하면 X% 상승" 약속 X.
 *
 * 파일 한도 100줄 준수.
 */

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export interface SeasonContext {
  readonly season: Season;
  readonly seasonLabel: string;
  readonly events: readonly string[];   // 해당 시점 진행 중인 한국 시즌 이벤트
  readonly month: number;
  readonly day: number;
  readonly isoDate: string;
}

interface KoreanEvent {
  readonly label: string;
  readonly startMonth: number;          // 1~12
  readonly startDay: number;
  readonly endMonth: number;
  readonly endDay: number;
}

const KOREAN_EVENTS: readonly KoreanEvent[] = [
  { label: '신학기·입학 시즌', startMonth: 2, startDay: 15, endMonth: 3, endDay: 31 },
  { label: '봄 야외활동·꽃놀이', startMonth: 3, startDay: 20, endMonth: 5, endDay: 15 },
  { label: '가정의 달', startMonth: 5, startDay: 1, endMonth: 5, endDay: 31 },
  { label: '여름 휴가·바캉스', startMonth: 7, startDay: 1, endMonth: 8, endDay: 31 },
  { label: '추석·명절 준비', startMonth: 9, startDay: 1, endMonth: 9, endDay: 30 },
  { label: '단풍·가을 여행', startMonth: 10, startDay: 1, endMonth: 11, endDay: 15 },
  { label: '수능·입시', startMonth: 11, startDay: 1, endMonth: 11, endDay: 30 },
  { label: '연말 쇼핑·블랙프라이데이', startMonth: 11, startDay: 20, endMonth: 12, endDay: 25 },
  { label: '연말연시·새해', startMonth: 12, startDay: 20, endMonth: 1, endDay: 10 },
  { label: '설날·구정', startMonth: 1, startDay: 20, endMonth: 2, endDay: 15 },
];

export function resolveSeason(date: Date | string = new Date()): SeasonContext {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) {
    throw new Error(`SEASON_INVALID_DATE: ${String(date)}`);
  }
  const month = d.getMonth() + 1;   // 1~12
  const day = d.getDate();

  let season: Season;
  let seasonLabel: string;
  if (month >= 3 && month <= 5) {
    season = 'spring'; seasonLabel = '봄';
  } else if (month >= 6 && month <= 8) {
    season = 'summer'; seasonLabel = '여름';
  } else if (month >= 9 && month <= 11) {
    season = 'autumn'; seasonLabel = '가을';
  } else {
    season = 'winter'; seasonLabel = '겨울';
  }

  const events: string[] = [];
  for (const ev of KOREAN_EVENTS) {
    if (isInRange(month, day, ev)) events.push(ev.label);
  }

  return {
    season,
    seasonLabel,
    events,
    month,
    day,
    isoDate: d.toISOString().slice(0, 10),
  };
}

function isInRange(month: number, day: number, ev: KoreanEvent): boolean {
  // start ≤ end (같은 해 안)
  if (ev.startMonth < ev.endMonth || (ev.startMonth === ev.endMonth && ev.startDay <= ev.endDay)) {
    if (month < ev.startMonth || month > ev.endMonth) return false;
    if (month === ev.startMonth && day < ev.startDay) return false;
    if (month === ev.endMonth && day > ev.endDay) return false;
    return true;
  }
  // 해를 넘기는 이벤트 (예: 12/20~1/10) — start 이후 OR end 이전
  if (month > ev.startMonth || (month === ev.startMonth && day >= ev.startDay)) return true;
  if (month < ev.endMonth || (month === ev.endMonth && day <= ev.endDay)) return true;
  return false;
}

export function buildSeasonPromptBlock(ctx: SeasonContext): string {
  const lines: string[] = [
    `## [시즌 컨텍스트]`,
    `- 날짜: ${ctx.isoDate} (${ctx.seasonLabel})`,
  ];
  if (ctx.events.length > 0) {
    lines.push(`- 진행 중 시즌: ${ctx.events.join(', ')}`);
    lines.push(`- 본문에 자연스럽게 반영 가능. 강제 X.`);
  } else {
    lines.push(`- 특별 시즌 이벤트 없음 — 일반 톤으로 작성`);
  }
  return lines.join('\n');
}
