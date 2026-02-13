/**
 * ✅ [2026-02-12] 공유 이미지 스타일 유틸리티
 * DeepInfra 100점 기준에서 추출한 공통 함수 및 상수
 * → Fal.ai, Stability, Prodia 모두에서 재사용
 */

// ═══════════════════════════════════════════════════════════════════
// 🔍 퍼지 카테고리 매칭 (NanoBananaPro getCategoryStyle과 동일 로직)
// ═══════════════════════════════════════════════════════════════════
export function getStyleGuideByCategory(
    category: string | undefined,
    styles: Record<string, string>
): { styleGuide: string; matchedKey: string } {
    if (!category || category === 'default') return { styleGuide: styles['default'], matchedKey: 'default' };
    const norm = category.toLowerCase().trim();
    // 1. 정확한 매칭
    if (styles[norm]) return { styleGuide: styles[norm], matchedKey: norm };
    // 2. 원본 케이스로 매칭
    if (styles[category]) return { styleGuide: styles[category], matchedKey: category };
    // 3. 퍼지 매칭 (includes)
    for (const [key, style] of Object.entries(styles)) {
        if (key === 'default') continue;
        if (norm.includes(key.toLowerCase()) || key.toLowerCase().includes(norm)) {
            return { styleGuide: style, matchedKey: key };
        }
    }
    return { styleGuide: styles['default'], matchedKey: 'default' };
}

// ═══════════════════════════════════════════════════════════════════
// 🛒 쇼핑커넥트 라이프스타일 전용 스타일 (NanoBananaPro와 동일 전략)
// ═══════════════════════════════════════════════════════════════════
export const SHOPPING_CONNECT_LIFESTYLE =
    'Premium lifestyle photography with Korean person using or enjoying the product, luxury lifestyle setting, modern Korean apartment or trendy cafe, product clearly visible while being used, natural warm lighting, Instagram-worthy aesthetic, aspirational lifestyle imagery, NO TEXT NO WRITING';

// ═══════════════════════════════════════════════════════════════════
// 🔄 재시도 시 프롬프트 변형 전략 (NanoBananaPro variationStyles와 동일)
// ═══════════════════════════════════════════════════════════════════
export const VARIATION_STYLES = [
    'Use a COMPLETELY DIFFERENT color palette and lighting.',
    'Change the camera angle to a unique perspective (overhead, low angle, dutch angle).',
    'Simplify the composition with fewer elements and more negative space.',
    'Use warm colors if previous was cool, or vice versa.',
    'Add more visual elements and environmental details.',
    'Change the background setting completely.',
];

