const CONTENT_CATEGORY_VALUES = [
  'general',
  'tips',
  'parenting',
  'pet',
  'good_writing',
  'fashion',
  'interior',
  'food_recipe',
  'shopping_review',
  'gardening',
  'literature',
  'movie',
  'art_design',
  'performance',
  'music',
  'drama',
  'celebrity',
  'cartoon',
  'broadcast',
  'game',
  'sports',
  'photo',
  'car',
  'hobby',
  'travel_domestic',
  'travel_world',
  'tasty_restaurant',
  'it_computer',
  'society_politics',
  'health',
  'business_economy',
  'language',
  'education_scholarship',
  'realestate',
  'self_dev',
] as const;

const CONTENT_CATEGORY_LABELS = [
  '일상',
  '생활정보',
  '육아 결혼',
  '반려동물',
  '좋은글',
  '패션',
  '인테리어',
  '요리 레시피',
  '상품리뷰',
  '원예',
  '문학',
  '영화',
  '미술 디자인',
  '공연 전시',
  '음악',
  '드라마',
  '스타 연예인',
  '만화 애니',
  '방송',
  '게임',
  '스포츠',
  '사진',
  '자동차',
  '취미',
  '국내여행',
  '세계여행',
  '맛집',
  'IT 컴퓨터',
  '사회 정치',
  '사회/정치',
  '사회·정치',
  '건강 의학',
  '비즈니스 경제',
  '어학 외국어',
  '교육 장학금',
  '부동산',
  '자기계발',
] as const;

const CONTENT_CATEGORY_TOKENS = new Set([
  ...CONTENT_CATEGORY_VALUES.map(normalizeCategoryToken),
  ...CONTENT_CATEGORY_LABELS.map(normalizeCategoryToken),
]);

const PLACEHOLDER_TOKENS = new Set([
  normalizeCategoryToken('분석된 카테고리를 선택하세요'),
  normalizeCategoryToken('카테고리 선택하세요'),
  normalizeCategoryToken('전체 기본'),
]);

export function normalizeCategoryToken(value: unknown): string {
  return String(value || '')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .toLowerCase();
}

export function isContentCategoryCandidate(value: unknown, text?: unknown): boolean {
  const valueToken = normalizeCategoryToken(value);
  const textToken = normalizeCategoryToken(text);

  return Boolean(
    (valueToken && CONTENT_CATEGORY_TOKENS.has(valueToken)) ||
    (textToken && CONTENT_CATEGORY_TOKENS.has(textToken)),
  );
}

function isPlaceholderCategory(value: unknown, text?: unknown): boolean {
  const valueToken = normalizeCategoryToken(value);
  const textToken = normalizeCategoryToken(text);

  return Boolean(
    !valueToken ||
    PLACEHOLDER_TOKENS.has(valueToken) ||
    PLACEHOLDER_TOKENS.has(textToken),
  );
}

export function markRealBlogCategoryOption(option: HTMLOptionElement, categoryId?: unknown): void {
  option.dataset.realBlogCategory = 'true';
  const cleanId = String(categoryId || '').trim();
  if (cleanId) {
    option.dataset.realBlogCategoryId = cleanId;
  }
}

export function getVerifiedRealBlogCategoryName(select: HTMLSelectElement | null | undefined): string | undefined {
  if (!select || select.selectedIndex < 0) return undefined;

  const selectedOption = select.options[select.selectedIndex];
  const value = selectedOption?.value?.trim() || '';
  const text = selectedOption?.text?.trim() || '';
  if (!selectedOption || isPlaceholderCategory(value, text)) return undefined;

  const explicitlyLoadedFromBlog = selectedOption.dataset.realBlogCategory === 'true';
  if (!explicitlyLoadedFromBlog && isContentCategoryCandidate(value, text)) {
    return undefined;
  }

  return text || value || undefined;
}

export function getVerifiedRealBlogCategoryValue(select: HTMLSelectElement | null | undefined): string | undefined {
  if (!select || select.selectedIndex < 0) return undefined;

  const selectedOption = select.options[select.selectedIndex];
  const value = selectedOption?.value?.trim() || '';
  const text = selectedOption?.text?.trim() || '';
  if (!selectedOption || isPlaceholderCategory(value, text)) return undefined;

  const explicitlyLoadedFromBlog = selectedOption.dataset.realBlogCategory === 'true';
  if (!explicitlyLoadedFromBlog && isContentCategoryCandidate(value, text)) {
    return undefined;
  }

  return value || text || undefined;
}
