/**
 * Shopping first-person voice audit.
 *
 * [2026-09-06] Live shopping post (opt-in first-person) copied buyer-review sentences verbatim and
 * rewrote reviewer usage numbers ("저녁에 30분 2번") and family usage ("온가족") as the author's own
 * experience. No existing detector held the review corpus next to the body: the authenticity audit
 * takes only title/body, the experience contract sees body only, and the review-depth audit scores
 * overlap as a positive signal. This module compares body against `productReviews` directly and
 * flags first-person claims the 9/3 voice rule forbids (numeric usage, purchase, family).
 *
 * Consumer: contentGenerator's shopping patch slot (same single selfCritique call the throughline
 * judge uses) — no extra paid call, no publish block.
 */

export type ReviewVoiceIssueCode =
  | 'REVIEW_VERBATIM_COPY'
  | 'UNSUPPORTED_USAGE_COUNT_CLAIM'
  | 'UNSUPPORTED_PURCHASE_CLAIM'
  | 'UNSUPPORTED_FAMILY_USAGE_CLAIM';

export interface ReviewVoiceIssue {
  code: ReviewVoiceIssueCode;
  message: string;
}

export interface VerbatimRun {
  /** Original body text of the copied span. */
  text: string;
  /** Normalized length (letters/digits only). */
  length: number;
}

export interface ReviewVoiceAudit {
  verbatimRuns: VerbatimRun[];
  /** Body sentences carrying a reviewer-only claim written as the author's own. */
  claimSentences: string[];
  issues: ReviewVoiceIssue[];
  patchable: boolean;
}

export interface ReviewVoiceAuditInput {
  body: string;
  conclusion?: string;
  reviews: string[];
  /** Strings whose overlap is not copying (product name, search keyword). */
  ignore?: string[];
}

/** Minimum normalized run shared with a review to count as copied (~15 raw chars with spaces). */
const MIN_GRAM = 12;
/** A single run this long is copying on its own; shorter runs need a second one. */
const LONG_RUN = 20;
const MIN_HANGUL_IN_RUN = 8;

const ATTRIBUTION = /구매자|후기|리뷰|라고\s*(?:하|남|적|썼|말)|다는\s*(?:분|말|평|후기|글)|다고\s*(?:하|남|합)|다네요|하시네요|하대요|한다네/;
// Past tense, and present-habitual first person ("~고 있답니다", "느껴져서") — the live 09-42-51
// patch left "30분씩 두 번 ... 챙기고 있답니다" untouched because only past endings were known.
const EXPERIENTIAL = /았|었|했|였|더라|더니|해보니|써보니|다\s*보니|하고\s*나면|하고\s*나니|하니까|느껴|느낌을\s*받|고\s*있(?:어요|습니다|답니다|네요|어서|고)/;
const HEDGE_TAIL = /(?:것\s*같|듯|수\s*있|겠|을까요?|추천|권해)[가-힣]{0,4}[.!?~\s]*$/;
// Korean numerals are whole words, not a character class — "보다 번거롭" must not read as "다 번".
const KO_NUM = '(?:한|두|세|네|다섯|여섯|일곱|여덟|아홉|열)';
const USAGE_COUNT = new RegExp(`(?:(?:\\d+|${KO_NUM}|반)\\s*(?:분|시간)\\s*(?:씩|정도|동안|간|만|쯤)?|(?:\\d+|${KO_NUM}|여러)\\s*(?:번|회|차례)(?!째)\\s*(?:씩|정도|쯤|만)?|(?:하루|이틀|사흘|일주일|한\\s*달|\\d+\\s*(?:일|주|개월|달|년))\\s*(?:동안|째|간|정도|넘게|만에|쯤))`);
const USAGE_VERB = /사용|써|쓰|쓴|돌리|돌려|작동|착용|해\s*보|해봤|먹|바르|발라|신어|입어|하고\s*나|하고\s*자/;
const PURCHASE = /(?:구매|주문|결제|내돈내산)(?:했|하고|해\s*봤|해봤)|샀|사\s*봤|사서\s*써|배송\s*(?:받았|왔)|들였|장만했/;
const FAMILY = /(?:온\s*)?가족|식구|남편|아내|와이프|신랑|아이들?|애들|우리\s*애|부모님|어머니|아버지|엄마|아빠|할머니|할아버지/;
const FAMILY_USE = /쓰|써|사용|좋아하|만족|시원|해\s*줬|해줬|해\s*드렸|해드렸|하니|하네|하고\s*있/;

