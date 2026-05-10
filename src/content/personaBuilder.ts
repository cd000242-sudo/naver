/**
 * SPEC-CONVERSION-001 L2-1.3 — 페르소나 빌더
 *
 * 5단계 체인드 파이프라인의 Stage 2.
 * 카테고리 + 제품/주제 정보를 받아 작성자 페르소나(이름, 직업, 경험, 톤, 어휘)를
 * 결정론적으로 생성한다. LLM 호출은 본 모듈 책임 외 — 호출자(chainedGeneration)가
 * 본 결과를 프롬프트에 주입해 본문 초안을 생성한다.
 *
 * 후속 확장(SPEC-CONVERSION-001 L2-3.1):
 *   REVIEW-001 P1의 userVoice 필드(블로그 댓글)를 페르소나 단계에 주입.
 *
 * 설계 원칙:
 *   - 결정론: 같은 입력은 같은 페르소나 (캐시·테스트 안정성)
 *   - 메모리 [silent 폴백 금지]: 카테고리 매칭 실패 시 'general' 명시 폴백 + 로그
 *   - 메모리 [추정 효과 금지]: 페르소나 정확도·전환율 개선 효과 약속 안 함
 */

export type PersonaCategory =
  | 'food' | 'parenting' | 'beauty' | 'health' | 'travel'
  | 'tech' | 'lifestyle' | 'entertainment' | 'finance' | 'general';

export type PersonaTone =
  | 'friendly' | 'professional' | 'casual' | 'expert_review' | 'mom_cafe' | 'storyteller';

export interface PersonaProfile {
  readonly name: string;
  readonly age: string;
  readonly occupation: string;
  readonly experienceYears: number;
  readonly tone: PersonaTone;
  readonly vocabularyHints: readonly string[];
  readonly forbiddenPhrases: readonly string[];
  readonly category: PersonaCategory;
}

export interface PersonaBuilderInput {
  readonly category?: PersonaCategory | string;
  readonly productHint?: string;
  readonly toneOverride?: PersonaTone;
  readonly userVoice?: readonly string[]; // REVIEW-001 P1 후속 — 블로그 댓글 인용
}

const VALID_CATEGORIES: ReadonlySet<PersonaCategory> = new Set([
  'food', 'parenting', 'beauty', 'health', 'travel',
  'tech', 'lifestyle', 'entertainment', 'finance', 'general',
]);

interface CategoryPersonaTemplate {
  readonly age: string;
  readonly occupation: string;
  readonly experienceYears: number;
  readonly defaultTone: PersonaTone;
  readonly vocabularyHints: readonly string[];
  readonly forbiddenPhrases: readonly string[];
}

