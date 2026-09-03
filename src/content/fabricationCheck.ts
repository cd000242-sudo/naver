/**
 * Fabrication Check — 글에만 있고 자료에는 없는 검증 가능한 수치·고유명사를 찾는다.
 *
 * 왜 필요한가 (2026-08-12 진단):
 *   기존 검사는 두 개인데 둘 다 반대 방향이거나 다른 축을 본다.
 *     sourceFidelityCheck  자료 → 글   "자료의 사실이 빠졌나" (누락)
 *     checkHallucination   감정 축     "혹평을 호평으로 뒤집었나"
 *   LLM 이 없던 금액·날짜를 하나 만들어 넣는 것은 누락도 감정 뒤집힘도 아니라
 *   두 검사를 모두 통과한다. "지어내지 마라"는 프롬프트에만 있고
 *   지켰는지 확인하는 코드가 0건이었다 — sourceFidelityCheck 가 만들어질 때와
 *   같은 구멍이 날조 방향에 그대로 남아 있었다.
 *
 * 설계 원칙
 *   · 판단이 필요한 주장은 보지 않는다. 기계적으로 대조 가능한 것만 본다.
 *   · 오탐이 나면 쓸모가 없어진다. 서수·개수·일반 기간처럼 자료에 없어도
 *     정상인 표현은 애초에 후보에서 뺀다.
 *   · 이 모듈은 측정·경고만 한다. 발행을 막거나 재작성을 트리거하지 않는다.
 *     오탐률 실측 뒤에 별도 단계로 정한다.
 */

export interface FabricationFinding {
  /** 글에서 발견된 원문 조각 */
  readonly claim: string;
  /** 어떤 종류인지 — 경고 문구와 후속 판단에 쓴다 */
  readonly kind: 'money' | 'percent' | 'date' | 'people' | 'org';
}

export interface FabricationCheckResult {
  readonly checked: boolean;
  readonly findings: readonly FabricationFinding[];
  readonly warnings: readonly string[];
  readonly totalClaims: number;
}

/** 자료가 이보다 짧으면 대조 자체가 무의미하다 (키워드 생성 등) */
const MIN_SOURCE_CHARS = 200;

/**
 * 자료에 없어도 정상인 표현 — 후보에서 제외한다.
 *   "3가지 방법", "두 번째로", "1주일이면", "하루 30분" 같은 것들.
 * 이 목록이 곧 오탐 방어선이다.
 */
const BENIGN_PATTERNS: readonly RegExp[] = Object.freeze([
  /^\d+\s*(가지|번째|단계|순위|위)$/u,
  /^\d+\s*(초|분|시간|일|주|주일|개월|달|년)\s*(정도|쯤|가량|이면|만에)?$/u,
  /^(하루|이틀|사흘|일주일|한\s?달|반년)$/u,
]);

const MONEY = /\d[\d,]*\s*(억|천만|백만|만)?\s*원/gu;
const PERCENT = /\d+(?:\.\d+)?\s*(?:%|퍼센트|퍼)/gu;
const DATE = /\d{1,2}\s*월\s*\d{1,2}\s*일|\d{4}\s*년\s*\d{1,2}\s*월(?:\s*\d{1,2}\s*일)?/gu;
const PEOPLE = /\d[\d,]*\s*(?:명|가구|세대|팀)/gu;
/**
 * 기관·제도명 — 지어내면 바로 들통나는 고유명사.
 * 뒤에 조사가 붙어도("청년창업진흥원에서") 잡히도록 후행 제약을 두지 않는다.
 * 대신 ORG_MIN_CHARS 로 "종합병원", "국세청" 같은 짧은 일반명사를 걸러낸다 —
 * 지어내서 위험한 쪽은 그럴듯하게 긴 이름이다.
 */
// [2026-09-03 self-run 08:19] "야간인지부터" 가 기관명 "야간인지부" 로 잡혔다 — 조사 '부터' 는 기관 접미가 아니다.
const ORG = /[가-힣]{2,}(?:청|부|처|원|공단|공사|재단|협회|위원회|센터)(?!터)/gu;
const ORG_MIN_CHARS = 5;

