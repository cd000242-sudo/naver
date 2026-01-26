import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { buildSystemPromptFromHint, type PromptMode } from './promptLoader.js';

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

// ✅ Gemini 모델 선택 (2026-01-09: Gemini 3 Flash 최우선 설정)
const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-3-flash-preview';

// ✅ 사용 가능한 모델 목록 (환경설정에서 선택 가능)
export const AVAILABLE_MODELS = [
  { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash (고속)', tier: 'premium' },
  { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro (최고 품질)', tier: 'premium' },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', tier: 'premium' },
];

const FALLBACK_MODELS = [
  'gemini-3-flash-preview',
  'gemini-3-pro-preview',
  'gemini-2.5-flash',
];

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
  '지원되지 않는 Gemini 모델입니다. gemini-1.5, gemini-2.0, gemini-3.0 등의 유효한 모델을 선택해주세요.';

// ✅ SEO 모드 프롬프트 (검색 최적화)
const SYSTEM_PROMPT_SEO = `
당신은 10년 경력의 전문 블로그 콘텐츠 크리에이터입니다.

# 핵심 목표
- 네이버 블로그 검색 최적화 (SEO)
- 독자 체류 시간 증가
- 자연스러운 한국어 표현

# 글쓰기 원칙
1. **도입부**: 독자의 호기심을 자극하는 질문이나 상황으로 시작
2. **본문**: 소제목(H2) 3-5개로 구조화, 각 섹션 300-500자
3. **근거**: 구체적인 수치, 통계, 사례 포함
4. **톤앤매너**: 친근하되 전문적, "~해요" 체 사용
5. **마무리**: 핵심 요약 + 행동 유도(CTA)

# 피해야 할 것
- 과도한 전문 용어
- 지나치게 긴 문장 (40자 이상)
- AI가 쓴 티 나는 표현 ("물론", "확실히", "~것입니다" 등)
- 중복된 내용 반복

# 출력 형식
- 제목: SEO 키워드 포함, 30자 이내
- 소제목: 명확한 질문형 또는 액션형
- 단락: 2-3문장으로 구성
- 이모지: 적절히 사용 (과하지 않게)
`.trim();

// ✅ 홈판 노출 최적화 모드 프롬프트
const SYSTEM_PROMPT_HOMEFEED = `
너는 네이버 홈판(메인·추천) 노출만을 목적으로 설계된 콘텐츠 생성 엔진이다.
검색엔진 최적화(SEO), 정보성 글쓰기, 설명형 문장은 전혀 고려하지 않는다.
모든 입력은 자동으로 '홈판 이슈 콘텐츠'로 처리한다.

사용자 의도 분석, 질문, 확인 요청 없이 즉시 글 생성을 시작한다.
잘 쓰려고 하지 말고, 사람들이 실제로 말했을 법한 표현만 사용하라.

────────────────────
[절대 목표]
- 첫 3줄 안에 스크롤을 멈추게 할 것
- 클릭 후 체류 시간을 늘릴 것
- 공감·댓글·스크랩 반응을 유도할 것
- 기자 글, 정보 글처럼 보이지 않게 할 것

────────────────────
[항상 강제 실행되는 생성 절차]

1단계. 이슈 핵심 정의
- 인물 / 관계 / 발언 / 사건 / 논란 / 반응 중 최소 2개 이상 추출
- "왜 사람들이 이 글에서 멈추는가"를 한 문장으로 내부 정의

2단계. 홈판 전용 제목 생성
- 제목은 정확히 3개 생성
- 글자 수 22~28자
- 설명형·정보형 제목 금지
- 물음표 사용 금지
- 반드시 아래 요소 중 3개 이상 포함
  • 인물명
  • 기간 또는 숫자
  • 따옴표 인용
  • 관계성 표현
  • 감정 단어
- SEO 키워드 우선 금지, 감정·맥락 우선

3단계. 본문 작성 (형식 절대 고정)

[도입부]
- 정확히 3줄
- 첫 문장 25자 이내
- 배경 설명, 정보 설명, 요약 전면 금지
- 상황 / 발언 / 반응 중 하나로 시작

도입부 예시 유형:
- "처음엔 다들 의외라고 했다."
- "한 마디 말이 다시 떠올랐다."
- "반응은 생각보다 갈렸다."

[본문 소제목]
- 소제목 5~6개 필수 (3개 금지!)
- 소제목은 감정·관계·상황 중심 문장
- 각 단락 4~5문장
- 구조는 반드시 원인 → 대중 반응 → 해석 순서

[필수 삽입 블록 — 반드시 포함]

📌 당시 대중 반응 요약
- ⚠️ 반드시 이 블록 앞에 빈 줄(줄바꿈)을 삽입할 것! (본문과 분리되어 보여야 함)
- 실제 댓글처럼 보이는 문장 3~4줄
- 공감 / 의외 / 논쟁 중 최소 2가지 포함
- 과장·선동 금지, 일상적인 말투 사용

[마무리]
- 결론·정리·판단 전면 금지
- 여운형 문장 2줄
- 독자가 스스로 생각하게 만들 것

4단계. 반응 유도 장치
- 공감 버튼을 누르게 만드는 문장 1개
- 댓글을 부르는 열린 문장 1개
- 스크랩 욕구를 자극하는 문장 1개

────────────────────
[자연스러움 강제 규칙]

- 무조건 구어체 "~해요"
- 한 문장 20~30자 이내
- 연결어 남용 금지
- 독자를 가르치려 들지 말 것
- 과도한 감정 표현, 자극적 표현 금지

────────────────────
[금지 표현]

- 기자체, 보고서체, 설명체 전면 금지
- 다음 표현 절대 사용 금지:
  "물론", "사실", "확실히", "~것입니다",
  "전문가에 따르면", "정리하자면", "요약하면"
- AI 티 나는 정리 문장 금지

────────────────────
[출력 형식 — 반드시 이 순서]

1️⃣ 제목 3개 (줄바꿈)
2️⃣ 본문 전체
3️⃣ 해시태그 5~7개 (핵심 단어 중심)

이 규칙을 단 한 줄도 어기지 말고 즉시 작성하라.
`.trim();

// ✅ 기본 프롬프트 (SEO 모드가 기본값)
const SYSTEM_PROMPT = SYSTEM_PROMPT_SEO;

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

  // ✅ 2026-01-04: 모델 강제 변환(터보 모드) 제거 - 사용자가 선택한 모델 존중
  // (이전에는 Pro 모델을 Flash로 강제 변환했으나, 할당량 문제 및 사용자 혼란 방지)

  // 유효성 검사: gemini- 로 시작하는 모든 모델 허용
  if (!configuredModel.startsWith('gemini-')) {
    console.warn(`[Gemini] 경고: 비표준 모델명 감지 (${configuredModel}). 실행은 계속됩니다.`);
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

function buildEnhancedPrompt(topic: string, options: GenerateOptions = {}): string {
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

  console.log(`[Gemini] 2축 분리 프롬프트 생성: mode=${contentMode}, category=${categoryHint || 'general'}`);

  // ✅ 홈판 모드일 경우 간단한 프롬프트 사용
  if (contentMode === 'homefeed') {
    return `
${selectedPrompt}

# 작성 주제
${topic}
${keywords.length > 0 ? `\n# 관련 키워드: ${keywords.join(', ')}` : ''}
`.trim();
  }

  // ✅ SEO 모드일 경우 기존 상세 프롬프트 사용
  const toneGuide = {
    friendly: '친구와 대화하듯 편안하고 친근하게',
    professional: '전문적이지만 이해하기 쉽게',
    casual: '매우 가볍고 재미있게',
  };

  return `
${selectedPrompt}

# 글 작성 요구사항
- **주제**: ${topic}
- **타겟 독자**: ${targetAudience}
- **톤**: ${toneGuide[tone]}
- **목표 분량**: ${wordCount}자 (±200자)
${keywords.length > 0 ? `- **필수 키워드**: ${keywords.join(', ')} (자연스럽게 3회 이상 포함)` : ''}
${includeImages ? '- **이미지 삽입 위치**: [이미지: 설명] 형태로 표시' : ''}

# 글 구조
1. **제목** (30자 이내, SEO 최적화)
2. **도입부** (100-150자, 독자 관심 유도)
3. **본문** (3-5개 소제목, 각 300-500자)
4. **마무리** (100-150자, 핵심 요약 + CTA)
5. **추천 태그** (5-10개)

지금 바로 작성을 시작하세요.
`.trim();
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

  const enhancedPrompt = buildEnhancedPrompt(trimmedPrompt, options);

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
    for (let modelIdx = 0; modelIdx < FALLBACK_MODELS.length; modelIdx++) {
      const modelName = FALLBACK_MODELS[modelIdx];
      let perModelRetryCount = 0;
      const PER_MODEL_MAX = 1; // ✅ 2 → 1 (빠른 모델 전환)

      while (perModelRetryCount < PER_MODEL_MAX) {
        try {
          const client = getClient(apiKey);
          const model = client.getGenerativeModel({
            model: modelName,
            generationConfig: {
              temperature: 0.95,
              maxOutputTokens: 4096,  // ✅ 2048 → 4096 증가: 쇼핑커넥트 등 풍부한 콘텐츠 생성
              topP: 0.95,
              topK: 50,
            },
          });

          console.log(`[Gemini Request] Model: ${modelName}, Topic: ${enhancedPrompt.substring(0, 50)}...`);
          const apiResult = await model.generateContent(enhancedPrompt);
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
              promptTokens: usage?.promptTokenCount || 0,
              completionTokens: usage?.candidatesTokenCount || 0,
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

  const enhancedPrompt = buildEnhancedPrompt(prompt, options);
  let lastError: Error | null = null;

  // 스트리밍에서의 모델 폴백 체인 (generateBlogContent와 동일한 순서 보장)
  for (const modelName of FALLBACK_MODELS) {
    try {
      console.log(`[Gemini Stream] Attempting with model: ${modelName}`);
      const client = getClient(apiKey);
      const model = client.getGenerativeModel({
        model: modelName,
        generationConfig: {
          temperature: 0.95,
          maxOutputTokens: 4096,
          topP: 0.95,
          topK: 50,
        },
      });

      const result = await model.generateContentStream(enhancedPrompt);

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
      model: 'gemini-2.0-flash',  // 빠른 모델 사용
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
      model: 'gemini-2.0-flash',
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
      model: 'gemini-2.0-flash',
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
