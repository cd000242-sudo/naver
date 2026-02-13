/**
 * 프롬프트 로더 - 2축 분리 구조 (노출 목적 × 카테고리)
 * 
 * 축 1: 노출 목적 (mode)
 *   - homefeed: 홈판(메인·추천) 노출 최적화
 *   - seo: 검색 상위노출 최적화
 * 
 * 축 2: 카테고리 (category)
 *   - entertainment: 연예
 *   - society: 시사/사회
 *   - health: 건강
 *   - it: IT/테크
 *   - life: 라이프/일상
 *   - general: 일반 (카테고리 없음)
 */

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

// 프롬프트 디렉토리 경로 (개발/프로덕션 환경 모두 지원)
function getPromptsDir(): string {
  // 개발 환경: src/prompts
  // 프로덕션: extraResources로 배포된 prompts 폴더 (resources/prompts)
  const isDev = !app.isPackaged;

  if (isDev) {
    return path.join(app.getAppPath(), 'src', 'prompts');
  } else {
    // 패키지 환경: extraResources로 배포된 prompts 폴더 사용
    // process.resourcesPath = .../resources 폴더
    return path.join(process.resourcesPath, 'prompts');
  }
}

// 프롬프트 모드 타입
export type PromptMode = 'seo' | 'homefeed' | 'traffic-hunter' | 'affiliate' | 'custom';

// 프롬프트 카테고리 타입
export type PromptCategory =
  | 'entertainment'  // 연예
  | 'society'        // 시사/사회
  | 'health'         // 건강
  | 'it'             // IT/테크
  | 'life'           // 라이프/일상
  | 'tips'           // 생활 꿀팁
  | 'living'         // 리빙/인테리어
  | 'fashion'        // 패션/뷰티
  | 'parenting'      // 육아/교육
  | 'pet'            // 반려동물
  | 'food'           // 요리/맛집
  | 'travel'         // 여행
  | 'general';       // 일반 (카테고리 보정 없음)

// 한국어 카테고리 힌트 → 영어 카테고리 매핑
const CATEGORY_MAP: Record<string, PromptCategory> = {
  // 연예
  '연예': 'entertainment',
  '스포츠': 'entertainment',
  '방송': 'entertainment',
  '아이돌': 'entertainment',
  '드라마': 'entertainment',
  '영화': 'entertainment',

  // 시사/사회
  '시사': 'society',
  '사회': 'society',
  '정치': 'society',
  '경제': 'society',
  '국제': 'society',
  '뉴스': 'society',

  // 건강
  '건강': 'health',
  '의료': 'health',
  '다이어트': 'health',
  '운동': 'health',
  '피트니스': 'health',

  // IT/테크
  'IT': 'it',
  '테크': 'it',
  '기술': 'it',
  '디지털': 'it',
  '앱': 'it',
  '게임': 'it',

  // 라이프
  '라이프': 'life',
  '일상': 'life',
  '생활': 'tips',
  '생활꿀팁': 'tips',
  '꿀팁': 'tips',
  '살림': 'tips',
  '노하우': 'tips',
  '여행': 'travel',
  '음식': 'food',
  '맛집': 'food',
  '레시피': 'food',
  '요리': 'food',
  '패션': 'fashion',
  '뷰티': 'fashion',
  '인테리어': 'living',
  '리빙': 'living',
  '육아': 'parenting',
  '교육': 'parenting',
  '반려동물': 'pet',
  '쇼핑': 'life',
  '자동차': 'life',
};

// 프롬프트 캐시
const promptCache = new Map<string, string>();

/**
 * 프롬프트 파일 로드
 */
function loadPromptFile(filePath: string): string {
  // 캐시 확인
  if (promptCache.has(filePath)) {
    return promptCache.get(filePath)!;
  }

  try {
    const fullPath = path.join(getPromptsDir(), filePath);
    const content = fs.readFileSync(fullPath, 'utf-8').trim();
    promptCache.set(filePath, content);
    return content;
  } catch (error) {
    console.warn(`[PromptLoader] 프롬프트 파일 로드 실패: ${filePath}`, error);
    return '';
  }
}

/**
 * 한국어 카테고리 힌트를 영어 카테고리로 변환
 */