// ═══════════════════════════════════════════════════════════════════
// 📷 28개 카테고리 스타일 (실사)
// ═══════════════════════════════════════════════════════════════════
export const REALISTIC_CATEGORY_STYLES: Record<string, string> = {
    // ===== 🎭 인물 필수 카테고리 (PERSON REQUIRED) =====
    '스타 연예인': 'Professional photography of FAMOUS KOREAN CELEBRITY, K-star facial features, glamorous stage lighting, premium magazine quality, NO TEXT NO WRITING',
    '스포츠': 'Dynamic Korean athlete in action, high-speed motion capture, stadium lighting, sports magazine quality, NO TEXT NO WRITING',
    '패션 뷰티': 'K-beauty and K-fashion editorial, beautiful Korean model with flawless skin, stylish outfit, Vogue Korea quality, NO TEXT NO WRITING',
    '건강': 'Wellness photography, healthy Korean person exercising, bright clean gym, health magazine quality, NO TEXT NO WRITING',
    '교육/육아': 'Heartwarming Korean family, loving mother with child, cozy home, genuine smiles, family magazine quality, NO TEXT NO WRITING',
    '자기계발': 'Successful Korean professional in modern office, motivational atmosphere, career success imagery, NO TEXT NO WRITING',
    '취미 라이프': 'Korean lifestyle photography, modern living moments, bright atmosphere, lifestyle magazine quality, NO TEXT NO WRITING',

    // ===== 🍽️ 인물 제외 카테고리 (NO PEOPLE) =====
    '요리 맛집': 'Professional food photography, overhead flat lay, appetizing Korean cuisine close-up, warm lighting, NO PEOPLE NO HANDS, NO TEXT NO WRITING',
    '여행': 'Stunning Korean landscape, breathtaking scenic view, golden hour lighting, NO PEOPLE, National Geographic quality, NO TEXT NO WRITING',
    'IT 테크': 'Technology product hero shot, sleek modern device, minimalist background, studio lighting, NO PEOPLE, Apple-style, NO TEXT NO WRITING',
    '제품 리뷰': 'E-commerce product photography, premium product on clean background, studio lighting, NO PEOPLE, NO TEXT NO WRITING',
    '리빙 인테리어': 'Modern interior photography, beautiful Korean home interior, clean design, natural daylight, NO PEOPLE, NO TEXT NO WRITING',
    '반려동물': 'Adorable pet photography, cute dog or cat portrait, warm lighting, NO PEOPLE, NO TEXT NO WRITING',
    '자동차': 'Automotive photography, sleek car shot, dramatic lighting, NO PEOPLE, NO TEXT NO WRITING',
    '부동산': 'Real estate photography, beautiful property exterior/interior, wide angle, NO PEOPLE, NO TEXT NO WRITING',

    // ===== 📊 인포그래픽 카테고리 (Korean hands) =====
    '비즈니스 경제': 'Korean business professional hands holding smartphone or document, split composition with real-life photo side and clean info area, warm indoor office lighting, premium business atmosphere, NO TEXT NO WRITING',
    '사회 정치': 'Korean person hands with official document or smartphone showing news, government/official atmosphere, soft lighting, red/blue official colors for emphasis, broadcast news quality, NO TEXT NO WRITING',
    '공부': 'Educational infographic, colorful learning icons, step-by-step guide, NO PEOPLE, NO TEXT NO WRITING',

    // ===== 🎨 기타 카테고리 =====
    '책 영화': 'Cinematic movie poster style, dramatic lighting, rich colors, film aesthetic, NO TEXT NO WRITING',
    '게임': 'Gaming aesthetic, vibrant neon colors, dynamic composition, high energy visuals, NO TEXT NO WRITING',
    '사진 영상': 'Artistic photography, creative composition, dramatic lighting, fine art quality, NO TEXT NO WRITING',
    '예술': 'Fine art aesthetic, artistic composition, gallery quality, creative design, NO TEXT NO WRITING',
    '음악': 'Music visual, concert stage aesthetic, musical instruments, album cover style, NO TEXT NO WRITING',
    '생활 꿀팁': 'Lifestyle tips photography, clean organized visuals, practical aesthetic, NO PEOPLE, NO TEXT NO WRITING',
    '일반': 'High quality professional photography, clean composition, natural lighting, NO TEXT NO WRITING',

    // ===== 🎯 기본값 =====
    'default': 'High quality professional photography, cinematic lighting, rich colors, 8K UHD quality, clean composition, NO TEXT NO WRITING NO LETTERS',
};

