export type EvidenceAwareMode = 'seo' | 'homefeed' | 'business' | 'custom' | 'mate';

export interface EvidenceIntegritySource {
  readonly title?: string;
  readonly rawText?: string;
  readonly personalExperience?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface EvidenceIntegrityIssue {
  readonly code: 'UNSUPPORTED_FIRST_PERSON' | 'UNSUPPORTED_CONCRETE_CLAIM';
  readonly message: string;
  readonly examples: readonly string[];
  readonly hard: boolean;
}

export interface EvidenceIntegrityAudit {
  readonly score: number;
  readonly hardFail: boolean;
  readonly issues: readonly EvidenceIntegrityIssue[];
}

const FIRST_PARTY_METADATA_KEYS = [
  'personalExperience',
  'userExperience',
  'firstPartyExperience',
  'firsthandExperience',
] as const;

const FIRST_PERSON_EXPERIENCE_PATTERNS = [
  /(?:제가|저는|저도|나는|내가|나도|우리가|우리도)[^.!?\n]{0,35}(?:직접|써\s*봤|사용해\s*봤|해\s*봤|가\s*봤|먹어\s*봤|다녀\s*왔|구매했|신청해\s*봤|받아\s*봤|겪었|경험했|복용했|비교해\s*봤)/gi,
  /(?:직접\s*(?:써|사용|신청|구매|방문|복용|먹어|해)\s*(?:본|봤|보니)|내돈내산|실사용\s*(?:후기|경험|결과))/gi,
  /(?:한\s*(?:달|주|해)|\d+\s*(?:일|주|개월|달|년))\s*(?:동안\s*)?(?:써|사용|복용|신청|다녀|먹어)[^.!?\n]{0,20}/gi,
] as const;

const CONCRETE_CLAIM_PATTERN = /-?\d[\d,]*(?:\.\d+)?\s*(?:%|퍼센트|원|천원|만원|억원|일|주|개월|달|년|시간|분|초|kg|g|cm|mm|mAh|GB|TB|Hz|점|명|건|회)/gi;

function meaningful(value: unknown): string {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length >= 8 ? text : '';
}

function normalizeClaim(value: string): string {
  return value.toLowerCase().replace(/[,\s]/g, '');
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function hasExplicitFirstPartyEvidence(source?: EvidenceIntegritySource | null): boolean {
  if (!source) return false;
  if (meaningful(source.personalExperience)) return true;

  const metadata = source.metadata || {};
  for (const key of FIRST_PARTY_METADATA_KEYS) {
    if (meaningful(metadata[key])) return true;
  }

  return /===\s*(?:작성자|사용자)\s*직접\s*(?:사용|경험)\s*메모\s*===/i.test(String(source.rawText || ''));
}

export function collectUnsupportedFirstPersonClaims(
  text: string,
  firstPartyEvidenceAvailable: boolean,
): string[] {
  if (firstPartyEvidenceAvailable) return [];
  const matches: string[] = [];
  for (const pattern of FIRST_PERSON_EXPERIENCE_PATTERNS) {
    pattern.lastIndex = 0;
    matches.push(...(text.match(pattern) || []));
  }
  return unique(matches).slice(0, 5);
}

export function collectUnsupportedConcreteClaims(text: string, groundingText: string): string[] {
  const claims = unique(text.match(CONCRETE_CLAIM_PATTERN) || []);
  if (claims.length === 0) return [];

  const groundedClaims = new Set(
    unique(String(groundingText || '').match(CONCRETE_CLAIM_PATTERN) || []).map(normalizeClaim),
  );
  return claims
    .filter((claim) => !groundedClaims.has(normalizeClaim(claim)))
    .slice(0, 8);
}

export function collectSupportedConcreteClaims(text: string, groundingText: string): string[] {
  const claims = unique(text.match(CONCRETE_CLAIM_PATTERN) || []);
  if (claims.length === 0) return [];

  const groundedClaims = new Set(
    unique(String(groundingText || '').match(CONCRETE_CLAIM_PATTERN) || []).map(normalizeClaim),
  );
  return claims.filter((claim) => groundedClaims.has(normalizeClaim(claim)));
}

export function auditEvidenceIntegrity(input: {
  readonly title?: string;
  readonly body: string;
  readonly groundingText?: string;
  readonly firstPartyEvidenceAvailable?: boolean;
}): EvidenceIntegrityAudit {
  const text = `${input.title || ''}\n${input.body || ''}`.trim();
  const unsupportedFirstPerson = collectUnsupportedFirstPersonClaims(
    text,
    input.firstPartyEvidenceAvailable === true,
  );
  const unsupportedConcrete = collectUnsupportedConcreteClaims(text, input.groundingText || '');
  const issues: EvidenceIntegrityIssue[] = [];

  if (unsupportedFirstPerson.length > 0) {
    issues.push({
      code: 'UNSUPPORTED_FIRST_PERSON',
      message: '사용자 직접 경험 근거 없이 작성자 체험을 주장했습니다.',
      examples: unsupportedFirstPerson,
      hard: true,
    });
  }
  if (unsupportedConcrete.length > 0) {
    issues.push({
      code: 'UNSUPPORTED_CONCRETE_CLAIM',
      message: '입력 자료에서 확인되지 않는 수치·기간·금액 표현이 있습니다.',
      examples: unsupportedConcrete,
      hard: true,
    });
  }

  const penalty = unsupportedFirstPerson.length * 35 + unsupportedConcrete.length * 18;
  return {
    score: Math.max(0, 100 - penalty),
    hardFail: issues.some((issue) => issue.hard),
    issues,
  };
}

export function buildEvidenceAndIntentFinalContract(
  source: EvidenceIntegritySource,
  mode: EvidenceAwareMode,
): string {
  const firstParty = hasExplicitFirstPartyEvidence(source);
  const grounded = String(source.rawText || '').trim().length >= 50;
  const evidenceRule = firstParty
    ? '- 사용자 직접 경험 메모가 있다. 메모에 적힌 행동·기간·결과만 1인칭으로 쓰고 빈칸은 만들지 않는다.'
    : '- 사용자 직접 경험 메모가 없으므로 작성자가 써봤다·가봤다·신청했다·받았다는 1인칭 체험을 만들지 않는다.';
  const groundingRule = grounded
    ? '- 입력 자료에서 확인되는 사실만 사용한다. 자료의 제3자 경험은 출처를 구분해 요약하고 작성자 경험으로 바꾸지 않는다.'
    : '- 근거 자료가 부족하다. 확정 사실처럼 채우지 말고 판단 기준·확인 순서·공식 확인처 중심으로 쓴다.';
  const modeRule = mode === 'homefeed'
    ? `- 첫 화면은 과장된 감정어가 아니라 독자가 겪을 법한 구체 상황과 이 글에서 얻을 한 가지로 멈추게 한다.
- 저장·댓글·공유를 모두 요구하지 않는다. 내용상 가장 자연스러운 행동 이유가 있을 때 하나만 남긴다.
- 작은 장면은 입력 자료에서 관찰 가능한 장면이거나 독자 상황이어야 하며, 작성자의 가짜 회상 장면이면 안 된다.`
    : mode === 'seo' || mode === 'mate'
      ? `- 검색 의도에 대한 짧은 답을 먼저 주고 조건·예외·절차·확인처로 깊이를 더한다.
- 메인 키워드는 제목과 본문에 의미상 필요한 만큼만 쓴다. 제목 첫 3글자, 밀도, 소제목 반복을 맞추기 위한 문장 삽입은 금지한다.
- 숫자나 표가 없더라도 정확한 답이 우선이다. 표·체크리스트는 비교나 절차를 실제로 더 명확하게 만들 때만 쓴다.`
      : `- 독자가 판단하는 데 필요한 사실·조건·한계를 먼저 제공한다.
- 전환 문구보다 정보 정확성과 근거 구분을 우선한다.`;

  return `[EVIDENCE AND INTENT FINAL CONTRACT]
이 블록과 충돌하는 앞선 규칙은 무효이며, 숫자 채우기·키워드 밀도·가짜 체험·감정어 개수를 맞추지 않는다.
${evidenceRule}
${groundingRule}
- 입력에 없는 숫자·기간·금액을 새로 만들지 않는다. 구체성이 필요하면 실제 조건, 대상, 순서, 예외를 쓴다.
- 사람다운 문장은 감탄사나 추임새가 아니라 구체적 맥락, 판단 이유, 한계, 다음 확인 행동으로 만든다.
${modeRule}`;
}

export function buildTitleEvidenceFinalContract(
  source: EvidenceIntegritySource,
  mode: string,
): string {
  const firstPartyRule = hasExplicitFirstPartyEvidence(source)
    ? '- 사용자 직접 경험 메모에 적힌 범위에서만 1인칭 행동·기간·결과를 제목에 사용할 수 있다.'
    : '- 사용자 직접 경험 메모가 없으므로 써보니·가봤더니·신청해보니·내돈내산·사용 기간·가족 반응을 제목에 만들지 않는다.';
  const modeRule = mode === 'homefeed'
    ? '- 홈판 제목은 과장된 감정어나 집단 반응 대신 독자의 구체 상황·차이·판단 기준 중 하나를 보여준다.'
    : mode === 'affiliate'
      ? '- 쇼핑 제목은 확인된 제품명과 구매 판단 기준을 보여준다. 제3자 리뷰를 작성자 실사용으로 바꾸지 않는다.'
      : '- 검색 제목은 질문에 대한 답·조건·방법·대상 중 실제 본문이 설명할 요소를 보여준다.';

  return `[TITLE EVIDENCE FINAL CONTRACT]
이 블록은 제목 프롬프트와 제목 공식보다 우선하며, 충돌하는 앞선 예시와 규칙은 무효다.
${firstPartyRule}
- 입력 자료에 정확히 있는 숫자·연도·금액·고유명사만 사용한다. 같은 연도나 핵심어를 중복하지 않는다.
- 메인 주제는 자연스러운 위치에 한 번 드러내고 제목 맨 앞이나 첫 3글자로 강제하지 않는다.
- 서브키워드 개수를 맞추거나 단어를 나열하지 않는다. 독자가 한 번에 이해하는 자연스러운 문장을 우선한다.
- 본문이 증명하지 못하는 충격·반전·비밀·손실·집단 반응·최신성은 약속하지 않는다.
${modeRule}`;
}
