/**
 * Homefeed topic craft blocks.
 *
 * Measured in this project: when bans outnumbered positive rules 4.2:1 the model wrote flat,
 * score-perfect posts. Each block here is a short list of devices ("write it like this") for one topic,
 * appended near the end of the homefeed system prompt. Blocks never loosen the evidence rules: every
 * device applies only to what the material contains. No imports, so promptLoader can use it freely.
 */

export const HOMEFEED_CRAFT_TOPICS = [
  'entertainment', 'sports', 'it', 'car', 'fashion', 'beauty', 'living', 'health', 'finance',
] as const;

export type HomefeedCraftTopic = (typeof HOMEFEED_CRAFT_TOPICS)[number];

/**
 * @param category result of resolveCategory(categoryHint)
 * @param categoryHint raw hint — cars, beauty and finance share a category with other topics
 */
export function resolveHomefeedCraftTopic(
  mode: string | undefined,
  category: string | undefined,
  categoryHint: string | undefined,
): HomefeedCraftTopic | null {
  if (mode !== 'homefeed') return null;
  const hint = String(categoryHint ?? '');
  if (category === 'entertainment') return hint.includes('스포츠') ? 'sports' : 'entertainment';
  if (category === 'it') return 'it';
  if (hint.includes('자동차')) return 'car';
  if (category === 'fashion') return hint.includes('뷰티') ? 'beauty' : 'fashion';
  if (category === 'living') return 'living';
  if (category === 'health') return 'health';
  if (category === 'society' && hint.includes('경제')) return 'finance';
  return null;
}

const HEAD = (name: string): string =>
  `[주제 장치 — ${name}] 위 골격과 근거 규칙 안에서 쓴다. 모든 장치는 자료에 있을 때만 쓰고, 없으면 건너뛴다.`;

