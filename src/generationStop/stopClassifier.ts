// src/generationStop/stopClassifier.ts
// Decides whether a generation failure should stop the run behind a blocking window, and phrases the one-line reason.
// Pure file with no imports: it is inlined into the renderer bundle, so every top-level name carries the gstop prefix.
// Errors cross IPC as plain text, so everything here reads the message (and the agent error code inside it).

export type GstopStage = 'text' | 'image';
export type GstopCause = 'limit' | 'login' | 'model' | 'image' | 'other';

export interface GstopInfo {
  readonly stage: GstopStage;
  readonly cause: GstopCause;
  readonly engine: string;
  readonly detail: string;
  /** Epoch ms of the usage-limit reset when the text names one. */
  readonly resetAt?: number;
}

export type GstopDecision =
  | { readonly kind: 'same' }
  | { readonly kind: 'switch'; readonly engine: string; readonly persist: boolean }
  | { readonly kind: 'halt' };

const GSTOP_ENGINE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  'agent-codex': '코덱스', 'agent-claude': '클로드 코드', 'agent-gemini': '제미나이',
  gemini: 'Gemini', openai: 'OpenAI', claude: 'Claude', perplexity: 'Perplexity',
  'codex-image': '코덱스', 'gemini-cli-image': '제미나이 구독', 'nano-banana-2': '나노바나나2',
  'openai-image': 'GPT 이미지', flow: 'Flow', dropshot: '드롭샷', genspark: '젠스파크', imagefx: 'ImageFX',
  pollinations: 'Pollinations',
});
const GSTOP_CAUSE_LABELS: Readonly<Record<GstopCause, string>> = Object.freeze({
  limit: '한도 초과', login: '로그인 만료', model: '모델 오류', image: '생성 실패', other: '오류',
});
const GSTOP_STAGE_LABELS: Readonly<Record<GstopStage, string>> = Object.freeze({ text: '글 생성', image: '이미지 생성' });

/** Failures a different or the same model cannot help: the user's stop, our own guards, input problems, Naver account stops. */
const GSTOP_NOT_A_STOP = [
  /취소했습니다|취소됨|UserCancelled|AbortError/i,
  /IMAGE_DUPLICATE_RUN/,
  /\[(?:LOGIN_REQUIRED|LOGIN_CHALLENGE|ACCOUNT_PROTECTED|NETWORK_WAIT|ACCOUNT_MISMATCH|PUBLISH_OUTCOME_UNKNOWN)\]/,
  /CONTENT_POLICY_BLOCKED|BLOCK_[A-Z_]{4,}/,
  /키워드 또는 초안|본문 정보가 없습니다|콘텐츠를 추출할 수 없습니다|제목이 없습니다|본문 내용이 없습니다|API 키가 설정되지 않았습니다/,
  /라이선스|PAYWALL/,
  /쇼핑커넥트 대표 상품 이미지가 없어|SHOPPING_COLLECTED_IMAGES_REQUIRED|OPENAI_ORG_VERIFY_REQUIRED/,
];
const GSTOP_LIMIT = /rate_limited|usage limit|rate limit|too many requests|\b429\b|한도|할당량|quota|구독 사용 한도/i;
const GSTOP_LOGIN = /not_logged_in|subscription_inactive|로그인|logged out|\b401\b|세션이 만료|unauthorized/i;
const GSTOP_MODEL = /model_unavailable|update_required|MODEL_UNAVAILABLE|모델에 접근|모델을 쓸 수|not_installed/i;