function normalize(text: string): { norm: string; map: number[] } {
  const chars: string[] = [];
  const map: number[] = [];
  const src = String(text || '');
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (/[가-힣a-zA-Z0-9]/.test(ch)) {
      chars.push(ch.toLowerCase());
      map.push(i);
    }
  }
  return { norm: chars.join(''), map };
}

function countHangul(text: string): number {
  return (text.match(/[가-힣]/g) || []).length;
}

function findVerbatimRuns(body: string, reviews: string[], ignore: string[]): VerbatimRun[] {
  const { norm, map } = normalize(body);
  if (norm.length < MIN_GRAM || reviews.length === 0) return [];
  const grams = new Set<string>();
  for (const review of reviews) {
    const r = normalize(review).norm;
    for (let i = 0; i + MIN_GRAM <= r.length; i += 1) grams.add(r.slice(i, i + MIN_GRAM));
  }
  const covered = new Array<boolean>(norm.length).fill(false);
  for (let i = 0; i + MIN_GRAM <= norm.length; i += 1) {
    if (!grams.has(norm.slice(i, i + MIN_GRAM))) continue;
    for (let j = i; j < i + MIN_GRAM; j += 1) covered[j] = true;
  }
  const ignoreNorm = ignore.map((s) => normalize(s).norm).filter(Boolean);
  const runs: VerbatimRun[] = [];
  let start = -1;
  for (let i = 0; i <= norm.length; i += 1) {
    const on = i < norm.length && covered[i];
    if (on && start < 0) start = i;
    if (!on && start >= 0) {
      const slice = norm.slice(start, i);
      const text = body.slice(map[start], map[i - 1] + 1);
      const isIgnored = ignoreNorm.some((ig) => ig.includes(slice));
      if (!isIgnored && countHangul(slice) >= MIN_HANGUL_IN_RUN) runs.push({ text, length: slice.length });
      start = -1;
    }
  }
  return runs;
}

function splitSentences(text: string): string[] {
  return String(text || '')
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 6);
}

function isAuthorExperienceSentence(sentence: string): boolean {
  if (ATTRIBUTION.test(sentence)) return false;
  if (HEDGE_TAIL.test(sentence) && !/았|었|했/.test(sentence)) return false;
  return EXPERIENTIAL.test(sentence);
}

function collectClaims(text: string): { sentences: string[]; codes: Set<ReviewVoiceIssueCode> } {
  const sentences: string[] = [];
  const codes = new Set<ReviewVoiceIssueCode>();
  for (const sentence of splitSentences(text)) {
    if (ATTRIBUTION.test(sentence)) continue;
    const hit: ReviewVoiceIssueCode[] = [];
    if (PURCHASE.test(sentence)) hit.push('UNSUPPORTED_PURCHASE_CLAIM');
    if (isAuthorExperienceSentence(sentence)) {
      if (USAGE_COUNT.test(sentence) && USAGE_VERB.test(sentence)) hit.push('UNSUPPORTED_USAGE_COUNT_CLAIM');
      if (FAMILY.test(sentence) && FAMILY_USE.test(sentence)) hit.push('UNSUPPORTED_FAMILY_USAGE_CLAIM');
    }
    if (hit.length === 0) continue;
    sentences.push(sentence);
    hit.forEach((code) => codes.add(code));
  }
  return { sentences, codes };
}

