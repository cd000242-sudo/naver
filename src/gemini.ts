import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { buildSystemPromptFromHint, type PromptMode } from './promptLoader.js';
import { loadConfig, saveConfig } from './configManager.js';

// ==================== 타입 정의 ====================

interface GenerateOptions {
  targetAudience?: string;
  tone?: 'friendly' | 'professional' | 'casual';
  wordCount?: number;
  keywords?: string[];
  includeImages?: boolean;
  blogType?: 'review' | 'informative' | 'storytelling';
  contentMode?: 'seo' | 'homefeed'; // ✅ SEO 모드 또는 홈판 노출 최적화 모드
  categoryHint?: string; // ✅ 2축 분리: 카테고리 힌트 (연예, 시사, 건강, IT 등)
}

interface GenerateResult {
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

// ✅ [2026-04-09] Stable Gemini 모델만 사용 (Preview 제거)
const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

// ✅ 사용 가능한 모델 목록 (환경설정에서 선택 가능)
// [v1.4.32] 가격 순서대로 3티어 정렬: 가성비(Lite) → 균형(Flash) → 프리미엄(Pro)
export const AVAILABLE_MODELS = [
  { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash-Lite (💰 가성비 ~₩15/글)', tier: 'budget' },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (⚖️ 균형 ~₩80/글)', tier: 'standard' },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro (👑 프리미엄 ~₩300/글)', tier: 'premium' },
];

const BASE_FALLBACK_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.5-pro',
];

// ✅ [2026-03-18] UI 선택 모델을 최우선 배치하는 동적 폴백 체인
function getFallbackModels(): string[] {
  const userModel = resolveModelName();
  // 사용자 선택 모델이 기본 폴백 목록에 이미 있으면 맨 앞으로 이동
  // 없으면 맨 앞에 추가 (새 커스텀 모델 대응)
  const rest = BASE_FALLBACK_MODELS.filter(m => m !== userModel);
  return [userModel, ...rest];
}

// ✅ 런타임에서 설정된 모델 (main.ts에서 설정)
let runtimeModel: string | null = null;
export function setGeminiModel(model: string) {
  runtimeModel = model;
  console.log(`[Gemini] 모델 변경: ${model}`);
}
export function getConfiguredModel(): string {
  return runtimeModel || DEFAULT_MODEL;
}

const MODEL_ENFORCEMENT_ERROR =
  '지원되지 않는 Gemini 모델입니다. gemini-2.5-flash / gemini-2.5-flash-lite / gemini-2.5-pro 중에서 선택해주세요.';

// ✅ 시스템 프롬프트는 .prompt 파일에서 로드됩니다.
// - SEO 모드: src/prompts/seo/base.prompt + 카테고리별 .prompt
// - 홈피드 모드: src/prompts/homefeed/base.prompt + 카테고리별 .prompt
// - 로드: buildSystemPromptFromHint() (promptLoader.ts)

// ==================== 사용량 추적 (통합 모듈 위임) ====================

/**
 * ✅ [2026-03-19] 통합 apiUsageTracker 모듈로 위임
 * - 기존 함수 시그니처 유지 (하위 호환)
 * - 실제 추적은 apiUsageTracker.ts에서 처리
 */
import { trackApiUsage, flushAllApiUsage, getApiUsageSnapshot, type ProviderUsageData } from './apiUsageTracker.js';

/** 사용량을 메모리에 누적 (즉시 반환, 논블로킹) — 통합 추적기로 위임 */
export function trackGeminiUsage(
  modelName: string,
  inputTokens: number,
  outputTokens: number
): void {
  trackApiUsage('gemini', { inputTokens, outputTokens, model: modelName });
}

/** 메모리 누적분을 config에 저장 (앱 종료/할당량 조회 시 호출) — 통합 추적기로 위임 */
export async function flushGeminiUsage(): Promise<void> {
  await flushAllApiUsage();
}

/** 현재 메모리 + 디스크 합산 스냅샷 반환 (UI 표시용) — 통합 추적기로 위임 */
export async function getGeminiUsageSnapshot(): Promise<{
  totalInputTokens: number; totalOutputTokens: number;
  totalCalls: number; estimatedCostUSD: number;
  lastUpdated?: string; firstTracked?: string;
}> {
  const snapshot = await getApiUsageSnapshot('gemini') as ProviderUsageData;
  return {
    totalInputTokens: snapshot.totalInputTokens,
    totalOutputTokens: snapshot.totalOutputTokens,
    totalCalls: snapshot.totalCalls,
    estimatedCostUSD: snapshot.estimatedCostUSD,
    lastUpdated: snapshot.lastUpdated || undefined,
    firstTracked: snapshot.firstTracked || undefined,
  };
}

