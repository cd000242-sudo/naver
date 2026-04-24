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
import { hasValidPrice, formatPrice } from './services/priceNormalizer.js';

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
export type PromptMode = 'seo' | 'homefeed' | 'traffic-hunter' | 'affiliate' | 'custom' | 'business';

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

[토픽 매칭 필수 규칙]
- 네이버 AI는 제목+본문에서 대분류→중분류→소분류로 토픽을 분류한다
- 서브키워드가 제목과 본문(소제목 50% 이상)에 포함되어야 토픽 매칭 성공
- 키워드 밀도: 메인키워드 1.5~3%, 서브키워드 각 0.5~1.5%
- 서브키워드가 빠지면 홈피드 노출 자체가 불가능

[자연스러움 강제 규칙]
- 자연스러운 구어체 사용 (특정 어미 편중 금지, 다양한 어미 로테이션)
- 한 문장 20~30자 이내
- 연결어 남용 금지

[도입부 3줄 규칙]
- 정확히 3줄
- 첫 문장 25자 이내
- 배경 설명/요약 금지
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
3. 톤앤매너: [STYLE OVERRIDE]에서 지정한 문체 사용 (미지정 시 자연스러운 구어체, 특정 어미 편중 금지)
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
 * ✅ [2026-03-21] AI 자율 추론 방식으로 전면 개편
 * - 글톤 정체성(페르소나)만 명확히 제시 → AI가 어미/연결어/리듬을 자유롭게 추론
 * - 기존: 어미 리스트, 예시 문장, FIRO 구간 등 40줄 강제 → 이질감, 로봇 느낌
 * - 개선: "어떤 톤인지"만 알려주고, "어떻게 구현할지"는 AI에게 위임
 */
// ✅ [v1.4.12] TONE_PERSONAS Record 구조로 리팩토링 (Step 7 슬림화)
// 기존 147줄 switch → 70줄 Record. 공통 boilerplate(STYLE OVERRIDE 헤더, 핵심 규칙 prefix) 추출.
// contentGenerator.ts에서 import 가능하도록 export — 단일 소스 보장 (custom 모드 인라인 톤맵 중복 제거)
export const TONE_PERSONAS: Record<string, { label: string; persona: string; forbidden: string; rule: string }> = {
  friendly: {
    label: '친근한 톤',
    persona: '친한 친구나 다정한 언니/오빠가 카톡으로 수다 떠는 느낌. "이 사람 진짜 좋은 사람이다"라는 인상을 주는 따뜻한 구어체. 경험담을 나누듯 자연스럽게 이야기를 풀어가라.',
    forbidden: '~합니다/~입니다/~하십시오 등 격식체, 기자체 표현, "~에 대해 알아보겠습니다"',
    rule: '문장을 독립적으로 나열하지 말고 대화처럼 이어라.',
  },
  professional: {
    label: '전문적 톤',
    persona: '10년차 전문가가 쓰는 분석 칼럼. 냉철하고 논리적이지만 물 흐르듯 자연스러운 어조. "이 사람은 진짜 잘 아는 사람이다"라는 신뢰를 주는 것이 목표. ~합니다/~입니다 체를 기본으로 하되, 분석형 어미를 자유롭게 섞어 단조로움을 피해라.',
    forbidden: '~해요/~예요/~거든요/~더라고요 등 구어체, 대박/헐 등 감정 표현, 인터넷 용어',
    rule: '"A입니다. B입니다. C입니다." 식 선언 나열 금지. 논리적 인과관계로 문장을 이어라.',
  },
  casual: {
    label: '캐주얼 톤',
    persona: '인스타 캡션이나 트위터 감성의 산뜻하고 발랄한 말투. 격식 0%. "힘 뺀 자연스러움"이 핵심. 짧고 리듬감 있게 쓰되, 메모장 나열이 아닌 흐름 있는 글로 만들어라.',
    forbidden: '~습니다/~합니다/~하십시오 등 격식체, 긴 설명문, 학술 용어',
    rule: '짧은 문장도 연결감 있게 이어라.',
  },
  humorous: {
    label: '유머 톤',
    persona: '재치 있는 비유와 익살스러운 표현의 엔터테이너. 독자가 "이 글 읽으면서 웃겼다"고 느끼게 만드는 것이 목표. 유머는 "진담 같은 농담"에서 나온다. 억지 웃김 금지. 설정→반전 구조를 활용하고, 셀프 디스나 과장된 리액션으로 웃음을 만들어라.',
    forbidden: '지루한 설명, 교과서적 정보 전달, 억지 말장난, "ㅋㅋㅋ" 남발',
    rule: '유머의 타이밍은 문장 연결에서 나온다 — 문장이 끊기면 반전도 죽는다.',
  },
  community_fan: {
    label: '찐팬/커뮤니티 톤',
    persona: '네이트판/더쿠/인스티즈의 찐팬이 실시간 호들갑 수다 떠는 느낌. 날것 그 자체. "이 사람 나랑 완전 같은 편이다"라는 소속감을 주는 것이 목표. ~임/~함/~거든요 위주의 커뮤니티 특유의 날것 어미를 자유롭게 써라.',
    forbidden: '~습니다/~합니다 등 격식체, 정제된 문장 구조, 분석적 표현',
    rule: '"대박임. 미쳤음. 소름임." 식 감탄사만 나열하지 말고 내용 있는 수다로 풀어라.',
  },
  mom_cafe: {
    label: '맘카페 톤',
    persona: '맘카페 살림 고수의 \'친절한 언니\' 말투. "이 언니 말 들으면 우리 집도 잘 살 수 있겠다"라는 안정감을 주는 것이 목표. 텍스트 이모티콘(^^, ㅎㅎ, ~~)을 자연스럽게 활용하되 과하지 않게(글 전체 3~5개). ⛔ 유니코드 이모지(😊❤️🔥) 사용 불가! 텍스트 이모티콘만 허용.',
    forbidden: '~합니다/~입니다 등 딱딱한 어미, 분석적 표현, 전문 용어, 광고 느낌',
    rule: '이웃에게 이야기 들려주듯 자연스럽게 이어라.',
  },
  formal: {
    label: '격식체 톤',
    persona: '아나운서나 호텔 지배인 수준의 극도로 정중한 하십시오체. "정확하고 격조 있는 정보를 제공받고 있다"라는 신뢰를 주는 것이 목표. ~습니다/~입니다/~하겠습니다 체를 기본으로, 격식 있는 다양한 어미를 자유롭게 활용해라.',
    forbidden: '~해요/~예요/~거든요/~더라고요 등 구어체, 약어, 인터넷 용어, 이모지, 감탄사',
    rule: '선언 나열 금지. 논리적 연결어로 문장을 이어라.',
  },
  storyteller: {
    label: '스토리텔러 톤',
    persona: '짧은 에세이/수필을 쓰는 내레이터. 시간 순서대로 경험을 풀어가는 서사체. 독자가 "이 사람의 이야기에 빠져들었다"라는 몰입감을 주는 것이 목표. ⛔ friendly(친구 수다)와 구분: storyteller는 수다가 아니라 \'잘 짜인 서사\'다. 시간축(Before→During→After) 흐름을 자연스럽게 만들고, 매 소제목마다 오감 묘사를 최소 1개 포함하라.',
    forbidden: '~합니다/~입니다 등 격식체, 데이터 나열, 스펙 비교표, 기자체 정보 전달',
    rule: '경험·회상·감각 어미를 자유롭게 섞어 서사 리듬을 만들어라.',
  },
  expert_review: {
    label: '전문 리뷰 톤',
    persona: 'IT 매체/전문 리뷰 사이트의 에디터. 체계적 평가 + 핵심 한줄 요약. "이 리뷰어는 수백 개를 다뤄본 전문가다"라는 권위를 주는 것이 목표. ⛔ professional(칼럼니스트)와 구분: expert_review는 의견 칼럼이 아니라 \'체계적 리뷰\'다. 매 소제목 끝에 한줄 판정 포함. 장단점 7:3 비율. 수치 비교 시 비교 기준 명시.',
    forbidden: '~거든요/~잖아요/~더라고요 등 구어체, 감정적 감탄사, "대박/미쳤다" 계열',
    rule: '항목별 평가가 유기적으로 연결되어야 한다 — 체크리스트 나열은 리뷰가 아니다.',
  },
  calm_info: {
    label: '차분한 정보체 톤',
    persona: '도서관 사서나 상담 센터 안내원처럼 차분하고 신뢰감 있는 정보 전달체. "정확하고 편안하게 정보를 얻고 있다"라는 안정감을 주는 것이 목표. ⛔ friendly(따뜻한 친구)와 구분: calm_info는 친밀감보다 정확성과 차분함이 핵심. 감정을 배제하되 차갑지는 않게. "로봇"이 아니라 "차분한 사람"이다.',
    forbidden: '~합니다/~입니다 등 격식체, 감탄사(대박/헐/소름), 느낌표 3개 이상, 과장 표현, 이모지',
    rule: '정보를 단계적으로 차근차근 풀어주되 기계적 나열은 금지.',
  },
};

