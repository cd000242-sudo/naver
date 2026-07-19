export interface ReviewDecisionTheme {
  readonly id: string;
  readonly label: string;
  readonly pattern: RegExp;
  readonly readerQuestion: string;
}

export interface ReviewDecisionCluster {
  readonly id: string;
  readonly label: string;
  readonly reviewRefs: readonly string[];
  readonly readerQuestion: string;
}

const REVIEW_DECISION_THEMES: readonly ReviewDecisionTheme[] = Object.freeze([
  Object.freeze({
    id: 'installation',
    label: '설치·교체',
    pattern: /설치|타공|구멍|천장|배선|전원|교체|조립|연결|규격/i,
    readerQuestion: '기존 환경에서 어디가 막히고, 구매 전에 무엇을 재거나 준비해야 하는가?',
  }),
  Object.freeze({
    id: 'climate-performance',
    label: '온도·습기·성능 체감',
    pattern: /제습|습기|물기|건조|온풍|따뜻|차갑|한기|바람|풍량|속도|성능|효과/i,
    readerQuestion: '어떤 사용 조건에서 무엇이 실제로 줄거나 달라졌고, 기대와 다른 조건은 무엇인가?',
  }),
  Object.freeze({
    id: 'noise',
    label: '소음·진동',
    pattern: /소음|소리|시끄|조용|진동|저단|고단|최고\s*단계|밤|야간/i,
    readerQuestion: '어느 단계와 시간대에서 거슬리고, 구매자가 어떻게 조절하거나 감수했는가?',
  }),
  Object.freeze({
    id: 'cleaning',
    label: '청소·관리',
    pattern: /청소|세척|필터|물통|관리|먼지|곰팡|오염|교체\s*주기/i,
    readerQuestion: '사용 뒤 어떤 관리가 반복되고, 그 과정이 얼마나 번거로운가?',
  }),
  Object.freeze({
    id: 'space',
    label: '크기·공간·이동',
    pattern: /크기|사이즈|무게|공간|자리|폭|높이|깊이|이동|보관/i,
    readerQuestion: '어떤 공간에는 맞고, 어디에서는 크기나 동선이 문제가 되는가?',
  }),
  Object.freeze({
    id: 'operation',
    label: '조작·일상 사용',
    pattern: /조작|버튼|리모컨|앱|설정|모드|편하|불편|번거|어렵|쉬웠|적응/i,
    readerQuestion: '매일 쓰면서 반복되는 편의와 불편은 무엇인가?',
  }),
  Object.freeze({
    id: 'durability',
    label: '고장·내구·AS',
    pattern: /고장|내구|수리|AS|A\/S|교환|반품|불량|누수|파손/i,
    readerQuestion: '문제가 생겼을 때 어떤 증상과 대응 경험이 있었는가?',
  }),
  Object.freeze({
    id: 'delivery',
    label: '배송·포장',
    pattern: /배송|포장|도착|파손|누락|택배/i,
    readerQuestion: '도착 과정이 설치나 첫 사용 일정에 어떤 영향을 줬는가?',
  }),
  Object.freeze({
    id: 'running-cost',
    label: '유지비·전기요금',
    pattern: /전기|요금|비용|소비전력|유지비|전력/i,
    readerQuestion: '구매 뒤 계속 부담되는 비용이나 사용 조건은 무엇인가?',
  }),
]);