const KIND_LABEL: Readonly<Record<FabricationFinding['kind'], string>> = Object.freeze({
  money: '금액', percent: '비율', date: '날짜', people: '인원', org: '기관명',
});

/**
 * 숫자 표기 흔들림을 흡수한다 — "1,200만원" 과 "1200 만 원" 을 같게 본다.
 * [2026-09-03 self-run 08:06] 리서치 자료는 마크다운이라 "2026년 **9월 4일**" 처럼 강조 표시가
 * 숫자 사이에 끼어 든다. 그대로 대조하면 자료에 있는 날짜를 "없는 날짜" 로 오판했다.
 */
function normalizeForMatch(value: string): string {
  return value.replace(/[\s,*_`]/gu, '');
}

/**
 * [2026-09-03 self-run 08:14] "2026년 9월 4일" 을 없는 날짜로 잡았다 — 자료는 "2026년 축제는 9월 4일~13일"
 * 이라 연도와 월일이 떨어져 있다. 월일이 자료에 있고 그 연도가 자료 어딘가에 있으면 조립된 날짜다.
 */
const YEAR_MONTH_DAY = /^(\d{4})년(\d{1,2}월\d{1,2}일)$/u;

function isDateComposedFromSource(finding: FabricationFinding, normalizedSource: string): boolean {
  if (finding.kind !== 'date') return false;
  const match = normalizeForMatch(finding.claim).match(YEAR_MONTH_DAY);
  if (!match) return false;
  const [, year, monthDay] = match;
  return normalizedSource.includes(monthDay)
    && (normalizedSource.includes(`${year}년`) || normalizedSource.includes(`${year}.`));
}

function isBenign(claim: string): boolean {
  const compact = claim.replace(/\s+/gu, ' ').trim();
  return BENIGN_PATTERNS.some(pattern => pattern.test(compact));
}

function collect(
  text: string,
  pattern: RegExp,
  kind: FabricationFinding['kind'],
  minChars = 0,
): FabricationFinding[] {
  const out: FabricationFinding[] = [];
  for (const match of text.matchAll(pattern)) {
    const claim = match[0].trim();
    if (!claim || claim.length < minChars || isBenign(claim)) continue;
    out.push({ claim, kind });
  }
  return out;
}

/** 글에서 기계적으로 대조 가능한 주장만 뽑는다. */
export function extractVerifiableClaims(text: string): FabricationFinding[] {
  const body = String(text ?? '');
  if (!body) return [];
  const all = [
    ...collect(body, MONEY, 'money'),
    ...collect(body, PERCENT, 'percent'),
    ...collect(body, DATE, 'date'),
    ...collect(body, PEOPLE, 'people'),
    ...collect(body, ORG, 'org', ORG_MIN_CHARS),
  ];
  const seen = new Set<string>();
  return all.filter((finding) => {
    const key = `${finding.kind}:${normalizeForMatch(finding.claim)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * 결과 본문의 주장이 자료에 실제로 있는지 대조한다.
 * 측정·경고만 한다 — 호출 측에서 발행을 막지 않는다.
 */
export function checkFabrication(
  rawText: string,
  resultBody: string,
): FabricationCheckResult {
  const source = String(rawText ?? '');
  const body = String(resultBody ?? '');

  if (source.length < MIN_SOURCE_CHARS || !body) {
    return { checked: false, findings: [], warnings: [], totalClaims: 0 };
  }

  const claims = extractVerifiableClaims(body);
  const normalizedSource = normalizeForMatch(source);
  const findings = claims.filter(
    finding => !normalizedSource.includes(normalizeForMatch(finding.claim))
      && !isDateComposedFromSource(finding, normalizedSource),
  );

  const warnings = findings.map(
    finding => `자료에 없는 ${KIND_LABEL[finding.kind]}: "${finding.claim}"`,
  );

  return { checked: true, findings, warnings, totalClaims: claims.length };
}