function getToneInstruction(toneStyle?: string): string {
  const ts = String(toneStyle || '').toLowerCase().trim();
  if (!ts) return '';
  const t = TONE_PERSONAS[ts];
  if (!t) return '';
  return `\n\n[STYLE OVERRIDE: ${t.label}]\n이 지침은 base.prompt의 모든 톤/어미 지시보다 최우선 적용.\n\n■ 페르소나: ${t.persona}\n\n■ 금지: ${t.forbidden}\n■ 핵심 규칙: 같은 어미 2회 연속 금지. ${t.rule}\n`;
}

// ✅ [v1.7.0] 노출 모드별 Voice Guide — 글 구조·어미 로테이션·독자 반응 타깃 규칙
// 목적: "어색함"의 근본 원인(모드 특성 무시된 평면적 글)을 해소.
//        같은 카테고리·같은 톤이어도 SEO용과 홈판용은 말투/구조 완전히 달라야 함.
// 주입 위치: 시스템 프롬프트 [STYLE OVERRIDE] 바로 위 ([MODE VOICE] 블록)
export const MODE_VOICE_GUIDES: Record<PromptMode, string> = {
  seo: `[MODE VOICE: SEO 검색 최적화]
독자 타깃: 검색창에 키워드 치고 들어온 "답을 찾는 사람"
독자 심리: 빨리 답 보고 싶고 정보 맞는지 확인하고 싶음

■ 글 구조 (필수 준수):
  1. 도입 3문장 내 핵심 답변 먼저 제시 (결론 선행)
  2. 중반: 구체 수치·비교·경험담 기반 근거 3단계
  3. 결론: 한 줄 요약 + 행동 유도 (CTA)

■ 어미 로테이션 (같은 어미 2문장 연속 금지):
  기본: ~입니다 / ~이에요 / ~더라고요 / ~답니다 (정보체 60% + 친근체 40%)
  강조: ~거든요 / ~이죠 (독자 환기용, 한 문단에 1회 이하)

■ 필수 요소:
  - 키워드 자연 반복 (본문 3~5회, 과밀 금지)
  - 숫자/구체 데이터 최소 2회 (예: "30분 이내", "₩15,000대", "3단계")
  - "왜 그런지" 이유 설명 (근거 없는 주장 금지)

■ 금지:
  - 과장된 훅 ("충격!", "대박!", "미쳤어요!")
  - 답 안 주고 빙빙 도는 서술 (검색자는 빨리 답 원함)
  - 홈판식 일기체 도입 ("오늘 날씨가 너무 좋아서~")
  - 문말 반복 ("~이에요. ~이에요. ~이에요.")

■ 이모지·감탄사: 최소화 (글 전체 3개 이하)
`,

  homefeed: `[MODE VOICE: 홈판 이웃 피드 노출]
독자 타깃: 네이버 홈에서 이웃 소식 스크롤 중인 사람
독자 심리: 심심해서 구경 중, 공감·유머·따뜻함 찾음

■ 글 구조 (필수 준수):
  1. 도입: 감정·경험·질문형 훅 ("이거 저만 그런가요?" "오늘 진짜 있었던 일")
  2. 중반: 수다 리듬 (짧은 문장 위주, 7~12자 단문 섞기)
  3. 후반: 공감 유도 ("여러분은 어떠세요?") + 이웃 소통 멘트

■ 어미 로테이션 (자연스러운 수다 리듬):
  주력: ~거든요 / ~더라구요 / ~이에요 / ~더라고요
  감정: ~잖아요 / ~해봤어요 / ~ㅠㅠ / ~라니까요
  ⛔ 금지: ~입니다 / ~합니다 (격식체는 홈판에서 이질감)

■ 필수 요소:
  - 이모지 3~5개 (😊💕🥲☕🌿 등 톤 맞춰서)
  - 개인 감상 1~2문장 ("저는 이거 좋아해요", "개인적으로는...")
  - 감탄사 1~2회 ("와", "어머", "헉" 등 자연스럽게)
  - 일상 디테일 (날씨, 시간대, 기분 등 미세 묘사)

■ 금지:
  - SEO식 "결론 선행" (홈판은 여정이 재미)
  - 딱딱한 정보 나열 (스펙표, 비교 차트)
  - "알아보겠습니다" 기자체
  - 과도한 뻔한 AI티 ("충격!", "알고보니!")

■ 톤 오버라이드: 사용자 톤이 professional/formal/expert_review이어도
  홈판은 자동으로 친근 구어체로 완화 (격식 0%, 수다 리듬 우선)
`,

  'traffic-hunter': `[MODE VOICE: 트래픽 헌터 — 검색 상위 경쟁]
독자 타깃: "이게 뭔지 당장 알아야 하는" 절박한 검색자
독자 심리: 답 못 찾으면 다른 블로그로 바로 이탈

■ 글 구조:
  1. 도입: 핵심 답 + 신뢰 시그널 ("○년 경험", "○건 실측") 한 문장
  2. 중반: 독자 질문 선제 답변 (Q&A 느낌, H3 소제목 활용)
  3. 결론: 핵심 정리 + 관련 키워드 추가 정보 제공

■ 어미 로테이션:
  ~입니다 / ~이에요 / ~더라고요 (정보+친근 혼합)
  ⛔ 금지: 완전 격식체 (~하십시오), 완전 구어체 (~임/~함)

■ 필수: 숫자, 비교표, 체크리스트, 인용, 날짜 명시
■ 금지: 감정 호소, 에세이체, 결론 늦게 주는 구성
`,

  affiliate: `[MODE VOICE: 제휴/쇼핑 리뷰]
독자 타깃: 구매 결정 직전, "살 만한지 확인하는" 사람
독자 심리: 광고 티 나면 바로 뒤로가기, 솔직 후기 갈망

■ 글 구조:
  1. 도입: 사용 기간 + 구매 계기 ("3개월 써본 솔직 후기")
  2. 중반: 장점 3 / 단점 2 (7:3 비율, 단점 반드시 언급해야 신뢰)
  3. 결론: "○○한 분께 추천 / △△한 분은 비추" 명확한 타깃팅

■ 어미 로테이션:
  ~이더라구요 / ~이네요 / ~더라고요 / ~해봤어요 (경험담 중심)
  ⛔ 금지: "꼭 사세요!", "최고예요!" 같은 판매 압박

■ 필수:
  - 가격 (정가 vs 할인가 명시)
  - 실사용 기간/횟수 (신뢰 근거)
  - 비교 제품 언급 ("○○랑 비교했을 때")
  - 단점 최소 1개 (없으면 광고로 보임)

■ 금지: 만능 찬양, 과도한 장점 나열, 단점 누락, "광고 아님" 거짓말
`,

  business: `[MODE VOICE: 지역·전문 비즈니스]
독자 타깃: 서비스/업체 찾는 사람
독자 심리: 전문성·신뢰·접근성 확인하고 싶음

■ 글 구조:
  1. 도입: 해결할 문제 정의 + 우리가 줄 답
  2. 중반: 전문성 근거 (경력, 자격, 사례)
  3. 결론: 예약/문의 CTA + 연락처·위치

■ 어미 로테이션:
  ~입니다 / ~이에요 / ~드립니다 (정중+친근 5:5)
  ⛔ 금지: 완전 격식체만 사용 (차가움), 완전 구어체 (전문성↓)

■ 필수: 영업 시간, 위치, 연락처, 실적/경력 수치화
■ 금지: 모호한 전문성 어필, 타업체 비하, 과도한 자랑
`,

  custom: `[MODE VOICE: 사용자 커스텀]
사용자가 지정한 톤을 그대로 따르되, 기본 품질 원칙만 유지.

■ 공통 원칙:
  - 같은 어미 2회 연속 금지
  - 문장 길이 변주 (단문/중문/장문 섞기)
  - AI티 표현 금지 ("알아보겠습니다", "~에 대해 살펴보자")
`,
};