const BLOCKS: Record<HomefeedCraftTopic, readonly string[]> = {
  entertainment: [
    HEAD('방송·연예'),
    '- 시점을 박는다: "방송 끝나기 5분 전", "두 번째 무대 직후"처럼 언제인지 적어 장면이 보이게 한다.',
    '- 장면만 세 문단 잇지 않는다. 장면 한 문단 뒤에는 그 장면을 어떻게 보는지가 온다.',
    '- 과거와 어긋나는 지점이 각도라면 시간을 되감는다: 지금 일 → 시점이 확인된 과거 → 그때의 복선 → 다시 지금.',
    '- 보도된 공적 사실을 전할 때는 전하는 표현을 돌려 쓴다(~라고 한다 / ~로 전해진다 / ~라는 보도가 나왔다).',
    '- 시청률·순위·조회 수는 앞 숫자와 나란히 써서 변화가 보이게 한다.',
    '- 다음 회차 예고나 예정된 일정이 있으면 그것으로 마무리해도 된다.',
  ],
  sports: [
    HEAD('스포츠'),
    '- 장면을 재생한다: 이닝·분·세트 같은 시점을 적고, 장면 한 문장 뒤에 그 순간의 반응 한 문장을 붙인다.',
    '- 기록 한 방: 그 장면의 크기를 보여 주는 공식 기록 하나를 숫자와 대상으로 쓴다("시즌 12호", "3경기 연속").',
    '- 감정 한마디는 가장 큰 장면에만, 글 전체에서 두세 번 쓴다.',
    '- 팬 반응이 갈렸으면 두 쪽을 나란히 놓고, 어느 쪽이 많은지는 집계가 있을 때만 말한다.',
    '- 다음 경기 일정과 상대가 있으면 거기서 확인할 것 하나로 마무리한다.',
  ],
  it: [
    HEAD('IT'),
    '- 숫자는 견줄 대상과 함께 쓴다: 이전 모델이나 경쟁 제품의 같은 항목을 나란히 놓는다(자료의 숫자끼리만).',
    '- 좋은 점을 말한 뒤에는 아쉬운 점 하나를 붙인다. 한쪽만 쓰면 광고로 읽힌다.',
    '- 누구에게 맞고 누구에게는 과한지 한 문단으로 가른다.',
    '- 같은 개념은 한 글에서 한 가지 쉬운 말로만 부른다.',
    '- 가격·출시일처럼 아직 안 나온 정보는 "아직 공개되지 않았다"고 쓴다.',
  ],
  car: [
    HEAD('자동차'),
    '- 용어를 쉬운 말 하나로 통일한다: 부분변경, 등급, 추가 사양, 앞뒤 바퀴 사이 거리처럼 풀어 쓰고 괄호로 영어를 붙이지 않는다.',
    '- 숫자는 이전 모델이나 경쟁 차의 같은 항목과 나란히 쓴다(자료의 숫자끼리만). 가격에는 등급과 기준일을 붙인다.',
    '- 등급에 따라 달라지는 사양을 갈라 쓴다: 기본 등급부터 들어가는 것, 올려야 열리는 것.',
    '- 어떤 운전자에게 맞고 누구에게는 아쉬운지 한 문단으로 쓴다.',
    '- 가격·출시일·등급 구성이 아직 안 나왔으면 "아직 공개되지 않았다"고 쓴다.',
  ],
  fashion: [
    HEAD('패션'),
    '- 착장을 위에서 아래로 나눠 쓴다: 겉옷·상의 → 하의 → 신발·가방. 한 문단에 한 부위.',
    '- 브랜드·제품 이름·가격은 한데 모아 한 번 보여 준다. 확인되지 않은 칸은 채우지 않고 확인되지 않았다고 쓴다.',
    '- 잘 맞은 조합과 아쉬운 조합을 함께 쓴다. 평가하는 것은 옷과 조합이다.',
    '- 본인이 산 것인지 협찬인지는 확인된 경우에만 밝힌다.',
    '- 따라 입을 수 있는 방법 한 가지로 마무리한다.',
  ],
  beauty: [
    HEAD('뷰티'),
    '- 바르는 순서대로 쓴다. 단계마다 무엇을 얼마나 쓰는지가 보이게 한다.',
    '- 브랜드·제품·용량·가격·기능성 여부는 한데 모아 한 번 보여 주고, 순위·할인에는 기준일을 붙인다.',
    '- 어떤 피부에 맞고 어떤 피부에는 맞지 않는지 가른다.',
    '- 써 본 기록이 없으면 "후기에서는 ~라는 말이 많다"처럼 전하는 말로 쓴다.',
    '- 좋았다는 평과 아쉽다는 평을 함께 싣는다.',
  ],
  living: [
    HEAD('리빙'),
    '- 아쉬운 점을 먼저 말하고 그 해결 요령을 바로 붙인다. 좋은 말만 있으면 상품 설명으로 읽힌다.',
    '- 크기·개수·가격 같은 숫자로 문장을 끝낸다. "넉넉하다" 대신 "가로 40cm"로 쓴다.',
    '- 원래 쓰임과 다르게 쓰는 방법이 있으면 한 가지를 싣는다.',
    '- 식구 수나 공간에 따라 어떤 집에 맞는지 가른다.',
    '- 제품 이름·품번·가격은 한데 모아 한 번 보여 주고 기준일을 붙인다.',
  ],
  health: [
    HEAD('건강'),
    '- 도입에서 독자가 겪는 상황 하나를 구체적으로 불러 준다(언제, 어디가, 어떻게).',
    '- 해당하는 사람과 해당하지 않는 사람을 가른다. 나이·증상·기간 같은 조건을 적는다.',
    '- 오늘 해 볼 수 있는 일 하나를 횟수나 시간과 함께 쓴다.',
    '- 근거가 공식 기관인지 연구 하나인지를 문장 안에서 밝힌다.',
    '- 증상을 다룬 글은 병원에서 확인하라는 권유와 위로 한마디로 마무리한다.',
  ],
  finance: [
    HEAD('재테크'),
    '- 숫자마다 기준 시점을 붙인다. 언제의 금리, 언제의 가격인지 문장 안에 적는다.',
    '- 숫자 뒤에는 그 숫자가 생활에서 얼마인지 풀이를 붙인다. 금리·세율은 자료의 숫자만 쓰고, 예로 드는 금액은 예라고 밝힌다.',
    '- 조건을 갈라 쓴다: "이 경우에는 …, 저 경우에는 …". 제도와 세금은 개인 사정에 따라 다르다고 밝힌다.',
    '- 통념과 실제 숫자가 어긋나는 지점이 있으면 그것을 각도로 세운다.',
    '- 앞으로 확인할 것 한두 가지로 마무리한다. 사라, 팔아라 식의 권유로 끝내지 않는다.',
  ],
};

export function buildHomefeedCraftBlock(topic: HomefeedCraftTopic): string {
  return BLOCKS[topic].join('\n');
}
