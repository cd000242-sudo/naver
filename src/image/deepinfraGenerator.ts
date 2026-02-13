import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { loadConfig } from '../configManager.js';
import { ImageRequestItem, GeneratedImage } from './types.js';
import { sanitizeImagePrompt, writeImageFile } from './imageUtils.js';
import { addThumbnailTextOverlay } from './textOverlay.js'; // ✅ [2026-01-30] 썸네일 텍스트 오버레이
import { AutomationService } from '../main/services/AutomationService.js'; // ✅ [2026-01-29 FIX] 중지 체크용
import sharp from 'sharp'; // ✅ [2026-01-30] 이미지 하단 텍스트 영역 크롭용

// ✅ [2026-02-12] 퍼지 카테고리 매칭 함수 (모듈 레벨 — for loop 밖에서 1회 정의)
// NanoBananaPro의 getCategoryStyle()과 동일 로직: '요리' → '요리 맛집' 부분 매칭 지원
function getStyleGuideByCategory(category: string | undefined, styles: Record<string, string>): { styleGuide: string; matchedKey: string } {
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

// ✅ [2026-02-12] 쇼핑커넥트 라이프스타일 전용 스타일 (NanoBananaPro와 동일 전략)
const DEEPINFRA_SHOPPING_CONNECT_LIFESTYLE = 'Premium lifestyle photography with Korean person using or enjoying the product, luxury lifestyle setting, modern Korean apartment or trendy cafe, product clearly visible while being used, natural warm lighting, Instagram-worthy aesthetic, aspirational lifestyle imagery, NO TEXT NO WRITING';

// ✅ [2026-02-12] 재시도 시 프롬프트 변형 전략 (NanoBananaPro variationStyles와 동일)
const VARIATION_STYLES = [
    'Use a COMPLETELY DIFFERENT color palette and lighting.',
    'Change the camera angle to a unique perspective (overhead, low angle, dutch angle).',
    'Simplify the composition with fewer elements and more negative space.',
    'Use warm colors if previous was cool, or vice versa.',
    'Add more visual elements and environmental details.',
    'Change the background setting completely.'
];


// ✅ DeepInfra FLUX API 설정 (참고: https://deepinfra.com/black-forest-labs/FLUX-2-dev)
const DEEPINFRA_API_URL = 'https://api.deepinfra.com/v1/openai/images/generations';
const DEFAULT_DEEPINFRA_MODEL = 'black-forest-labs/FLUX-2-dev'; // 기본값

// ✅ [2026-01-28] FLUX Redux (image-to-image) API 설정
const DEEPINFRA_REDUX_API_URL = 'https://api.deepinfra.com/v1/inference/black-forest-labs/FLUX-1-Redux-dev';

// ✅ [2026-01-27] 사용자 설정값 → DeepInfra API 모델명 매핑
const DEEPINFRA_MODEL_MAP: Record<string, string> = {
    'flux-2-dev': 'black-forest-labs/FLUX-2-dev',      // FLUX.2-dev (최신)
    'flux-dev': 'black-forest-labs/FLUX-1-dev',        // FLUX.1-dev
    'flux-schnell': 'black-forest-labs/FLUX-1-schnell' // FLUX.1-schnell (빠름)
};


export interface DeepInfraGenerateOptions {
    prompt: string;
    size?: string; // "1024x1024", "512x512", etc.
    n?: number;
    model?: string; // ✅ [2026-01-27] 동적 모델 선택 지원
    referenceImageUrl?: string; // ✅ [2026-01-28] 참조 이미지 URL (img2img)
    referenceImagePath?: string; // ✅ [2026-01-28] 참조 이미지 로컬 경로
    guidanceScale?: number; // ✅ [2026-01-28] img2img 가이던스 (기본 7.5)
}

export interface DeepInfraResult {
    success: boolean;
    imageData?: string; // base64
    localPath?: string;
    error?: string;
}

/**
 * DeepInfra API 키 확인
 */
export async function isDeepInfraConfigured(): Promise<boolean> {
    const config = await loadConfig();
    return !!((config as any).deepinfraApiKey && (config as any).deepinfraApiKey.trim());
}

/**
 * DeepInfra로 일괄 이미지 생성 (공통 인터페이스)
 */
export async function generateWithDeepInfra(
    items: ImageRequestItem[],
    postTitle?: string,
    postId?: string,
    isFullAuto: boolean = false,
    providedApiKey?: string,
    isShoppingConnect: boolean = false // ✅ [2026-02-12] 쇼핑커넥트 모드 전달
): Promise<GeneratedImage[]> {
    const config = await loadConfig();
    const apiKey = providedApiKey || (config as any).deepinfraApiKey?.trim();

    if (!apiKey) {
        throw new Error('DeepInfra API 키가 설정되지 않았습니다. 환경설정에서 입력해주세요.');
    }

    // ✅ [2026-01-27] 사용자 설정에서 모델 선택 읽기
    const selectedModelKey = (config as any).deepinfraModel || 'flux-2-dev';
    const actualModel = DEEPINFRA_MODEL_MAP[selectedModelKey] || DEFAULT_DEEPINFRA_MODEL;

    console.log(`[DeepInfra] 🎨 총 ${items.length}개 이미지 생성 시작`);
    console.log(`[DeepInfra] 📋 선택된 모델: ${selectedModelKey} → ${actualModel}`);

    const results: GeneratedImage[] = [];

    for (let i = 0; i < items.length; i++) {
        // ✅ [2026-01-29 FIX] 각 이미지 생성 전 중지 체크
        if (AutomationService.isCancelRequested()) {
            console.log('[DeepInfra] ⛔ 중지 요청 감지 → 이미지 생성 중단');
            break;
        }

        const item = items[i];
        const isThumbnail = (item as any).isThumbnail !== undefined ? (item as any).isThumbnail : (i === 0);

        console.log(`[DeepInfra] 🖼️ [${i + 1}/${items.length}] "${item.heading}" 생성 중...`);

        try {
            // ✅ [2026-01-28] 참조 이미지가 있으면 img2img 우선 시도
            if (item.referenceImageUrl) {
                console.log(`[DeepInfra] 🖼️ 참조 이미지 감지 → FLUX Redux (img2img) 모드 사용`);
                const img2imgResult = await generateDeepInfraWithReference(item, apiKey, postTitle, postId);

                if (img2imgResult) {
                    results.push(img2imgResult);
                    console.log(`[DeepInfra] ✅ [${i + 1}/${items.length}] "${item.heading}" img2img 완료`);
                    continue; // 성공 시 다음 아이템으로
                }

                console.log(`[DeepInfra] ⚠️ img2img 실패, text-to-image로 폴백`);
            }

            // ✅ [2026-02-08 FIX] 이미지 스타일 설정 읽기 — config.json 폴백 (main 프로세스에서 localStorage 접근 불가)
            const imageStyle = (item as any).imageStyle || (config as any).imageStyle || 'realistic';

            console.log(`[DeepInfra] 🎨 이미지 스타일: ${imageStyle}`);

            // ✅ [2026-01-29 100점] 표준 카테고리명 사용 + NO TEXT NO WRITING
            const realisticCategoryStyles: Record<string, string> = {
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

                // ===== 📊 인포그래픽 카테고리 (NO PEOPLE) =====
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
                'default': 'High quality professional photography, cinematic lighting, rich colors, 8K UHD quality, clean composition, NO TEXT NO WRITING NO LETTERS'
            };



            // ✅ [2026-01-29 100점] 애니메이션 스타일 - 표준 카테고리명 사용
            const animeCategoryStyles: Record<string, string> = {
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
                'default': 'beautiful anime illustration, high quality anime art, detailed scene, vibrant colors, NO TEXT NO WRITING NO LETTERS'
            };


            const isAnimeStyle = imageStyle === 'anime';
            const categoryStyles = isAnimeStyle ? animeCategoryStyles : realisticCategoryStyles;

            // ✅ [2026-02-12] 퍼지 카테고리 매칭 — 모듈 레벨 함수 사용 (getStyleGuideByCategory)

            const { styleGuide: categoryStyle, matchedKey: matchedCategoryKey } = getStyleGuideByCategory(item.category, categoryStyles);

            // ✅ [2026-02-12] 쇼핑커넥트 모드일 때 라이프스타일 스타일 강제 적용 (NanoBananaPro와 동일 전략)
            const styleGuide = isShoppingConnect ? DEEPINFRA_SHOPPING_CONNECT_LIFESTYLE : categoryStyle;
            const effectiveStyleSource = isShoppingConnect ? '쇼핑커넥트 라이프스타일' : matchedCategoryKey;
            console.log(`[DeepInfra] 🎨 이미지 스타일: category="${item.category || '(없음)'}" → matched="${effectiveStyleSource}"`);

            // ✅ 영문 프롬프트 우선 사용 (FLUX는 영어 프롬프트에 최적화)
            let basePrompt = item.englishPrompt || sanitizeImagePrompt(item.prompt || item.heading);

            // ✅ [2026-02-12] NO PEOPLE 카테고리에서 englishPrompt 인물 키워드 필터링
            // styleGuide에 NO PEOPLE이 있는데 basePrompt에 person/people/celebrity 등이 있으면 충돌 → 필터링
            const isNoPersonStyle = /NO PEOPLE|NO HANDS/i.test(styleGuide);
            if (isNoPersonStyle && /person|people|celebrity|human|checking phone|studying|exercising/i.test(basePrompt)) {
                const originalBasePrompt = basePrompt;
                basePrompt = `visual scene depicting: ${sanitizeImagePrompt(item.heading)}`;
                console.log(`[DeepInfra] ⚠️ NO PEOPLE 카테고리에서 인물 프롬프트 감지 → 재생성: "${originalBasePrompt.substring(0, 40)}..." → "${basePrompt.substring(0, 40)}..."`);
            }

            // ✅ [2026-01-30 FIX] 한글 감지 시 → 카테고리별 다른 처리!
            const hasKorean = /[가-힣]/.test(basePrompt);
            if (hasKorean && !item.englishPrompt) {
                // ✅ [핵심] 원본 한글 프롬프트 = 소제목 상황
                const koreanContext = sanitizeImagePrompt(item.heading || item.prompt || '');
                console.log(`[DeepInfra] ⚠️ 한글 프롬프트 감지 → 소제목 상황 반영: "${koreanContext.substring(0, 30)}..."`);

                // ✅ [2026-01-30] 인물 필수 카테고리 목록
                const personRequiredCategories = [
                    '스타 연예인', '스포츠', '패션 뷰티', '건강',
                    '교육/육아', '자기계발', '취미 라이프', '책 영화'
                ];
                // ✅ 인물 제외 카테고리 목록 (사물/풍경 중심)  
                const noPersonCategories = [
                    '요리 맛집', '여행', 'IT 테크', '제품 리뷰',
                    '리빙 인테리어', '반려동물', '자동차', '부동산',
                    '비즈니스 경제', '사회 정치', '공부', '생활 꿀팁'
                ];

                const category = item.category || 'default';
                // ✅ [2026-02-12] 퍼지 매칭으로 카테고리 판별 (includes → 부분 매칭)
                const isPersonRequired = personRequiredCategories.some(c =>
                    category.includes(c) || c.includes(category)
                );
                const isNoPersonCategory = noPersonCategories.some(c =>
                    category.includes(c) || c.includes(category)
                );

                // ✅ [2026-01-30 FIX] 다양한 카메라 앵글/구도 - 모든 카테고리에 적용
                const cameraAngles = [
                    'bird-eye view, overhead shot, looking down',
                    'low angle shot, looking up, dramatic perspective',
                    'wide shot, full scene visible, environmental',
                    'medium shot, waist up, natural framing',
                    'close-up shot, detailed focus, intimate',
                    'over-the-shoulder shot, POV perspective',
                    'dutch angle, tilted frame, dynamic tension',
                    'profile view, side angle, elegant composition',
                    'three-quarter view, natural pose',
                    'silhouette, backlit, atmospheric'
                ];
                const randomAngle = cameraAngles[Math.floor(Math.random() * cameraAngles.length)];

                if (imageStyle === 'anime') {
                    // 애니메이션 스타일 + 다양한 구도 + 원본 내용 반영
                    basePrompt = `${styleGuide}, ${randomAngle}, scene showing: ${koreanContext}, anime illustration, detailed background, vibrant colors, dynamic composition matching the headline`;
                } else if (isNoPersonCategory) {
                    // ✅ 인물 제외 카테고리: 다양한 앵글 + 사물/풍경/개념 중심 (NO PEOPLE)
                    basePrompt = `${styleGuide}, ${randomAngle}, visual scene depicting: ${koreanContext}, professional photography, cinematic composition, NO PEOPLE, focus on objects and environment matching the headline context`;
                } else if (isPersonRequired) {
                    // ✅ 인물 필수 카테고리: 다양한 구도의 한국인 장면
                    const dynamicPoses = [
                        'dynamic pose, action shot, in motion',
                        'candid moment, natural interaction, caught off-guard',
                        'environmental portrait, context visible, storytelling',
                        'medium shot showing activity, hands visible',
                        'full body shot in context, walking or moving',
                        'back view, looking away, mysterious',
                        'side profile, dramatic lighting',
                        'group interaction, multiple people'
                    ];
                    const randomPose = dynamicPoses[Math.floor(Math.random() * dynamicPoses.length)];
                    basePrompt = `${styleGuide}, ${randomAngle}, scene showing: ${koreanContext}, Korean person in context, ${randomPose}, authentic Asian features, professional photography, scene matching the headline situation, NOT front-facing portrait`;
                } else {
                    // ✅ 기본: 다양한 앵글 + 소제목 상황에 맞는 장면 (인물 선택적)
                    basePrompt = `${styleGuide}, ${randomAngle}, visual scene depicting: ${koreanContext}, professional photography, cinematic lighting, compelling composition matching the headline context`;
                }
            }

            // ✅ [2026-01-26] FLUX-2-dev용 8개 스타일별 프롬프트 조합
            let prompt = '';

            // ✅ [2026-02-08] 11가지 스타일별 베이스 프롬프트 (3카테고리)
            const styleBasePrompts: Record<string, string> = {
                // 📷 실사
                'realistic': 'RAW photo, hyperrealistic, 8k uhd, dslr, high quality, film grain, Fujifilm XT3',
                'bokeh': 'beautiful bokeh photography, shallow depth of field, dreamy out-of-focus lights, soft circular bokeh orbs, dslr wide aperture f1.4, romantic atmosphere, fairy lights',
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
                'isometric': 'isometric 3d illustration, isometric pixel world, 30 degree angle, clean geometric shapes, pastel colors, miniature scene, game perspective, detailed tiny world'
            };

            const selectedStyleBase = styleBasePrompts[imageStyle] || styleBasePrompts['realistic'];

            // ✅ [2026-01-26] 한국인 강조 프롬프트 (외국인 제외)
            const koreanOnlyPrompt = 'KOREAN person ONLY (NOT Western, NOT Caucasian, NOT European), authentic Korean facial features, Korean bone structure, Korean skin tone';

            // ✅ [2026-01-30 FIX v2] 썸네일 스타일 - 텍스트 유도 키워드 완전 제거
            // "news", "headline", "title", "caption" 같은 단어는 FLUX가 텍스트 생성을 유도함
            // 프롬프트 시작 부분에 NO TEXT 배치 (FLUX는 앞쪽 토큰에 더 집중)
            const noTextPrefix = 'IMPORTANT: Generate a CLEAN image with ABSOLUTELY NO TEXT, NO LETTERS, NO WORDS, NO WRITING, NO CAPTIONS, NO SUBTITLES, NO WATERMARKS.';
            const thumbnailStyle = 'professional photography, cinematic composition, clean background, high visual impact';

            // ✅ [2026-02-12] koreanOnlyPrompt는 인물 허용 카테고리에서만 사용
            // NO PEOPLE 카테고리에서 "KOREAN person ONLY"가 들어가면 모순 발생
            const personPrompt = isNoPersonStyle ? '' : koreanOnlyPrompt;

            // 스타일에 따른 프롬프트 조합
            if (imageStyle === 'realistic') {
                if (isThumbnail && postTitle) {
                    // ✅ [2026-01-30 FIX v2] NO TEXT를 프롬프트 맨 앞에 배치
                    prompt = `${noTextPrefix} ${selectedStyleBase}, ${personPrompt ? personPrompt + ', ' : ''}${thumbnailStyle}, ${styleGuide}, ${basePrompt}, cinematic lighting, shallow depth of field, varied composition, NOT strictly front-facing. REMINDER: ZERO TEXT ON IMAGE.`;
                } else {
                    // ✅ [2026-01-30 FIX] 본문 이미지: 다양한 장면 강조
                    prompt = `${noTextPrefix} ${selectedStyleBase}, ${personPrompt ? personPrompt + ', ' : ''}${styleGuide}, ${basePrompt}, ultra detailed, natural lighting, dynamic scene composition. NO TEXT.`;
                }
            } else {
                // 일러스트/애니메이션 스타일들
                if (isThumbnail && postTitle) {
                    prompt = `${noTextPrefix} masterpiece, best quality, ${selectedStyleBase}, ${basePrompt}, stunning visual, eye-catching composition, varied angles. CLEAN IMAGE ONLY.`;
                } else {
                    prompt = `${noTextPrefix} masterpiece, best quality, ${selectedStyleBase}, ${basePrompt}, beautiful scene, detailed artwork, dynamic framing.`;
                }
            }

            // ✅ [2026-01-27] 이미지 비율 설정 (config.json에서 - localStorage는 메인 프로세스에서 접근 불가)
            const imageRatio = (item as any).imageRatio || (config as any).imageRatio || '1:1';
            const sizeMap: Record<string, string> = {
                '1:1': '1024x1024',
                '16:9': '1344x768',
                '9:16': '768x1344',
                '4:3': '1152x896',
                '3:4': '896x1152'
            };
            const imageSize = sizeMap[imageRatio] || '1024x1024';

            console.log(`[DeepInfra] 📐 이미지 비율: ${imageRatio} → ${imageSize}`);

            // ✅ [2026-02-12] 재시도 루프 (NanoBananaPro와 동일 전략 — 최대 2회)
            const maxRetries = 2;
            let res: DeepInfraResult | null = null;

            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                let attemptPrompt = prompt;

                // ✅ 재시도 시 프롬프트 변형 (이미지 다양성 확보)
                if (attempt > 1) {
                    const randomVariation = VARIATION_STYLES[Math.floor(Math.random() * VARIATION_STYLES.length)];
                    attemptPrompt += ` [VARIATION: ${randomVariation}]`;
                    console.log(`[DeepInfra] 🔄 재시도 ${attempt}/${maxRetries}: ${randomVariation}`);
                }

                res = await generateSingleDeepInfraImage({
                    prompt: attemptPrompt,
                    size: imageSize,
                    n: 1,
                    model: actualModel
                }, apiKey);

                if (res.success && res.localPath) break; // 성공하면 루프 탈출

                if (attempt < maxRetries) {
                    console.log(`[DeepInfra] ⚠️ 시도 ${attempt} 실패, ${attempt + 1}번째 재시도...`);
                    await new Promise(resolve => setTimeout(resolve, 1000)); // 1초 대기
                }
            }

            if (!res) {
                console.error(`[DeepInfra] ❌ "${item.heading}" 모든 재시도 실패`);
                continue;
            }


            if (res.success && res.localPath) {
                let buffer: Buffer = fs.readFileSync(res.localPath);

                // ✅ [2026-01-30 100점] FLUX AI 생성 텍스트 완전 제거 - 하단 20% 크롭
                // FLUX 모델은 항상 이미지 하단에 텍스트를 넣으므로, 하단을 잘라내고 다시 리사이즈
                try {
                    const metadata = await sharp(buffer).metadata();
                    if (metadata.width && metadata.height) {
                        const cropHeight = Math.floor(metadata.height * 0.80); // 상단 80%만 유지
                        buffer = await sharp(buffer)
                            .extract({ left: 0, top: 0, width: metadata.width, height: cropHeight })
                            .resize(metadata.width, metadata.height, { fit: 'fill' }) // 원래 크기로 다시 리사이즈
                            .toBuffer();
                        console.log(`[DeepInfra] ✂️ 하단 텍스트 영역 크롭 완료 (${metadata.height} → ${cropHeight} → ${metadata.height})`);
                    }
                } catch (cropError) {
                    console.warn(`[DeepInfra] ⚠️ 크롭 실패, 원본 사용:`, cropError);
                }

                // ✅ [2026-01-30 FIX] 텍스트 오버레이 조건 수정:
                // - i === 0 (1번 이미지만)
                // - allowText === true (명시적으로 설정된 경우만)
                // - 나노바나나프로는 AI가 직접 텍스트 생성하므로 여기서는 DeepInfra만 해당
                const isFirstImage = i === 0;
                const explicitlyAllowText = (item as any).allowText === true;
                const shouldApplyTextOverlay = isFirstImage && explicitlyAllowText && postTitle;

                if (shouldApplyTextOverlay) {
                    console.log(`[DeepInfra] 📝 1번 이미지 텍스트 오버레이 적용 중...`);
                    try {
                        const overlayResult = await addThumbnailTextOverlay(buffer, postTitle);
                        if (overlayResult.success && overlayResult.outputBuffer) {
                            buffer = overlayResult.outputBuffer;
                            console.log(`[DeepInfra] ✅ 텍스트 오버레이 적용 완료: "${postTitle.substring(0, 30)}..."`);
                        } else {
                            console.warn(`[DeepInfra] ⚠️ 텍스트 오버레이 실패, 원본 이미지 사용`);
                        }
                    } catch (overlayError) {
                        console.warn(`[DeepInfra] ⚠️ 텍스트 오버레이 예외:`, overlayError);
                    }
                }

                const savedResult = await writeImageFile(buffer, 'png', item.heading, postTitle, postId);

                results.push({
                    heading: item.heading,
                    filePath: savedResult.savedToLocal || savedResult.filePath,
                    provider: 'deepinfra',
                    previewDataUrl: savedResult.previewDataUrl,
                    savedToLocal: savedResult.savedToLocal
                });

                // 임시 파일 정리
                try { fs.unlinkSync(res.localPath); } catch { }

                console.log(`[DeepInfra] ✅ [${i + 1}/${items.length}] "${item.heading}" 완료`);
            }
        } catch (error) {
            console.error(`[DeepInfra] ❌ "${item.heading}" 생성 실패:`, (error as Error).message);
        }
    }

    console.log(`[DeepInfra] ✅ 완료: ${results.length}/${items.length}개 성공`);
    return results;
}

