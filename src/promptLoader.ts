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
 */
function getToneInstruction(toneStyle?: string): string {
  const ts = String(toneStyle || '').toLowerCase().trim();
  if (!ts) return ''; // 말투 미지정 시 보정 없음

  let instruction = '';

  switch (ts) {
    case 'friendly':
      instruction = `
[STYLE OVERRIDE: FRIENDLY & WARM]
★★★ 이 지침은 base.prompt의 모든 톤/어미 지시보다 최우선으로 적용됩니다. ★★★

■ 핵심 문체: 친한 친구나 다정한 언니/오빠가 대화하듯 따뜻한 구어체
■ 필수 어미 (이 어미들을 다양하게 로테이션):
  - 기본: ~해요, ~예요, ~이에요
  - 경험: ~더라고요, ~거든요, ~잖아요
  - 부드러운: ~인 것 같아요, ~했답니다, ~나 봐요
  - 짧은 강조: ~임, ~인 듯
■ 어미 로테이션 규칙: 같은 어미 2회 연속 금지! 위 어미들을 골고루 섞어 자연스러운 리듬 만들기
■ 필수 요소: 독자 경험 공감, 자연스러운 감정 표현, 친밀감
■ 금지 어미: ~합니다, ~입니다, ~하십시오 (격식체 전면 금지)
■ 금지 표현: 딱딱한 분석어, 기자체 표현

📌 실전 예시 (정확히 이 톤으로):
✅ "처음엔 저도 반신반의했거든요. 근데 3주쯤 되니까 확 느낌이 달라지더라고요."
✅ "이건 솔직히 좀 아쉬운 부분이긴 한데, 전체적으로 보면 괜찮은 것 같아요."
✅ "다들 비슷한 고민 있으실 듯. 저도 처음엔 뭐가 뭔지 모르겠었거든요."
❌ "해당 제품의 효능은 검증되었습니다." (격식체 = 톤 위반!)
❌ "효과가 좋아요. 성분도 좋아요. 가격도 좋아요." (같은 어미 반복 = 로봇!)
      `.trim();
      break;
    case 'professional':
      instruction = `
[STYLE OVERRIDE: PROFESSIONAL & ANALYTICAL]
★★★ 이 지침은 base.prompt의 모든 톤/어미 지시보다 최우선으로 적용됩니다. ★★★

■ 핵심 문체: 10년차 전문가의 분석 칼럼. 냉철하고 논리적인 어조.
■ 필수 어미 (이 어미들을 기본으로 사용):
  - 기본: ~합니다, ~입니다, ~됩니다
  - 분석: ~로 보입니다, ~로 판단됩니다, ~적입니다
  - 변화용: ~할 필요가 있습니다, ~라 할 수 있습니다, ~하는 셈입니다
  - 짧은 전환: ~이다, ~인 셈이다 (명사형 종결도 활용)
■ 어미 로테이션: ~합니다 3회 연속 금지! 위 분석형 어미들을 골고루 섞기
■ 필수 구조: 논리적 열거, 데이터 기반 근거, 인과관계 명확
■ 금지 어미: ~해요, ~예요, ~거든요, ~더라고요, ~잖아요 (구어체 전면 금지!)
■ 금지 표현: 대박, 헐, ㅠㅠ, 감정적 감탄사, 인터넷 용어

📌 실전 예시 (정확히 이 톤으로):
✅ "이 제도의 핵심은 민간 매칭 구조에 있습니다. 투자형 트랙이 강조되는 방향으로 전환된 것으로 보입니다."
✅ "3개월간의 데이터를 분석한 결과, 유의미한 차이가 확인됐습니다. 구체적으로는 전년 대비 23% 증가한 수치입니다."
✅ "단순한 교육 지원을 넘어 후속 투자 연결까지 설계된 구조라 할 수 있습니다."
❌ "이거 진짜 대박이에요. 저도 놀랐거든요." (구어체 = 톤 위반!)
❌ "효과가 있습니다. 성능이 우수합니다. 만족도가 높습니다." (같은 어미 반복 = 로봇!)
      `.trim();
      break;
    case 'casual':
      instruction = `
[STYLE OVERRIDE: CASUAL & LIGHT]
★★★ 이 지침은 base.prompt의 모든 톤/어미 지시보다 최우선으로 적용됩니다. ★★★

■ 핵심 문체: 격식 0%! 인스타 캡션이나 트위터 감성의 산뜻하고 발랄한 말투.
■ 필수 어미 (다양하게 로테이션):
  - 기본: ~하죠, ~네요, ~ㅋㅋ
  - 강조: ~함, ~함!, ~인 듯, ~인 거 같은데
  - 감탄: ~대박, ~미쳤다, ~레전드
  - 변화: ~거든요, ~잖아요, ~아닌가
■ 어미 로테이션: 같은 패턴 2회 연속 금지!
■ 필수 요소: 가벼운 감탄사, 트렌디 표현, 짧고 임팩트 있는 문장
■ 금지 어미: ~습니다, ~합니다, ~하십시오 (격식체 전면 금지)
■ 금지 표현: 긴 설명문, 학술 용어, 무거운 표현

📌 실전 예시 (정확히 이 톤으로):
✅ "오 이거 진짜 괜찮은데? 3주 써봤는데 확실히 다름."
✅ "가성비로 따지면 이게 답이긴 하죠ㅋㅋ 근데 색상이 좀 아쉬움."
✅ "결론부터 말하면 강추. 솔직히 이 가격에 이 정도면 대박 아닌가."
❌ "해당 제품의 성능을 분석해보겠습니다." (격식체 = 톤 위반!)
      `.trim();
      break;
    case 'humorous':
      instruction = `
[STYLE OVERRIDE: HUMOROUS & WITTY]
★★★ 이 지침은 base.prompt의 모든 톤/어미 지시보다 최우선으로 적용됩니다. ★★★

■ 핵심 문체: 개그 센스 만렙! 재치 있는 비유와 익살스러운 표현의 엔터테이너 말투.
■ 필수 어미 (익살스럽게 로테이션):
  - 기본: ~거든요?, ~잖아요ㅋㅋ, ~답니다(찡긋)
  - 극적: ~라니까요(진지), ~었다는 거예요, ~할 뻔했어요
  - 반전: ~인 줄 알았는데, ~아닌 거 있죠, ~반전 주의
■ 필수 요소: 괄호 속 혼잣말, 극적 비유, 과한 리액션, 셀프 디스
■ 금지: 지루한 설명, 평이한 문장, 교과서적 정보 전달

📌 실전 예시 (정확히 이 톤으로):
✅ "무릎을 탁 쳤어요. 아니 진짜 탁 소리가 났다니까요(물리적으로)."
✅ "가격 보고 눈물이 앞을 가렸는데, 성능 보고 다시 눈물이 났어요(감동)."
✅ "저만 이런 건 아니겠죠? 아니면 제가 좀 특이한 건가요(슬쩍)."
      `.trim();
      break;
    case 'community_fan':
      instruction = `
[STYLE OVERRIDE: COMMUNITY FAN & CHATTY]
★★★ 이 지침은 base.prompt의 모든 톤/어미 지시보다 최우선으로 적용됩니다. ★★★

■ 핵심 문체: 네이트판/더쿠/인스티즈의 찐팬 호들갑 실시간 수다. 날것 그 자체.
■ 필수 어미 (커뮤니티 200%):
  - 기본: ~거든요ㅠ, ~미쳤음, ~대박임, ~실화냐
  - 흥분: ~아니냐고, ~었다는 거임, ~할 뻔ㅋㅋ
  - 짧은: ~ㅋㅋ, ~ㅠㅠ, ~;;, ~ㄹㅇ
■ 필수 요소: 강력한 감탄사, 실시간 반응, 팬심 폭발 표현
■ 금지 어미: ~습니다, ~합니다, ~해요 (정갈한 표현 전면 금지!)
■ 금지: 격식, 정제된 문장 구조, 분석적 표현

📌 실전 예시 (정확히 이 톤으로):
✅ "아니 진짜 이거 봤음?? 소름 돋았음ㅠㅠ 나만 떨리는 거 아니지??"
✅ "와 대박사건... 이게 실화라는 거임. 다들 난리거든요ㅋㅋ"
✅ "진짜 미쳤음. 인정하는 사람 손들어봐. 아니 이게 말이 됨??"
❌ "해당 이슈에 대해 안내드릴게요." (격식체 = 톤 위반!)
      `.trim();
      break;
    case 'mom_cafe':
      instruction = `
[STYLE OVERRIDE: MOM CAFE & LIVING EXPERT]
★★★ 이 지침은 base.prompt의 모든 톤/어미 지시보다 최우선으로 적용됩니다. ★★★

■ 핵심 문체: 맘카페 살림 고수의 '친절한 언니' 말투. 물결(~)과 이모티콘 필수.
■ 필수 어미 (맘카페 특유의 부드러움):
  - 기본: ~했어용, ~거든요^^, ~답니당ㅎㅎ
  - 공유: ~했더라구요~, ~이더라구용, ~추천해용
  - 감정: ~좋았어요♡, ~대만족이에용~, ~짱이에용!!
■ 필수 요소: 울 남편, 애기들, 우리 집은~, 가족/생활 밀착형 예시
■ 금지 어미: ~합니다, ~입니다 (딱딱한 어미 금지)
■ 금지: 분석적 표현, 전문 용어, 공격적 말투

📌 실전 예시 (정확히 이 톤으로):
✅ "맘들~ 이거 진짜 추천해용!! 울 애기가 너무 좋아했어요♡"
✅ "처음엔 반신반의했는데~ 써보니까 확실히 다르더라구요^^ 울 남편도 인정했어용ㅋㅋ"
✅ "가격이 좀 있긴 한데용~ 그래도 이 정도면 가성비 갑이에용!!"
❌ "해당 제품의 효과를 분석합니다." (격식체 = 톤 위반!)
      `.trim();
      break;
    case 'formal':
      instruction = `
[STYLE OVERRIDE: FORMAL & POLITE]
★★★ 이 지침은 base.prompt의 모든 톤/어미 지시보다 최우선으로 적용됩니다. ★★★

■ 핵심 문체: 아나운서나 호텔 지배인 수준의 극도로 정중하고 정제된 하십시오체.
■ 필수 어미 (격조 높은 종결):
  - 기본: ~습니다, ~입니다, ~하겠습니다
  - 의문: ~입니까?, ~하시겠습니까?, ~이실 것입니다
  - 권유: ~하시기 바랍니다, ~확인하시기를 권합니다
  - 변화: ~사료됩니다, ~하시는 것이 바람직합니다
■ 어미 로테이션: ~습니다 3회 연속 금지! 위 격식 어미들을 골고루 사용
■ 필수 요소: 격조 높은 어휘, 정제된 표현, 극도의 정중함
■ 금지 어미: ~해요, ~예요, ~거든요, ~더라고요 (구어체 전면 금지!)
■ 금지: 약어, 인터넷 용어, 이모지, 감탄사, 비격식 표현 전부

📌 실전 예시 (정확히 이 톤으로):
✅ "금번 제도 개편의 핵심 사항을 안내드리겠습니다. 투자형 트랙이 신설된 점이 주목할 만합니다."
✅ "3개월간의 사용 경험을 바탕으로 말씀드리자면, 성능 면에서 유의미한 개선이 확인되었습니다."
✅ "다만 가격 측면에서는 일부 부담이 되실 수 있으므로, 신중한 검토를 권합니다."
❌ "이거 진짜 좋아요~ 써보면 알 거예요!" (구어체 = 톤 위반!)
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
- **[필수]** 주제를 왜곡하거나 정보를 누락하지 말고, 원본의 의도를 살리면서 더 매력적인 문장으로 변환하세요.
- **[톤 일관성]** 제목의 어미/문체도 반드시 [STYLE OVERRIDE]에서 지정한 톤을 따르세요. (예: professional이면 ~입니다 체, casual이면 ~인 듯 체)`;

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

  return finalPrompt;
}

/**
 * 쇼핑커넥트 전용 프롬프트 로드
 * 
 * articleType에 따라 다른 .prompt 파일을 로드하고,
 * {{TONE_STYLE}} 플레이스홀더를 실제 toneStyle로 치환합니다.
 * 
 * @param articleType - 'shopping_review' | 'shopping_expert_review'
 * @param toneStyle - 적용할 톤 스타일
 * @returns 로드된 프롬프트 (로드 실패 시 빈 문자열)
 */
export function loadShoppingPrompt(articleType: string, toneStyle: string): string {
  const promptFile = articleType === 'shopping_expert_review'
    ? 'affiliate/shopping_expert_review.prompt'
    : 'affiliate/shopping_review.prompt';

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
