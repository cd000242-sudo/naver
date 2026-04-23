/**
 * ✅ [2026-02-12] 공유 이미지 스타일 유틸리티
 * DeepInfra 100점 기준에서 추출한 공통 함수 및 상수
 * → Fal.ai, Stability, Prodia 모두에서 재사용
 */

// ═══════════════════════════════════════════════════════════════════
// 🛒 쇼핑커넥트 라이프스타일 전용 스타일 (비즈니스 요구사항)
// ═══════════════════════════════════════════════════════════════════
export const SHOPPING_CONNECT_LIFESTYLE =
    'Premium lifestyle photography with Korean person using or enjoying the product, luxury lifestyle setting, modern Korean apartment or trendy cafe, product clearly visible while being used, natural warm lighting, Instagram-worthy aesthetic, aspirational lifestyle imagery, TEXTLESS';

// ═══════════════════════════════════════════════════════════════════
// 🔄 재시도 시 프롬프트 변형 전략
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
// ✅ [2026-03-01] 하드코딩 카테고리 스타일 제거
// AI 추론 기반: 각 생성기(NanoBananaPro, DeepInfra)에서 getPersonRule()로
// 인물 포함/제외 + 한국인 하드코딩만 제공, 비주얼 스타일은 AI가 주제에서 추론
// ═══════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════
// 🎨 5가지 스타일별 프롬프트 매핑 (✅ [2026-02-18] 100점 품질 달성)
// ═══════════════════════════════════════════════════════════════════
export const STYLE_PROMPT_MAP: Record<string, string> = {
    // 📷 실사 (10/10) — 시네마틱 라이팅 + 보케 + DSLR 렌즈 특성
    // ✅ [2026-02-20 FIX] 85mm f/1.4 인물 전용렌즈 → 24-70mm 다용도 렌즈, skin texture 제거
    // 인물 편향 방지: 렌즈와 키워드가 피사체를 결정하지 않도록 범용 키워드 사용
    'realistic': 'RAW photo, hyperrealistic, 8k uhd, shot on Canon EOS R5 with 24-70mm f/2.8 lens, cinematic color grading, volumetric lighting with soft golden hour glow, shallow depth of field with creamy bokeh background, professional studio quality, film grain, high dynamic range, magazine editorial quality, rich texture and detail, TEXTLESS',

    // 📜 빈티지 (10/10) — 텍스처 + 색 보정 + 시대 디테일 + 인쇄 질감
    'vintage': 'vintage mid-century retro poster art, authentic 1960s advertising illustration style, hand-painted gouache texture on aged cream paper, warm sepia and burnt orange palette with faded teal accents, visible paper grain and slight ink bleeding, halftone dot pattern overlay, rounded geometric composition, nostalgic warm lighting, slightly desaturated earth tones, screen-print aesthetic with limited color palette, classic editorial illustration quality, TEXTLESS',

    // 🤸 심플 만화 캐릭터 — 둥근 흰 머리 + 옷 착용 + 두꺼운 팔다리 + 표정 있는 만화체
    // ✅ [2026-02-19 FIX] 배경/장면 고정 제거 → basePrompt의 상황 설명이 장면에 반영되도록
    'stickman': 'cute simple character with round white circle head, dot eyes, expressive mouth, thick round limbs, wearing casual clothes, LINE Friends mascot style, bold black outlines, flat bright colors, digital illustration, character actively interacting with the scene, TEXTLESS',

    // 🫧 뚱글이 (10/10) — Molang 양태 + 파스텔 팔레트 + 힐링 무드
    // ✅ [2026-02-19 FIX] 고정 배경(baby pink lavender mint gradient) 제거 → 장면 맥락 반영
    'roundy': 'adorable ultra-chubby round blob character, perfectly spherical soft white body, tiny stubby limbs, small dot eyes close together, happy cat-like smile, Molang inspired kawaii design, 90 percent round body, soft pastel color palette, smooth cel-shading, digital illustration, character actively participating in the scene, TEXTLESS',

    // 🎨 2D 한국 웹툰 일러스트 (✅ [2026-02-19] 웹툰 일러스트 기본값 + 서브스타일 시스템)
    // 기본값은 webtoon_illust (말풍선 없는 만화 일러스트)
    // ✅ [2026-02-22 FIX] 인물 편향 수정: 'expressive character with big eyes' 제거
    // 캐릭터 외형은 getWebtoonStylePrompt()에서 카테고리 조건부로 추가
    '2d': 'Korean webtoon digital illustration style, warm soft color palette, clean smooth lineart, detailed atmospheric background, soft lighting and shadows, romantic manhwa aesthetic, semi-realistic proportions, beautiful color gradients, professional digital painting quality, TEXTLESS',

    // 🏰 디즈니 3D (Disney Pixar) — 부드러운 조명 + 3D 렌더링 + 생동감
    'disney': 'Disney Pixar 3D animation style, vibrant colorful scene, soft diffused studio lighting, smooth plastic-like skin texture, big expressive eyes with detailed reflections, rounded friendly character design, subsurface scattering on skin, beautiful volumetric lighting, dreamy magical atmosphere, Pixar movie quality render, octane render, hyper detailed 3D, adorable character proportions, whimsical fairy tale environment, TEXTLESS',

    // 📊 인포그래픽 (v1.6.3) — 데이터 시각화 + 플랫 벡터 + 한글 타이포 친화
    //   용도: 블로그 본문 내 개념 설명, 통계/비교, 단계별 절차 설명
    //   특징: 아이콘, 차트, 다이어그램, 단색~2색 기반 미니멀 팔레트
    //   TEXTLESS: 한글 텍스트는 overlay 단계에서 주입되도록 빈 캔버스 유지
    'infographic': 'professional clean infographic style, data visualization with subtle charts bars icons arrows, minimalist flat vector illustration, isometric 3D elements with soft shadows, limited 2-3 color palette with navy and accent color, clear information architecture, rounded rectangle sections, modern corporate aesthetic, geometric shapes and lines, white or light gray background, clean grid layout, abstract concept illustration, process flow diagram vibe, TEXTLESS',
};