/**
 * DeepInfra로 단일 이미지 생성 (핵심 로직)
 */
export async function generateSingleDeepInfraImage(
    options: DeepInfraGenerateOptions,
    apiKey: string
): Promise<DeepInfraResult> {
    try {
        // OpenAI 호환 API 호출 (공식 문서: https://deepinfra.com/black-forest-labs/FLUX-2-dev/api)
        const response = await axios.post(
            DEEPINFRA_API_URL,
            {
                prompt: options.prompt,
                size: options.size || '1024x1024',
                model: options.model || DEFAULT_DEEPINFRA_MODEL,
                n: options.n || 1
                // ✅ response_format 불필요 - API가 기본으로 b64_json 반환
            },
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                timeout: 120000, // 2분 타임아웃
            }
        );

        const data = response.data;

        if (!data.data || data.data.length === 0) {
            return { success: false, error: 'DeepInfra 응답에 이미지가 없습니다.' };
        }

        // base64 이미지 데이터 추출 (공식 응답 형식: { data: [{ b64_json: "..." }] })
        const imageData = data.data[0].b64_json;

        if (!imageData) {
            return { success: false, error: 'DeepInfra 응답에 b64_json이 없습니다.' };
        }

        // Base64 → 파일 저장
        const buffer = Buffer.from(imageData, 'base64');
        const filename = `deepinfra_${Date.now()}.png`;
        const localPath = path.join(app.getPath('temp'), filename);

        fs.writeFileSync(localPath, buffer);

        return {
            success: true,
            imageData,
            localPath,
        };

    } catch (error: any) {
        const msg = error.response?.data?.error?.message ||
            error.response?.data?.detail ||
            error.message ||
            'DeepInfra API Error';
        console.error('[DeepInfra] 오류 발생:', msg);
        return { success: false, error: msg };
    }
}