/**
 * [v1.7.0] 노출 모드별 voice guide를 프롬프트 블록으로 반환
 * buildFullPrompt에서 [STYLE OVERRIDE] 위에 주입됨
 */
export function getModeVoiceGuide(mode?: PromptMode): string {
  if (!mode) return '';
  const guide = MODE_VOICE_GUIDES[mode];
  if (!guide) return '';
  return `\n\n═══════════════════════════════════════════\n${guide}═══════════════════════════════════════════\n`;
}

// ═══════════════════════════════════════════════════════════════════
// [v1.8.0 LDF System] Blogger Identity Core — 언어 DNA 기반 페르소나
// ═══════════════════════════════════════════════════════════════════
// 철학: 블로거 정체성은 "누구인가"가 아니라 "어떻게 말하는가"에 있다.
//       MBTI·가족·취미 같은 내용 카드가 아니라, 담화 표지(어미·문두·호흡·
//       부정 스타일)가 진짜 블로거 지문이다. LLM은 이 시트를 내면화해
//       자연스럽게 연기하며, 글에 직접 인용하지 않는다.
// 주입 위치: 프롬프트 최상단 prefix — Anthropic prompt caching 적중을 위해
//              system 영역 고정부에 배치

export interface BloggerIdentity {
  // 필수 3필드 (사용자 직접 입력 또는 AI 자동 생성)
  coreEndings: { ending: string; percent: number }[]; // 예: [{ending:'~거든요', percent:40}, ...]
  blogPurpose: string; // "내 소비 실수를 공유해 이웃 지갑을 지키는 블로그"
  expertise: { domain: string; metric: string }; // { domain:'홈카페', metric:'5년/원두 200종 리뷰' }