// ═══════════════════════════════════════════════════════════════════
// 🎨 2D 서브스타일 (✅ [2026-02-19] 웹툰일러스트/치비/플랫벡터)
// ═══════════════════════════════════════════════════════════════════
export type WebtoonSubStyle = 'webtoon_illust' | 'chibi' | 'flat';

export const SUBSTYLE_PROMPT_MAP: Record<WebtoonSubStyle, string> = {
    // 🖌️ 웹툰 일러스트 (기본) — 만화 느낌 + 깨끗한 배경, 텍스트 최소
    'webtoon_illust': 'Korean webtoon digital illustration style, warm soft color palette, clean smooth lineart, expressive character with big eyes, detailed atmospheric background, soft lighting and shadows, romantic manhwa aesthetic, semi-realistic proportions, beautiful color gradients, professional digital painting quality, TEXTLESS',

    // 🎀 치비 — 큰 머리 + 작은 몸 SD캐릭터 (텍스트 약간 발생 가능)
    'chibi': 'cute chibi super-deformed mini character, small body with oversized head ratio 2:1 or 3:1, big round sparkling eyes with colorful iris, tiny cute body with short limbs, exaggerated adorable expressions, clean bold outlines, flat vibrant cel-shaded colors, dynamic scene with props and background matching the action, playful composition, soft pastel to vivid color palette, fun energetic mood, digital illustration, TEXTLESS',

    // 📐 플랫 벡터 — 깔끔한 그래픽, 텍스트 완전 제로
    'flat': 'flat vector illustration, clean geometric shapes, modern minimalist design, bold simple outlines, limited color palette with harmonious colors, isometric perspective, professional infographic style character, abstract simplified environment, corporate clean aesthetic, smooth gradients, TEXTLESS',
};

// ═══════════════════════════════════════════════════════════════════
// 🎭 한국 웹툰 성별 분기 프롬프트 (✅ [2026-02-18] 신규)
// ═══════════════════════════════════════════════════════════════════
export type WebtoonGender = 'male' | 'female' | 'neutral';