/**
 * DeepInfra API 테스트
 */
export async function testDeepInfra(): Promise<{ success: boolean; message: string }> {
    try {
        const config = await loadConfig();
        const apiKey = (config as any).deepinfraApiKey?.trim();
        if (!apiKey) return { success: false, message: 'DeepInfra API 키가 없습니다.' };

        const result = await generateSingleDeepInfraImage({
            prompt: 'A cute robot artist painting a landscape, 4k, digital art',
            size: '512x512', // 테스트용 작은 사이즈
        }, apiKey);

        if (result.success) {
            // 테스트 파일 정리
            if (result.localPath) {
                try { fs.unlinkSync(result.localPath); } catch { }
            }
            return { success: true, message: '✅ DeepInfra FLUX-2-dev 테스트 성공!' };
        } else {
            return { success: false, message: result.error || '실패' };
        }
    } catch (error: any) {
        return { success: false, message: `오류: ${error.message}` };
    }
}

/**
 * ✅ [2026-01-28] FLUX Redux img2img 생성
 * - 참조 이미지 URL을 기반으로 이미지 변형 생성
 * - URL 크롤링에서 수집된 이미지를 활용 가능
 */
export async function generateDeepInfraImg2Img(
    referenceImageUrl: string,
    prompt: string,
    apiKey: string,
    options: {
        width?: number;
        height?: number;
        guidanceScale?: number;
        numInferenceSteps?: number;
    } = {}
): Promise<DeepInfraResult> {
    try {
        console.log(`[DeepInfra Redux] 🎨 img2img 생성 시작: ${referenceImageUrl.substring(0, 50)}...`);
        console.log(`[DeepInfra Redux] 📝 프롬프트: ${prompt.substring(0, 100)}...`);

        // 1. 참조 이미지 다운로드 및 base64 변환
        let imageBase64: string;

        if (referenceImageUrl.startsWith('data:')) {
            // 이미 base64인 경우
            imageBase64 = referenceImageUrl.split(',')[1] || referenceImageUrl;
        } else {
            // URL에서 다운로드
            console.log('[DeepInfra Redux] 📥 참조 이미지 다운로드 중...');
            const response = await axios.get(referenceImageUrl, {
                responseType: 'arraybuffer',
                timeout: 30000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'image/*',
                }
            });
            imageBase64 = Buffer.from(response.data).toString('base64');
            console.log(`[DeepInfra Redux] ✅ 이미지 다운로드 완료 (${Math.round(imageBase64.length / 1024)}KB)`);
        }

        // 2. FLUX Redux API 호출
        const {
            width = 1024,
            height = 1024,
            guidanceScale = 7.5,
            numInferenceSteps = 25
        } = options;

        console.log(`[DeepInfra Redux] 📡 API 호출 중... (${width}x${height}, guidance: ${guidanceScale})`);

        const response = await axios.post(
            DEEPINFRA_REDUX_API_URL,
            {
                image: imageBase64,
                prompt: prompt,
                width: width,
                height: height,
                guidance_scale: guidanceScale,
                num_inference_steps: numInferenceSteps,
                num_images: 1
            },
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                timeout: 120000,
            }
        );

        const data = response.data;

        // 응답에서 이미지 추출
        let outputImageBase64 = '';

        if (data.images && data.images.length > 0) {
            // 응답 형식 1: { images: [base64...] }
            outputImageBase64 = data.images[0];
        } else if (data.output && data.output.length > 0) {
            // 응답 형식 2: { output: [base64...] }
            outputImageBase64 = data.output[0];
        } else if (data.image) {
            // 응답 형식 3: { image: base64 }
            outputImageBase64 = data.image;
        } else {
            console.error('[DeepInfra Redux] ❌ 응답에서 이미지를 찾을 수 없습니다:', Object.keys(data));
            return { success: false, error: 'FLUX Redux 응답에 이미지가 없습니다.' };
        }

        // 3. 결과 저장
        const buffer = Buffer.from(outputImageBase64, 'base64');
        const filename = `deepinfra_redux_${Date.now()}.png`;
        const localPath = path.join(app.getPath('temp'), filename);
        fs.writeFileSync(localPath, buffer);

        console.log(`[DeepInfra Redux] ✅ img2img 생성 완료! ${localPath}`);

        return {
            success: true,
            imageData: outputImageBase64,
            localPath,
        };

    } catch (error: any) {
        const msg = error.response?.data?.error?.message ||
            error.response?.data?.detail ||
            error.message ||
            'DeepInfra Redux API Error';
        console.error('[DeepInfra Redux] ❌ img2img 오류:', msg);
        return { success: false, error: msg };
    }
}