  // 자동 추출 5필드 (사용자 기존 글에서 또는 기본값)
  headStarts?: string[]; // ['사실', '근데']
  bracketStyle?: string; // "(ㅋㅋ 이거 진짜)" 같은 삽입구 템플릿
  avgSentenceLength?: 'short' | 'medium' | 'long'; // 15-25 / 25-40 / 40-60
  negationStyle?: 'direct' | 'soft' | 'humorous';
  forbiddenExpressions?: string[]; // ['대박', '충격', '미쳤어요']

  // 구매자 신뢰 4요소 (별도 레이어)
  trustPrinciple?: string; // "광고는 항상 [광고] 표기, 단점도 솔직히"
  comparisonHabit?: boolean; // 리뷰 시 비교 대상 언급 여부 (기본 true)
}

/**
 * [v1.8.0] 기본 페르소나 — 사용자 미설정 시 안전한 일반 블로거 프로필
 * 홈판 친화적 기본값 (friendly + 이웃 관계 + 구매자 신뢰 4요소 켜짐)
 */
export const DEFAULT_IDENTITY: BloggerIdentity = {
  coreEndings: [
    { ending: '~거든요', percent: 35 },
    { ending: '~더라구요', percent: 30 },
    { ending: '~이에요', percent: 25 },
    { ending: '~더라고요', percent: 10 },
  ],
  blogPurpose: '내가 써보고 좋았던 것, 실수한 것을 솔직하게 공유하는 이웃 블로그',
  expertise: { domain: '일상 리뷰', metric: '실사용 경험 기반 솔직 후기' },
  headStarts: ['사실', '근데', '오늘은'],
  bracketStyle: '(ㅋㅋ 이거 진짜)',
  avgSentenceLength: 'medium',
  negationStyle: 'soft',
  forbiddenExpressions: ['대박', '충격', '미쳤어요', '소름', '알아보겠습니다', '살펴보자'],
  trustPrinciple: '광고는 [광고] 표기, 단점도 솔직히 쓰기',
  comparisonHabit: true,
};

/**
 * [v1.8.0] Blogger Identity를 프롬프트 블록으로 변환
 * 필수 3필드 + 자동 추출 5필드 + 신뢰 4요소를 LLM이 내면화하도록 구성
 * 글에 직접 인용 금지 지시 포함 (인용되면 AI티 되므로)
 */
export function buildIdentityBlock(identity?: BloggerIdentity): string {
  const id = identity || DEFAULT_IDENTITY;

  const endingsStr = id.coreEndings
    .map(e => `${e.ending}(${e.percent}%)`)
    .join(' / ');

  const headStartsStr = (id.headStarts && id.headStarts.length > 0)
    ? id.headStarts.join(', ')
    : '사실, 근데, 오늘은';

  const forbiddenStr = (id.forbiddenExpressions && id.forbiddenExpressions.length > 0)
    ? id.forbiddenExpressions.join(', ')
    : '대박, 충격, 미쳤어요';

  const sentenceLengthGuide = {
    short: '짧은 편 (평균 15~25자)',
    medium: '보통 (평균 25~40자)',
    long: '긴 편 (평균 40~60자)',
  }[id.avgSentenceLength || 'medium'];

  const negationGuide = {
    direct: '직설적으로 ("아니에요", "그건 아닙니다")',
    soft: '부드럽게 ("그런 건 아닌데요", "딱히 그렇진 않고요")',
    humorous: '유머러스하게 ("절대 아님 ㅋㅋ", "그럴 리가요")',
  }[id.negationStyle || 'soft'];

  return `
═══════════════════════════════════════════════════════════
[BLOGGER IDENTITY CORE] — 이 블로거의 언어 DNA (인용 금지, 내면화만)
═══════════════════════════════════════════════════════════

■ 블로그 존재 이유 (정체성 앵커):
  "${id.blogPurpose}"
  → 이 목적을 글 전체의 톤·선택에 반영하되, 직접 서술하지 마세요.

■ 전문 영역 (신뢰 앵커):
  ${id.expertise.domain} | ${id.expertise.metric}
  → 리뷰·정보 글일 때 자연스럽게 경력·횟수·기간을 녹여내세요.

■ 말하는 방식 DNA (이 블로거의 지문, 반드시 따르되 "나는 ~를 쓴다"식 자기언급 금지):
  • 주력 어미 분포: ${endingsStr}
    → 전체 글의 어미를 이 비율로 분배. 같은 어미 연속 2회 금지.
  • 문두 습관: "${headStartsStr}" 중에서 자연스럽게 선택
    → 기계적으로 반복 말고 글의 흐름에 맞게 사용.
  • 삽입구·괄호 스타일: 한 글에 1~2회 "${id.bracketStyle || '(ㅋㅋ 이거 진짜)'}" 같은 입말 덧붙임
  • 문장 길이: ${sentenceLengthGuide} — 편차 적게 유지.
  • 부정 표현: ${negationGuide}

■ 절대 금지 표현 (이 블로거는 이런 말 안 씀):
  ${forbiddenStr}
  → 유사 표현도 피하세요. "대박"류 감탄사 전부 배제.

■ 구매자 신뢰 원칙 (리뷰·제휴 글에서 의무):
  ${id.trustPrinciple || '광고는 [광고] 표기, 단점도 솔직히'}
  ${id.comparisonHabit !== false ? '- 리뷰 글마다 비교 대상 1개 이상 언급 ("○○랑 비교했을 때")' : ''}
  - 단점 최소 1개 이상 명시 (무조건 찬양 금지)
  - 경력·실사용 기간을 본문에 1회 이상 녹임

■ 연기 원칙 (최우선):
  1. 위 DNA는 "연기의 뿌리"일 뿐. 글에 이 시트를 인용하거나 "저는 ~인 사람이에요"식 자기소개 금지.
  2. 매 글은 다르게 변주하되 일관된 화자를 유지 — 독자가 글 5개 읽었을 때 "같은 사람이네"라고 느끼게.
  3. 완벽한 AI 스타일 배제. 사소한 입말(아 그리고, 근데, 보니까), 괄호 덧붙임, 감정 노출을 자연스럽게.

═══════════════════════════════════════════════════════════
`;
}

/**
 * [v1.8.0] 글 생성 후 검증 — 언어 DNA 준수 + 금지 표현 차단
 * 반환: { ok: boolean, issues: string[], score: number (0-100) }
 */