// ==================== 캐싱 ====================

let cachedClient: GoogleGenerativeAI | null = null;
let cachedApiKey: string | null = null;

function getClient(apiKey: string): GoogleGenerativeAI {
  if (cachedClient && cachedApiKey === apiKey.trim()) {
    return cachedClient;
  }
  cachedApiKey = apiKey.trim();
  cachedClient = new GoogleGenerativeAI(cachedApiKey);
  return cachedClient;
}

function resolveModelName(): string {
  // ✅ 런타임 설정 > 환경변수 > 기본값 순서
  const configuredModel = runtimeModel || process.env.GEMINI_MODEL || DEFAULT_MODEL;

  // ✅ [2026-03-18 FIX] 비-Gemini 모델명은 즉시 에러 → 다른 엔진 전환 유도
  if (!configuredModel.startsWith('gemini-')) {
    throw new Error(`⏳ [사용량 초과] Gemini API 할당량이 소진되었습니다. 다른 AI 엔진(Claude/OpenAI)으로 전환하거나 잠시 후 다시 시도해주세요. (감지된 모델: ${configuredModel})`);
  }

  return configuredModel;
}

// ==================== 기존 호환성 함수 ====================

/**
 * 기존 코드와의 호환성을 위한 함수 (contentGenerator.ts에서 사용)
 */
export function getGeminiModel(): { model: GenerativeModel; modelName: string } {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY 환경변수가 설정되지 않았습니다.');
  }

  const client = getClient(apiKey);
  const modelName = resolveModelName();
  const model = client.getGenerativeModel({ model: modelName });
  return { model, modelName };
}

// ==================== 헬퍼 함수 ====================