export function resolveCategory(categoryHint?: string): PromptCategory {
  if (!categoryHint) return 'general';

  // 직접 매핑 확인
  const mapped = CATEGORY_MAP[categoryHint];
  if (mapped) return mapped;

  // 부분 매칭 시도
  for (const [hint, category] of Object.entries(CATEGORY_MAP)) {
    if (categoryHint.includes(hint) || hint.includes(categoryHint)) {
      return category;
    }
  }

  return 'general';
}

/**
 * 2축 분리 구조로 시스템 프롬프트 생성
 * 
 * @param mode - 노출 목적 (seo | homefeed)
 * @param category - 카테고리 (entertainment | society | health | it | life | general)
 * @returns 합성된 시스템 프롬프트
 * 
 * 합성 순서: [노출 목적 base] + [카테고리 보정 prompt]
 */
export function buildSystemPrompt(mode: PromptMode, category: PromptCategory = 'general'): string {
  // 1. 노출 목적 base 프롬프트 로드
  const basePrompt = loadPromptFile(`${mode}/base.prompt`);

  if (!basePrompt) {
    console.error(`[PromptLoader] base 프롬프트 로드 실패: ${mode}/base.prompt`);
    return getFallbackPrompt(mode);
  }

  // 2. 카테고리가 general이면 base만 반환
  if (category === 'general') {
    return basePrompt;
  }

  // 3. 카테고리 보정 프롬프트 로드
  const categoryPrompt = loadPromptFile(`${mode}/${category}.prompt`);

  if (!categoryPrompt) {
    console.warn(`[PromptLoader] 카테고리 프롬프트 없음: ${mode}/${category}.prompt - base만 사용`);
    return basePrompt;
  }

  // 4. 합성: base + 카테고리 보정
  return `${basePrompt}\n\n${categoryPrompt}`;
}

/**
 * ContentSource의 categoryHint를 사용해 시스템 프롬프트 생성
 */
export function buildSystemPromptFromHint(mode: PromptMode, categoryHint?: string): string {
  const category = resolveCategory(categoryHint);
  return buildSystemPrompt(mode, category);
}

/**
 * 폴백 프롬프트 (파일 로드 실패 시)
 */
function getFallbackPrompt(mode: PromptMode): string {
  if (mode === 'homefeed') {
    return `
너는 네이버 홈판(메인·추천) 노출만을 목적으로 설계된 콘텐츠 생성 엔진이다.
검색엔진 최적화(SEO), 정보성 글쓰기, 설명형 문장은 전혀 고려하지 않는다.

[절대 목표]
- 첫 3줄 안에 스크롤을 멈추게 할 것
- 클릭 후 체류 시간을 늘릴 것
- 공감·댓글·스크랩 반응을 유도할 것
- 기자 글, 정보 글처럼 보이지 않게 할 것

[자연스러움 강제 규칙]
- 무조건 구어체 "~해요"
- 한 문장 20~30자 이내
- 연결어 남용 금지
`.trim();
  }

  // SEO 모드 폴백
  return `
당신은 10년 경력의 전문 블로그 콘텐츠 크리에이터입니다.

# 핵심 목표
- 네이버 블로그 검색 최적화 (SEO)
- 독자 체류 시간 증가
- 자연스러운 한국어 표현

# 글쓰기 원칙
1. 도입부: 독자의 호기심을 자극하는 질문이나 상황으로 시작
2. 본문: 소제목(H2) 3-5개로 구조화
3. 톤앤매너: 친근하되 전문적, "~해요" 체 사용
4. 마무리: 핵심 요약 + 행동 유도(CTA)
`.trim();
}

/**
 * 프롬프트 캐시 초기화
 */
export function clearPromptCache(): void {
  promptCache.clear();
  console.log('[PromptLoader] 프롬프트 캐시 초기화됨');
}

/**
 * 사용 가능한 모든 카테고리 목록 반환
 */
export function getAvailableCategories(): PromptCategory[] {
  return [
    'entertainment',
    'society',
    'health',
    'it',
    'life',
    'tips',
    'living',
    'fashion',
    'parenting',
    'pet',
    'food',
    'travel',
    'general'
  ];
}

/**
 * 사용 가능한 모든 모드 목록 반환
 */
