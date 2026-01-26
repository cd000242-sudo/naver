/**
 * PromptBuilder - 이미지 생성 프롬프트 빌더 모듈
 * 프롬프트 생성 로직을 완벽하게 모듈화
 */

import { ImageRequestItem } from './types.js';
import { sanitizeImagePrompt } from './imageUtils.js';

export interface PromptOptions {
    isThumbnail: boolean;
    postTitle?: string;
    categoryStyle: string;
    isShoppingConnect?: boolean;
    hasCollectedImages?: boolean; // ✅ 추가: collectedImages가 있을 때 참조 이미지 모드 활성화
}

export class PromptBuilder {
    /**
     * 최적의 이미지 생성 프롬프트를 조립합니다.
     */
    static build(item: ImageRequestItem, options: PromptOptions): string {
        const { isThumbnail, postTitle, categoryStyle, isShoppingConnect } = options;

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
            ? `
REFERENCE IMAGE RULES (CRITICAL):
- A reference product image is provided. You MUST keep the exact same product identity.
- Do NOT change product model/variant, packaging design, colors, shapes, logo/brand marks, materials, or proportions.
- Do NOT replace it with a different similar-looking product. Match the reference as closely as possible.
- Keep the same product category and key visual details.
`
            : '';

        // 3. 쇼핑 커넥트 모드 엄격성 강화
        const referenceStrictness = isShoppingConnect
            ? `
⚠️ ABSOLUTE PRODUCT IDENTITY (CRITICAL FOR SHOPPING CONNECT):
- YOU MUST USE THE PROVIDED REFERENCE IMAGE AS THE SOURCE.
- KEEP THE PRODUCT EXACTLY AS IT IS. DO NOT CHANGE COLORS, LOGOS, OR SHAPES.
- Match the product appearance precisely. No generic versions.`
            : '';

        // 4. 상황별 프롬프트 분기 (Thumbnail vs Infographic vs Section)

        // [Case A-1] ✅ 쇼핑커넥트 썸네일 (제품 이미지 유지 + 텍스트 오버레이)
        if (isThumbnail && postTitle && allowText && isShoppingConnect && options.hasCollectedImages) {
            return this.buildShoppingConnectThumbnailPrompt(basePrompt, postTitle, categoryStyle, referenceLock);
        }

        // [Case A-2] 일반 썸네일 (텍스트 포함) - 네이버 홈판 최적화
        if (isThumbnail && postTitle && allowText) {
            return this.buildThumbnailWithTextPrompt(basePrompt, postTitle, categoryStyle, referenceStrictness, referenceLock);
        }

        // [Case B] 썸네일 (텍스트 없음) - 시각적 임팩트 강조
        if (isThumbnail && postTitle) {
            return this.buildThumbnailNoTextPrompt(basePrompt, categoryStyle, referenceLock);
        }

        // [Case C] 인포그래픽/상세페이지 (텍스트 허용)
        if (allowText) {
            return this.buildInfographicPrompt(basePrompt, item.heading, referenceLock);
        }

        // ✅ [Case D-1] 쇼핑커넥트 라이프스타일 이미지 (제품 이미지 기반 변환) - 100점짜리 구매욕구 자극
        if (isShoppingConnect && options.hasCollectedImages) {
            return this.buildShoppingLifestylePrompt(basePrompt, item.heading, categoryStyle, referenceLock);
        }

        // [Case D-2] 기본 소제목용 이미지 (텍스트 절대 금지)
        return this.buildSectionImagePrompt(basePrompt, item.heading, categoryStyle, referenceLock);
    }

