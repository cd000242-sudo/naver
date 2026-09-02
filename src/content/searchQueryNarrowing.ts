/**
 * 문장형 키워드를 검색 가능한 질의로 쪼갠다.
 *
 * 사장님 지적: "자료가 0건이면 글을 어떻게 쓰라고 하는 거니?"
 * 답은 생성을 멈추는 것이 아니라 자료를 제대로 찾는 것이다.
 *
 *   "추석 연휴 대비: 냉장고 파먹기 식재료 정리 및 성에 제거"
 *
 * 이건 검색어가 아니라 문장이다. 어느 검색엔진에 넣어도 0건이 나오고,
 * 그 0건 화면을 긁어와 뉴스 헤드라인이 자료가 됐다.
 *
 * [2026-09-01 회귀] 처음에는 "콜론 뒤가 본체" 로 잡았는데 그 전제가 틀렸다.
 *
 *   "여름 에어컨 가을 보관 전 필수: 필터 청소 및 내부 건조 무작정 따라하기"
 *   → "필터 청소 및 내부"        ← 주제어 "에어컨" 이 사라졌다
 *
 * 냉장고 때는 주제어가 콜론 뒤였고 이번에는 앞이었다. 그 결과 일반어로 검색해
 * 에어건 제품 리뷰 · 환기설비 · 담배 신제품 뉴스가 자료로 딸려왔다.
 *
 * 콜론 위치가 아니라 낱말의 무게로 고른다. 계절 · 시점 · 상투구를 버리고
 * 실질 명사를 앞에서부터 남긴다. 주제어는 대개 맨 앞의 실질 명사다.
 */

/** 이 길이를 넘으면 문장으로 보고 쪼갠다. 짧은 키워드는 그대로가 최선이다. */
const SENTENCE_LIKE_WORDS = 4;

/** 좁힌 질의의 최대 어절 수. 넘으면 검색엔진이 결과를 못 낸다. */
const MAX_QUERY_WORDS = 4;

/**
 * 뜻을 보태지 않는 낱말.
 *
 * 계절 · 시점은 검색어에서 결과를 좁히기만 하고("여름 에어컨" 보다 "에어컨" 이 넓다),
 * 상투구는 블로그 제목의 장식이라 자료에 없다.
 */
const FILLER_WORDS = new Set([
  '봄', '여름', '가을', '겨울', '연휴', '명절', '추석', '설날',
  '대비', '준비', '맞이', '기념', '전', '후', '앞두고',
  '필수', '총정리', '정리편', '완벽', '완전', '무작정', '따라하기',
  '방법', '방법은', '꿀팁', '알아보기', '가이드', '및', '그리고', '와', '과',
  // [2026-09-01] "다가오는 추석 명절 대비 냉장고…" 에서 "다가오는" 이 주제어로 잡혔다.
  //   시점을 가리키는 관형어와 글의 성격을 말하는 낱말은 검색어에서 뜻을 보태지 않는다.
  '다가오는', '앞둔', '임박', '코앞', '올해', '내년', '지난해',
  '핵심', '기준', '정리', '점검', '체크', '노하우', '팁', '리스트',
  /*
   * [2026-09-02] 사장님 키워드 셋이 전부 "맥락 : 주제" 구조였다.
   *   "9월 가을 환절기 침구 교체 : 구스 이불 vs 차렵이불 세탁"
   *   "2026년 가을 이사철 : 신축 아파트 셀프 입주청소 체크리스트 및 하자"
   * 앞은 계절 포장이고 뒤가 진짜 쓰려는 내용이다. 그런데 앞을 검색했다.
   * 환절기 · 이사철 · 시즌은 계절과 같은 급의 시점어다 — 이미 버리기로 한 것들이다.
   */
  '환절기', '이사철', '시즌', '무렵', '초입', '체크리스트',
  // [2026-09-02] 날씨 계절어. 봄·여름·가을·겨울과 같은 급인데 빠져 있었다 —
  //   "장마 대비 베란다 창문" 에서 장마가 주제어로 세어져 적합도 분모를 늘렸다.
  '장마', '폭염', '한파',
  'vs', 'VS', 'Vs',
]);