export function getAvailableModes(): PromptMode[] {
  return ['seo', 'homefeed', 'traffic-hunter'];
}

/**
 * 완전자동 발행용 보조 프롬프트 로드
 * 
 * AI가 선택하지 않고 시스템이 처리하기 쉬운 정규화된 출력을 생성하도록 함
 * - [TITLE_1], [TITLE_2], [TITLE_3] 형식의 제목
 * - {{SELECTED_TITLE}} 토큰으로 제목 위치 표시
 */
export function getAutomationPrompt(): string {
  const automationPrompt = loadPromptFile('automation.prompt');

  if (!automationPrompt) {
    console.warn('[PromptLoader] automation.prompt 로드 실패 - 폴백 사용');
    return getAutomationFallbackPrompt();
  }

  return automationPrompt;
}

/**
 * 자동화 보조 프롬프트 폴백
 */
function getAutomationFallbackPrompt(): string {
  return `
────────────────────
[완전자동 발행 시스템 출력 규칙]

너는 자동 발행 시스템과 함께 동작하는 출력 생성기다.

[제목 출력 규칙]
- 제목은 정확히 3개만 생성한다.
- 형식: [TITLE_1] 제목내용 / [TITLE_2] 제목내용 / [TITLE_3] 제목내용

[본문 출력 규칙]
- 본문에는 제목을 직접 삽입하지 않는다.
- 제목 위치에는 {{SELECTED_TITLE}} 토큰만 사용한다.

[금지 사항]
- "추천 제목", "가장 강한 제목" 표현 금지
- 제목 비교, 평가, 설명 금지
`.trim();
}

/**
 * 완전자동 발행용 전체 프롬프트 생성
 * 
 * 합성 순서: [노출 목적 base] + [카테고리 보정] + [자동화 보조]
 * 
 * @param mode - 노출 목적 (seo | homefeed)
 * @param categoryHint - 카테고리 힌트 (한국어)
 * @param isFullAuto - 완전자동 발행 모드 여부
 */
/**
 * 말투(Tone)에 따른 추가 지침 생성
 */