    /**
     * [Case A] 썸네일 + 텍스트 포함 (네이버 홈판 최적화)
     */
    private static buildThumbnailWithTextPrompt(
        basePrompt: string,
        postTitle: string,
        categoryStyle: string,
        referenceStrictness: string,
        referenceLock: string
    ): string {
        const fullTitle = String(postTitle || '').trim();
        return `Generate a 100-point MASTERPIECE blog thumbnail that PERFECTLY MATCHES the title: "${fullTitle}".
Topic: ${basePrompt}.
Aesthetic: Naver Homefeed Premium Style - high contrast, dynamic and energetic composition, vibrant colors, professional magazine quality.
Category Style: ${categoryStyle}

DESIGN REQUIREMENTS (NAVER HOMEFEED QUALITY):
- Use BOLD, LARGE, and impactful typography for the title text overlay: "${fullTitle}".
- Text must be CLEARLY VISIBLE and PROMINENT (use 48-64px equivalent font size for maximum readability).
- THE TEXT SHOULD BE THE MAIN VISUAL ELEMENT. Make it BIG and BOLD. MAX 2 lines of text.
- Use LARGE font sizes (around 48-64px equivalent) to ensure text is easily readable even on mobile.
${referenceStrictness}


⚠️ CRITICAL TEXT PLACEMENT (ANTI-CROP SAFE ZONE FOR 1:1 RATIO):
- ALL TEXT MUST be placed WITHIN THE CENTER 50% OF THE IMAGE (both width AND height).
- NEVER place text near ANY EDGES. Leave at least 25% margin from ALL four sides.
- Text should be placed in the LOWER-CENTER portion of the image (bottom 40% to 60% area).
- Keep text in a SINGLE LINE or TWO SHORT LINES at most.
- Use COMPACT text that fits within 60% of the image width.
- TEXT MUST NOT EXTEND beyond the central safe zone.

- Ensure high contrast between text and background using subtle shadows or glowing effects, but keep it elegant and professional.

COMPOSITION & SUBJECT (CRITICAL FOR CTR):
- The main subject (Hero Subject) must be CRYSTAL CLEAR and UNINTERRUPTED by text.
- SQUARE 1:1 composition (1024x1024) - CRITICAL!
- The PRODUCT/SUBJECT should occupy at least 60-70% of the visual space.
- DYNAMIC & ENERGETIC composition (Avoid static or boring angles).
- SINGLE COHESIVE IMAGE (NO collages, NO split-screen).
- Place the main subject prominently in the center for mobile cropping.

${referenceLock}

⛔ ABSOLUTELY FORBIDDEN ELEMENTS (VIOLATION = 0 POINTS):
- NO badges, labels, tags, ribbons, stamps, or stickers (especially in corners).
- NO "리뷰" (Review) marks, stars, ratings, or any review indicators.
- NO "SHOPPING CONNECT", "SHOPPING CONNECT REVIEW", "SC", or any English promotional phrases.
- NO "후기" (Review), "체험단" (Experience Group), or any Korean promotional texts.
- NO watermarks, logos, trademarks, or brand marks that are NOT part of the product.
- NO promotional overlays like "EVENT", "SALE", "NEW", "HOT", "BEST", etc.
- The ONLY text allowed is the title: "${fullTitle}".

ABSOLUTE REQUIREMENTS:
- TOP-TIER professional photography/digital art style (Magazine Editorial Quality).
- The resulting image must be visually stunning, unique, and viral-ready.
- The text must feel like a SMALL SUBTITLE, not a headline. Keep it DISCREET.
- PERFECT RELEVANCE between the visual subject and the title text.`;
    }

