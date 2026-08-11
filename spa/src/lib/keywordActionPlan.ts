/**
 * 키워드별 실행 계획 — "왜 이걸 쓰는가"와 "어떻게 쓰는가"를 한 장으로.
 *
 * 왜 필요한가:
 *   보드가 "자리가 있다"까지는 말해 준다. 그런데 사용자는 그 다음을 모른다 —
 *   지금 써야 하는지, 어떤 형태로 써야 하는지, 무엇을 조심해야 하는지.
 *   숫자만 보여 주고 판단을 통째로 떠넘기면 초보자에게는 쓸모가 없다.
 *
 * 규칙 (이걸 어기면 이 모듈은 만들지 않느니만 못하다):
 *   - **측정한 사실과 그로부터 곧바로 따라오는 지침만** 쓴다.
 *   - 예상 유입·예상 수익·성공 확률·점수를 만들지 않는다.
 *   - 근거가 없으면 그 줄을 아예 안 쓴다. 빈칸을 추측으로 메우지 않는다.
 */
/** 보드가 싣는 층·위험 값. 판정 로직은 leword-app 쪽 preemption-gate 가 갖는다. */
type PreemptionTier = 'top3' | 'page1' | 'page1-weak' | 'contested';
type BriefingRisk = 'high' | 'medium' | 'low';

export interface ActionPlanInput {
  keyword: string;
  topic: string;
  tier: PreemptionTier | null;
  openSlot: number | null;
  searchVolume: number | null;
  documentCount: number | null;
  /** 검색 의도 라벨('구매 검토'·'거래'·'정보'). 없으면 빈 문자열. */
  intentLabel?: string;
  briefingRisk?: BriefingRisk | null;
  /** 의료·금융 규제 라벨. 있으면 그대로 경고에 쓴다. */
  regulatoryLabel?: string;
  /** 수요 모양 라벨('시즌성'·'에버그린'…). */
  trendLabel?: string;
  /** 시즌성일 때 착수 시점 문장. */
  timing?: string;
  /** 화면에 함께 뜨는 경쟁 구획(인플루언서·지식iN·카페…). */
  sections?: string[];
  /** 상위 문서 나이 중앙값(일). */
  medianDaysAgo?: number | null;
}

export interface ActionPlan {
  /** 왜 이 키워드인가 — 전부 관측 사실. */
  why: string[];
  /** 어떻게 쓸 것인가 — 사실에서 곧바로 따라오는 지침. */
  how: string[];
  /** 무엇을 조심할 것인가. 없으면 빈 배열. */
  caution: string[];
  /** 언제 쓸 것인가. 근거가 없으면 빈 문자열. */
  when: string;
}

const num = (value: number) => value.toLocaleString('ko-KR');

/** 경쟁 구획별로 실제로 달라지는 대응. 없는 구획은 말하지 않는다. */
const SECTION_ADVICE: Record<string, string> = {
  인플루언서: '인플루언서 구획이 위를 먹는다 — 블로그탭 노출을 노리고 제목을 검색어에 정확히 맞춘다',
  지식iN: '지식iN 이 함께 뜬다 — 질문 형태를 소제목으로 받아 쓰면 같은 의도를 흡수한다',
  카페: '카페 글과 경쟁한다 — 카페에 없는 정리된 표·순서를 넣어야 차별이 된다',
  쇼핑: '쇼핑 구획이 있다 — 구매 의도가 실제로 붙은 키워드다. 제품 비교를 넣는다',
  파워링크: '광고가 붙는 키워드다 — 돈이 도는 주제라는 뜻이고, 그만큼 경쟁 글도 상업적이다',
};

/**
 * 실행 계획을 만든다.
 *
 * 입력에 없는 값은 그 줄을 통째로 건너뛴다 — "정보 없음"이라고 쓰지도 않는다.
 * 화면에 빈 줄이 늘면 사용자가 나머지도 안 읽는다.
 */
export function buildActionPlan(input: ActionPlanInput): ActionPlan {
  const why: string[] = [];
  const how: string[] = [];
  const caution: string[] = [];

  // ── 왜 ─────────────────────────────────────────────────────────────
  if (input.openSlot !== null && input.tier === 'top3') {
    why.push(`상위 ${input.openSlot}번째 자리에 이 검색어를 정면으로 다룬 글이 없다`);
  } else if (input.tier === 'page1' || input.tier === 'page1-weak') {
    why.push('1페이지 안에 이 검색어를 정면으로 다룬 글이 없다');
  } else if (input.tier === 'contested') {
    why.push('정면으로 다룬 글이 1건뿐이다 — 경합이지만 자리가 아주 없지는 않다');
  }

  if (input.searchVolume !== null && input.documentCount !== null) {
    why.push(`월 검색량 ${num(input.searchVolume)} · 문서수 ${num(input.documentCount)}`);
  }
  if (typeof input.medianDaysAgo === 'number' && input.medianDaysAgo >= 30) {
    why.push(`상위 문서가 중앙값 ${Math.round(input.medianDaysAgo)}일 전 글이다`);
  }
  if (input.intentLabel === '구매 검토') {
    why.push('구매를 앞두고 비교하는 검색이라 글을 끝까지 읽는다');
  }

  // ── 어떻게 ─────────────────────────────────────────────────────────
  // 제목은 어느 키워드에나 해당하는 유일한 공통 지침이다.
  how.push(`제목 앞부분에 "${input.keyword}"를 그대로 한 번 넣는다`);

  if (input.intentLabel === '구매 검토') {
    how.push('비교표와 단점까지 넣는다 — 장점만 있는 글은 비교 검색자가 바로 나간다');
  } else if (input.intentLabel === '거래') {
    how.push('절차를 번호 순서로 적는다 — 이 검색자는 지금 실행하려는 사람이다');
  } else if (input.intentLabel === '정보') {
    how.push('첫 문단에 답을 먼저 쓴다 — 뒤에 숨기면 AI 요약에 밀린다');
  }

  for (const section of input.sections || []) {
    const advice = SECTION_ADVICE[section];
    if (advice) how.push(advice);
  }

  // ── 조심 ───────────────────────────────────────────────────────────
  if (input.briefingRisk === 'high') {
    caution.push('AI 브리핑이 답을 대신하는 유형이다 — 자리가 비어 있어도 클릭이 안 올 수 있다');
  }
  if (input.regulatoryLabel) {
    caution.push(`${input.regulatoryLabel} — 표현에 따라 노출 제한·행정처분 대상이 될 수 있다`);
  }
  if (input.trendLabel === '하락세') {
    caution.push('1년 전보다 검색이 줄고 있다 — 지금 써도 수요가 계속 빠질 수 있다');
  }

  // ── 언제 ───────────────────────────────────────────────────────────
  // 시즌성은 착수 시점이 곧 성패다. 그 외에는 근거가 없으므로 말하지 않는다.
  const when = input.timing || (input.trendLabel === '에버그린'
    ? '수요가 1년 내내 고르다 — 급할 것 없이 품질에 시간을 쓴다'
    : '');

  return { why, how, caution, when };
}