function getToneInstruction(toneStyle?: string): string {
  const ts = String(toneStyle || '').toLowerCase().trim();
  if (!ts) return ''; // 말투 미지정 시 보정 없음

  let instruction = '';

  switch (ts) {
    case 'friendly':
      instruction = `
[STYLE OVERRIDE: FRIENDLY & WARM]
- ★ 문체 규칙: 친한 친구나 다정한 언니가 이야기하듯 따뜻하게 작성하세요.
- ★ 필수 어미: "~해요", "~했답니다", "~더라고요", "~인 것 같아요" (부드러운 구어체 강제)
- ★ 필수 요소: "저도 정말 공감되는데요", "이런 고민 한 번쯤 해보셨죠?" 등 공감 문구 3개 이상 삽입
- ★ 금지: "~함", "~임", "~이다" 등 딱딱한 어휘, 격식 차리는 표현 전면 금지
      `.trim();
      break;
    case 'professional':
      instruction = `
[STYLE OVERRIDE: PROFESSIONAL & ANALYTICAL]
- ★ 문체 규칙: 10년 경력의 해당 분야 전문가가 작성하는 칼럼 뉴스와 같은 명확한 어조.
- ★ 필수 구조: "첫째, 둘째" 식의 논리적 열거, "데이터에 따르면", "전망을 분석해보면" 등 전문 용어 활용.
- ★ 필수 어미: "~합니다", "~적입니다", "~할 것으로 보입니다" (신뢰감 주는 종결 어미)
- ★ 필수 요소: 객관적인 사실 근거, 인과관계가 명확한 문장 구성.
- ★ 금지: "대박", "헐", "ㅠㅠ" 등 가벼운 표현, 주관적인 감정 이입 절대 금지.
      `.trim();
      break;
    case 'casual':
      instruction = `
[STYLE OVERRIDE: CASUAL & LIGHT]
- ★ 문체 규칙: 격식을 0%로 낮춘 산뜻하고 발랄한 블로그 말투.
- ★ 필수 어미: "~하죠", "~네요", "~함", "~함!" (다양한 종결 어미를 섞어 리듬감 부여)
- ★ 필수 요소: "오늘 날씨 대박이죠?", "완전 취향 저격!" 등 가벼운 감탄사와 트렌디한 표현.
- ★ 금지: "~습니다", "~합니다" 등 무거운 표현, 지나치게 긴 설명문 금지.
      `.trim();
      break;
    case 'humorous':
      instruction = `
[STYLE OVERRIDE: HUMOROUS & WITTY]
- ★ 문체 규칙: 개그감이 넘치고 재치 있는 비유를 곁들인 즐거운 어투.
- ★ 필수 요소: 괄호 속 혼잣말(예: "진짜라니까요(진지)"), "무릎을 탁 쳤다", "눈물이 앞을 가린다" 등 극적인 비유.
- ★ 필수 어미: "~거든요?", "~겠어요?", "~답니다(씨익)" 등 익살스러운 어휘.
- ★ 금지: 지루한 설명, 평이한 문장 흐름, 교과서적인 정보 전달 금지.
      `.trim();
      break;
    case 'community_fan':
      instruction = `
[STYLE OVERRIDE: COMMUNITY FAN & CHATTY]
- ★ 문체 규칙: 네이트판, 더쿠, 인스티즈 등 '찐팬'들의 호들갑스러운 실시간 수다 말투.
- ★ 필수 어미: "~거든요ㅠ", "~미쳤음", "~대박임", "~아니냐고", "~실화냐" (커뮤니티 구어체 200% 적용)
- ★ 필수 요소: "아니 진짜..", "와 소름 돋았음", "헐 대박사건", "나만 떨림?" 등의 강력한 감탄사 매 문장마다 사용.
- ★ 금지: 격식 있게 인사하기, "~습니다" 사용, 정갈한 문장 구조 절대 금지 (날것의 느낌 유지).
      `.trim();
      break;
    case 'mom_cafe':
      instruction = `
[STYLE OVERRIDE: MOM CAFE & LIVING EXPERT]
- ★ 문체 규칙: 맘카페의 살림 고수 '친절한 언니/동생' 말투.
- ★ 필수 어미: "~했어용", "~했더라구요~", "~거든요^^", "~답니당ㅎㅎ" (물결과 웃음 기호 필수 결합)
- ★ 필수 요소: "울 남편", "애기들", "우리 집은~" 등 가족/생활 밀착형 예시 주입.
- ★ 금지: 딱딱한 정보 나열, "본문", "결사" 등 분석적 표현, 공격적인 말투 전면 금지.
      `.trim();
      break;
    case 'formal':
      instruction = `
[STYLE OVERRIDE: FORMAL & POLITE]
- ★ 문체 규칙: 호텔 지배인이나 아나운서가 말하듯 극도로 정중하고 정제된 언어.
- ★ 필수 어미: "~습니다", "~하십시오", "~입니까?" (완벽한 하십시오체/취향체)
- ★ 필수 요소: "안녕하십니까", "모시겠습니다", "심혈을 기울여" 등 격조 높은 어휘.
- ★ 금지: 모든 약어, 인터넷 용어, 이모지, 구어체 표현 절대 금지.
      `.trim();
      break;
  }

  return instruction ? `\n\n${instruction}\n` : '';
}

// ✅ [2026-01-30] 제품 정보 파라미터 타입
interface ProductInfoForPrompt {
  name?: string;
  spec?: string;
  price?: string;
  reviews?: string[];
}

