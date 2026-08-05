/**
 * Single source of truth: UI article-type slug -> Korean category hint.
 *
 * Chain: UI slug -> this map -> resolveCategory() -> category prompt file.
 *
 * The hint MUST be a Korean token. resolveCategory()'s CATEGORY_MAP is keyed on
 * Korean, and contentTonePolicy.ts matches Korean display literals directly, so
 * an English slug resolves to 'general' (no category prompt at all).
 *
 * A slug with no entry here yields an empty hint. main.ts:5776 guards the
 * override with `if (categoryHint)`, so an empty hint leaves source.categoryHint
 * as sourceAssembler.ts:7431 set it — `keywords[0]`. The prompt is then chosen by
 * the first keyword rather than by the topic the user picked. Entries are added
 * only once the category prompt is confirmed appropriate for that topic;
 * everything else keeps the existing behaviour until it is reviewed.
 */

/**
 * UI 주제 슬러그(public/index.html #unified-article-type) → 한국어 카테고리 힌트.
 *
 * 여기 없는 슬러그는 힌트가 비어 키워드 폴백으로 넘어간다(현행 동작).
 * 주제별 검토가 끝나는 대로 하나씩 추가한다.
 */
export const ARTICLE_TYPE_TO_HINT: Readonly<Record<string, string>> = {
  // ── 기존 매핑 (동작 유지) ──────────────────────────────────
  tips: '생활',
  parenting: '육아',
  health: '건강',
  sports: '스포츠',
  shopping_review: '쇼핑',
  general: 'general',

  // ── 신규: 카테고리 프롬프트가 해당 주제를 명시적으로 다루는 것만 ──
  // pet.prompt — 반려동물 전용 (품종·급여량·수의사 확인 신호)
  pet: '반려동물',
  // fashion.prompt — 패션·뷰티
  fashion: '패션',
  // living.prompt — 인테리어·리빙
  interior: '인테리어',
  // food.prompt — 메뉴·재료·조리 순서 / 방문 조건·대기·예약
  food_recipe: '요리',
  tasty_restaurant: '맛집',
  // travel.prompt — 장소·운영시간·요금·교통·예약
  travel_domestic: '여행',
  travel_world: '여행',
  // it.prompt — 모델명·사양·호환성·벤치마크
  it_computer: 'IT',
  // society.prompt — "정책명, 대상, 소득·연령 기준, 신청 기간, 금액, 금리, 세금"
  society_politics: '사회',
  business_economy: '경제',
  // entertainment.prompt — "작품·인물·방송·공연의 이름, 발언, 일정, 공개 시점"
  celebrity: '연예',
  movie: '영화',
  drama: '드라마',
  // life.prompt 1행이 "생활·쇼핑·자동차·문화"를 스코프로 명시한다
  car: '자동차',

  // ── 레거시 키: UI가 내보내지 않지만 다른 호출자가 쓸 수 있어 유지 ──
  entertainment: '연예',
  it_review: 'IT',
  finance: '경제',
  shopping_expert_review: '쇼핑',
  travel: '여행',
  food: '음식',
  lifestyle: '라이프',
};

/**
 * 아직 매핑하지 않은 UI 슬러그 — 주제별 검토 대기.
 *
 * 목록으로 유지하는 이유: 슬러그가 누락된 것인지, 검토를 거쳐 보류한 것인지
 * 구분하기 위해서다. 테스트가 이 둘의 합이 UI 옵션 전체와 일치하는지 검사한다.
 */
export const PENDING_ARTICLE_TYPES: readonly string[] = [
  'literature', // 문학·책 — 서평이 연예 골격과 맞는지 미검토
  'art_design', // 미술·디자인
  'performance', // 공연·전시
  'music', // 음악
  'cartoon', // 만화·애니
  'broadcast', // 방송 — 편성정보형에 이슈 서사가 붙는 문제 미해결
  'good_writing', // 좋은글·이미지
  'gardening', // 원예·재배
  'game', // 게임 — it.prompt의 발열·배터리 축이 부적합
  'photo', // 사진
  'hobby', // 취미
  'language', // 어학·외국어
  'education_scholarship', // 교육·학문 — parenting은 전부 아이·양육이라 부적합
  'realestate', // 부동산
  'self_dev', // 자기계발
];

/**
 * Returns the Korean category hint for a UI article-type slug.
 * Unknown slugs yield an empty string, preserving each caller's existing
 * `|| ''` behaviour rather than silently claiming a category.
 */
export function resolveArticleTypeHint(articleType?: string | null): string {
  if (!articleType) return '';
  return ARTICLE_TYPE_TO_HINT[articleType] ?? '';
}
