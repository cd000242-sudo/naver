import type { DailyCaptureCategory, DailyContentMode, DailyImageMode, DailyKeywordSource, DailyPublishingJob, DailyPublishingPlan } from './dailyPublishingTypes.js';
import { DAILY_LEWORD_MAX_TOPICS, DAILY_LEWORD_TOPICS } from './dailyLewordTopics.js';

const ID = /^[A-Za-z0-9_.@-]{1,100}$/;
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const invalid = (): never => { throw new Error('DAILY_PLAN_INVALID'); };
/** Legacy plans retain their AI behavior; new modes must be explicit and supported. */
const IMAGE_MODES: readonly DailyImageMode[] = ['official-capture', 'ai-generated', 'ai-first', 'collect-first'];
export function resolveDailyImageMode(value: unknown): DailyImageMode {
  if (value === undefined) return 'ai-generated';
  return IMAGE_MODES.includes(value as DailyImageMode) ? value as DailyImageMode : invalid();
}
/** Every mode but the reviewed official capture draws AI images with an engine. */
export const usesDailyAiImages = (mode: DailyImageMode): boolean => mode !== 'official-capture';
export const collectsDailyPhotos = (mode: DailyImageMode): boolean => mode === 'ai-first' || mode === 'collect-first';
/** Collect modes run unattended only after the owner took responsibility for collected photos. */
export function resolveDailyCollectConsent(value: unknown, imageMode: DailyImageMode, enabled: boolean): true | undefined {
  if (value !== undefined && value !== true) return invalid();
  if (collectsDailyPhotos(imageMode) && enabled && value !== true) throw Error('DAILY_COLLECT_CONSENT_REQUIRED');
  return value === true ? true : undefined;
}
/** A capture run always names its official source category; AI legacy plans need none. */
export function resolveDailyCaptureCategory(value: unknown, imageMode: DailyImageMode, enabled: boolean): DailyCaptureCategory | undefined {
  if (value === undefined) {
    if (imageMode === 'official-capture' && enabled) throw Error('DAILY_CAPTURE_CATEGORY_REQUIRED');
    return undefined;
  }
  return value === 'issue' || value === 'sports' || value === 'auto' ? value : invalid();
}
/** Absent for legacy plans; otherwise 1-3 distinct, known LEWORD topic names and nothing else. */
export function resolveDailyKeywordSource(value: unknown): DailyKeywordSource | undefined {
  if (value === undefined) return undefined;
  const source = dailyObject(value, ['type', 'topics']);
  const topics = source.topics;
  if (source.type !== 'leword-today-picks' || !Array.isArray(topics) || topics.length < 1 || topics.length > DAILY_LEWORD_MAX_TOPICS
    || topics.some(topic => typeof topic !== 'string' || !DAILY_LEWORD_TOPICS.includes(topic)) || new Set(topics).size !== topics.length) return invalid();
  return { type: 'leword-today-picks', topics: [...topics as string[]] };
}
export function resolveDailyContentMode(value: unknown): DailyContentMode | undefined {
  if (value === undefined) return undefined;
  return value === 'seo' || value === 'homefeed' ? value : invalid();
}
export function dailyObject(value: unknown, fields: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  if (Object.keys(value).some((key) => !fields.includes(key))) return invalid();
  return value as Record<string, unknown>;
}
export function dailyId(value: unknown, empty = false): string {
  if (typeof value !== 'string' || !(ID.test(value) || (empty && value === ''))) return invalid();
  return value;
}
export function dailyTime(value: unknown): string {
  if (typeof value !== 'string' || !TIME.test(value)) return invalid();
  return value;
}
export function validateDailyPlans(value: unknown): DailyPublishingPlan[] {
  if (!Array.isArray(value) || value.length > 100) return invalid();
  const accounts = new Set<string>();
  return value.map((input) => {
    const p = dailyObject(input, ['accountId', 'categoryId', 'enabled', 'mode', 'leadMinutes', 'slots', 'generator', 'imageSource', 'imageMode', 'captureCategory', 'imageCollectConsent', 'keywordExhaustion', 'keywordSource', 'contentMode', 'topic']);
    const keywordSource = resolveDailyKeywordSource(p.keywordSource);
    const contentMode = resolveDailyContentMode(p.contentMode);
    const topic = p.topic === undefined && keywordSource ? '' : p.topic;
    const imageMode = resolveDailyImageMode(p.imageMode);
    const captureCategory = resolveDailyCaptureCategory(p.captureCategory, imageMode, p.enabled === true);
    const imageCollectConsent = resolveDailyCollectConsent(p.imageCollectConsent, imageMode, p.enabled === true);
    if (p.keywordExhaustion !== undefined && p.keywordExhaustion !== 'expand' && p.keywordExhaustion !== 'stop') return invalid();
    const accountId = dailyId(p.accountId);
    if (accounts.has(accountId)) return invalid();
    accounts.add(accountId);
    if (typeof p.enabled !== 'boolean' || !['draft', 'publish', 'schedule'].includes(p.mode as string)) return invalid();
    if (p.mode === 'schedule' ? p.leadMinutes !== 60 : p.leadMinutes !== undefined) return invalid();
    if (typeof topic !== 'string' || topic.length > 2000 || /[\x00-\x08\x0b-\x1f\x7f]/.test(topic)) return invalid();
    if (!Array.isArray(p.slots) || p.slots.length < 1 || p.slots.length > 20) return invalid();
    const times = new Set<string>();
    const slots = p.slots.map((inputSlot) => {
      const slot = dailyObject(inputSlot, ['time', 'count']);
      const time = dailyTime(slot.time);
      if (times.has(time) || !Number.isInteger(slot.count) || (slot.count as number) < 1 || (slot.count as number) > 20) return invalid();
      times.add(time);
      return { time, count: slot.count as number };
    }).sort((a, b) => a.time.localeCompare(b.time));
    if (slots.reduce((total, slot) => total + slot.count, 0) > 20) return invalid();
    if (typeof p.categoryId !== 'string' || !/^\d{1,10}$/.test(p.categoryId)) return invalid();
    if (p.imageSource !== undefined && (typeof p.imageSource !== 'string' || (p.imageSource !== '' && !/^[A-Za-z0-9_.-]{1,80}$/.test(p.imageSource)))) return invalid();
    return { accountId, categoryId: p.categoryId, enabled: p.enabled,
      mode: p.mode as DailyPublishingPlan['mode'], slots, generator: dailyId(p.generator), imageMode,
      ...(p.mode === 'schedule' ? { leadMinutes: 60 as const } : {}),
      ...(captureCategory ? { captureCategory } : {}),
      ...(imageCollectConsent ? { imageCollectConsent } : {}),
      ...(p.keywordExhaustion ? { keywordExhaustion: p.keywordExhaustion as 'expand' | 'stop' } : {}),
      ...(keywordSource ? { keywordSource } : {}),
      ...(contentMode ? { contentMode } : {}),
      ...(!p.imageSource ? {} : { imageSource: p.imageSource as string }), topic };
  });
}
export function dailyKst(now: Date): { date: string; time: string } {
  if (!Number.isFinite(now.getTime())) throw new Error('DAILY_CLOCK_INVALID');
  const value = new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString();
  return { date: value.slice(0, 10), time: value.slice(11, 16) };
}
export function dailyClaimKey(accountId: string, now: Date, time: string, ordinal: number): string {
  return `${accountId}:${dailyKst(now).date}:${time.replace(':', '')}:${ordinal}`;
}
type DailyClaim = Pick<DailyPublishingJob, 'accountId' | 'date' | 'time' | 'ordinal'>;
export function nextDailyRunAt(plan: DailyPublishingPlan, now: Date, claims: readonly DailyClaim[] = []): string | null {
  return nextDailyTiming(plan, now, claims)?.prepareAt || null;
}
export function dailySlotTiming(plan: DailyPublishingPlan, date: string, time: string): { prepareAt: string; scheduledFor?: string } {
  const target = new Date(`${date}T${dailyTime(time)}:00+09:00`);
  if (!Number.isFinite(target.getTime()) || dailyKst(target).date !== date) return invalid();
  const scheduledFor = target.toISOString();
  return plan.mode === 'schedule'
    ? { scheduledFor, prepareAt: new Date(target.getTime() - 60 * 60_000).toISOString() }
    : { prepareAt: scheduledFor };
}
/** Include tomorrow because its midnight slots start preparation today. */
function dailyCandidates(plan: DailyPublishingPlan, now: Date) {
  return [0, 86_400_000].flatMap(offset => {
    const { date } = dailyKst(new Date(now.getTime() + offset));
    return plan.slots.map(slot => ({ date, ...slot, ...dailySlotTiming(plan, date, slot.time) }));
  });
}
/**
 * Draft/publish slots: with `since`, every slot of today (KST) that has started and began at or after the plan's
 * activation minute is due — a sleeping PC or a busy app catches up the same day instead of losing the post.
 * Without `since`, only the exact minute is due.
 */
