/**
 * Perplexity API 클라이언트
 * ===========================
 * OpenAI 호환 API를 사용하여 Perplexity Sonar 모델에 접속합니다.
 * 실시간 웹 검색을 통해 최신 정보를 반영한 콘텐츠 생성이 가능합니다.
 * 
 * @module perplexity
 * @since 2026-01-25
 */

import OpenAI from 'openai';
import { buildSystemPromptFromHint, type PromptMode } from './promptLoader.js';

// ==================== 타입 정의 ====================

interface PerplexityGenerateOptions {
    targetAudience?: string;
    tone?: 'friendly' | 'professional' | 'casual';
    wordCount?: number;
    keywords?: string[];
    includeImages?: boolean;
    blogType?: 'review' | 'informative' | 'storytelling';
    contentMode?: 'seo' | 'homefeed';
    categoryHint?: string;
}

interface PerplexityGenerateResult {
    content: string;
    usage: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
        estimatedCost: number;
    };
    modelUsed: string;
}

// ==================== 상수 ====================

/**
 * Perplexity 모델 목록
 * - sonar: 기본 모델 (검색 + 생성)
 * - sonar-pro: 고급 모델 (더 정확한 검색 + 고품질 생성)
 */
export const PERPLEXITY_MODELS = [
    { id: 'sonar', name: 'Sonar (기본)', tier: 'standard' },
    { id: 'sonar-pro', name: 'Sonar Pro (고급)', tier: 'premium' },
];

const DEFAULT_MODEL = 'sonar';

// 런타임 모델 설정
let runtimeModel: string = DEFAULT_MODEL;

export function setPerplexityModel(model: string): void {
    runtimeModel = model;
    console.log(`[Perplexity] 모델 변경: ${model}`);
}

export function getConfiguredPerplexityModel(): string {
    return runtimeModel || DEFAULT_MODEL;
}

// ==================== 캐싱 ====================

let cachedClient: OpenAI | null = null;
let cachedApiKey: string | null = null;

/**
 * Perplexity 클라이언트 생성 (OpenAI SDK 사용)
 * Perplexity API는 OpenAI 호환 형식이므로 baseURL만 변경하면 됩니다.
 */
function getClient(apiKey: string): OpenAI {
    if (cachedClient && cachedApiKey === apiKey.trim()) {
        return cachedClient;
    }
    cachedApiKey = apiKey.trim();
    cachedClient = new OpenAI({
        apiKey: cachedApiKey,
        baseURL: 'https://api.perplexity.ai',
    });
    return cachedClient;
}

// ==================== 헬퍼 함수 ====================

/**
 * Perplexity 오류 메시지 한글화
 */
export function translatePerplexityError(error: Error): string {
    if (!error) return '⚠️ 알 수 없는 오류';
    const msg = error.message.toLowerCase();

    if (msg.includes('api key') || msg.includes('unauthorized') || msg.includes('401')) {
        return '🚫 [인증 오류] Perplexity API 키가 올바르지 않습니다. 키를 확인해주세요.';
    }
    if (msg.includes('rate limit') || msg.includes('429') || msg.includes('too many')) {
        return '⏳ [사용량 초과] Perplexity API 호출 한도를 초과했습니다. 잠시 후 다시 시도하세요.';
    }
    if (msg.includes('insufficient') || msg.includes('quota') || msg.includes('credits')) {
        return '💳 [크레딧 부족] Perplexity API 크레딧이 부족합니다. 결제 정보를 확인해주세요.';
    }
    if (msg.includes('timeout') || msg.includes('timed out')) {
        return '⏱️ [시간 초과] 응답 시간이 초과되었습니다. 다시 시도해주세요.';
    }
    if (msg.includes('network') || msg.includes('fetch failed') || msg.includes('econnrefused')) {
        return '📡 [연결 실패] 인터넷 연결 상태를 확인해주세요.';
    }
    if (msg.includes('invalid') || msg.includes('bad request') || msg.includes('400')) {
        return '📝 [요청 오류] 요청 형식이 올바르지 않습니다.';
    }

    return `⚠️ [Perplexity 오류] ${error.message}`;
}

/**
 * 프롬프트 빌드
 */
