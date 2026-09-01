/**
 * Plain-Korean wording for the SERP comparison card.
 *
 * The card said things like
 *   "안전성 부족 심각 — 우리 35.0 vs 상위 노출 평균 65.0 (즉시 보완)"
 * to a side-hustle blogger who has never seen the word SERP. It named an
 * internal metric, printed two decimals of a hidden 0-100 scale, and never
 * said what to do about it. A diagnosis the reader cannot act on is noise.
 *
 * Every signal here gets three things: a word people use, the right unit,
 * and one concrete next action — preferably naming a control the user
 * actually has in the app.
 */

export interface SignalHelp {
  /** Everyday word for the metric. */
  readonly label: string;
  /** Unit suffix for the numbers ('점', '자', '개'). */
  readonly unit: string;
  /** One concrete thing the user can do. */
  readonly action: string;
}

export const SIGNAL_HELP: Readonly<Record<string, SignalHelp>> = {
  '통합 점수': {
    label: '전체 점수',
    unit: '점',
    action: '아래 항목 중 차이가 큰 것부터 하나씩 손보세요',
  },
  '모드 적합도': {
    label: '글의 방향',
    unit: '점',
    action: 'SEO 글이면 검색한 질문에 바로 답하는 문장을, 홈판 글이면 공감되는 상황을 앞쪽에 넣으세요',
  },
  '사람다움': {
    label: '사람이 쓴 느낌',
    unit: '점',
    action: '문단 끝마다 반복되는 마무리 문장과 같은 어미가 이어지는 곳을 손보세요',
  },
  '안전성': {
    label: '표현 안전',
    unit: '점',
    action: '단정·과장 표현("무조건", "확실히")과 근거 없는 효과 주장을 빼세요',
  },
  '본문 길이': {
    label: '글 길이',
    unit: '자',
    action: '길이 자체는 순위 기준이 아닙니다 — 제목이 약속한 답이 빠졌는지만 확인하세요',
  },
  '구체 수치(단위)': {
    label: '구체적인 숫자',
    unit: '개',
    action: '자료에 있는 가격·기간·비율을 본문에 옮기세요 (자료에 없는 숫자는 만들지 마세요)',
  },
  '직접 경험 표현': {
    label: '겪은 이야기',
    unit: '개',
    action: '생성 옵션의 "AI가 경험을 대신 써주기"를 켜거나, 직접 겪은 일을 경험 메모에 적어 주세요',
  },
};

/** Falls back to the raw signal name so a new metric never renders blank. */
export function describeSignal(signal: string): SignalHelp {
  return SIGNAL_HELP[signal] || { label: signal, unit: '', action: '' };
}

/**
 * Rounds to whole numbers.
 *
 * "35.0 vs 65.0" reads like a measurement precise to a tenth. It is not —
 * these are heuristic scores. The decimal invited a precision the number
 * does not have, and cost a character of readability for nothing.
 */
export function formatSignalValue(value: number | string, unit: string): string {
  const n = typeof value === 'number' ? Math.round(value) : Number(value);
  const shown = Number.isFinite(n) ? n.toLocaleString('ko-KR') : String(value);
  return unit ? `${shown}${unit}` : shown;
}