export function auditReviewVoice(input: ReviewVoiceAuditInput): ReviewVoiceAudit {
  const body = [input.body, input.conclusion].filter(Boolean).join('\n');
  const reviews = (input.reviews || []).map((r) => String(r || '')).filter((r) => r.length >= MIN_GRAM);
  const verbatimRuns = findVerbatimRuns(body, reviews, input.ignore || []);
  const claims = collectClaims(body);
  const issues: ReviewVoiceIssue[] = [];
  const copying = verbatimRuns.length >= 2 || verbatimRuns.some((r) => r.length >= LONG_RUN);
  if (copying) {
    issues.push({ code: 'REVIEW_VERBATIM_COPY', message: `후기 원문을 그대로 옮긴 구간 ${verbatimRuns.length}곳` });
  }
  const claimMessages: Record<Exclude<ReviewVoiceIssueCode, 'REVIEW_VERBATIM_COPY'>, string> = {
    UNSUPPORTED_USAGE_COUNT_CLAIM: '리뷰어의 사용 횟수·기간 수치를 필자 경험으로 씀',
    UNSUPPORTED_PURCHASE_CLAIM: '구매·주문 사실을 필자 경험으로 씀',
    UNSUPPORTED_FAMILY_USAGE_CLAIM: '가족 사용·반응을 필자 경험으로 씀',
  };
  for (const code of claims.codes) {
    if (code !== 'REVIEW_VERBATIM_COPY') issues.push({ code, message: claimMessages[code] });
  }
  return { verbatimRuns, claimSentences: claims.sentences, issues, patchable: issues.length > 0 };
}

/** Only opt-in first-person shopping posts without a user-supplied experience note are audited. */
export function isAffiliateFirstPersonVoice(source: {
  contentMode?: string;
  aiExperienceGeneration?: boolean;
  personalExperience?: string;
}): boolean {
  return source.contentMode === 'affiliate'
    && source.aiExperienceGeneration === true
    && String(source.personalExperience || '').trim().length < 8;
}

const quote = (s: string) => `  · "${s.length > 120 ? `${s.slice(0, 120)}…` : s}"`;

export function buildReviewVoiceDirective(audit: ReviewVoiceAudit): string {
  if (!audit.patchable) return '';
  const lines: string[] = ['[쇼핑 1인칭 화자 규칙 위반 — 반드시 고칠 것]'];
  if (audit.issues.some((i) => i.code === 'REVIEW_VERBATIM_COPY')) {
    lines.push('- 아래 구간은 구매자 후기 원문을 그대로 옮긴 것이다. 같은 관찰을 필자의 말과 문장 구조로 다시 쓰고, 후기 문장을 12자 이상 이어서 옮기지 말 것:');
    audit.verbatimRuns.slice(0, 6).forEach((r) => lines.push(quote(r.text)));
  }
  if (audit.claimSentences.length > 0) {
    lines.push('- 아래 문장의 사용 횟수·기간 수치, 구매 사실, 가족 사용·반응은 후기 작성자의 것이지 필자의 것이 아니다. 수치·횟수·구매·가족을 빼고 필자의 관찰(정도·느낌·조건)로 바꿀 것:');
    audit.claimSentences.slice(0, 6).forEach((s) => lines.push(quote(s)));
  }
  return lines.join('\n');
}

export function describeReviewVoice(audit: ReviewVoiceAudit): string {
  if (!audit.patchable) return `[ReviewVoice] ✅ 후기 복사 ${audit.verbatimRuns.length}곳 · 이식 주장 0문장`;
  const codes = audit.issues.map((i) => i.code).join(', ');
  return `[ReviewVoice] ⚠️ ${codes} — 복사 ${audit.verbatimRuns.length}곳 · 이식 주장 ${audit.claimSentences.length}문장`;
}