const WEBTOON_GENDER_PROMPTS: Record<WebtoonGender, string> = {
    'male': 'handsome young Korean male character, sharp jawline, neat short dark hair, confident expression, tall slim build, wearing stylish modern Korean menswear',
    'female': 'beautiful young Korean female character, soft facial features, long flowing dark hair with highlights, gentle expressive eyes, slim figure, wearing trendy modern Korean fashion',
    'neutral': 'cute gender-neutral Korean character, youthful soft features, medium-length stylish hair, friendly warm expression, modern casual Korean streetwear',
};

/**
 * 한국 웹툰 스타일 프롬프트 (성별 + 서브스타일 분기)
 * ✅ [2026-02-22 FIX] category 파라미터 추가: 인물 제외 카테고리에서 성별 프롬프트 제거
 * @param gender 남성/여성/중성
 * @param subStyle 서브스타일 (웹툰일러스트/치비/플랫벡터)
 * @param category 카테고리 (인물 제외 판별용)
 * @returns 성별+서브스타일 특화 프롬프트 (인물 제외 카테고리면 성별 생략)
 */
export function getWebtoonStylePrompt(gender: WebtoonGender = 'male', subStyle: WebtoonSubStyle = 'webtoon_illust', category?: string): string {
    const baseWebtoon = SUBSTYLE_PROMPT_MAP[subStyle] || SUBSTYLE_PROMPT_MAP['webtoon_illust'];
    // ✅ [2026-02-22 FIX] 인물 제외 카테고리에서는 성별/캐릭터 프롬프트 제외
    if (isNoPersonCategory(category)) {
        return `${baseWebtoon}, NO PEOPLE, focus on objects and environment`;
    }
    const genderPrompt = WEBTOON_GENDER_PROMPTS[gender] || WEBTOON_GENDER_PROMPTS['male'];
    return `${baseWebtoon}, ${genderPrompt}`;
}

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
// 📐 [2026-02-23 v2] 다축(Multi-Axis) 이미지 다양성 엔진
// 인덱스 기반 순환 — 연속 이미지 절대 중복 없음
// 6개 독립 축: 카메라앵글, 조명, 피사계심도, 색감, 프레이밍, 인물
// 소수(prime) 오프셋으로 축마다 다른 주기 → 최대 조합 다양성
// ═══════════════════════════════════════════════════════════════════

/** 축 1: 카메라 앵글 (7개 — 소수) */
const ANGLES = [
    'bird-eye view, overhead shot, looking down',
    'low angle shot, looking up, dramatic perspective',
    'wide establishing shot, full scene visible',
    'medium shot, waist up, natural framing',
    'close-up shot, detailed focus, intimate',
    'dutch angle, tilted frame, dynamic tension',
    'three-quarter view, elegant composition',
];

/** 축 2: 조명 스타일 (11개 — 소수) */
const LIGHTINGS = [
    'warm golden hour sunlight',
    'cool blue twilight atmosphere',
    'dramatic chiaroscuro side lighting with deep shadows',
    'soft diffused overcast natural light',
    'neon-accented urban night lighting',
    'high-key bright and airy studio feel',
    'backlit rim lighting with lens flare',
    'candlelit warm intimate glow',
    'harsh midday sun with strong shadows',
    'foggy ethereal soft glow',
    'mixed artificial and natural window light',
];

/** 축 3: 피사계심도 & 포커스 (5개 — 소수) */
const FOCUS_STYLES = [
    'shallow depth of field, bokeh background',
    'deep focus, everything sharp from foreground to background',
    'selective focus on main subject, soft surroundings',
    'tilt-shift miniature effect',
    'rack focus pull, cinematic depth',
];

/** 축 4: 색감 & 톤 (7개 — 소수) */
const COLOR_PALETTES = [
    'vibrant saturated colors, bold contrasts',
    'muted earth tones, natural palette',
    'monochromatic with one accent color pop',
    'pastel soft dreamy palette',
    'high contrast black and white with color splash',
    'warm amber and terracotta tones',
    'cool jade and silver contemporary palette',
];

/** 축 5: 프레이밍 & 구성 (5개 — 소수) */
const FRAMINGS = [
    'rule of thirds composition, subject off-center',
    'centered symmetrical composition, balanced',
    'leading lines drawing eye to subject',
    'frame within frame, natural border',
    'negative space emphasis, minimalist',
];

