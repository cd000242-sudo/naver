/**
 * PromptBuilder - 이미지 생성 프롬프트 빌더 모듈
 * 프롬프트 생성 로직을 완벽하게 모듈화
 * 
 * ✅ [2026-02-24] 100점 리팩토링:
 *   - 모든 프롬프트를 "긍정 지시 우선" 구조로 전환
 *   - heading/subject를 최상단 배치 (AI 가중치 극대화)
 *   - 부정 지시(NO X) 최소화 → 긍정 대체어로 변환
 *   - 자기모순 제거 (텍스트 크기 지시 통일)
 *   - 4지선다 옵션 제거 (이미지 AI는 reasoning 불가)
 *   - 프롬프트 길이 50% 이상 축소 (핵심 농도 향상)
 * 
 * ✅ [2026-03-01] AI 추론 기반 리팩토링:
 *   - categoryStyle을 하드코딩 스타일이 아닌 AI 추론 지시로 전환
 *   - personRule 추가: 인물 규칙 (한국인 하드코딩)
 *   - STYLE: 지시 제거 → REASONING: 지시로 대체 (AI가 주제에서 추론)
 *   - 쇼핑커넥트만 전용 스타일 유지
 */

import { ImageRequestItem } from './types.js';
import { sanitizeImagePrompt } from './imageUtils.js';

export interface PromptOptions {
    isThumbnail: boolean;
    postTitle?: string;
    categoryStyle: string; // 쇼핑커넥트 전용 스타일 또는 빈 문자열 (AI 추론 시)
    personRule?: string; // ✅ [2026-03-01] 인물 규칙 (한국인 하드코딩)
    isShoppingConnect?: boolean;
    hasCollectedImages?: boolean; // ✅ 추가: collectedImages가 있을 때 참조 이미지 모드 활성화
    provider?: string; // ✅ [2026-01-30] 이미지 생성 provider: 'nano-banana-pro' | 'deepinfra' | 'fal' | 'stability'
    imageStyle?: string; // ✅ [2026-03-01] 적용할 이미지 스타일
    stylePrompt?: string; // ✅ [2026-03-01] 스타일 상세 프롬프트
}

export class PromptBuilder {
    /**
     * 최적의 이미지 생성 프롬프트를 조립합니다.
     */
    static build(item: ImageRequestItem, options: PromptOptions): string {
        const { isThumbnail, postTitle, categoryStyle, isShoppingConnect, imageStyle, stylePrompt } = options;
        const personRule = options.personRule || '';

        // 1. 기본 프롬프트 및 레퍼런스 체크
        const basePrompt = item.englishPrompt || sanitizeImagePrompt(item.prompt || item.heading || 'Abstract Image');
        const allowText = !!(item as any).allowText;

        // ✅ [수정] collectedImages가 있을 때도 참조 이미지 모드 활성화
        const hasReference = (() => {
            const p = String((item as any).referenceImagePath || '').trim();
            const u = String((item as any).referenceImageUrl || '').trim();
            return !!p || !!u || options.hasCollectedImages === true;
        })();

        // 2. 레퍼런스 잠금(Lock) 문구 생성
        const referenceLock = hasReference
            ? `REFERENCE: Keep the exact same product identity from the provided reference image. Match model, colors, shape, logos, and proportions precisely.`
            : '';

        // 3. 쇼핑 커넥트 모드 강화
        const referenceStrictness = isShoppingConnect
            ? `PRODUCT IDENTITY: Use the provided reference image as the source. Keep the product exactly as-is — same colors, logos, shape, material.`
            : '';

        // 4. 상황별 프롬프트 분기

        // [Case A-1] ✅ 쇼핑커넥트 썸네일 (제품 이미지 유지 + 텍스트 오버레이)
        if (isThumbnail && postTitle && allowText && isShoppingConnect && options.hasCollectedImages) {
            return this.buildShoppingConnectThumbnailPrompt(basePrompt, postTitle, categoryStyle, referenceLock, imageStyle, stylePrompt);
        }

        // [Case A-2] 일반 썸네일 - provider별 분기 처리
        if (isThumbnail && postTitle && allowText) {
            if (options.provider === 'nano-banana-pro') {
                console.log('[PromptBuilder] 🍌 나노바나나프로: AI가 직접 한글 텍스트 생성');
                return this.buildThumbnailWithTextPrompt(basePrompt, postTitle, personRule, referenceStrictness, referenceLock, imageStyle, stylePrompt);
            }
            console.log(`[PromptBuilder] 🖼️ ${options.provider || 'unknown'}: NO TEXT 프롬프트 (후처리 오버레이)`);
            return this.buildThumbnailNoTextPrompt(basePrompt, personRule, referenceLock, imageStyle, stylePrompt);
        }

        // [Case B] 썸네일 (텍스트 없음) - 시각적 임팩트 강조
        if (isThumbnail && postTitle) {
            return this.buildThumbnailNoTextPrompt(basePrompt, personRule, referenceLock, imageStyle, stylePrompt);
        }

        // [Case C] 인포그래픽/상세페이지 (텍스트 허용)
        if (allowText) {
            return this.buildInfographicPrompt(basePrompt, item.heading, referenceLock, imageStyle, stylePrompt);
        }

        // ✅ [Case D-1] 쇼핑커넥트 라이프스타일 이미지
        if (isShoppingConnect && options.hasCollectedImages) {
            return this.buildShoppingLifestylePrompt(basePrompt, item.heading, categoryStyle, referenceLock, imageStyle, stylePrompt);
        }

        // [Case D-2] 기본 소제목용 이미지
        return this.buildSectionImagePrompt(basePrompt, item.heading, personRule, referenceLock, imageStyle, stylePrompt);
    }