    /**
     * ✅ [Case A-1] 쇼핑커넥트 썸네일 (제품 이미지 유지 + 텍스트 오버레이)
     * 수집된 제품 이미지를 그대로 사용하면서 타이틀 텍스트만 오버레이
     */
    private static buildShoppingConnectThumbnailPrompt(
        basePrompt: string,
        postTitle: string,
        categoryStyle: string,
        referenceLock: string
    ): string {
        const fullTitle = String(postTitle || '').trim();
        return `🛒 SHOPPING CONNECT THUMBNAIL: PRODUCT IMAGE WITH TEXT OVERLAY

⛔⛔⛔ ABSOLUTE CRITICAL RULE ⛔⛔⛔
YOU ARE GIVEN A REFERENCE PRODUCT IMAGE.
YOUR TASK IS TO KEEP THIS EXACT PRODUCT IMAGE AND ONLY ADD TEXT OVERLAY.

🚫 WHAT YOU MUST NOT DO:
- DO NOT CREATE A NEW BACKGROUND
- DO NOT REPLACE THE PRODUCT WITH ANYTHING ELSE
- DO NOT CREATE A "LIFESTYLE" OR "ARTISTIC" VERSION
- DO NOT USE GRADIENTS, ABSTRACT BACKGROUNDS, OR SOLID COLORS AS THE MAIN VISUAL
- DO NOT CHANGE THE PRODUCT IN ANY WAY

✅ WHAT YOU MUST DO:
1. USE THE REFERENCE PRODUCT IMAGE AS-IS (keep the product, keep the original background if present)
2. ADD TEXT OVERLAY: "${fullTitle}"
3. The product must REMAIN CLEARLY VISIBLE and be the HERO of the image

${referenceLock}

CONTEXT: ${basePrompt}
CATEGORY: ${categoryStyle}

TEXT OVERLAY REQUIREMENTS:
- Add the title text: "${fullTitle}" in BOLD, LARGE typography
- Place text in LOWER-CENTER portion of the image (bottom 40% area)
- Use high contrast (white text with dark shadow, or dark text with light glow)
- Text must NOT obscure the main product - product remains 100% visible
- Keep text within the CENTER 60% of image width (avoid edge cropping)
- MAX 2 lines of text

COMPOSITION:
- The PRODUCT from reference image = 60-70% of visual space
- Text overlay = 30-40% (lower portion)
- Product should remain unobstructed and clearly identifiable
- SQUARE 1:1 composition (1024x1024)

STYLE:
- Clean, professional product photography style
- Soft, neutral background if needed (NOT gradient, NOT abstract art)
- Product-focused, e-commerce ready look
- Samsung/LG advertisement quality

⛔ FORBIDDEN ELEMENTS:
- NO badges, labels, ribbons, stamps, or stickers
- NO "리뷰", "SHOPPING CONNECT REVIEW", "SC", "후기" text
- NO promotional overlays (EVENT, SALE, NEW, HOT, BEST)
- The ONLY text allowed is the title: "${fullTitle}"

⚠️ FINAL CHECK: Your output MUST contain the EXACT PRODUCT from the reference image. If the product is not visible or has been replaced, you have FAILED.`;
    }

    /**
     * [Case B] 썸네일 + 텍스트 없음 (시각적 임팩트 강조)
        */
    private static buildThumbnailNoTextPrompt(
        basePrompt: string,
        categoryStyle: string,
        referenceLock: string
    ): string {
        return `Generate a premium, high-impact cinematic blog thumbnail without any text.
Topic: ${basePrompt}.
Aesthetic: Professional magazine cover style, high contrast, vibrant colors, artistic composition.
Category Style: ${categoryStyle}

REQUIREMENTS:
- SINGLE COHESIVE IMAGE (NO collages, NO split-screen).
- Place the main subject prominently.
- Cinematic lighting, professional photography.
- ABSOLUTELY NO TEXT, NO letters, NO words.

${referenceLock}`;
    }

    /**
     * [Case C] 인포그래픽/상세페이지 (텍스트 허용)
     */
    private static buildInfographicPrompt(
        basePrompt: string,
        heading: string,
        referenceLock: string
    ): string {
        return `Create a Korean e-commerce product detail page infographic image.

MAIN SUBJECT: "${basePrompt}"
PRODUCT NAME/CONTEXT: "${heading}"

${referenceLock}

LAYOUT REQUIREMENTS:
- Clean white or very light background
- Center the product prominently (photorealistic product rendering)
- Add 3-6 feature callouts with simple icons
- Add short, readable Korean text phrases (not gibberish)
- Use neat grid layout, modern typography, and balanced spacing
- Include a small "spec" box area (simple numbers/units) if appropriate

QUALITY:
- High-end commercial product photography + modern infographic design
- Sharp, clean, print-ready look

TEXT REQUIREMENTS:
- Korean language only
- Keep phrases short and clear (e.g., 3~10 words)
- No watermark

ABSOLUTE REQUIREMENTS:
- The resulting image must be unique and not similar to any other image in this batch.`;
    }