/**
 * ✅ [2026-01-28] 참조 이미지가 있으면 img2img, 없으면 text-to-image
 * - 크롤링에서 수집된 이미지를 자동으로 활용
 */
export async function generateDeepInfraWithReference(
    item: ImageRequestItem,
    apiKey: string,
    postTitle?: string,
    postId?: string
): Promise<GeneratedImage | null> {
    const referenceUrl = item.referenceImageUrl;

    // 참조 이미지가 있으면 img2img 사용
    if (referenceUrl) {
        console.log(`[DeepInfra] 🖼️ 참조 이미지 감지 → img2img 모드 사용`);

        // ✅ [2026-01-30 FIX] 프롬프트에 다양한 구도 지시 추가 + 참조 이미지 맥락 활용
        const basePrompt = item.englishPrompt || sanitizeImagePrompt(item.prompt || item.heading);
        const diversityPrompt = `${basePrompt}, inspired by reference image context and style, varied camera angle, NOT front-facing portrait, dynamic composition, situational scene matching the headline`;

        const result = await generateDeepInfraImg2Img(
            referenceUrl,
            diversityPrompt,
            apiKey,
            {
                width: 1024,
                height: 1024,
                guidanceScale: 3.5, // ✅ [2026-01-30 FIX] 더 낮춰서 참조 이미지 영향력 강화
                numInferenceSteps: 30 // ✅ 품질 향상을 위해 스텝 증가
            }
        );

        if (result.success && result.localPath) {
            const buffer = fs.readFileSync(result.localPath);
            const savedResult = await writeImageFile(buffer, 'png', item.heading, postTitle, postId);

            // 임시 파일 정리
            try { fs.unlinkSync(result.localPath); } catch { }

            return {
                heading: item.heading,
                filePath: savedResult.savedToLocal || savedResult.filePath,
                provider: 'deepinfra',
                previewDataUrl: savedResult.previewDataUrl,
                savedToLocal: savedResult.savedToLocal
            };
        } else {
            console.warn(`[DeepInfra] ⚠️ img2img 실패, text-to-image로 폴백: ${result.error}`);
            // img2img 실패 시 null 반환 → 호출자가 기존 로직 사용
            return null;
        }
    }

    return null; // 참조 이미지 없음 → 기존 text-to-image 사용
}