    /**
     * [Case A] 썸네일 + 텍스트 포함 (네이버 홈판 최적화)
     * ✅ [2026-03-01] AI 추론 기반: STYLE 제거 → AI가 주제에서 비주얼 추론
     */
    private static buildThumbnailWithTextPrompt(
        basePrompt: string,
        postTitle: string,
        personRule: string,
        referenceStrictness: string,
        referenceLock: string,
        imageStyle?: string,
        stylePrompt?: string
    ): string {
        const fullTitle = String(postTitle || '').trim();
        const isRealistic = !imageStyle || imageStyle === 'realistic';
        const styleInstruction = isRealistic
            ? 'Magazine editorial quality, high contrast, vibrant colors, dynamic composition.'
            : `ART STYLE: Render this scene in ${imageStyle}. ${stylePrompt}`;

        // ✅ [2026-03-12 FIX v2] 프롬프트 전면 개선
        // - 제목을 TOPIC으로 1회 포함 → 이미지 관련성 보장
        // - TEXT OVERLAY 섹션에서만 렌더링 지시 → 중복 방지
        // - 한글 텍스트 품질 향상: 간격·크기·배치 상세 지시
        return `Create a Naver blog thumbnail about: "${fullTitle}"

VISUAL SUBJECT: ${basePrompt}
${referenceStrictness}
${referenceLock}
${personRule ? `PERSON: ${personRule}` : ''}

COMPOSITION:
- Hero subject fills 60-70% of the frame, crystal clear.
- ${styleInstruction}
- Leave clean space in the lower 30% of image for text placement.

KOREAN TEXT OVERLAY (⚠️ CRITICAL RULES):
- Render EXACTLY this Korean text ONCE: "${fullTitle}"
- Place in the BOTTOM CENTER of the image.
- Use BOLD sans-serif font, 36-48px equivalent size.
- Split into 2 lines maximum if the title is long. Each line should be well-balanced in length.
- Letter spacing must be generous (not cramped). Each character must be clearly separated.
- Add a semi-transparent dark gradient behind the text for readability.
- ⚠️ DO NOT render the title text more than once. DO NOT place text in multiple locations.
- ⚠️ DO NOT overlap characters. Ensure clear spacing between every Korean character.

No other text or watermark may appear.`;
    }

    /**
     * [Case A-1] 쇼핑커넥트 썸네일 (제품 이미지 유지 + 텍스트 오버레이)
     * ✅ 쇼핑커넥트는 전용 스타일 유지 (비즈니스 요구사항)
     */
    private static buildShoppingConnectThumbnailPrompt(
        basePrompt: string,
        postTitle: string,
        categoryStyle: string,
        referenceLock: string,
        imageStyle?: string,
        stylePrompt?: string
    ): string {
        const fullTitle = String(postTitle || '').trim();
        const isRealistic = !imageStyle || imageStyle === 'realistic';
        const styleInstruction = isRealistic
            ? 'Clean product photography, e-commerce ready, 1:1 square'
            : `ART STYLE: ${stylePrompt}`;

        return `SHOPPING THUMBNAIL: Keep the reference product image exactly as-is, add title text overlay only.

${referenceLock}

PRODUCT PRESERVATION (CRITICAL):
- The reference product image IS the hero visual. Keep it 100% intact.
- Product occupies 60-70% of the frame, fully visible and unobstructed.

TEXT OVERLAY:
- Add "${fullTitle}" in bold Korean typography over the lower-center area (bottom 40%).
- High contrast text (white with shadow, or dark with glow). Maximum 2 lines.
- Text must not obscure the product.

STYLE: ${categoryStyle}, ${styleInstruction}.
CONTEXT: ${basePrompt}

Only "${fullTitle}" may appear as text.`;
    }

