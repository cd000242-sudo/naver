// src/imageHeadingMatcher.ts
// ✅ AI 기반 소제목-이미지 의미적 매칭 (Gemini 2.5 Flash / Perplexity 지원)

import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';

export type MatcherConfig = {
    provider: 'gemini' | 'perplexity';
    geminiApiKey?: string;
    perplexityApiKey?: string;
    geminiModel?: string;
    perplexityModel?: string;
};

/**
 * 수집된 이미지와 소제목을 AI로 분석하여 최적 매칭
 * @param images 수집된 이미지 URL 배열
 * @param headings 소제목 텍스트 배열
 * @param config AI 설정 (Gemini 또는 Perplexity)
 * @returns 각 소제목에 매칭된 이미지 인덱스 배열
 */
export async function matchImagesToHeadings(
    images: string[],
    headings: string[],
    config: MatcherConfig
): Promise<number[]> {
    // 이미지나 소제목이 없으면 순차 배치
    if (!images.length || !headings.length) {
        console.log('[ImageMatcher] 이미지/소제목 없음 → 순차 배치');
        return headings.map((_, i) => i % images.length);
    }

    // 프롬프트 생성
    const prompt = buildMatchingPrompt(images, headings);

    try {
        // ✅ Perplexity 우선 체크 (사용자 설정 존중)
        if (config.provider === 'perplexity' && config.perplexityApiKey) {
            console.log('[ImageMatcher] 🔍 Perplexity로 이미지 매칭 중...');
            return await matchWithPerplexity(prompt, headings.length, images.length, config);
        }

        // ✅ Gemini 사용
        if (config.geminiApiKey) {
            console.log('[ImageMatcher] ✨ Gemini 2.5 Flash로 이미지 매칭 중...');
            return await matchWithGemini(prompt, headings.length, images.length, config);
        }

        // API 키 없음 - 순차 배치
        console.warn('[ImageMatcher] ⚠️ AI API 키 없음 → 순차 배치');
        return headings.map((_, i) => i % images.length);

    } catch (error) {
        console.error('[ImageMatcher] ❌ AI 매칭 실패, 순차 배치로 폴백:', (error as Error).message);
        return headings.map((_, i) => i % images.length);
    }
}

/**
 * Gemini 2.5 Flash로 이미지 매칭
 */
async function matchWithGemini(
    prompt: string,
    headingCount: number,
    imageCount: number,
    config: MatcherConfig
): Promise<number[]> {
    const client = new GoogleGenerativeAI(config.geminiApiKey!);
    const model = client.getGenerativeModel({
        model: config.geminiModel || process.env.GEMINI_MODEL || 'gemini-2.5-flash',
        generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 512,
        },
    });

    const result = await model.generateContent(prompt);
    const responseText = result.response.text().replace(/```json|```/g, '').trim();

    return parseAndValidateMatches(responseText, headingCount, imageCount);
}

/**
 * Perplexity로 이미지 매칭
 */
async function matchWithPerplexity(
    prompt: string,
    headingCount: number,
    imageCount: number,
    config: MatcherConfig
): Promise<number[]> {
    const client = new OpenAI({
        apiKey: config.perplexityApiKey!,
        baseURL: 'https://api.perplexity.ai',
    });

    const response = await client.chat.completions.create({
        model: config.perplexityModel || 'sonar',
        messages: [
            {
                role: 'system',
                content: '당신은 쇼핑 블로그 이미지 배치 전문가입니다. JSON 배열만 출력하세요.'
            },
            {
                role: 'user',
                content: prompt
            }
        ],
        temperature: 0.2,
        max_tokens: 512,
    });

    const responseText = response.choices[0]?.message?.content?.replace(/```json|```/g, '').trim() || '[]';

    return parseAndValidateMatches(responseText, headingCount, imageCount);
}

/**
 * 프롬프트 생성
 */
function buildMatchingPrompt(images: string[], headings: string[]): string {
    // 이미지 URL에서 힌트 추출
    const imageHints = images.map((url, idx) => {
        try {
            const urlObj = new URL(url);
            const path = urlObj.pathname.toLowerCase();

            let type = '제품';
            if (path.includes('review') || path.includes('후기')) type = '리뷰';
            else if (path.includes('detail') || path.includes('상세')) type = '상세';
            else if (path.includes('main') || path.includes('대표') || idx === 0) type = '메인';

            return `[${idx}] ${type} 이미지`;
        } catch {
            return `[${idx}] 제품 이미지`;
        }
    });

    return `
[소제목 목록]
${headings.map((h, i) => `${i}. ${h}`).join('\n')}

[이미지 목록] (총 ${images.length}개)
${imageHints.slice(0, 20).join('\n')}

각 소제목에 가장 적합한 이미지 인덱스(0~${images.length - 1})를 배열로 반환하세요.
- 제품 특징/개요 → 메인/제품 이미지
- 상세 스펙/정보 → 상세 이미지
- 후기/리뷰 → 리뷰 이미지
- 중복 사용 가능

JSON 배열만 출력 (설명 없이):
`.trim();
}

/**
 * AI 응답 파싱 및 검증
 */
function parseAndValidateMatches(responseText: string, headingCount: number, imageCount: number): number[] {
    const matches = JSON.parse(responseText);

    if (Array.isArray(matches) && matches.length === headingCount) {
        const validatedMatches = matches.map((idx: number) => {
            return Math.max(0, Math.min(imageCount - 1, Math.floor(idx)));
        });

        console.log(`[ImageMatcher] ✅ AI 매칭 완료: ${JSON.stringify(validatedMatches)}`);
        return validatedMatches;
    }

    throw new Error('응답 형식 불일치');
}

/**
 * 이미지 타입 분류 (URL 기반 휴리스틱)
 */
export function classifyImageType(url: string, index: number): 'main' | 'detail' | 'review' | 'gallery' {
    const lower = url.toLowerCase();

    if (index === 0) return 'main';
    if (lower.includes('review') || lower.includes('후기') || lower.includes('photo')) return 'review';
    if (lower.includes('detail') || lower.includes('상세') || lower.includes('content')) return 'detail';

    return 'gallery';
}