function validateContent(text: string): boolean {
  const trimmed = text.trim();

  if (trimmed.length < 1000 || trimmed.length > 10000) {
    console.warn(`⚠️ 글자 수 이상: ${trimmed.length}자`);
    return false;
  }

  const h2Count = (trimmed.match(/##/g) || []).length;
  if (h2Count < 3) {
    console.warn(`⚠️ 소제목 부족: ${h2Count}개`);
    return false;
  }

  return true;
}

// ✅ Gemini 오류 메시지 한글화 함수 (외부 공유 가능)
export function translateGeminiError(error: Error): string {
  if (!error) return '⚠️ 알 수 없는 오류';
  const msg = error.message.toLowerCase();

  if (msg.includes('api key')) return '🚫 [인증 오류] Gemini API 키가 올바르지 않습니다. 키를 확인해주세요.';
  if (msg.includes('quota exceeded') || msg.includes('429') || msg.includes('limit')) return '⏳ [사용량 초과] Gemini 무료 사용량이 초과되었습니다. 잠시 후 다시 시도하거나 API 키를 교체하세요.';
  if (msg.includes('safety') || msg.includes('blocked')) return '🛡️ [안전 필터] 생성된 콘텐츠가 Gemini 안전 기준(선정성/폭력성 등)에 의해 차단되었습니다. 주제를 변경해보세요.';
  if (msg.includes('location') || msg.includes('unsupported country')) return '🌍 [접속 위치] 현재 국가에서 Gemini API를 사용할 수 없습니다. VPN을 확인해주세요.';
  if (msg.includes('valid json')) return '📝 [형식 오류] AI 응답 형식이 깨졌습니다. 일시적인 현상이니 다시 시도해주세요.';
  if (msg.includes('500') || msg.includes('internal')) return '🔥 [서버 오류] Google Gemini 서버에 일시적인 문제가 발생했습니다.';
  if (msg.includes('fetch failed')) return '📡 [연결 실패] 인터넷 연결 상태를 확인해주세요.';

  return `⚠️ [알 수 없는 오류] ${error.message}`;
}

/**
 * ✅ [2026-03-16] systemInstruction 분리 구조
 * system: .prompt 파일 규칙 (AI가 명령으로 인식)
 * user: 주제 + 키워드만 (짧고 명확)
 */
function buildSplitPrompt(topic: string, options: GenerateOptions = {}): { system: string; user: string } {
  const {
    targetAudience = '일반 블로그 독자',
    tone = 'friendly',
    wordCount = 2000,
    keywords = [],
    includeImages = true,
    contentMode = 'seo', // ✅ 기본값은 SEO 모드
    categoryHint, // ✅ 2축 분리: 카테고리 힌트
  } = options;

  // ✅ 2축 분리 구조: [노출 목적 base] + [카테고리 보정 prompt]
  const selectedPrompt = buildSystemPromptFromHint(contentMode as PromptMode, categoryHint);

  console.log(`[Gemini] systemInstruction 분리 적용: mode=${contentMode}, category=${categoryHint || 'general'}`);

  // ✅ 홈판 모드: system에 규칙, user에 주제만
  if (contentMode === 'homefeed') {
    return {
      system: selectedPrompt,
      user: `# 작성 주제\n${topic}${keywords.length > 0 ? `\n\n# 관련 키워드: ${keywords.join(', ')}` : ''}\n\n지금 바로 작성을 시작하세요.`,
    };
  }

  // ✅ SEO 모드: system에 규칙, user에 요구사항만
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

  return {
    system: selectedPrompt,
    user: `# 글 작성 요구사항
- **주제**: ${topic}
- **타겟 독자**: ${targetAudience}
- **톤**: ${toneGuide[tone]}
- **목표 분량**: ${wordCount}자 (±200자)
${keywords.length > 0 ? `- **필수 키워드**: ${keywords.join(', ')} (자연스럽게 3회 이상 포함)` : ''}
${includeImages ? '- **이미지 삽입 위치**: [이미지: 설명] 형태로 표시' : ''}

지금 바로 작성을 시작하세요.`.trim(),
  };
}

// ==================== 메인 함수 ====================

/**
 * 새로운 향상된 블로그 콘텐츠 생성 함수 (옵션 지원)
 * 옵션이 없으면 string 반환 (기존 코드 호환), 옵션이 있으면 GenerateResult 반환
 */
export async function generateBlogContent(
  prompt: string,
  options?: GenerateOptions
): Promise<string>;
export async function generateBlogContent(
  prompt: string,
  options: GenerateOptions
): Promise<GenerateResult>;
export async function generateBlogContent(
  prompt: string,
  options?: GenerateOptions
): Promise<string | GenerateResult> {
  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt) {
    throw new Error('생성할 내용을 입력해주세요.');
  }

  const splitPrompt = buildSplitPrompt(trimmedPrompt, options);

  // Gemini 모드 (auto 또는 gemini)
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY가 설정되어 있지 않습니다.');
  }

  const maxRetries = 2;  // ✅ 4 → 2 (과도한 재시도 방지)
  const baseDelay = 1000;

  let lastError: Error | null = null;



  // 재시도 루프
  for (let retry = 0; retry < maxRetries; retry++) {
    // 모델 폴백 루프
    const fallbackModels = getFallbackModels();
    for (let modelIdx = 0; modelIdx < fallbackModels.length; modelIdx++) {
      const modelName = fallbackModels[modelIdx];
      let perModelRetryCount = 0;
      const PER_MODEL_MAX = 1; // ✅ 2 → 1 (빠른 모델 전환)

      while (perModelRetryCount < PER_MODEL_MAX) {
        try {
          const client = getClient(apiKey);
          // ✅ [2026-03-16] systemInstruction으로 규칙 분리 → AI 규칙 인식률 향상
          const model = client.getGenerativeModel({
            model: modelName,
            systemInstruction: { role: 'system', parts: [{ text: splitPrompt.system }] },
            generationConfig: {
              temperature: 0.95,
              maxOutputTokens: 4096,
              topP: 0.95,
              topK: 50,
            },
            // @ts-ignore - Google Search Grounding 상시 활성화
            tools: [{ googleSearch: {} }],
          });

          console.log(`[Gemini Request] Model: ${modelName} [systemInstruction: ON, Search Grounding: ON], Topic: ${splitPrompt.user.substring(0, 50)}...`);

          // ✅ [v1.4.41] 5분 timeout 추가 — 30분~1시간 hang 방지
          // Google이 503/지연으로 응답 안 주면 무한 대기하던 버그 차단
          const GEMINI_TIMEOUT_MS = 5 * 60 * 1000; // 5분
          const apiResult = await Promise.race([
            model.generateContent(splitPrompt.user),
            new Promise<never>((_, reject) =>
              setTimeout(
                () => reject(new Error(`GEMINI_TIMEOUT:Gemini ${modelName} 응답 시간 초과 (5분). Google 서버 일시 장애로 보입니다. 5~10분 후 다시 시도해주세요.`)),
                GEMINI_TIMEOUT_MS
              )
            )
          ]);
          const text = apiResult.response.text();

          if (!text?.trim()) {
            console.error(`[Gemini Error] ${modelName} returned empty response`);
            throw new Error('빈 응답');
          }

          if (!validateContent(text)) {
            throw new Error('품질 기준 미달');
          }

          const usage = (apiResult.response as any).usageMetadata;
          const totalTokens = usage?.totalTokenCount || 0;
          const promptTokens = usage?.promptTokenCount || 0;
          const completionTokens = usage?.candidatesTokenCount || 0;

          // ✅ [2026-03-19] 사용량 누적 추적 (동기, 메모리 누적)
          trackGeminiUsage(modelName, promptTokens, completionTokens);

          console.log(`✅ [Gemini Success] ${modelName} (전체 루프 ${retry + 1}, 모델 시도 ${perModelRetryCount + 1})`);

          // ✅ [핵심 수정] HTML 태그 제거 (<u>, </u>, <b>, </b>, <i>, </i> 등)
          const cleanedText = text.trim()
            .replace(/<\/?u>/gi, '')    // <u>, </u> 제거
            .replace(/<\/?b>/gi, '')    // <b>, </b> 제거
            .replace(/<\/?i>/gi, '')    // <i>, </i> 제거
            .replace(/<\/?em>/gi, '')   // <em>, </em> 제거
            .replace(/<\/?strong>/gi, ''); // <strong>, </strong> 제거

          const generateResult: GenerateResult = {
            content: cleanedText,
            usage: {
              promptTokens,
              completionTokens,
              totalTokens,
              estimatedCost: (totalTokens / 1_000_000) * 0.075,
            },
            modelUsed: modelName,
          };

          if (options === undefined) {
            return generateResult.content as any;
          }

          return generateResult;

        } catch (error) {
          const errorMessage = (error as Error).message;
          lastError = error as Error;

          // ✅ [v1.4.41] Timeout 즉시 중단 — 다른 모델 폴백 안 함 (사용자가 선택한 모델 존중)
          if (errorMessage.startsWith('GEMINI_TIMEOUT:')) {
            console.error(`[Gemini Timeout] ${modelName} 5분 초과 → 즉시 중단`);
            throw new Error(errorMessage.replace('GEMINI_TIMEOUT:', ''));
          }

          // 즉시 중단 (API 키 오류만)
          if (errorMessage.includes('API key')) {
            throw new Error(translateGeminiError(error as Error));
          }

          // 할당량 초과(429) 처리
          if (errorMessage.includes('quota exceeded') || errorMessage.includes('429') || errorMessage.includes('limit: 0') || errorMessage.includes('Too Many Requests')) {
            perModelRetryCount++;

            let waitMs = 5000; // ✅ 15초 → 5초 (빠른 응답)
            const retryMatch = errorMessage.match(/retry in ([\d.]+)(s|ms)/i);
            if (retryMatch) {
              const val = parseFloat(retryMatch[1]);
              const unit = retryMatch[2].toLowerCase();
              waitMs = (unit === 's' ? val * 1000 : val) + 1000;
            }

            if (perModelRetryCount < PER_MODEL_MAX) {
              console.warn(`⏳ [Gemini Quota] ${modelName} 바쁨. ${Math.round(waitMs / 1000)}초 후 동일 모델 재시도...`);
              await new Promise(resolve => setTimeout(resolve, waitMs));
              continue;
            } else {
              console.warn(`🚀 [Gemini Switch] ${modelName} 시도 끝. 다음 모델로 전환합니다.`);
              break; // while 종료 -> 다음 모델 for 루프로
            }
          }

          // Rate limit 또는 기타 오류 -> 다음 모델로
          console.warn(`⚠️ ${modelName} 오류: ${errorMessage.substring(0, 50)}...`);
          break; // while 종료 -> 다음 모델로
        }
      }
    }

    // 한 루프 다 돌았는데 실패한 경우
    if (retry < maxRetries - 1) {
      console.log(`🔄 [Global Retry] 모든 모델 시도 실패. 1초 후 루프 ${retry + 2} 시작...`);
      await new Promise(resolve => setTimeout(resolve, 1000)); // ✅ 2초 → 1초
    }
  }

  // ✅ Gemini 모든 시도 실패
  throw new Error(`Gemini 생성 실패: ${lastError ? translateGeminiError(lastError) : '원인 불명'}`);
}