    /**
     * [Case B] 썸네일 + 텍스트 없음 (시각적 임팩트 강조)
     * ✅ [2026-03-01] AI 추론 기반: STYLE 제거 → AI가 주제에서 비주얼 추론
     */
    private static buildThumbnailNoTextPrompt(
        basePrompt: string,
        personRule: string,
        referenceLock: string,
        imageStyle?: string,
        stylePrompt?: string
    ): string {
        const isRealistic = !imageStyle || imageStyle === 'realistic';
        const styleInstruction = isRealistic
            ? 'Professional magazine cover quality. High contrast, vibrant colors, artistic lighting.'
            : `ART STYLE: Render this scene in ${imageStyle} style. ${stylePrompt}`;

        return `${basePrompt} — Premium cinematic blog thumbnail, text-free.

REASONING: Analyze the topic and infer the best style, lighting, and composition.
${personRule ? `PERSON RULE: ${personRule}` : ''}
${referenceLock}

${styleInstruction}
Single cohesive image with the subject prominently centered.
Pure visual — absolutely no text, letters, or watermarks.`;
    }

    /**
     * [Case C] 인포그래픽/상세페이지 (텍스트 허용)
     */
    private static buildInfographicPrompt(
        basePrompt: string,
        heading: string,
        referenceLock: string,
        imageStyle?: string,
        stylePrompt?: string
    ): string {
        const isRealistic = !imageStyle || imageStyle === 'realistic';
        const styleInstruction = isRealistic
            ? 'High-end commercial photography + modern infographic design, sharp and print-ready.'
            : `ART STYLE: Render this scene in ${imageStyle} style. ${stylePrompt}`;

        return `"${heading}" — Korean e-commerce product detail infographic.

PRODUCT: ${basePrompt}
${referenceLock}

LAYOUT:
- Clean white background, product centered prominently.
- 3-6 feature callouts with simple icons around the product.
- Accurate, natural Korean text labels for each feature (3-10 words each).
- Modern grid layout, balanced spacing, professional typography.
- Include a small spec box with key numbers/units if appropriate.

QUALITY: ${styleInstruction}`;
    }

    /**
     * [Case D] 기본 소제목용 이미지 (텍스트 절대 금지)
     * ✅ [2026-03-01] AI 추론 기반 리팩토링:
     *   - STYLE: 하드코딩 제거 → REASONING: AI가 주제에서 비주얼 추론
     *   - personRule 파라미터로 인물 규칙 분리 (한국인 하드코딩)
     */
    private static buildSectionImagePrompt(
        basePrompt: string,
        heading: string,
        personRule: string,
        referenceLock: string,
        imageStyle?: string,
        stylePrompt?: string
    ): string {
        // ✅ [2026-02-24] heading에 영어 번역(basePrompt)과 한국어 원본 모두 전달
        const headingContext = heading && heading !== basePrompt
            ? `TOPIC: "${heading}" (Korean original) = ${basePrompt}`
            : basePrompt;

        const isRealistic = !imageStyle || imageStyle === 'realistic';
        const imageType = isRealistic ? 'photorealistic image' : `${imageStyle} style image`;
        const styleInstruction = isRealistic
            ? 'Hyper-realistic photography, 8K, professional lighting, modern Korean setting.\nDiverse visual approach: product shots, flat lays, environmental scenes, close-ups, overhead angles.'
            : `ART STYLE: Render this scene in ${imageStyle} style. ${stylePrompt}`;

        return `"${heading}" — Generate a ${imageType} that EXACTLY visualizes this specific topic.

${headingContext}

${referenceLock}

REASONING: Analyze the topic "${heading}" and infer the most appropriate color palette, lighting, and composition. Do NOT rely on generic templates — create a unique scene tailored to this specific subject.
PERSON RULE: ${personRule}

${styleInstruction}
Pure visual — no text, letters, or watermarks.`;
    }

    /**
     * [Case D-1] 쇼핑커넥트 라이프스타일 이미지 (제품 이미지 기반 변환)
     * ✅ 쇼핑커넥트는 전용 스타일 유지 (비즈니스 요구사항)
     */
    private static buildShoppingLifestylePrompt(
        basePrompt: string,
        heading: string,
        categoryStyle: string,
        referenceLock: string,
        imageStyle?: string,
        stylePrompt?: string
    ): string {
        const isRealistic = !imageStyle || imageStyle === 'realistic';
        const styleInstruction = isRealistic
            ? 'Samsung/LG advertisement level. Hyper-realistic commercial photography, 8K detail, K-style aesthetic.'
            : `ART STYLE: Render this scene in ${imageStyle} style. ${stylePrompt}`;

        return `"${heading}" — Premium lifestyle photo featuring the EXACT product from the reference image.

${referenceLock}

PRODUCT IDENTITY (CRITICAL):
Use the exact product from the reference image. Same shape, color, material, size, logos, branding. The product in your output must be visually identical to the reference.

LIFESTYLE TRANSFORMATION:
- Place the exact reference product in a premium, aspirational Korean lifestyle setting.
- Choose a setting that naturally matches this product's category and "${heading}".
- Product occupies 30-50% of the frame, shown being used or beautifully displayed.
- Warm, natural lighting (golden hour, soft window light). Subtle luxury elements (marble, plants, soft textiles).
- ${categoryStyle}

EMOTIONAL GOAL: "I want this in MY life" — purchase desire through visual aspiration.

QUALITY: ${styleInstruction}
Pure visual — no text, letters, or watermarks.`;
    }
}
