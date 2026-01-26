// src/ui/config/categories.ts
// 카테고리 관련 설정

/**
 * 쇼핑커넥트 모드가 활성화되는 카테고리 목록
 * (리뷰형 글쓰기가 가능한 카테고리)
 * ✅ [2026-01-22] 확장: 모든 상품 리뷰/추천이 가능한 카테고리 포함
 */
export const AFFILIATE_ENABLED_CATEGORIES = [
    // ===== 기존 카테고리 =====
    'it_computer',        // IT/컴퓨터 (가전, 디지털)
    'shopping_review',    // 상품리뷰
    'fashion',            // 패션/뷰티
    'food_recipe',        // 요리/레시피
    'tasty_restaurant',   // 맛집
    'parenting',          // 육아/결혼 (유아용품)
    'interior',           // 인테리어/DIY (가구, 소품)
    'pet',                // 반려동물 (펫용품)
    'car',                // 자동차 (자동차용품)
    'game',               // 게임 (게임기, 주변기기)
    'hobby',              // 취미 (취미용품)
    'travel_domestic',    // 국내여행 (여행용품)
    'travel_world',       // 세계여행 (여행용품)

    // ===== 추가 카테고리 (2026-01-22) =====
    'health',             // 건강/의학 (건강식품, 운동기구)
    'sports',             // 스포츠 (스포츠용품)
    'gardening',          // 원예/재배 (원예용품)
    'photo',              // 사진 (카메라, 촬영장비)
    'business_economy',   // 비즈니스/경제 (사무용품, 책)
    'education_scholarship', // 교육/학문 (교재, 학습기기)
    'language',           // 어학/외국어 (어학교재)
    'realestate',         // 부동산 (인테리어, 가구)
    'self_dev',           // 자기계발 (도서, 강의)
    'general',            // 일상/생각 (일상용품)
    'literature',         // 문학/책 (도서)
    'movie',              // 영화 (영화용품, DVD)
    'art_design',         // 미술/디자인 (미술용품)
    'music',              // 음악 (악기, 음향기기)
    'good_writing',       // 좋은글/이미지 (인테리어소품)
    'cartoon',            // 만화/애니 (피규어, 굿즈)
] as const;

export type AffiliateCategory = typeof AFFILIATE_ENABLED_CATEGORIES[number];

/**
 * 카테고리가 쇼핑커넥트 활성화 대상인지 확인
 */
export function isAffiliateCategoryEnabled(category: string): boolean {
    return (AFFILIATE_ENABLED_CATEGORIES as readonly string[]).includes(category);
}

/**
 * 전체 카테고리 목록 (라벨 포함)
 */
export const CATEGORY_LABELS: Record<string, string> = {
    // 엔터테인먼트/예술
    literature: '📚 문학·책',
    movie: '🎬 영화',
    art: '🎨 미술·디자인',
    performance: '🎭 공연·전시',
    music: '🎵 음악',
    drama: '📺 드라마',
    celebrity: '⭐ 스타·연예인',
    cartoon: '🎌 만화·애니',
    broadcast: '📡 방송',

    // 생활/노하우/쇼핑
    daily: '💭 일상·생각',
    parenting: '👶 육아·결혼',
    pet: '🐶 반려동물',
    photo: '🖼️ 좋은글·이미지',
    fashion: '👗 패션·미용',
    interior: '🏠 인테리어·DIY',
    food_recipe: '🍳 요리·레시피',
    shopping_review: '📦 상품리뷰',
    gardening: '🌱 원예·재배',

    // 취미/여가/여행
    game: '🎮 게임',
    sports: '⚽ 스포츠',
    camera: '📷 사진',
    car: '🚗 자동차',
    hobby: '🎯 취미',
    travel_domestic: '🗺️ 국내여행',
    travel_world: '✈️ 세계여행',
    tasty_restaurant: '🍽️ 맛집',

    // 지식/동향
    it_computer: '💻 IT·컴퓨터',
    politics: '📰 사회·정치',
    health: '🏥 건강·의학',
    economy: '💼 비즈니스·경제',
    language: '🌍 어학·외국어',
    education: '🎓 교육·학문',
    realestate: '🏢 부동산',
    selfdev: '📈 자기계발'
};

/**
 * 카테고리 키로 라벨 가져오기
 */
export function getCategoryLabel(key: string): string {
    return CATEGORY_LABELS[key] || key;
}