// ==================== 스트리밍 버전 ====================

export async function* generateBlogContentStream(
  prompt: string,
  options: GenerateOptions = {}
): AsyncGenerator<string, void, unknown> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY가 설정되어 있지 않습니다.');
  }

  const splitPrompt = buildSplitPrompt(prompt, options);
  let lastError: Error | null = null;

  // ✅ [2026-03-18] 스트리밍에서도 UI 선택 모델 우선 폴백 체인 사용
  const fallbackModels = getFallbackModels();
  for (const modelName of fallbackModels) {
    try {
      console.log(`[Gemini Stream] Attempting with model: ${modelName} [systemInstruction: ON, Search Grounding: ON]`);
      const client = getClient(apiKey);
      // ✅ [2026-03-16] 스트리밍도 systemInstruction 분리 적용
      const model = client.getGenerativeModel({
        model: modelName,
        systemInstruction: { role: 'system', parts: [{ text: splitPrompt.system }] },
        generationConfig: {
          temperature: 0.95,
          maxOutputTokens: 4096,
          topP: 0.95,
          topK: 50,
        },
        // @ts-ignore - Google Search Grounding 상시 활성화
        tools: [{ googleSearch: {} }],
      });

      const result = await model.generateContentStream(splitPrompt.user);

      let fullText = '';
      // 첫 번째 청크를 기다려보며 성공 여부 확인 (404 등은 여기서 catch됨)
      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        fullText += chunkText;
        yield chunkText;
      }

      if (!validateContent(fullText)) {
        console.warn(`[Gemini Stream] Content quality check failed for ${modelName}`);
        // 품질 미달 시 다음 모델로 넘어가거나 종료 (스트리밍은 중간에 이미 데이터가 나갔으므로 예외 처리 필요)
        // 여기서는 일단 성공한 것으로 간주하되 경고만 남김
      }

      // ✅ [2026-03-19] 사용량 추적 (스트리밍 완료 후 aggregated response에서 추출)
      try {
        const aggResponse = await result.response;
        const streamUsage = (aggResponse as any).usageMetadata;
        if (streamUsage) {
          trackGeminiUsage(modelName, streamUsage.promptTokenCount || 0, streamUsage.candidatesTokenCount || 0);
        }
      } catch { /* usage 추출 실패 무시 */ }

      console.log(`✅ [Gemini Stream Success] ${modelName}`);
      return; // 성공 시 함수 종료

    } catch (error) {
      lastError = error as Error;
      const errorMessage = lastError.message;
      console.error(`⚠️ [Gemini Stream Failure] Model ${modelName} failed: ${errorMessage}`);

      // API 키 오류는 즉시 중단
      if (errorMessage.includes('API key')) {
        throw new Error(translateGeminiError(lastError));
      }

      // 404, 429 등은 루프 계속 (다음 모델 시도)
      continue;
    }
  }

  throw new Error(`Gemini 스트리밍 생성 실패: ${lastError ? translateGeminiError(lastError) : '모든 모델 시도 실패'}`);
}