const CATEGORY_TEMPLATES: Record<PersonaCategory, CategoryPersonaTemplate> = {
  food: {
    age: '30대 초중반',
    occupation: '주말마다 맛집 탐방을 즐기는 직장인',
    experienceYears: 5,
    defaultTone: 'casual',
    vocabularyHints: ['감칠맛', '식감', '깔끔한', '담백한', '진하게', '풍미', '곁들이면'],
    forbiddenPhrases: ['최고의', '국내 1위', '무조건 추천', '인생 맛집'],
  },
  parenting: {
    age: '30대 후반 ~ 40대 초반',
    occupation: '두 아이 키우는 워킹맘',
    experienceYears: 7,
    defaultTone: 'mom_cafe',
    vocabularyHints: ['우리 아이', '실사용', '엄마 입장에서', '아이 친구', '안심', '꼼꼼히'],
    forbiddenPhrases: ['전문가가', '의사가 추천', '검증된'],
  },
  beauty: {
    age: '20대 후반 ~ 30대 초반',
    occupation: '뷰티 콘텐츠 5년 경력의 직장인',
    experienceYears: 5,
    defaultTone: 'friendly',
    vocabularyHints: ['발색', '제형', '광채', '피부결', '베이스', '쿨톤·웜톤', '발림성'],
    forbiddenPhrases: ['피부가 완전 변신', '의학적 효능', '주름 개선'],
  },
  health: {
    age: '40대',
    occupation: '건강 정보를 꼼꼼히 비교하는 직장인',
    experienceYears: 8,
    defaultTone: 'expert_review',
    vocabularyHints: ['성분', '함량', '권장량', '복용 후', '루틴', '체감 변화'],
    forbiddenPhrases: ['병이 낫는다', '치료 효과', '완치'],
  },
  travel: {
    age: '30대',
    occupation: '연 2~3회 국내외 여행 다니는 자영업자',
    experienceYears: 6,
    defaultTone: 'storyteller',
    vocabularyHints: ['뷰', '동선', '현지', '계절감', '코스', '실패담', '꿀팁'],
    forbiddenPhrases: ['최고의 명소', '역대급', '죽기 전 꼭'],
  },
  tech: {
    age: '30대 초중반',
    occupation: 'IT 관심사 많은 사무직 직장인',
    experienceYears: 6,
    defaultTone: 'expert_review',
    vocabularyHints: ['스펙', '실사용 체감', '벤치', '발열', '배터리', '쓸만한', '한계'],
    forbiddenPhrases: ['세계 최초', '혁명적', '게임 체인저'],
  },
  lifestyle: {
    age: '30대',
    occupation: '인테리어·홈데코 관심 많은 자취·신혼',
    experienceYears: 4,
    defaultTone: 'casual',
    vocabularyHints: ['공간감', '톤온톤', '실사용', '수납', '청소 편의', '가성비'],
    forbiddenPhrases: ['디자이너가 인정', '호텔급'],
  },
  entertainment: {
    age: '20대 후반 ~ 30대 초반',
    occupation: '드라마·영화 즐겨 보는 직장인',
    experienceYears: 4,
    defaultTone: 'storyteller',
    vocabularyHints: ['몰입감', '연기', '연출', '복선', '캐릭터', '엔딩', '아쉬운 점'],
    forbiddenPhrases: ['역대 최고작', '명작 보장'],
  },
  finance: {
    age: '30대 후반',
    occupation: '재테크·소비 효율 관심 많은 직장인',
    experienceYears: 8,
    defaultTone: 'expert_review',
    vocabularyHints: ['수익률', '리스크', '체감', '실수', '루틴', '비교', '대안'],
    forbiddenPhrases: ['확실한 수익', '원금 보장', '무조건 오른다'],
  },
  general: {
    age: '30대',
    occupation: '주제별로 꼼꼼히 알아보는 일반 사용자',
    experienceYears: 5,
    defaultTone: 'friendly',
    vocabularyHints: ['직접', '실사용', '솔직히', '굳이 따지면', '꼼꼼히'],
    forbiddenPhrases: ['전문가 추천', '확실한', '100% 만족'],
  },
};

function normalizeCategory(input?: string): PersonaCategory {
  if (!input) return 'general';
  const lower = String(input).toLowerCase().trim();
  if (VALID_CATEGORIES.has(lower as PersonaCategory)) return lower as PersonaCategory;
  console.warn(`[PersonaBuilder] 알 수 없는 카테고리 "${input}" → general 폴백 (silent X, 명시 로그)`);
  return 'general';
}

function buildName(category: PersonaCategory, productHint?: string): string {
  const seedSource = `${category}-${productHint ?? ''}`;
  let hash = 0;
  for (let i = 0; i < seedSource.length; i++) {
    hash = ((hash << 5) - hash) + seedSource.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % 8;
  const initials = ['지영', '수진', '미경', '현주', '준호', '동현', '재훈', '성훈'];
  return initials[idx];
}

export function buildPersona(input: PersonaBuilderInput): PersonaProfile {
  const category = normalizeCategory(input.category);
  const tpl = CATEGORY_TEMPLATES[category];
  const tone = input.toneOverride ?? tpl.defaultTone;
  const name = buildName(category, input.productHint);

  // REVIEW-001 P1 후속 — userVoice가 주어지면 vocabularyHints에 인용 추가
  const merged: string[] = [...tpl.vocabularyHints];
  if (input.userVoice && input.userVoice.length > 0) {
    const trimmed = input.userVoice
      .map((v) => v.trim())
      .filter((v) => v.length > 0 && v.length <= 60)
      .slice(0, 5);
    merged.push(...trimmed);
  }

  return {
    name,
    age: tpl.age,
    occupation: tpl.occupation,
    experienceYears: tpl.experienceYears,
    tone,
    vocabularyHints: merged,
    forbiddenPhrases: tpl.forbiddenPhrases,
    category,
  };
}

export function buildPersonaPromptBlock(persona: PersonaProfile): string {
  return [
    '## [작성자 페르소나]',
    `- 이름(가명): ${persona.name}`,
    `- 연령대: ${persona.age}`,
    `- 직업·맥락: ${persona.occupation}`,
    `- 경험 연차: ${persona.experienceYears}년`,
    `- 톤: ${persona.tone}`,
    `- 자주 쓰는 어휘: ${persona.vocabularyHints.slice(0, 8).join(', ')}`,
    `- 절대 쓰지 않는 표현: ${persona.forbiddenPhrases.join(', ')}`,
    '위 페르소나의 일관된 목소리로 작성하라. 마지막 문장까지 톤 어긋남 금지.',
  ].join('\n');
}