const GSTOP_MONTHS: Readonly<Record<string, number>> = Object.freeze({
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
});
const GSTOP_RESET_ENGLISH = /(?:try again|retry|resets?)\s+(?:at|on|after)\s+([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\s+(\d{1,2}):(\d{2})\s*(am|pm)?/i;
const GSTOP_RESET_KOREAN = /(\d{1,2})월\s*(\d{1,2})일\s*(\d{1,2})시\s*(\d{1,2})분/;

/** Epoch ms of the reset moment named in a limit message ("Nov 24th, 2026 3:20 PM" or "11월 24일 15시 20분"), else undefined. */
export function gstopParseResetAt(text: string, now: number = Date.now()): number | undefined {
  const source = String(text ?? '');
  const english = source.match(GSTOP_RESET_ENGLISH);
  if (english) {
    const month = GSTOP_MONTHS[english[1].slice(0, 3).toLowerCase()];
    let hour = Number(english[4]);
    const meridiem = (english[6] || '').toLowerCase();
    if (meridiem === 'pm' && hour < 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;
    if (month === undefined || hour > 23 || Number(english[5]) > 59) return undefined;
    const at = new Date(Number(english[3]), month, Number(english[2]), hour, Number(english[5])).getTime();
    return Number.isNaN(at) ? undefined : at;
  }
  const korean = source.match(GSTOP_RESET_KOREAN);
  if (!korean) return undefined;
  const year = new Date(now).getFullYear();
  let at = new Date(year, Number(korean[1]) - 1, Number(korean[2]), Number(korean[3]), Number(korean[4])).getTime();
  if (Number.isNaN(at)) return undefined;
  if (at < now - 30 * 24 * 3_600_000) at = new Date(year + 1, Number(korean[1]) - 1, Number(korean[2]), Number(korean[3]), Number(korean[4])).getTime();
  return at;
}

/** "오후 3:20" */
export function gstopFormatResetClock(at: number): string {
  const date = new Date(at);
  const hour = date.getHours();
  const minute = String(date.getMinutes()).padStart(2, '0');
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour < 12 ? '오전' : '오후'} ${h12}:${minute}`;
}

export function gstopEngineLabel(engine: string): string {
  return GSTOP_ENGINE_LABELS[String(engine || '').trim()] || String(engine || '').trim() || '선택한 엔진';
}

function gstopMessageOf(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const named = error as { message?: unknown; name?: unknown; detail?: unknown };
    return [named.name === 'UserCancelledError' ? '취소했습니다' : '', String(named.message ?? ''), String(named.detail ?? '')].join(' ').trim();
  }
  return String(error ?? '');
}

/** The stop to show for this failure, or null when the failure is not one a window can help with (it keeps its old handling). */
export function gstopClassify(error: unknown, stage: GstopStage, engine: string, now: number = Date.now()): GstopInfo | null {
  const detail = gstopMessageOf(error);
  if (GSTOP_NOT_A_STOP.some((pattern) => pattern.test(detail))) return null;
  const cause: GstopCause = GSTOP_LIMIT.test(detail) ? 'limit'
    : GSTOP_MODEL.test(detail) ? 'model'
      : GSTOP_LOGIN.test(detail) ? 'login'
        : stage === 'image' ? 'image' : 'other';
  const resetAt = cause === 'limit' ? gstopParseResetAt(detail, now) : undefined;
  return { stage, cause, engine, detail: detail.slice(0, 400), ...(resetAt !== undefined ? { resetAt } : {}) };
}

/** "이미지 생성이 멈췄어요 · 코덱스 한도 초과 · 초기화 오후 3:20" */
export function gstopSummaryLine(info: Pick<GstopInfo, 'stage' | 'cause' | 'engine' | 'resetAt'>): string {
  const parts = [`${GSTOP_STAGE_LABELS[info.stage]}이 멈췄어요`, `${gstopEngineLabel(info.engine)} ${GSTOP_CAUSE_LABELS[info.cause]}`];
  if (info.resetAt !== undefined) parts.push(`초기화 ${gstopFormatResetClock(info.resetAt)}`);
  return parts.join(' · ');
}

const GSTOP_ACCOUNT_LEVEL_AGENT = /원인 코드:\s*(?:rate_limited|not_logged_in|subscription_inactive|model_unavailable|update_required|not_installed|provider_disabled)/;

/** A subscription CLI engine (Codex, Gemini, Claude Code) failed for the whole account: another request fails the same way. */
export function gstopIsAccountLevelAgentError(error: unknown): boolean {
  return GSTOP_ACCOUNT_LEVEL_AGENT.test(gstopMessageOf(error));
}