export function clusterReviewDecisionEvidence(
  reviews: readonly string[],
): readonly ReviewDecisionCluster[] {
  const normalizedReviews = reviews
    .map(review => String(review || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const themeAssignments = normalizedReviews.map(review => (
    REVIEW_DECISION_THEMES.findIndex(theme => theme.pattern.test(review))
  ));
  const themedClusters = REVIEW_DECISION_THEMES.flatMap((theme, themeIndex) => {
    const reviewRefs = themeAssignments.flatMap((assignedThemeIndex, reviewIndex) => (
      assignedThemeIndex === themeIndex ? [`REVIEW_${reviewIndex + 1}`] : []
    ));
    if (reviewRefs.length === 0) return [];
    return [Object.freeze({
      id: theme.id,
      label: theme.label,
      reviewRefs: Object.freeze(reviewRefs),
      readerQuestion: theme.readerQuestion,
    })];
  });
  const unmatchedReviewRefs = themeAssignments.flatMap((themeIndex, reviewIndex) => (
    themeIndex < 0 ? [`REVIEW_${reviewIndex + 1}`] : []
  ));
  const fallbackClusters: readonly ReviewDecisionCluster[] = unmatchedReviewRefs.length > 0
    ? [Object.freeze({
      id: 'other-decision-scene',
      label: '기타 구매 결정 장면',
      reviewRefs: Object.freeze(unmatchedReviewRefs),
      readerQuestion: '이 후기에서 구매 전 기대했던 변화와 실제로 달라진 점은 무엇인가?',
    })]
    : [];

  return Object.freeze([...themedClusters, ...fallbackClusters]);
}

/**
 * Converts already-filtered buyer reviews into a deterministic writing plan.
 * It carries only theme labels and REVIEW_N references, never new product facts.
 */
export function buildReviewDecisionBlueprint(reviews: readonly string[]): string {
  const clusters = clusterReviewDecisionEvidence(reviews);
  if (clusters.length === 0) return '';

  const uniqueReviewRefCount = new Set(clusters.flatMap(cluster => cluster.reviewRefs)).size;
  const multipleEvidenceRule = uniqueReviewRefCount >= 2 && clusters.length >= 2
    ? '- 서로 다른 REVIEW_N 근거가 2개 이상이면 첫 두 소제목은 서로 다른 BUYER_PAIN_POINT_MAP 항목을 사용한다. 상품명·가격·기능명 재설명으로 대체하지 않는다.'
    : '- REVIEW_N 근거가 하나뿐이면 하나의 구매자 의견으로 한정하고, 여러 사람의 반복 의견이나 복수 독립 근거처럼 확장하지 않는다.';

  const map = clusters
    .map((cluster, index) => (
      `${index + 1}. ${cluster.label} | 근거 ${cluster.reviewRefs.join(', ')}\n`
      + `   독자가 원하는 답: ${cluster.readerQuestion}`
    ))
    .join('\n');

  return `[REVIEW DECISION BLUEPRINT — 후기형 글의 최우선 구조]
아래 지도는 구매자 리뷰 원문을 주제별로 묶은 앱 생성 구조다. 새로운 사실이 아니며, 반드시 연결된 REVIEW_N 원문 범위 안에서만 쓴다.

<BUYER_PAIN_POINT_MAP>
${map}
</BUYER_PAIN_POINT_MAP>

[필수 집필 순서]
- 첫 120~180자는 BUYER_PAIN_POINT_MAP의 1순위 고민과 사용 뒤 달라진 결과로 시작한다. 기능 나열이나 제품 소개로 열지 않는다.
- 도입 첫 문단은 1순위 고민이 있는 사람에게 후기에서 확인된 결과 또는 남은 한계를 바로 답한다. 제품명·가격·기능명 소개로 시작하지 않는다.
${multipleEvidenceRule}
- 각 후기형 소제목은 REVIEW_N의 구체 상황 → 실제 사용 결과·해결·적응 또는 남은 불편 → 구매 전에 중요한 이유 → 맞는 사람과 맞지 않는 사람 순으로 연결한다.
- 후기 근거가 있는 글의 중심은 기능 목록이 아니라 구매자가 겪은 문제와 결과다. 기능 이름을 상식적으로 풀이한 문단은 삭제한다.
- 같은 의견이라고 말하려면 서로 다른 REVIEW_N 두 개 이상이 같은 판단을 뒷받침해야 한다. 하나뿐이면 한 구매자의 의견으로 한정한다.
- 구매욕구는 과장이나 재촉이 아니라, 독자가 겪는 골치 아픈 문제가 어떤 조건에서 실제로 줄었는지 보여 주는 방식으로 만든다.`;
}