export function validateBloggerIdentity(
  content: string,
  identity?: BloggerIdentity,
): { ok: boolean; issues: string[]; score: number } {
  const id = identity || DEFAULT_IDENTITY;
  const issues: string[] = [];
  let score = 100;

  // 1. 금지 표현 체크
  const forbidden = id.forbiddenExpressions || DEFAULT_IDENTITY.forbiddenExpressions!;
  const defaultForbidden = [
    '알아보겠습니다', '살펴보자', '여러분!', '대박!', '충격!',
    '소름', '미쳤어요', '결론적으로 말하자면', '많은 분들이',
    '핵심은 바로', '놀랍게도', '어마어마한',
  ];
  const allForbidden = Array.from(new Set([...forbidden, ...defaultForbidden]));
  const hits: string[] = [];
  for (const word of allForbidden) {
    const matches = content.match(new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'));
    if (matches && matches.length > 0) {
      hits.push(`"${word}" × ${matches.length}회`);
      score -= matches.length * 5;
    }
  }
  if (hits.length > 0) {
    issues.push(`금지 표현 감지: ${hits.join(', ')}`);
  }

  // 2. 어미 연속 반복 체크 (3회 연속 같은 어미)
  const endingsInContent = id.coreEndings.map(e => e.ending.replace(/^~/, ''));
  for (const ending of endingsInContent) {
    const esc = ending.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`${esc}[.!?][^.!?]*${esc}[.!?][^.!?]*${esc}[.!?]`, 'g');
    const repeats = content.match(pattern);
    if (repeats && repeats.length > 0) {
      issues.push(`어미 "${ending}" 3회 연속 반복 ${repeats.length}건`);
      score -= repeats.length * 10;
    }
  }

  // 3. 자기소개 인용 감지 (DNA 시트가 글에 직접 나오면 안 됨)
  const selfRefPatterns = [
    /저는.*?(?:ESFJ|INFJ|ENTJ|ISFP)/i, // MBTI 직접 언급
    /제\s*블로그의?\s*(?:목적|정체성)은?/,
    /제\s*말투는?/,
    /저는\s*주력\s*어미를?/,
  ];
  for (const p of selfRefPatterns) {
    if (p.test(content)) {
      issues.push('DNA 시트가 글에 직접 인용됨 (내면화 실패)');
      score -= 20;
      break;
    }
  }

  score = Math.max(0, score);
  return {
    ok: issues.length === 0 && score >= 70,
    issues,
    score,
  };
}

// ✅ [2026-01-30] 제품 정보 파라미터 타입
interface ProductInfoForPrompt {
  name?: string;
  spec?: string;
  price?: string;
  reviews?: string[];
}

// ═══════════════════════════════════════════════════════════════
// ✅ [2026-03-30] 구조 변동 엔진 (Structure Variation Engine)
// AI 지문 방지: 매 글마다 다른 구조 아키타입을 랜덤 배정
// ═══════════════════════════════════════════════════════════════

interface StructureArchetype {
  name: string;
  headingCount: number;
  sentencesPerHeading: string;
  structureDescription: string;
  fifoVariation: string;
}

const STRUCTURE_ARCHETYPES: StructureArchetype[] = [
  {
    name: '딥다이브형',
    headingCount: 4,
    sentencesPerHeading: '5~7',
    structureDescription: '소제목 4개, 각 섹션을 깊고 풍성하게. 하나의 주제를 다각도로 파고드는 구조.',
    fifoVariation: '소제목1: F→I→R→O (정석) / 소제목2: R→F→I→O (반응 먼저) / 소제목3: I→F→O→R (해석 선행) / 소제목4: O→F→R (의견부터)',
  },
  {
    name: '스탠다드형',
    headingCount: 5,
    sentencesPerHeading: '4~5',
    structureDescription: '소제목 5개, 균형 잡힌 표준 구조. 정보 밀도와 감정 밸런스.',
    fifoVariation: '소제목1: F→I→R→O / 소제목2: F→R→I→O / 소제목3: R→F→O / 소제목4: I→R→F→O / 소제목5: O→F→R',
  },
  {
    name: '속보·이슈형',
    headingCount: 6,
    sentencesPerHeading: '3~5',
    structureDescription: '소제목 6개, 빠른 전개. 이슈의 다양한 측면을 짧고 임팩트 있게 다룸.',
    fifoVariation: '소제목1: F→I→R→O / 소제목2: R→O→F / 소제목3: F→I→O / 소제목4: R→F→I→O / 소제목5: F→R→O / 소제목6: O→R→F',
  },
  {
    name: '종합분석형',
    headingCount: 7,
    sentencesPerHeading: '3~4',
    structureDescription: '소제목 7개, 넓은 커버리지. 주제를 최대한 다양한 관점에서 훑는 구조.',
    fifoVariation: '소제목1: F→I→R→O / 소제목2: F→R→O / 소제목3: I→F→R / 소제목4: R→I→F→O / 소제목5: F→O→R / 소제목6: R→F→O / 소제목7: O→F→R (여운)',
  },
];

/**
 * 글마다 랜덤 구조 아키타입 선택
 * → 같은 카테고리여도 매번 다른 구조의 글이 생성됨
 */
function getRandomStructureArchetype(): StructureArchetype {
  const idx = Math.floor(Math.random() * STRUCTURE_ARCHETYPES.length);
  return STRUCTURE_ARCHETYPES[idx];
}

/**
 * 글 길이 변동 엔진: 같은 카테고리에서도 ±20% 분량 변동
 */
function getContentLengthVariation(): { sentenceJitter: string; paragraphNote: string } {
  const variations = [
    { sentenceJitter: '짧은 편 (전체 1800~2200자)', paragraphNote: '간결하고 핵심만. 군더더기 없이.' },
    { sentenceJitter: '보통 (전체 2200~2800자)', paragraphNote: '표준 분량. 충분한 깊이와 적절한 길이.' },
    { sentenceJitter: '풍성한 편 (전체 2800~3500자)', paragraphNote: '에피소드와 디테일 풍부. 체류시간 극대화.' },
  ];
  const idx = Math.floor(Math.random() * variations.length);
  return variations[idx];
}

/**
 * ✅ [v1.4.21] 업체 홍보 모드 전용 다양성 엔진
 * 같은 업체로 반복 발행 시 매번 다른 강조 각도 선택 → 글 패턴 반복 방지
 */