// ==================== Exports ====================

export { getClient, GenerateOptions, GenerateResult };

// ==================== 이미지 검색어 최적화 (100점 개선) ====================

/**
 * 제목과 소제목을 분석하여 최적의 이미지 검색어를 생성합니다.
 * 동명이인, 문맥 구분, 관계어 분석을 수행합니다.
 */
export async function optimizeImageSearchQuery(
  title: string,
  heading: string,
  providedApiKey?: string
): Promise<{
  optimizedQuery: string;
  coreSubject: string;
  broaderQuery: string;
  category: string;
}> {
  const apiKey = providedApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    // API 키 없으면 단순 키워드 추출로 폴백
    console.log('[Gemini] API 키 없음, 단순 키워드 추출로 폴백');
    const fallbackQuery = extractSimpleKeywords(title, heading);
    return {
      optimizedQuery: fallbackQuery,
      coreSubject: fallbackQuery.split(' ')[0] || heading,
      broaderQuery: fallbackQuery.split(' ')[0] || heading,
      category: 'general'
    };
  }

  try {
    const client = getClient(apiKey);
    const model = client.getGenerativeModel({
      model: 'gemini-2.5-flash',  // 빠른 모델 사용
      generationConfig: {
        temperature: 0.3,  // 정확성 우선
        maxOutputTokens: 200,
      },
    });

    const prompt = `
당신은 네이버 이미지 검색 전문가입니다. 문맥을 분석하여 최적의 검색어를 생성합니다.

# 제목
${title}

# 현재 소제목
${heading}

# 분석 요청
1. 이 제목에서 핵심 인물/사물/브랜드를 파악하세요.
2. 동명이인이 있다면 문맥에 맞는 사람을 특정하세요.
   - 예: "개코 김수미 이혼" → 김수미는 래퍼 개코의 아내 (배우 김수미 아님)
   - 예: "샤이니 키 근황" → 아이돌 SHINee의 멤버 Key
   - 예: "손흥민 키 몸무게" → 축구선수 손흥민의 신장
3. 소제목에 맞는 구체적인 이미지 검색어를 생성하세요.

# 응답 형식 (JSON만 출력)
{
  "optimizedQuery": "소제목에 맞는 정확한 검색어",
  "coreSubject": "제목의 핵심 인물/사물 (폴백용)",
  "broaderQuery": "범위 넓힌 검색어 (폴백용)",
  "category": "entertainment|sports|tech|shopping|lifestyle|news"
}

JSON만 출력하세요. 설명 없이.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    // ✅ [2026-03-19] 사용량 추적
    const _u = (result.response as any).usageMetadata;
    if (_u) trackGeminiUsage('gemini-2.5-flash', _u.promptTokenCount || 0, _u.candidatesTokenCount || 0);

    // JSON 파싱
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        console.log(`[Gemini] 검색어 최적화: "${heading}" → "${parsed.optimizedQuery}"`);
        return {
          optimizedQuery: parsed.optimizedQuery || heading,
          coreSubject: parsed.coreSubject || heading,
          broaderQuery: parsed.broaderQuery || heading,
          category: parsed.category || 'general'
        };
      } catch (parseErr) {
        console.warn('[Gemini] JSON 파싱 실패, 폴백 사용');
      }
    }
  } catch (error) {
    console.warn('[Gemini] 검색어 최적화 실패:', (error as Error).message);
  }

  // 폴백: 단순 키워드 추출
  const fallbackQuery = extractSimpleKeywords(title, heading);
  return {
    optimizedQuery: fallbackQuery,
    coreSubject: fallbackQuery.split(' ')[0] || heading,
    broaderQuery: fallbackQuery.split(' ')[0] || heading,
    category: 'general'
  };
}

/**
 * 단순 키워드 추출 (API 실패 시 폴백)
 */
function extractSimpleKeywords(title: string, heading: string): string {
  const stopWords = ['은', '는', '이', '가', '을', '를', '의', '에', '에서', '으로', '로', '와', '과', '도', '만', '까지', '부터', '에게', '한테', '께', '보다', '처럼', '같이', '대해', '대한', '위한', '통한', '관한', '있는', '없는', '하는', '되는', '된', '할', '될', '하고', '되고', '그리고', '하지만', '그러나', '또한', '및', '등', '것', '수', '때', '중', '후', '전', '내', '외'];

  const combined = `${title} ${heading}`;
  const words = combined.split(/[\s,.!?:;'"()\[\]{}]+/).filter(w =>
    w.length >= 2 && !stopWords.includes(w)
  );

  return words.slice(0, 4).join(' ');
}

/**
 * 제목에서 핵심 주제(인물/브랜드)를 추출합니다.
 */
export async function extractCoreSubject(
  title: string,
  providedApiKey?: string
): Promise<string> {
  const apiKey = providedApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    // 폴백: 첫 번째 단어 반환
    const words = title.split(/[\s,.!?:;'"()\[\]{}]+/).filter(w => w.length >= 2);
    return words[0] || title;
  }

  try {
    const client = getClient(apiKey);
    const model = client.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 50,
      },
    });

    const prompt = `
제목: "${title}"

이 제목에서 가장 핵심이 되는 인물명, 브랜드명, 또는 주제어 하나만 추출하세요.
예: "손흥민 키 몸무게 프로필" → "손흥민"
예: "개코 김수미 이혼 발표" → "개코"
예: "LG 그램17 키보드 후기" → "LG그램"

한 단어만 출력하세요. 설명 없이.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    // ✅ [2026-03-19] 사용량 추적
    const _u2 = (result.response as any).usageMetadata;
    if (_u2) trackGeminiUsage('gemini-2.5-flash', _u2.promptTokenCount || 0, _u2.candidatesTokenCount || 0);

    console.log(`[Gemini] 핵심 주제 추출: "${title}" → "${text}"`);
    return text || title.split(' ')[0];
  } catch (error) {
    console.warn('[Gemini] 핵심 주제 추출 실패:', (error as Error).message);
    const words = title.split(/[\s,.!?:;'"()\[\]{}]+/).filter(w => w.length >= 2);
    return words[0] || title;
  }
}

/**
 * [100점 개선] 배치 검색어 최적화 - 모든 소제목을 한 번에 처리
 * API 호출 횟수: N회 → 1회로 감소
 */
export async function batchOptimizeImageSearchQueries(
  title: string,
  headings: string[],
  providedApiKey?: string
): Promise<Array<{
  heading: string;
  optimizedQuery: string;
  broaderQuery: string;
}>> {
  const apiKey = providedApiKey || process.env.GEMINI_API_KEY;

  // 폴백용 기본 결과 생성
  const createFallbackResults = () => headings.map(heading => ({
    heading,
    optimizedQuery: extractSimpleKeywords(title, heading),
    broaderQuery: title.split(' ')[0] || heading
  }));

  if (!apiKey) {
    console.log('[Gemini] API 키 없음, 단순 키워드 추출로 폴백');
    return createFallbackResults();
  }

  try {
    const client = getClient(apiKey);
    const model = client.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 500,
      },
    });

    const headingsText = headings.map((h, i) => `${i + 1}. ${h}`).join('\n');

    const prompt = `
당신은 네이버 이미지 검색 전문가입니다. 제목과 소제목을 분석하여 각 소제목에 맞는 최적의 이미지 검색어를 생성합니다.

# 제목
${title}

# 소제목 목록
${headingsText}

# 분석 규칙
1. 동명이인 구분: "개코 김수미" → 래퍼 개코의 아내 (배우 김수미 아님)
2. 동음이의어 구분: "키" 문맥에 따라 (아이돌 Key / 신장 / 열쇠)
3. 각 소제목에 맞는 구체적인 이미지 검색어 생성
4. broaderQuery: 검색 결과 없을 때 사용할 넓은 범위 검색어

# 응답 형식 (JSON 배열만 출력)
[
  {"index": 1, "optimizedQuery": "검색어1", "broaderQuery": "넓은검색어1"},
  {"index": 2, "optimizedQuery": "검색어2", "broaderQuery": "넓은검색어2"}
]

JSON만 출력하세요. 설명 없이.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    // ✅ [2026-03-19] 사용량 추적
    const _u3 = (result.response as any).usageMetadata;
    if (_u3) trackGeminiUsage('gemini-2.5-flash', _u3.promptTokenCount || 0, _u3.candidatesTokenCount || 0);

    // JSON 배열 파싱
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]) as Array<{ index: number; optimizedQuery: string; broaderQuery: string }>;
        console.log(`[Gemini] 배치 검색어 최적화 완료: ${parsed.length}개 소제목`);

        return headings.map((heading, i) => {
          const match = parsed.find(p => p.index === i + 1);
          if (match) {
            return {
              heading,
              optimizedQuery: match.optimizedQuery || heading,
              broaderQuery: match.broaderQuery || title.split(' ')[0]
            };
          }
          return {
            heading,
            optimizedQuery: extractSimpleKeywords(title, heading),
            broaderQuery: title.split(' ')[0] || heading
          };
        });
      } catch (parseErr) {
        console.warn('[Gemini] 배치 JSON 파싱 실패, 폴백 사용');
      }
    }
  } catch (error) {
    console.warn('[Gemini] 배치 검색어 최적화 실패:', (error as Error).message);
  }

  return createFallbackResults();
}