/** 축 6: 인물 활동/포즈 (11개 — 소수) */
const PERSON_ACTIONS = [
    'dynamic pose, action shot, in motion',
    'candid moment, natural interaction, caught off-guard',
    'environmental portrait, context visible, storytelling',
    'medium shot showing activity, hands visible',
    'full body shot in context, walking or moving',
    'back view, looking away, mysterious atmosphere',
    'side profile, dramatic lighting',
    'group interaction, lively conversation',
    'contemplative pose, gazing into distance',
    'hands-on activity, deeply engaged with task',
    'over-the-shoulder perspective, POV framing',
];

// 레거시 호환 export
export const CAMERA_ANGLES = ANGLES;
export const DYNAMIC_POSES = PERSON_ACTIONS;

/**
 * 인덱스 기반 다양성 힌트 번들.
 * 각 축은 서로 다른 소수 길이 → 같은 조합이 반복되려면 수백 개 이미지 필요.
 * @param index - 이미지 순서 인덱스 (0-based)
 */
export interface ImageDiversityHints {
    angle: string;
    lighting: string;
    focus: string;
    color: string;
    framing: string;
    personAction: string;
}

export function getImageDiversityHints(index: number): ImageDiversityHints {
    return {
        angle: ANGLES[index % ANGLES.length],
        lighting: LIGHTINGS[index % LIGHTINGS.length],
        focus: FOCUS_STYLES[index % FOCUS_STYLES.length],
        color: COLOR_PALETTES[index % COLOR_PALETTES.length],
        framing: FRAMINGS[index % FRAMINGS.length],
        personAction: PERSON_ACTIONS[index % PERSON_ACTIONS.length],
    };
}

/** 레거시 호환: 랜덤 카메라 앵글 */
export function getRandomCameraAngle(): string {
    return ANGLES[Math.floor(Math.random() * ANGLES.length)];
}

/** 레거시 호환: 랜덤 포즈 */
export function getRandomPose(): string {
    return PERSON_ACTIONS[Math.floor(Math.random() * PERSON_ACTIONS.length)];
}

/** 레거시 호환: 랜덤 구도 */
export function getRandomComposition(): string {
    const all = [...LIGHTINGS, ...FOCUS_STYLES, ...FRAMINGS];
    return all[Math.floor(Math.random() * all.length)];
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

// ═══════════════════════════════════════════════════════════════════
// 🎨 Leonardo AI v1 전용: presetStyle API 파라미터 매핑
// ═══════════════════════════════════════════════════════════════════
export function getPresetStyleMapping(imageStyle: string): string {
    const mapping: Record<string, string> = {
        'realistic': 'PHOTOGRAPHY',
        'stickman': 'ILLUSTRATION',
        'roundy': 'ILLUSTRATION',
        '2d': 'ANIME',
        'vintage': 'SKETCH_COLOR',
        'disney': 'RENDER_3D',
        'infographic': 'ILLUSTRATION', // [v1.6.3] 인포그래픽 — Leonardo 일러스트 프리셋 매핑
    };
    return mapping[imageStyle] || 'DYNAMIC';
}

// ═══════════════════════════════════════════════════════════════════
// 🚫 Leonardo AI v1 전용: 스타일별 네거티브 프롬프트
// ═══════════════════════════════════════════════════════════════════
export function getStyleNegativePrompt(imageStyle: string): string {
    const base = 'text, words, letters, writing, watermark, signature, blurry, low quality';
    const styleNegatives: Record<string, string> = {
        'realistic': `${base}, cartoon, anime, illustration, drawing`,
        'stickman': `${base}, photorealistic, photography, 3d render, human face`,
        'roundy': `${base}, photorealistic, photography, sharp edges, realistic proportions`,
        '2d': `${base}, photorealistic, 3d render, photography`,
        'vintage': `${base}, modern, digital, neon, futuristic`,
        'disney': `${base}, photorealistic, photography, 2d flat, sketch, dark horror`,
    };
    return styleNegatives[imageStyle] || base;
}