export function buildBusinessAngleDirective(): string {
  const angles = [
    {
      name: '가격 투명성',
      focus: '평수별/단계별 가격 가이드를 본문 핵심으로 삼아라. "20평 ○○만원~", "○일 공정" 같은 구체 수치가 본문 30% 이상.',
      hook: '비용 부담형 후킹 ("견적 받아보고 깜짝 놀라셨나요?")',
      pastor: '문제 단계에서 "잘못된 견적의 함정" 강조',
    },
    {
      name: '시공 사례 (포트폴리오)',
      focus: '실제 시공 사례 3건 이상을 본문 중심에 배치. Before/After 묘사 + 평수/지역/기간 포함.',
      hook: '경험 공유형 후킹 ("○○동 30평 시공 후기, 사진과 함께")',
      pastor: '사례·차별점 단계를 두 개로 분할 (사례 1+2)',
    },
    {
      name: 'A/S 보장 (사후 관리)',
      focus: '시공 후 사후 관리, A/S 정책, 하자 보수 조항을 본문 핵심. "1년 무상", "재방문 시" 등.',
      hook: '안심형 후킹 ("시공 후 문제 생기면 누가 책임지나요?")',
      pastor: '구체 제안 단계에서 A/S 약속 명시',
    },
    {
      name: '빠른 견적 + 24시간 응답',
      focus: '응답 속도와 견적 절차의 신속성을 강조. "카톡 24시간", "방문 견적 당일" 등.',
      hook: '즉시성 후킹 ("기다리기 싫으신가요? 1시간 안에 답변 드립니다")',
      pastor: '구체 제안 단계에서 응답 시간 명시 + CTA 강화',
    },
    {
      name: '무료 상담 + 비교 견적',
      focus: '무료 견적, 비교용 부담 없는 상담을 핵심. "타사와 비교해보세요", "조건 맞으면 진행" 등.',
      hook: '부담 제거형 후킹 ("처음이라 비교만 하실 분도 환영")',
      pastor: '구체 제안 단계에서 무료 강조 + 진행 의무 없음 명시',
    },
    {
      name: '전문성 + 경력',
      focus: '대표/시공자의 경력, 자격증, 전문성을 본문 핵심. "○년차", "○○ 자격증" 등.',
      hook: '권위형 후킹 ("○년차 전문가가 알려드리는 ○○ 핵심")',
      pastor: '사례·차별점 단계에서 자격/경력을 사례 위에 배치',
    },
    {
      name: '친절한 상담 + 고객 후기',
      focus: '실제 고객 응대 사례, 상담 만족도를 본문 핵심. ⚠️ 의료 분야는 사용 금지 (광고법).',
      hook: '공감형 후킹 ("처음 문의하시는 분도 편하게 물어보세요")',
      pastor: '사례·차별점 단계에서 응대 후기 강조',
    },
    {
      name: '최신 트렌드 + 디자인',
      focus: '최신 시공 트렌드, 디자인 사례, 신소재를 본문 핵심. "2026년 인기 ○○", "○○ 트렌드".',
      hook: '트렌드형 후킹 ("올해 가장 인기 있는 ○○ 디자인 5가지")',
      pastor: '해결책 단계에서 트렌드 정보를 우선 배치',
    },
  ];
  const idx = Math.floor(Math.random() * angles.length);
  const angle = angles[idx];
  console.log(`[BusinessAngle] 🎲 이번 글 강조 각도: ${angle.name}`);
  return `
══════════════════════════════════════════
🎲 [BUSINESS ANGLE OVERRIDE — 이번 글의 강조 각도]
══════════════════════════════════════════

⚠️ 같은 업체라도 매번 다른 각도로 작성되어야 한다. 이번 글의 강조 각도:

■ 강조 포인트: ${angle.name}
■ 본문 초점: ${angle.focus}
■ 도입부 후킹 스타일: ${angle.hook}
■ PASTOR 변형: ${angle.pastor}

⛔ 위 각도를 무시하고 매번 같은 톤으로 작성하면 0점.
⛔ 도입부 첫 3줄에 위 후킹 스타일을 반영할 것.
══════════════════════════════════════════
`;
}

/**
 * 구조 변동 + 글 길이 변동 지침 생성
 * homefeed 모드에서만 주입됨
 */
export function buildStructureVariationDirective(): string {
  const archetype = getRandomStructureArchetype();
  const lengthVar = getContentLengthVariation();

  console.log(`[StructureEngine] 🎲 구조 아키타입: ${archetype.name} (소제목 ${archetype.headingCount}개) / 분량: ${lengthVar.sentenceJitter}`);

  return `
════════════════════════════════════════
🎲 [STRUCTURE OVERRIDE — 이번 글의 구조 지정] 🎲
════════════════════════════════════════

⚠️ 이 지침은 base.prompt의 "소제목 5~6개" 규칙보다 최우선 적용.
이번 글은 아래 구조를 따라라. 매번 다른 구조가 지정되므로 무조건 따를 것.

■ 구조 아키타입: [${archetype.name}]
■ 소제목 개수: 정확히 ${archetype.headingCount}개
■ 각 소제목 본문: ${archetype.sentencesPerHeading}문장
■ 구조 설명: ${archetype.structureDescription}

■ FIRO 순서 배치 (이번 글 전용):
${archetype.fifoVariation}

■ 분량 지정: ${lengthVar.sentenceJitter}
  ${lengthVar.paragraphNote}

⛔ 위 소제목 개수와 FIRO 순서를 무시하고 기본 5~6개로 회귀하면 0점.
════════════════════════════════════════
`;
}

