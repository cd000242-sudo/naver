import type { DailySource } from './dailyPublishingExecutor.js';

export interface DailyEditorialAngle {
  readonly scene: string;
  readonly expectationGap: string;
  readonly visualHook: string;
  readonly bodyPayoff: string;
  readonly targetReader: string;
  readonly readerQuestion: string;
  readonly whyCareNow: string;
  readonly titleDirection: string;
}
export interface DailyEditorialSource extends DailySource { readonly editorial: Readonly<DailyEditorialAngle> }
export interface DailyEditorialPacket {
  readonly sourceId: string;
  readonly title: string;
  readonly date: string;
  readonly url: string;
  readonly body: string;
  readonly source: DailySource;
}

const anchors = ['scene', 'expectationGap', 'visualHook', 'bodyPayoff'] as const;
const guidance = ['targetReader', 'readerQuestion', 'whyCareNow', 'titleDirection'] as const;
// off_profile(2026-10-21): 블로그 설정의 제외 주제 · 독자와 맞지 않는 소재
const rejectedReasons = new Set(['merely_new', 'promotion', 'no_surprise', 'no_reader_stake', 'no_visual_scene', 'unverified_payoff', 'duplicate_question', 'off_profile']);
const normalize = (text: string): string => text.normalize('NFKC').replace(/\s+/gu, ' ').trim();
const invalid = (): never => { throw new Error('DAILY_EDITORIAL_INVALID: 소재 비교 결과와 근거를 확인하지 못해 작성을 보류합니다.'); };
function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : invalid();
}
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): void {
  if (Object.keys(value).length !== keys.length || keys.some(key => !Object.prototype.hasOwnProperty.call(value, key))) invalid();
}
function text(value: unknown, min: number, max: number): string {
  if (typeof value !== 'string' || normalize(value).length < min || value.length > max || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(value)) return invalid();
  return value.trim();
}

/** Anchors must occur verbatim in the bounded packet actually shown to the judge. */
export function parseDailyEditorialSelection(raw: string, packets: readonly DailyEditorialPacket[]): DailyEditorialSource[] {
  if (typeof raw !== 'string' || raw.length > 64_000) return invalid();
  let parsed: unknown;
  try { parsed = JSON.parse(raw.trim().replace(/^```json\s*([\s\S]*?)\s*```$/u, '$1')); } catch { return invalid(); }
  const root = record(parsed); exactKeys(root, ['reviews']);
  if (!Array.isArray(root.reviews) || root.reviews.length !== packets.length) return invalid();
  const seen = new Set<string>(); const questions = new Set<string>(); const output: DailyEditorialSource[] = [];
  for (const rawReview of root.reviews) {
    const review = record(rawReview); exactKeys(review, ['sourceId', 'decision', 'reason', 'angle']);
    const sourceId = text(review.sourceId, 2, 10);
    const packet = packets.find(item => item.sourceId === sourceId);
    if (!packet || seen.has(sourceId)) return invalid(); seen.add(sourceId);
    if (review.decision === 'reject') {
      if (review.angle !== null || !rejectedReasons.has(String(review.reason))) return invalid();
      continue;
    }
    if (review.decision !== 'select') return invalid();
    text(review.reason, 12, 400);
    const angle = record(review.angle); exactKeys(angle, [...anchors, ...guidance]);
    const result: Record<string, string> = {};
    for (const key of anchors) {
      const quote = text(angle[key], 12, 500);
      if (!normalize(packet.body).includes(normalize(quote))) return invalid();
      result[key] = quote;
    }
    if (normalize(result.scene) === normalize(result.expectationGap)) return invalid();
    for (const key of guidance) result[key] = text(angle[key], 12, 400);
    const question = normalize(result.readerQuestion).replace(/[\p{P}\p{Z}]/gu, '');
    if (questions.has(question)) return invalid(); questions.add(question);
    output.push(Object.freeze({ ...packet.source, editorial: Object.freeze(result as unknown as DailyEditorialAngle) }));
  }
  return output;
}