    /**
     * [Case D] 기본 소제목용 이미지 (텍스트 절대 금지)
     */
    private static buildSectionImagePrompt(
        basePrompt: string,
        heading: string,
        categoryStyle: string,
        referenceLock: string
    ): string {
        return `Generate a photorealistic image for a Korean blog section.
The image MUST look like a real photo taken in South Korea with Korean people.

SPECIFIC SUBJECT: "${heading}"
CONTEXT: This is about "${basePrompt}" - create a visually compelling scene that directly represents this specific topic.

${referenceLock}

STYLE REQUIREMENTS:
- ${categoryStyle}
- HYPER-REALISTIC PHOTOGRAPHY, 8K resolution, stunning detail.
- If people are present, they MUST be KOREAN with authentic K-style features.
- If indoor/outdoor settings are shown, they MUST reflect modern South Korean environment.
- High-end commercial photography, professional lighting.
- Emotional and impactful composition.

ABSOLUTE REQUIREMENTS:
- NEVER TEXT. This MUST be a pure photograph with NO TEXT whatsoever.
- NO letters, NO words, NO numbers, NO symbols, NO signs, NO labels, NO banners, NO watermarks.
- Pure visual storytelling only.
- If the subject is a product, focus on a "Desirable Lifestyle" composition that evokes positive emotions and a "Premium First-Class" feel (Conversion-Optimized).

- The resulting image must be unique and not similar to any other image in this batch.

Create a stunning, text-free, hyper-realistic Korean-style image that captures the essence of "${heading}".`;
    }

    /**
     * ✅ [Case D-1] 쇼핑커넥트 라이프스타일 이미지 (제품 이미지 기반 변환)
     * 100점짜리 구매욕구를 자극하는 프리미엄 라이프스타일 이미지 생성
     * ✅ [2026-01-23 FIX] 참조 이미지 준수 강화 - AI가 다른 제품으로 생성하는 문제 해결
     */
    private static buildShoppingLifestylePrompt(
        basePrompt: string,
        heading: string,
        categoryStyle: string,
        referenceLock: string
    ): string {
        return `🛒 SHOPPING CONNECT MODE: PREMIUM LIFESTYLE TRANSFORMATION

⛔⛔⛔ ULTRA-CRITICAL PRODUCT IDENTITY RULE ⛔⛔⛔
YOU HAVE BEEN GIVEN A REFERENCE PRODUCT IMAGE.
YOU MUST USE THAT EXACT PRODUCT IN YOUR OUTPUT.

🚫 ABSOLUTELY FORBIDDEN:
- DO NOT IMAGINE A DIFFERENT PRODUCT
- DO NOT CREATE A "SIMILAR" PRODUCT
- DO NOT CHANGE THE PRODUCT DESIGN, SHAPE, COLOR, OR MATERIAL
- DO NOT USE A GENERIC VERSION OF THIS PRODUCT TYPE

✅ YOU MUST:
- COPY THE EXACT PRODUCT from the reference image
- KEEP THE SAME: shape, color, material, size, proportions, logos, branding
- The product in your output MUST be VISUALLY IDENTICAL to the reference

${referenceLock}

CONTEXT: "${heading}"
TOPIC: "${basePrompt}"

🎯 TASK: LIFESTYLE TRANSFORMATION (NOT PRODUCT REPLACEMENT!)
Take the EXACT product from the reference image and place it in a premium lifestyle setting.

LIFESTYLE SETTING EXAMPLES:
- Luxurious Korean apartment/penthouse interior
- High-end café or hotel lounge setting
- Elegant workspace with natural lighting
- Minimalist, Instagram-worthy home decor

COMPOSITION RULES:
- Product should occupy 30-50% of the image
- Show the product being USED or DISPLAYED in an enviable way
- Include subtle luxury elements (marble, plants, soft textiles)
- Natural, warm lighting (golden hour, soft window light)

STYLE REQUIREMENTS:
- ${categoryStyle}
- HYPER-REALISTIC commercial photography (Samsung, LG ad quality)
- 8K resolution, stunning detail, professional lighting
- Korean aesthetic sensibility (K-style home, K-beauty vibes)
- Magazine editorial quality

EMOTIONAL GOALS:
- "This could be MY life" feeling
- "I deserve this" emotional response
- Purchase desire through visual appeal

ABSOLUTE REQUIREMENTS:
- NO TEXT, NO letters, NO words, NO watermarks
- Pure visual storytelling only
- The product MUST be the EXACT SAME as the reference image
- NOT a similar product, NOT a generic version - THE EXACT SAME PRODUCT

⚠️ FINAL CHECK: Before generating, verify that your output contains THE EXACT PRODUCT from the reference image, not a different or modified version.

Generate a 100-point lifestyle image with the EXACT reference product.`;
    }
}