export function buildFullPrompt(
  mode: PromptMode,
  categoryHint?: string,
  isFullAuto: boolean = false,
  toneStyle?: string,
  productInfo?: ProductInfoForPrompt,  // ✅ [2026-01-30] 제품 정보 파라미터 추가
  hookHint?: string,  // ✅ [2026-04-20 SPEC-HOMEFEED-100 W2] 사용자 후킹 1문장 (선택)
  recentWinnersBlock?: string,  // ✅ [2026-04-20 SPEC-HOMEFEED-100 W4] few-shot 피드백 루프
  bloggerIdentity?: BloggerIdentity,  // ✅ [v1.8.0 LDF] 언어 DNA 페르소나
  primaryKeyword?: string,  // ✅ [v1.8.1 LDF Phase 2] CTR 훅 라이브러리 매개
): string {
  // 1. 기본 2축 분리 프롬프트
  const basePrompt = buildSystemPromptFromHint(mode, categoryHint);

  // 2. 말투(Tone) 보정 프롬프트 추가 (가장 강력하게 작용하도록 상단 배치 고려 가능하나, 보통 뒤에 붙여도 됨)
  const tonePrompt = getToneInstruction(toneStyle);

  // ✅ [v1.7.0] 노출 모드별 Voice Guide — SEO/홈판/트래픽헌터/제휴/비즈니스 별 글 구조+어미 규칙
  const modeVoiceGuide = getModeVoiceGuide(mode);

  // ✅ [v1.8.0 LDF] Blogger Identity Core — 언어 DNA 페르소나
  const identityBlock = buildIdentityBlock(bloggerIdentity);

  // ✅ [v2.4.0 Prompt Diet] base.prompt(623줄)가 이미 홈판 훅·썸네일·Precision 규칙을 정교하게
  //   담고 있어 ctrCombat/homefeedPrecision 외부 주입은 **중복**으로 LLM 지시 경합을 일으켰음.
  //   "승인" 지시에 따라 Option A+C 병행 — 외부 프롬프트 블록 제거, base.prompt 원본 지시력 복원.
  //   검증 함수(scoreTitleForHomefeed, scoreHomefeedPrecision)는 여전히 **발행 후 게이트**로 사용.
  //
  //   남기는 외부 가이드 (base.prompt에 없는 기능):
  //     - BLOGGER IDENTITY (언어 DNA 페르소나)
  //     - MODE VOICE (짧은 모드별 어미 규칙 — base와 강화적으로 작동)
  //     - STYLE OVERRIDE (사용자 선택 톤, base.prompt에 "STYLE OVERRIDE 우선" 명시됨)
  const ctrCombatBlock = '';
  const homefeedPrecisionBlock = '';

  // ✅ [v1.4.35] 글톤 prompt를 system 시작(prefix)에도 추가 — primacy effect로 강제력 증대
  const tonePrefix = tonePrompt
    ? `${identityBlock}${homefeedPrecisionBlock}${ctrCombatBlock}${modeVoiceGuide}${tonePrompt}\n\n═══════════════════════════════════════════\n⚠️ 위 [BLOGGER IDENTITY] + [HOMEFEED PRECISION] + [HOMEFEED HOOK] + [MODE VOICE] + [STYLE OVERRIDE]는 모든 규칙보다 최우선입니다. 홈판 노출이 단일 목표. 100% 준수.\n═══════════════════════════════════════════\n\n`
    : `${identityBlock}${homefeedPrecisionBlock}${ctrCombatBlock}${modeVoiceGuide}`;
  let finalPrompt = `${tonePrefix}${basePrompt}`;

  // ✅ [v1.4.18] structureDirective를 system에서 제거 — 매 호출 random 변동 → 캐시 무효화 원인
  // 이제 buildModeBasedPrompt가 user 파트에 직접 추가함 (캐시 적중률 보존)

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
- **[필수]** 주제를 왜곡하거나 정보를 누락하지 말고, 원본의 의도를 살리면서 더 매력적인 문장으로 변환하세요.
- **[톤 일관성]** 제목의 어미/문체도 반드시 [STYLE OVERRIDE]에서 지정한 톤을 따르세요. (예: professional이면 ~입니다 체, casual이면 ~인 듯 체)`;

  // ✅ [2026-01-30] 쇼핑커넥트 제품 정보 블록 추가
  // ✅ [2026-04-20] 가격 정규화: hasValidPrice로 0원/빈값/"가격 정보 없음" 전부 차단.
  //    가격이 유효하지 않으면 프롬프트에서 가격 줄 + "현재 XX원에 판매 중" 지시문을 통째로 생략.
  const priceIsValid = hasValidPrice(productInfo?.price);
  const priceDisplay = priceIsValid ? formatPrice(productInfo!.price) : null;

  if (productInfo && (productInfo.name || productInfo.spec || priceIsValid || productInfo.reviews?.length)) {
    console.log(`[PromptLoader] 🛒 쇼핑커넥트 제품 정보 프롬프트에 추가 (가격 ${priceIsValid ? '유효' : '미수집/무효 → 생략'})`);

    let productBlock = `\n\n[쇼핑커넥트 제품 정보 - 반드시 활용하세요!]\n`;

    if (productInfo.name) {
      productBlock += `📦 제품명: ${productInfo.name}\n`;
    }
    if (priceIsValid && priceDisplay) {
      productBlock += `💰 가격: ${priceDisplay}\n`;
    }
    if (productInfo.spec) {
      productBlock += `📋 스펙: ${productInfo.spec}\n`;
    }
    if (productInfo.reviews && productInfo.reviews.length > 0) {
      productBlock += `⭐ 실제 구매자 리뷰:\n`;
      productInfo.reviews.forEach((review, idx) => {
        productBlock += `  ${idx + 1}. "${review.substring(0, 200)}${review.length > 200 ? '...' : ''}"\n`;
      });
    } else {
      // P0 review guard stub (SPEC-REVIEW-001): when no reviews were collected
      // we replace the review slot with an explicit absence notice. The full
      // no-experience guard block is appended later in contentGenerator.ts so
      // it lands AFTER the shopping archetype prompt (recency effect).
      productBlock += `⚠️ 실제 구매자 리뷰 데이터가 수집되지 않았습니다 — 스펙/공식 설명 기반 분석 모드로 작성하세요.\n`;
      productBlock += `(체험 서술, 기간 주장, 수령 시점 묘사는 아래 P0 가드 블록에서 금지됩니다.)\n`;
    }

    const priceInstruction = priceIsValid
      ? `- 가격 정보는 "현재 ${priceDisplay}에 판매 중" 형식으로 본문에 자연스럽게 녹여서 언급하세요.\n`
      : `- ⛔ 가격 정보가 수집되지 않았습니다. **제목·소제목·본문 어디에도** "원", "가격", "판매가", "할인가", "정가", "특가", "0원", "얼마" 등 **가격 관련 언급을 절대 포함하지 마세요**. 구체 금액/할인율 날조 금지. 소제목에도 "0원 특가", "0원 할인" 같은 표현 절대 사용 금지.\n`;

    productBlock += `
[제품 정보 활용 지침]
- 위 제품 정보를 본문에 자연스럽게 녹여서 작성하세요.
${priceInstruction}- 스펙 정보는 장점으로 풀어서 설명하세요 (예: "크기가 445mm로 슬림해서 어디든 배치 가능").
- 리뷰는 "실제 구매하신 분들 반응을 보면~" 형식으로 인용하세요.
- 정보를 지어내지 말고, 위에 제공된 정보만 활용하세요.

[🛒 쇼핑커넥트 필수 제목 규칙]
⛔ 크롤링된 상품 1개만 사용. 다른 상품과 비교 금지!

📌 상품명 보존 규칙 (가장 중요!):
- 상품명에서 브랜드명 + 모델명 + 핵심 스펙(용량, 사이즈, 색상 등)은 반드시 보존
- 홍보성 수식어("프리미엄", "최고급", "인기")만 제거 가능
- ⛔ 스펙 숫자(8GB, 256GB, 14인치 등)는 절대 변형/합산/생략 금지!
  ❌ "8GB/256GB" → "/25614" (숫자 합산 금지!)
  ❌ "8GB/256GB" → 생략 (스펙 삭제 금지!)
  ✅ "8GB/256GB" → "8GB 256GB" 또는 그대로 유지
- 예: "LG전자 오브제컬렉션 코드제로 A9S 무선청소기" → "LG 코드제로 A9S 무선청소기"
- 예: "베이직북14 사무용 노트북 윈도우11 8GB/256GB" → "베이직북14 노트북 윈도우11 8GB 256GB"

📌 제목 공식 (25~50자):
{보존된 상품명} + {후킹 키워드 1개}
⚠️ 상품명이 길면 50자까지 허용! 상품명을 짧게 줄이는 것보다 정확하게 전달하는 것이 중요!

📌 후킹 키워드 (반드시 1개만 선택, 자연스러운 문장으로):
- 경험: "실사용 후기", "솔직후기", "직접 써본"
- 궁금증: "살까 말까", "어떨까", "진짜일까"
- 시간: "1개월 사용기", "2주 써보니", "한달 후기"

⛔ 금지 패턴:
- 상품명만 (중복됨)
- "총정리", "리뷰"로만 끝남 (흔함)
- OO vs OO 비교 (상품 1개뿐)
- ⛔ "장단점 꿀팁 내돈내산 비교 실사용 추천" 같은 키워드 나열 (스팸처럼 보임!)
- ⛔ 스펙 숫자 변형/합산 (정확성 훼손!)`;

    finalPrompt += productBlock;
  }

  // ✅ [2026-04-20 SPEC-HOMEFEED-100 W2] 사용자 후킹 1문장 블록 (선택)
  // 사용자가 직접 입력한 1차 경험 문장은 QUMA/DIA+가 가장 신뢰하는 신호다.
  // 40자 이내 짧은 문장만 받아서 도입부·소제목1에 녹이도록 지시한다.
  // ✅ [2026-04-20 SPEC-HOMEFEED-100 W4] RECENT_WINNERS few-shot 블록
  // 이 엔진의 과거 성과 상위 글에서 추출된 제목/도입부 패턴. 호출자가 이미
  // 포맷팅된 블록 문자열을 넘기므로 여기서는 trim만 하고 그대로 주입한다.
  const trimmedWinners = (recentWinnersBlock ?? '').trim();
  if (trimmedWinners) {
    finalPrompt += `\n\n${trimmedWinners}\n`;
  }

  const trimmedHook = (hookHint ?? '').trim().slice(0, 40);
  if (trimmedHook) {
    finalPrompt += `\n\n[사용자 후킹 1문장 — 반드시 자연스럽게 녹일 것]
사용자가 이 글의 후킹으로 제공한 1차 경험 문장: "${trimmedHook}"
→ 도입부 첫 줄 또는 소제목1 첫 문장에 녹여라.
→ 그대로 복사 금지. 맥락에 맞게 재구성하되, 핵심 의도(감정·숫자·변화)는 유지.
→ 이 문장은 사용자의 1차 경험 데이터이므로 QUMA/DIA+가 신뢰하는 신호다.
→ 구체 수치·기간·제품명이 포함되어 있다면 본문 다른 곳에도 그대로 사용 가능.
`;
  }

  return finalPrompt;
}

/**
 * 쇼핑커넥트 전용 프롬프트 로드
 *
 * articleType에 따라 다른 .prompt 파일을 로드하고,
 * {{TONE_STYLE}} 플레이스홀더를 실제 toneStyle로 치환합니다.
 *
 * @param articleType - 'shopping_review' | 'shopping_expert_review' | 'shopping_spec_analysis'
 * @param toneStyle - 적용할 톤 스타일
 * @returns 로드된 프롬프트 (로드 실패 시 빈 문자열)
 */
export function loadShoppingPrompt(articleType: string, toneStyle: string): string {
  // SPEC-REVIEW-001 option C: shopping_spec_analysis is the dedicated mode
  // for products with zero reviews — neither a testimonial nor an expert
  // review, but a curator-style spec-based purchase guide.
  const SHOPPING_PROMPT_FILES: Record<string, string> = {
    shopping_review: 'affiliate/shopping_review.prompt',
    shopping_expert_review: 'affiliate/shopping_expert_review.prompt',
    shopping_spec_analysis: 'affiliate/shopping_spec_analysis.prompt',
  };

  const promptFile = SHOPPING_PROMPT_FILES[articleType] || SHOPPING_PROMPT_FILES.shopping_review;

  const rawPrompt = loadPromptFile(promptFile);

  if (!rawPrompt) {
    console.warn(`[PromptLoader] 쇼핑 프롬프트 로드 실패: ${promptFile}`);
    return '';
  }

  // {{TONE_STYLE}} 플레이스홀더 치환
  const finalPrompt = rawPrompt.replace(/\{\{TONE_STYLE\}\}/g, toneStyle || 'friendly');

  console.log(`[PromptLoader] ✅ 쇼핑 프롬프트 로드: ${promptFile} (tone: ${toneStyle})`);
  return finalPrompt;
}
