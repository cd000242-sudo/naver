export interface DailyTitleInput {
  title: string;
  body: string;
  sourceGrounding: string;
  /**
   * 근거 문구를 원문 그대로 대조할 전체 수집 원문(2026-10-21). 모델에는 sourceGrounding(크기 제한 창)만 보내고,
   * 본문은 전체 원문으로 쓰이므로 대조는 전체에서 한다 — 창 밖의 실제 원문 문장을 "자료에 없음"으로 막지 않는다.
   */
  sourceVerification?: string;
  editorialAngle?: unknown;
  /** 블로그별 초기 설정(2026-10-21) — 이 블로그 독자가 알아볼 대상 · 질문. 사실 근거가 아니다. */
  blogProfile?: unknown;
  signal?: AbortSignal;
}
export interface DailyTitleCandidate {
  id: string;
  title: string;
  readerQuestion: string;
  expectedBelief: string;
  surprisingFact: string;
  clickReason: string;
  sourceAnchors: string[];
  bodyAnchors: string[];
}
export interface DailyTitleCritique {
  id: string;
  eligible: boolean;
  concreteSubject: boolean;
  specificCuriosity: boolean;
  realScene: boolean;
  faithful: boolean;
  payoff: boolean;
  notRoutineAnnouncement: boolean;
  distinctQuestion: boolean;
  reason: string;
  sourceAnchors: string[];
  bodyAnchors: string[];
}
export const reviewFlags = ['eligible', 'concreteSubject', 'specificCuriosity', 'realScene', 'faithful', 'payoff', 'notRoutineAnnouncement', 'distinctQuestion'] as const;
const candidateKeys = ['id', 'title', 'readerQuestion', 'expectedBelief', 'surprisingFact', 'clickReason', 'sourceAnchors', 'bodyAnchors'];
const reviewKeys = ['id', ...reviewFlags, 'reason', 'sourceAnchors', 'bodyAnchors'];
export function failTitle(code: string, message: string): never {
  throw Object.assign(new Error(`${code}: ${message}`), { code });
}
export function normalizeTitleEvidence(text: string): string { return text.normalize('NFKC').replace(/\s+/gu, '').toLocaleLowerCase('ko-KR'); }
function object(value: unknown, keys: readonly string[], message = '제목 응답 형식을 확인하지 못했습니다.'): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) failTitle('DAILY_TITLE_CONTRACT', message);
  const entry = value as Record<string, unknown>;
  if (Object.keys(entry).length !== keys.length || Object.keys(entry).some(key => !keys.includes(key))) failTitle('DAILY_TITLE_CONTRACT', message);
  return entry;
}
function text(value: unknown, max = 600): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)) failTitle('DAILY_TITLE_CONTRACT', '제목 검수 응답의 문구와 크기를 확인해 주세요.');
  return value.trim();
}
export function readTitleJson(raw: string): unknown {
  if (typeof raw !== 'string' || raw.length > 65_536) failTitle('DAILY_TITLE_CONTRACT', '제목 응답 크기를 확인해 주세요.');
  const value = raw.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/u, '$1');
  try { return JSON.parse(value); } catch { return failTitle('DAILY_TITLE_CONTRACT', '제목 검수 응답이 JSON 형식이 아닙니다.'); }
}
function anchors(value: unknown, grounding: string): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 6) failTitle('DAILY_TITLE_EVIDENCE', '제목과 본문을 확인할 실제 근거가 없습니다.');
  return value.map(anchor => {
    const exact = text(anchor, 900);
    if (exact.length < 4 || !normalizeTitleEvidence(grounding).includes(normalizeTitleEvidence(exact))) {
      // 어떤 문구가 막혔는지 남긴다(2026-10-21 실측: 정당한 차단인지 대조 오류인지 구분할 수 없었다).
      console.warn(`[DailyTitle] 근거 불일치 (대조 자료 ${grounding.length}자): ${exact.slice(0, 160)}`);
      failTitle('DAILY_TITLE_EVIDENCE', '자료에 없는 근거 문구로 제목을 만들 수 없습니다.');
    }
    return exact;
  });
}
export function assertTitleGrounding(title: string, sourceAnchors: readonly string[], bodyAnchors: readonly string[]): void {
  if (title.length < 8 || title.length > 100 || /[\r\n]/u.test(title)) failTitle('DAILY_TITLE_CONTRACT', '제목 길이와 줄바꿈을 확인해 주세요.');
  const source = normalizeTitleEvidence(sourceAnchors.join(' ')), body = normalizeTitleEvidence(bodyAnchors.join(' '));
  for (const match of title.matchAll(/[“"‘']([^“”"‘’']{1,120})[”"’']/gu)) {
    const quote = normalizeTitleEvidence(match[1]);
    if (!source.includes(quote) || !body.includes(quote)) failTitle('DAILY_TITLE_QUOTE', '실제 자료와 본문에서 확인되지 않는 인용 제목은 사용할 수 없습니다.');
  }
  const number = /\d+(?:[,.]\d+)*/gu;
  const sourceNumbers = new Set(source.match(number) || []), bodyNumbers = new Set(body.match(number) || []);
  for (const value of normalizeTitleEvidence(title).match(number) || []) {
    if (!sourceNumbers.has(value) || !bodyNumbers.has(value)) failTitle('DAILY_TITLE_NUMBER', '제목 수치가 원문 근거 및 본문과 일치하지 않습니다.');
  }
  const quantity = /\d[\d,.]*(?:(?:조|억|만|천)(?:원|달러)?|원|달러|명|년|개월|일|회|대|%|배|잔|인|박|분|초|위|km|kg|cc|kwh)/gu;
  for (const value of normalizeTitleEvidence(title).match(quantity) || []) {
    if (!source.includes(value) || !body.includes(value)) failTitle('DAILY_TITLE_NUMBER', '제목 수치의 단위가 원문 근거 및 본문과 일치하지 않습니다.');
  }
  const money = /\d[\d,.]*(?:조|억|만|천)?(?:원|달러)/u;
  if (!money.test(normalizeTitleEvidence(title))) return;
  const bases = ['한잔', '1잔', '한병', '1병', '1인', '코스', '1박', '월간', '연간', '하루'];
  for (const basis of bases) {
    if (normalizeTitleEvidence(title).includes(basis) && (!source.includes(basis) || !body.includes(basis))) failTitle('DAILY_TITLE_PRICE_BASIS', '금액의 단위·가격 기준을 바꾸는 제목은 사용할 수 없습니다.');
  }
}
export function parseTitleCandidates(raw: string, input: DailyTitleInput): DailyTitleCandidate[] {
  const packet = object(readTitleJson(raw), ['candidates']);
  if (!Array.isArray(packet.candidates) || packet.candidates.length < 3 || packet.candidates.length > 5) failTitle('DAILY_TITLE_CONTRACT', '서로 다른 관점의 제목 후보 3~5개가 필요합니다.');
  const seen = new Set<string>(), questions = new Set<string>(), titles = new Set<string>();
  return packet.candidates.map(value => {
    const entry = object(value, candidateKeys), id = text(entry.id, 30), title = text(entry.title, 100), readerQuestion = text(entry.readerQuestion);
    if (!/^[a-z\d_-]+$/iu.test(id) || seen.has(id) || titles.has(normalizeTitleEvidence(title))) failTitle('DAILY_TITLE_CONTRACT', '제목 후보 식별자 또는 제목이 중복됐습니다.');
    if (questions.has(normalizeTitleEvidence(readerQuestion))) failTitle('DAILY_TITLE_DIVERSITY', '단어만 바꾼 제목 대신 서로 다른 독자 질문·관점이 필요합니다.');
    seen.add(id); questions.add(normalizeTitleEvidence(readerQuestion)); titles.add(normalizeTitleEvidence(title));
    const sourceAnchors = anchors(entry.sourceAnchors, input.sourceVerification || input.sourceGrounding), bodyAnchors = anchors(entry.bodyAnchors, input.body);
    assertTitleGrounding(title, sourceAnchors, bodyAnchors);
    return { id, title, readerQuestion, expectedBelief: text(entry.expectedBelief), surprisingFact: text(entry.surprisingFact), clickReason: text(entry.clickReason), sourceAnchors, bodyAnchors };
  });
}
export function parseTitleCritique(raw: string, ids: readonly string[], input: DailyTitleInput): { selectedId: string; reviews: DailyTitleCritique[] } {
  const packet = object(readTitleJson(raw), ['selectedId', 'reviews'], '제목 별도 검수 응답 형식을 확인하지 못했습니다.');
  if (packet.selectedId !== null && typeof packet.selectedId !== 'string') failTitle('DAILY_TITLE_CONTRACT', '제목 검수의 선정 결과를 확인하지 못했습니다.');
  if (!Array.isArray(packet.reviews) || packet.reviews.length !== ids.length) failTitle('DAILY_TITLE_CONTRACT', '모든 제목 후보의 별도 검수가 필요합니다.');
  const seen = new Set<string>();
  const reviews = packet.reviews.map(value => {
    const entry = object(value, reviewKeys, '제목 검수 항목을 확인하지 못했습니다.'), id = text(entry.id, 30);
    if (!ids.includes(id) || seen.has(id) || reviewFlags.some(key => typeof entry[key] !== 'boolean')) failTitle('DAILY_TITLE_CONTRACT', '제목 검수 식별자 또는 판정이 올바르지 않습니다.');
    seen.add(id);
    return { id, ...Object.fromEntries(reviewFlags.map(key => [key, entry[key]])), reason: text(entry.reason), sourceAnchors: anchors(entry.sourceAnchors, input.sourceVerification || input.sourceGrounding), bodyAnchors: anchors(entry.bodyAnchors, input.body) } as DailyTitleCritique;
  });
  if (packet.selectedId === null) failTitle('DAILY_TITLE_QUALITY', '읽을 이유와 실제 장면을 확인할 제목이 없어 글을 보류했습니다. 다른 소재를 선택해 주세요.');
  const selected = reviews.find(review => review.id === packet.selectedId);
  if (!selected || reviewFlags.some(key => selected[key] !== true)) failTitle('DAILY_TITLE_QUALITY', '선정 제목의 구체적인 궁금증·사실·본문 보상 검수를 통과하지 못했습니다.');
  return { selectedId: packet.selectedId, reviews };
}
