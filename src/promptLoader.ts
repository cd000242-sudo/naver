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
  hookHint?: string  // ✅ [2026-04-20 SPEC-HOMEFEED-100 W2] 사용자 후킹 1문장 (선택)
): string {
  // 1. 기본 2축 분리 프롬프트
  const basePrompt = buildSystemPromptFromHint(mode, categoryHint);

  // 2. 말투(Tone) 보정 프롬프트 추가 (가장 강력하게 작용하도록 상단 배치 고려 가능하나, 보통 뒤에 붙여도 됨)
  const tonePrompt = getToneInstruction(toneStyle);

  // ✅ [v1.4.35] 글톤 prompt를 system 시작(prefix)에도 추가 — primacy effect로 강제력 증대
  // LLM은 prompt 시작 부분의 지시를 가장 강하게 따르는 경향. 톤은 끝에만 박으면 다른 규칙에 묻힘.
  // 트레이드오프: 캐시 적중률 약간 감소 (톤이 변동 부분이라 캐시 키 다양화)
  // 우선순위: 품질(사람보다 사람처럼) > 캐시 비용
  const tonePrefix = tonePrompt
    ? `${tonePrompt}\n\n═══════════════════════════════════════════\n⚠️ 위 [STYLE OVERRIDE]는 모든 규칙보다 최우선입니다. 100% 준수.\n═══════════════════════════════════════════\n\n`
    : '';
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
      : `- ⛔ 가격 정보가 수집되지 않았습니다. 본문에 "원", "가격", "판매가", "얼마" 등 가격 관련 언급을 절대 포함하지 마세요. 구체 금액/할인율 날조 금지.\n`;

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