/** N월 · N년 · N일 — 계절과 같은 시점 표기다. 검색 결과를 좁히기만 한다. */
const TIME_TOKEN = /^\d+\s*(?:년|월|일|주차)$/u;

function stripParticles(word: string): string {
  return word.replace(/[,·…]/gu, '').trim();
}

/**
 * 뜻을 보태는 낱말인가.
 *
 * [2026-09-02] 소제목 핵심어 선택(contentHeadingKeywordPatch)도 같은 판정을 쓴다.
 * 거기서 "9월" 이 핵심어로 뽑혀 소제목 앞에 박혔는데, 시점어를 거르는 규칙을
 * 그쪽에 따로 만들면 목록이 두 벌이 된다 — 이 저장소가 반복해서 겪은 실패다.
 * 판정은 여기 하나만 둔다.
 */
export function isContentWord(word: string): boolean {
  const w = stripParticles(word);
  if (w.length < 2) return false;
  if (TIME_TOKEN.test(w)) return false;
  return !FILLER_WORDS.has(w);
}

/** 한 조각에서 실질 명사만 순서대로 뽑는다. */
function contentWordsOf(segment: string): string[] {
  return segment
    .split(/\s+/u)
    .map(stripParticles)
    .filter(Boolean)
    .filter(isContentWord);
}

export function narrowSearchQueries(keyword: string | undefined): string[] {
  const original = String(keyword ?? '').trim();
  if (!original) return [];

  const candidates: string[] = [original];
  const push = (value: string) => {
    const v = value.replace(/\s+/gu, ' ').trim();
    if (v && v.length >= 2 && !candidates.includes(v)) candidates.push(v);
  };

  const allWords = original
    .replace(/[:：]/gu, ' ')
    .split(/\s+/u)
    .map(stripParticles)
    .filter(Boolean);
  if (allWords.length <= SENTENCE_LIKE_WORDS) return candidates;

  /*
   * [2026-09-02] 콜론 앞은 맥락, 뒤가 주제다.
   *
   * 실측 셋 중 둘이 여기서 무너졌다 — 앞을 검색하고 뒤를 버렸다:
   *   "…침구 교체 : 구스 이불 vs 차렵이불 세탁"  → "9월 환절기 침구 교체" 로 검색
   *     세탁법이 자료에 없으니 본문이 백화점 행사 얘기로 채워졌다.
   *   "…이사철 : 신축 아파트 셀프 입주청소 … 하자" → "2026년 이사철 신축 아파트" 로 검색
   *     청소법이 없으니 본문이 잠실 개발 · 양도소득세로 채워졌다.
   * 제대로 검색된 하나("냉장고 찌든 냄새 제거")만 쓸 만한 글이 나왔다.
   *
   * 그렇다고 "콜론 뒤가 본체" 로 되돌리면 에어컨 회귀가 난다 —
   * 거기서는 주제어(에어컨)가 앞에 있었다. 둘 다 잃지 않는 방법은 이것이다:
   *   주제는 뒤에서 가져오고, 앞의 첫 실질 명사 하나만 닻으로 붙인다.
   * 에어컨은 그 닻으로 살아남고, 침구·이사철은 주제를 되찾는다.
   */
  const colonAt = original.search(/[:：]/u);
  const front = colonAt >= 0 ? contentWordsOf(original.slice(0, colonAt)) : [];
  const back = contentWordsOf(colonAt >= 0 ? original.slice(colonAt + 1) : original);

  const subject = back.length > 0 ? back : front;
  if (subject.length === 0) return candidates;

  // 앞 조각은 맥락이므로 첫 낱말 하나만 남긴다 — 그것이 주제어일 때(에어컨)를 위해서다.
  const anchor = back.length > 0 && front.length > 0 ? front[0] : undefined;
  const head = anchor ? [anchor, ...subject] : subject;

  push(head.slice(0, MAX_QUERY_WORDS).join(' '));

  // 더 좁힌 후보: 닻 + 꼬리. 행위어(세탁 · 제거)는 대개 맨 뒤에 온다.
  if (subject.length > 2) {
    push([head[0], ...subject.slice(-2)].join(' '));
  }
  if (head.length > 1) {
    push(head.slice(0, 2).join(' '));
  }

  return candidates;
}