export function dueDailySlots(plan: DailyPublishingPlan, now: Date, since?: Date): Array<{
  date: string; time: string; count: number; prepareAt?: string; scheduledFor?: string;
}> {
  if (!plan.enabled) return [];
  if (plan.mode !== 'schedule') {
    const { date, time } = dailyKst(now);
    if (!since || !Number.isFinite(since.getTime())) return plan.slots.filter(slot => slot.time === time).map(slot => ({ date, ...slot }));
    const from = Math.floor(since.getTime() / 60_000) * 60_000;
    return plan.slots.filter(slot => {
      const start = Date.parse(dailySlotTiming(plan, date, slot.time).prepareAt);
      return start <= now.getTime() && start >= from;
    }).map(slot => ({ date, ...slot }));
  }
  return dailyCandidates(plan, now).filter(slot => Date.parse(slot.prepareAt) <= now.getTime()
    && now.getTime() < Date.parse(slot.scheduledFor!));
}
function nextDailyTiming(plan: DailyPublishingPlan, now: Date, claims: readonly DailyClaim[]): { prepareAt: string; scheduledFor?: string } | null {
  if (!plan.enabled) return null;
  const candidates = dailyCandidates(plan, now).filter(slot => {
    const claimed = new Set(claims.filter(claim => claim.accountId === plan.accountId
      && claim.date === slot.date && claim.time === slot.time).map(claim => claim.ordinal));
    const fullyClaimed = Array.from({ length: slot.count }, (_, i) => i + 1).every(ordinal => claimed.has(ordinal));
    return !fullyClaimed && (plan.mode === 'schedule' ? Date.parse(slot.scheduledFor!) > now.getTime()
      : Date.parse(slot.prepareAt) >= now.getTime());
  });
  return candidates.sort((left, right) => left.prepareAt.localeCompare(right.prepareAt))[0] || null;
}
export function nextDailyScheduledFor(plan: DailyPublishingPlan, now: Date, claims: readonly DailyClaim[] = []): string | null {
  return plan.mode === 'schedule' ? nextDailyTiming(plan, now, claims)?.scheduledFor || null : null;
}
export function confirmedDailyUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !['blog.naver.com', 'm.blog.naver.com'].includes(url.hostname)
      || url.username || url.password || url.port) return null;
    const match = url.pathname.match(/^\/([A-Za-z0-9_-]+)\/([1-9]\d*)\/?$/);
    if (match) return `https://blog.naver.com/${match[1]}/${match[2]}`;
    const blogId = url.searchParams.get('blogId') || url.pathname.match(/^\/([A-Za-z0-9_-]+)\/?$/)?.[1];
    const logNo = url.searchParams.get('logNo');
    if (blogId && /^[A-Za-z0-9_-]+$/.test(blogId) && logNo && /^[1-9]\d*$/.test(logNo)
      && (url.pathname === '/PostView.naver' || url.pathname === `/${blogId}` || url.pathname === `/${blogId}/`)) {
      return `https://blog.naver.com/${blogId}/${logNo}`;
    }
    return null;
  } catch { return null; }
}