function buildEnhancedPrompt(topic: string, options: PerplexityGenerateOptions = {}): { systemPrompt: string; userPrompt: string } {
    const {
        targetAudience = '일반 블로그 독자',
        tone = 'friendly',
        wordCount = 2000,
        keywords = [],
        contentMode = 'seo',
        categoryHint,
    } = options;

    // 2축 분리: 노출 목적 + 카테고리
    const selectedPrompt = buildSystemPromptFromHint(contentMode as PromptMode, categoryHint);

    const toneGuide: Record<string, string> = {
        friendly: '친구와 대화하듯 편안하고 친근하게',
        professional: '전문적이지만 이해하기 쉽게',
        casual: '매우 가볍고 재미있게',
        formal: '정중하고 격식있는 하십시오체',
        humorous: '재치 있는 비유와 위트 넘치게',
        community_fan: '커뮤니티 찐팬의 날것 수다체',
        mom_cafe: '맘카페 살림고수 언니 말투',
        storyteller: '에세이 내레이터의 서사적 묘사체',
        expert_review: '매체 에디터의 체계적 분석체',
        calm_info: '차분하고 신뢰감 있는 안내체',
    };

    // 홈판 모드
    if (contentMode === 'homefeed') {
        return {
            systemPrompt: selectedPrompt,
            userPrompt: `# 작성 주제\n${topic}${keywords.length > 0 ? `\n\n# 관련 키워드: ${keywords.join(', ')}` : ''}`,
        };
    }

    // SEO 모드
    return {
        systemPrompt: selectedPrompt,
        userPrompt: `# 글 작성 요구사항
- **주제**: ${topic}
- **타겟 독자**: ${targetAudience}
- **톤**: ${toneGuide[tone] || toneGuide.friendly}
- **목표 분량**: ${wordCount}자 (±200자)
${keywords.length > 0 ? `- **필수 키워드**: ${keywords.join(', ')} (자연스럽게 3회 이상 포함)` : ''}

# 글 구조
1. **제목** (30자 이내, SEO 최적화)
2. **도입부** (100-150자, 독자 관심 유도)
3. **본문** (3-5개 소제목, 각 300-500자)
4. **마무리** (100-150자, 핵심 요약 + CTA)
5. **추천 태그** (5-10개)

지금 바로 작성을 시작하세요.`,
    };
}

/**
 * 콘텐츠 품질 검증
 */
function validateContent(text: string): boolean {
    const trimmed = text.trim();

    if (trimmed.length < 500) {
        console.warn(`⚠️ [Perplexity] 글자 수 부족: ${trimmed.length}자`);
        return false;
    }

    return true;
}

// ==================== 메인 함수 ====================

/**
 * Perplexity를 사용한 블로그 콘텐츠 생성
 * 
 * @param prompt 생성할 주제/프롬프트
 * @param options 생성 옵션
 * @returns 생성된 콘텐츠 및 메타데이터
 */
export async function generatePerplexityContent(
    prompt: string,
    options: PerplexityGenerateOptions = {}
): Promise<PerplexityGenerateResult> {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
        throw new Error('생성할 내용을 입력해주세요.');
    }

    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey) {
        throw new Error('PERPLEXITY_API_KEY가 설정되어 있지 않습니다. 환경설정에서 Perplexity API 키를 입력해주세요.');
    }

    const { systemPrompt, userPrompt } = buildEnhancedPrompt(trimmedPrompt, options);
    const modelName = getConfiguredPerplexityModel();

    const maxRetries = 2;
    let lastError: Error | null = null;

    for (let retry = 0; retry < maxRetries; retry++) {
        try {
            const client = getClient(apiKey);

            console.log(`[Perplexity Request] Model: ${modelName}, Topic: ${trimmedPrompt.substring(0, 50)}...`);

            const response = await client.chat.completions.create({
                model: modelName,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
                max_tokens: 4096,
                temperature: 0.7,
            });

            const content = response.choices[0]?.message?.content?.trim() || '';

            if (!content) {
                throw new Error('빈 응답');
            }

            if (!validateContent(content)) {
                throw new Error('품질 기준 미달');
            }

            const usage = response.usage;

            console.log(`✅ [Perplexity Success] ${modelName} (시도 ${retry + 1})`);

            // HTML 태그 제거
            const cleanedContent = content
                .replace(/<\/?u>/gi, '')
                .replace(/<\/?b>/gi, '')
                .replace(/<\/?i>/gi, '')
                .replace(/<\/?em>/gi, '')
                .replace(/<\/?strong>/gi, '');

            return {
                content: cleanedContent,
                usage: {
                    promptTokens: usage?.prompt_tokens || 0,
                    completionTokens: usage?.completion_tokens || 0,
                    totalTokens: usage?.total_tokens || 0,
                    // Perplexity 과금: 약 $1/1M tokens (Sonar), $5/1M tokens (Sonar Pro)
                    estimatedCost: ((usage?.total_tokens || 0) / 1_000_000) * (modelName === 'sonar-pro' ? 5 : 1),
                },
                modelUsed: modelName,
            };

        } catch (error) {
            lastError = error as Error;
            const errorMessage = lastError.message;

            console.error(`⚠️ [Perplexity Error] 시도 ${retry + 1}: ${errorMessage}`);

            // API 키 오류는 즉시 중단
            if (errorMessage.includes('API key') || errorMessage.includes('unauthorized') || errorMessage.includes('401')) {
                throw new Error(translatePerplexityError(lastError));
            }

            // 재시도 가능한 오류
            if (retry < maxRetries - 1) {
                const delay = Math.min(1000 * Math.pow(2, retry), 5000);
                console.log(`🔄 [Perplexity Retry] ${delay}ms 후 재시도...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    throw new Error(`Perplexity 생성 실패: ${lastError ? translatePerplexityError(lastError) : '원인 불명'}`);
}

// ==================== Exports ====================

export { PerplexityGenerateOptions, PerplexityGenerateResult };