// ═══════════════════════════════════════════════════════════════════
// 🎨 28개 카테고리 스타일 (애니메이션)
// ═══════════════════════════════════════════════════════════════════
export const ANIME_CATEGORY_STYLES: Record<string, string> = {
    // 🎭 인물 필수 카테고리
    '스타 연예인': 'beautiful anime idol character, kawaii Korean style, sparkling eyes, K-pop aesthetic, NO TEXT NO WRITING',
    '스포츠': 'dynamic anime sports scene, action pose, motion lines, shonen style, vibrant energy, NO TEXT NO WRITING',
    '패션 뷰티': 'stylish anime fashion illustration, beautiful character, K-beauty anime style, sparkling effects, NO TEXT NO WRITING',
    '건강': 'cute anime girl doing yoga, healthy lifestyle illustration, bright cheerful colors, NO TEXT NO WRITING',
    '교육/육아': 'heartwarming anime family scene, cute children, warm soft colors, NO TEXT NO WRITING',
    '자기계발': 'confident anime character in office, success aesthetic, motivational scene, NO TEXT NO WRITING',
    '취미 라이프': 'slice of life anime scene, cozy atmosphere, beautiful detailed background, NO TEXT NO WRITING',

    // 🍽️ 인물 제외 카테고리 (NO PEOPLE)
    '요리 맛집': 'delicious anime food illustration, ghibli style meal, appetizing close-up, NO PEOPLE, warm atmosphere, NO TEXT NO WRITING',
    '여행': 'stunning anime landscape, makoto shinkai style sky, beautiful scenery, NO PEOPLE, dreamy atmosphere, NO TEXT NO WRITING',
    'IT 테크': 'cool futuristic technology anime illustration, cyberpunk aesthetic, devices and gadgets, NO PEOPLE, NO TEXT NO WRITING',
    '제품 리뷰': 'anime product illustration, cute stylized item, clean background, NO PEOPLE, NO TEXT NO WRITING',
    '리빙 인테리어': 'cozy anime interior scene, warm lighting, beautiful room design, NO PEOPLE, NO TEXT NO WRITING',
    '반려동물': 'adorable anime pet illustration, cute dog or cat, warm colors, NO PEOPLE, NO TEXT NO WRITING',
    '자동차': 'sleek anime car illustration, initial D style, dramatic angles, NO PEOPLE, NO TEXT NO WRITING',
    '부동산': 'anime architecture illustration, beautiful building exterior, scenic view, NO PEOPLE, NO TEXT NO WRITING',

    // 📊 인포그래픽 스타일 (NO PEOPLE)
    '비즈니스 경제': 'anime style business infographic, clean icons, soft gradient, NO PEOPLE, NO TEXT NO WRITING',
    '사회 정치': 'anime news broadcast illustration, professional aesthetic, NO PEOPLE, NO TEXT NO WRITING',
    '공부': 'anime educational illustration, colorful learning icons, cute style, NO PEOPLE, NO TEXT NO WRITING',

    // 🎨 기타 카테고리
    '책 영화': 'cinematic anime scene, movie poster aesthetic, dramatic lighting, NO TEXT NO WRITING',
    '게임': 'gaming anime illustration, vibrant neon colors, dynamic composition, high energy, NO TEXT NO WRITING',
    '사진 영상': 'artistic anime illustration, creative composition, fine art quality, NO TEXT NO WRITING',
    '예술': 'fine art anime style, artistic composition, gallery quality, creative design, NO TEXT NO WRITING',
    '음악': 'anime music visual, concert stage aesthetic, musical instruments, album cover style, NO TEXT NO WRITING',
    '생활 꿀팁': 'lifestyle tips anime illustration, clean organized visuals, practical aesthetic, NO PEOPLE, NO TEXT NO WRITING',
    '일반': 'high quality anime illustration, detailed scene, vibrant colors, NO TEXT NO WRITING',

    // 🎯 기본값
    'default': 'beautiful anime illustration, high quality anime art, detailed scene, vibrant colors, NO TEXT NO WRITING NO LETTERS',
};

// ═══════════════════════════════════════════════════════════════════
// 🎨 11가지 스타일별 프롬프트 매핑 (NanoBananaPro 동기화)
// ═══════════════════════════════════════════════════════════════════
export const STYLE_PROMPT_MAP: Record<string, string> = {
    // 📷 실사
    'realistic': 'RAW photo, hyperrealistic, 8k uhd, dslr, high quality, film grain, Fujifilm XT3',
    'bokeh': 'beautiful bokeh photography, shallow depth of field, dreamy out-of-focus lights, soft circular bokeh orbs, dslr wide aperture f1.4, romantic atmosphere',
    // 🖌️ 아트
    'vintage': 'vintage retro illustration, 1950s poster art, muted colors, nostalgic aesthetic, old fashioned charm, classic design',
    'minimalist': 'minimalist flat design, simple clean lines, solid colors, modern aesthetic, geometric shapes, professional illustration',
    '3d-render': '3D render, octane render, cinema 4d, blender 3d, realistic materials, studio lighting, high quality 3d art',
    'korean-folk': 'Korean traditional Minhwa folk painting, vibrant primary colors on hanji paper, stylized tiger and magpie, peony flowers, pine trees, traditional Korean decorative patterns, bold flat colors with ink outlines, cheerful folk art',
    // ✨ 이색
    'stickman': 'simple stick figure drawing, black line art on white background, crude hand-drawn stick people, childlike doodle, humorous, thick marker lines, minimal stick figure',
    'claymation': 'claymation stop-motion, cute clay figurines, handmade plasticine texture, soft rounded shapes, miniature diorama, warm studio lighting, aardman style',
    'neon-glow': 'neon glow effect, luminous light trails, dark background, vibrant neon lights, synthwave, glowing outlines, electric blue and hot pink, LED sign',
    'papercut': 'paper cut art, layered paper craft, 3d paper sculpture, shadow between layers, handmade texture, colorful construction paper, kirigami, depth through layering',
    'isometric': 'isometric 3d illustration, isometric pixel world, 30 degree angle, clean geometric shapes, pastel colors, miniature scene, game perspective, detailed tiny world',
};