export function buildFullPrompt(
  mode: PromptMode,
  categoryHint?: string,
  isFullAuto: boolean = false,
  toneStyle?: string,
  productInfo?: ProductInfoForPrompt  // ✅ [2026-01-30] 제품 정보 파라미터 추가
): string {
  // 1. 기본 2축 분리 프롬프트
  const basePrompt = buildSystemPromptFromHint(mode, categoryHint);

  // 2. 말투(Tone) 보정 프롬프트 추가 (가장 강력하게 작용하도록 상단 배치 고려 가능하나, 보통 뒤에 붙여도 됨)
  const tonePrompt = getToneInstruction(toneStyle);

  let finalPrompt = basePrompt;

  // 3. 완전자동 모드면 자동화 보조 프롬프트 추가
  if (isFullAuto) {
    const automationPrompt = getAutomationPrompt();
    console.log(`[PromptLoader] 완전자동 발행 모드: 자동화 보조 프롬프트 추가`);
    finalPrompt = `${finalPrompt}\n\n${automationPrompt}`;
  }

  // 4. 말투(Tone) 지침을 가장 마지막에 추가 (AI에 대한 최종 가중치 부여)
  if (tonePrompt) {
    console.log(`[PromptLoader] 말투 보정 최종 적용: ${toneStyle}`);
    finalPrompt = `${finalPrompt}\n\n${tonePrompt}`;
  }

  // 5. 원본 제목 활용 지침 (70/30 전략)
  finalPrompt += `\n\n[원본 제목 활용 지침 (70/30 전략)]
- 입력 데이터에 'SOURCE TITLE'이 있다면 이를 제목의 뼈대(70%)로 삼으세요.
- 원본 제목의 핵심 키워드와 주어를 유지하되, 나머지 30%를 AI의 후킹/심리 트리거로 채워 클릭률을 높이세요.
- **[필수]** 주제를 왜곡하거나 정보를 누락하지 말고, 원본의 의도를 살리면서 더 매력적인 문장으로 변환하세요.`;

  // ✅ [2026-01-30] 쇼핑커넥트 제품 정보 블록 추가
  if (productInfo && (productInfo.name || productInfo.spec || productInfo.price || productInfo.reviews?.length)) {
    console.log(`[PromptLoader] 🛒 쇼핑커넥트 제품 정보 프롬프트에 추가`);

    let productBlock = `\n\n[쇼핑커넥트 제품 정보 - 반드시 활용하세요!]\n`;

    if (productInfo.name) {
      productBlock += `📦 제품명: ${productInfo.name}\n`;
    }
    if (productInfo.price) {
      productBlock += `💰 가격: ${productInfo.price}\n`;
    }
    if (productInfo.spec) {
      productBlock += `📋 스펙: ${productInfo.spec}\n`;
    }
    if (productInfo.reviews && productInfo.reviews.length > 0) {
      productBlock += `⭐ 실제 구매자 리뷰:\n`;
      productInfo.reviews.forEach((review, idx) => {
        productBlock += `  ${idx + 1}. "${review.substring(0, 200)}${review.length > 200 ? '...' : ''}"\n`;
      });
    }

    productBlock += `
[제품 정보 활용 지침]
- 위 제품 정보를 본문에 자연스럽게 녹여서 작성하세요.
- 가격 정보는 "현재 XX원에 판매 중" 형식으로 언급하세요.
- 스펙 정보는 장점으로 풀어서 설명하세요 (예: "크기가 445mm로 슬림해서 어디든 배치 가능").
- 리뷰는 "실제 구매하신 분들 반응을 보면~" 형식으로 인용하세요.
- 정보를 지어내지 말고, 위에 제공된 정보만 활용하세요.

[🛒 쇼핑커넥트 필수 제목 규칙]
⛔ 크롤링된 상품 1개만 사용. 다른 상품과 비교 금지!

📌 상품명 축약 규칙:
원본 상품명이 너무 길면 "브랜드명 + 핵심 모델명"으로 축약 (수식어구 제거)
예: "LG전자 오브제컬렉션 코드제로 A9S 무선청소기" → "LG 코드제로 A9S"

📌 제목 공식 (25~40자):
{축약된 상품명} + {상품 특성 키워드} + {정합성 맞는 자유 조합}

📌 키워드 정합성 규칙:
- 고가 제품(100만원+) → "프리미엄", "대가족", "신혼" 가능
- 저가 제품(30만원-) → "가성비", "입문용", "원룸", "1인가구" 가능
- 가격대와 맞지 않는 키워드 금지!

📌 자유 조합 예시:
- 대상: 원룸, 1인가구, 신혼, 직장인, 반려동물집
- 시점: 2026, 최신, 요즘인기, 신제품
- 평가: 가성비, 만족도, 추천이유, 구매꿀팁

⛔ 금지 패턴:
- 상품명만 (중복됨)
- "총정리", "리뷰"로만 끝남 (흔함)
- OO vs OO 비교 (상품 1개뿐)`;

    finalPrompt += productBlock;
  }

  return finalPrompt;
}
