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
]);

function stripParticles(word: string): string {
  return word.replace(/[,·…]/gu, '').trim();
}

function isContentWord(word: string): boolean {
  const w = stripParticles(word);
  if (w.length < 2) return false;
  return !FILLER_WORDS.has(w);
}

export function narrowSearchQueries(keyword: string | undefined): string[] {
  const original = String(keyword ?? '').trim();
  if (!original) return [];

  const candidates: string[] = [original];
  const push = (value: string) => {
    const v = value.replace(/\s+/gu, ' ').trim();
    if (v && v.length >= 2 && !candidates.includes(v)) candidates.push(v);
  };

  const words = original
    .replace(/[:：]/gu, ' ')
    .split(/\s+/u)
    .map(stripParticles)
    .filter(Boolean);
  if (words.length <= SENTENCE_LIKE_WORDS) return candidates;

  const contentWords = words.filter(isContentWord);
  if (contentWords.length === 0) return candidates;

  // 앞에서부터 실질 명사만 모은다 — 주제어는 대개 맨 앞에 온다.
  push(contentWords.slice(0, MAX_QUERY_WORDS).join(' '));

  // 더 좁힌 후보: 주제어 + 뒤쪽 핵심어. 앞 후보로도 부족할 때 쓴다.
  if (contentWords.length > 2) {
    push([contentWords[0], ...contentWords.slice(-2)].join(' '));
  }
  if (contentWords.length > 1) {
    push(contentWords.slice(0, 2).join(' '));
  }

  return candidates;
}