// ═══════════════════════════════════════════════════════════════════
// 🚫 NO PEOPLE 충돌 방지 (englishPrompt 인물 키워드 필터링)
// ═══════════════════════════════════════════════════════════════════
export const PERSON_KEYWORDS_REGEX = /person|people|celebrity|human|checking phone|studying|exercising|man |woman |girl |boy |worker|employee/i;
export const NO_PERSON_STYLE_REGEX = /NO PEOPLE|NO HANDS/i;

/**
 * NO PEOPLE 스타일에서 인물 키워드 충돌 방지
 * @returns 필터링된 basePrompt
 */
export function filterPersonKeywordsIfNeeded(
    styleGuide: string,
    basePrompt: string,
    heading: string,
    sanitizeFn: (s: string) => string
): string {
    if (NO_PERSON_STYLE_REGEX.test(styleGuide) && PERSON_KEYWORDS_REGEX.test(basePrompt)) {
        console.log(`[ImageStyles] ⚠️ NO PEOPLE 카테고리에서 인물 프롬프트 감지 → 재생성`);
        return `visual scene depicting: ${sanitizeFn(heading)}`;
    }
    return basePrompt;
}

// ═══════════════════════════════════════════════════════════════════
// 🎭 인물 필수 / 인물 제외 카테고리 목록
// ═══════════════════════════════════════════════════════════════════
export const PERSON_REQUIRED_CATEGORIES = [
    '스타 연예인', '스포츠', '패션 뷰티', '건강',
    '교육/육아', '자기계발', '취미 라이프', '책 영화',
];

export const NO_PERSON_CATEGORIES = [
    '요리 맛집', '여행', 'IT 테크', '제품 리뷰',
    '리빙 인테리어', '반려동물', '자동차', '부동산',
    '비즈니스 경제', '사회 정치', '공부', '생활 꿀팁',
];

/**
 * 카테고리가 인물 필수인지 퍼지 판별
 */
export function isPersonRequiredCategory(category: string | undefined): boolean {
    if (!category) return false;
    return PERSON_REQUIRED_CATEGORIES.some(c => category.includes(c) || c.includes(category));
}

/**
 * 카테고리가 인물 제외인지 퍼지 판별
 */
export function isNoPersonCategory(category: string | undefined): boolean {
    if (!category) return false;
    return NO_PERSON_CATEGORIES.some(c => category.includes(c) || c.includes(category));
}

// ═══════════════════════════════════════════════════════════════════
// 📐 카메라 앵글 랜덤 선택 (이미지 다양성)
// ═══════════════════════════════════════════════════════════════════
export const CAMERA_ANGLES = [
    'bird-eye view, overhead shot, looking down',
    'low angle shot, looking up, dramatic perspective',
    'wide shot, full scene visible, environmental',
    'medium shot, waist up, natural framing',
    'close-up shot, detailed focus, intimate',
    'over-the-shoulder shot, POV perspective',
    'dutch angle, tilted frame, dynamic tension',
    'profile view, side angle, elegant composition',
    'three-quarter view, natural pose',
    'silhouette, backlit, atmospheric',
];

export function getRandomCameraAngle(): string {
    return CAMERA_ANGLES[Math.floor(Math.random() * CAMERA_ANGLES.length)];
}

export const DYNAMIC_POSES = [
    'dynamic pose, action shot, in motion',
    'candid moment, natural interaction, caught off-guard',
    'environmental portrait, context visible, storytelling',
    'medium shot showing activity, hands visible',
    'full body shot in context, walking or moving',
    'back view, looking away, mysterious',
    'side profile, dramatic lighting',
    'group interaction, multiple people',
];

export function getRandomPose(): string {
    return DYNAMIC_POSES[Math.floor(Math.random() * DYNAMIC_POSES.length)];
}

// ═══════════════════════════════════════════════════════════════════
// 📏 이미지 비율 → 크기 매핑
// ═══════════════════════════════════════════════════════════════════
export const SIZE_MAP: Record<string, string> = {
    '1:1': '1024x1024',
    '16:9': '1344x768',
    '9:16': '768x1344',
    '4:3': '1152x896',
    '3:4': '896x1152',
};

export function getImageSize(ratio: string): string {
    return SIZE_MAP[ratio] || '1024x1024';
}
