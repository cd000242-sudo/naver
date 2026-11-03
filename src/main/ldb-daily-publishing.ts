import type { DailyPublishingScheduler } from '../scheduler/dailyPublishing.js';
import { nextDailyRunAt, nextDailyScheduledFor, validateDailyPlans } from '../scheduler/dailyPublishingModel.js';
import type { DailyPublishingPlan } from '../scheduler/dailyPublishingTypes.js';
import { DAILY_LEWORD_TOPICS } from '../scheduler/dailyLewordTopics.js';

export interface DailyPublishingAvailability { ready: boolean; paid: boolean; label: string }
export interface DailyPublishingApi {
  request(method: string, path: string, body?: unknown): Promise<{ status: number; body: Record<string, any> }>;
}
interface Dependencies {
  scheduler: DailyPublishingScheduler;
  availability: () => Promise<DailyPublishingAvailability>;
  validatePlan: (plan: DailyPublishingPlan) => Promise<void>;
  onPlanChanged?: (accountId: string) => void;
  now?: () => Date;
  nativeReservationReady?: () => boolean;
}
const writers = ['gemini', 'openai', 'claude', 'perplexity', 'agent-codex', 'agent-claude', 'agent-gemini'];
export const DAILY_WRITERS = writers;
export const DAILY_IMAGE_PROVIDERS = ['imagefx', 'genspark', 'flow', 'dropshot', 'openai-image', 'nano-banana-2', 'nano-banana-pro', 'gemini', 'imagen', 'pexels', 'unsplash'];
/**
 * What the setup screen offers: free engines first, then the paid engines the generator actually routes.
 * Older ids stay valid so saved plans still load, but are not offered — ImageFX was closed by Google
 * (2026-10-29: its page redirects to Flow, its auth endpoint returns 410; it now runs as Flow), and
 * gemini/imagen/pexels/unsplash have no route in generateImages, so they could only fail.
 */
const DAILY_IMAGE_CHOICES = [
  { id: 'flow', label: 'Flow (구글 무료 · 추천)' },
  { id: 'genspark', label: '젠스파크 (구독 무료 할당량)' },
  { id: 'dropshot', label: '리더스 나노바나나 무제한 (구독자 0원)' },
  { id: 'nano-banana-2', label: '나노바나나2 (API 키 · 유료)' },
  { id: 'openai-image', label: 'OpenAI 이미지 (API 키 · 유료)' },
];
export const DAILY_IMAGE_MODES = Object.freeze([
  { id: 'ai-first', label: 'AI 이미지 먼저 → 빈 칸은 실제 사진 수집' },
  { id: 'collect-first', label: '실제 사진 수집 먼저 → 모자라면 AI 이미지' },
  { id: 'ai-generated', label: 'AI 이미지만' },
  { id: 'official-capture', label: '공식 자료 자동 캡처' },
]);
export const DAILY_CAPTURE_CATEGORIES = Object.freeze([
  { id: 'issue', label: '이슈' }, { id: 'sports', label: '스포츠' }, { id: 'auto', label: '자동차' },
]);
function input(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('DAILY_PLAN_INVALID');
  const item = value as Record<string, unknown>;
  if (Object.keys(item).some(k => !keys.includes(k)) || !Number.isSafeInteger(item.revision) || Number(item.revision) < 0) throw Error('DAILY_PLAN_INVALID');
  return item;
}
/** Separate recurring publishing consent from the existing draft-only handoff. */
export function createDailyPublishingApi(deps: Dependencies): DailyPublishingApi {
  const status = async () => {
    const state = deps.scheduler.getState();
    const now = deps.now?.() || new Date();
    return { ok: true, ...state, runs: state.runs.slice(-200), plans: state.plans.map(plan => ({ ...plan, nextAt: nextDailyRunAt(plan, now, state.runs),
      ...(plan.mode === 'schedule' ? { nextScheduledFor: nextDailyScheduledFor(plan, now, state.runs) } : {}) })),
      availability: await deps.availability(), generators: [{ id: 'app-settings', label: '앱에서 선택한 작성 엔진' }, ...writers.map(id => ({ id, label: id }))],
      imageProviders: DAILY_IMAGE_CHOICES.map(choice => ({ ...choice })),
      imageModes: DAILY_IMAGE_MODES.map(mode => ({ ...mode })),
      captureCategories: DAILY_CAPTURE_CATEGORIES.map(category => ({ ...category })),
      lewordTopics: [...DAILY_LEWORD_TOPICS],
      imageCapabilities: { officialCaptureReady: false, officialCaptureReason: '공식 자료 캡처는 글별 출처·장면·사용 권한 검토가 필요하여 무인 반복 시작을 지원하지 않습니다.' },
      scheduling: { mode: 'schedule', leadMinutes: 60, timeMeaning: 'publication', nativeReservationReady: deps.nativeReservationReady?.() === true },
      runtime: { timezone: 'Asia/Seoul', label: '예약발행 시각은 공개 예정 시각이며 1시간 전에 준비합니다. 기존 임시저장·즉시 발행 계획은 작업 시작 시각을 유지합니다.' } };
  };
  return { async request(method, path, payload) {
    try {
      await deps.scheduler.initialize();
      if (method === 'GET' && path === '/v1/automations/status') return { status: 200, body: await status() };
      if (method !== 'POST' || !['/v1/automations/plan', '/v1/automations/stop'].includes(path)) return { status: 404, body: { ok: false, error: '지원하지 않는 매일 발행 요청입니다.' } };
      if (path.endsWith('/stop')) {
        const value = input(payload, ['revision', 'accountId']);
        if (typeof value.accountId !== 'string' || !/^[\w-]{1,120}$/.test(value.accountId)) throw Error('DAILY_PLAN_INVALID');
        await deps.scheduler.stop(value.accountId, Number(value.revision));
        deps.onPlanChanged?.(value.accountId);
        return { status: 200, body: await status() };
      }
      const value = input(payload, ['revision', 'plan']);
      const state = deps.scheduler.getState();
      const raw = value.plan as Record<string, unknown> | undefined;
      const previous = state.plans.find(saved => saved.accountId === raw?.accountId);
      if (previous?.mode === 'schedule' && raw?.mode === undefined) throw Error('DAILY_SCHEDULE_MODE_REQUIRED');
      if (raw?.mode === 'schedule' && raw.leadMinutes !== 60) throw Error('DAILY_SCHEDULE_LEAD_REQUIRED');
      const [plan] = validateDailyPlans([value.plan]);
      const existing = state.plans.find(saved => saved.accountId === plan.accountId);
      if (existing?.imageMode === 'official-capture' && (value.plan as Record<string, unknown>).imageMode === undefined) {
        throw Error('DAILY_IMAGE_MODE_REQUIRED');
      }
      if (plan.imageSource && !DAILY_IMAGE_PROVIDERS.includes(plan.imageSource)) throw Error('DAILY_PLAN_INVALID');
      if (plan.generator !== 'app-settings' && !writers.includes(plan.generator)) throw Error('DAILY_PLAN_INVALID');
      const available = await deps.availability();
      if (plan.enabled && !available.paid) return { status: 403, body: { ok: false, code: 'ANNUAL_PLAN_REQUIRED', error: '매일 자동 발행은 유효한 1년 이상 이용권이 필요합니다. 앱의 이용권을 다시 확인해 주세요.' } };
      if (!available.ready) return { status: 503, body: { ok: false, error: '자동화앱 로그인과 화면 준비를 완료한 뒤 다시 저장해 주세요.' } };
      if (plan.enabled && plan.mode === 'schedule' && deps.nativeReservationReady?.() !== true) throw Error('DAILY_NATIVE_RESERVATION_ADAPTER_REQUIRED');
      await deps.validatePlan(plan);
      await deps.scheduler.replacePlans([...state.plans.filter(p => p.accountId !== plan.accountId), plan], Number(value.revision));
      deps.onPlanChanged?.(plan.accountId);
      return { status: 200, body: await status() };
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      const settings: Record<string, string> = {
        DAILY_WRITER_REQUIRED: '앱에서 글 작성 엔진을 먼저 선택해 주세요.',
        DAILY_SOURCE_REQUIRED: '검색할 주제·키워드 또는 소재 URL을 입력해 주세요.',
        DAILY_IMAGE_PROVIDER_REQUIRED: '사용할 이미지 엔진을 먼저 선택해 주세요.',
        DAILY_IMAGE_ENGINE_LOGIN_REQUIRED: '선택한 이미지 엔진에 로그인되어 있지 않습니다. 앱 이미지 설정에서 그 엔진의 로그인 버튼을 눌러 로그인한 뒤 다시 저장해 주세요.',
        DAILY_COLLECT_CONSENT_REQUIRED: '실제 사진 수집을 쓰려면 저작권 안내를 읽고 "수집 이미지 사용 책임은 본인에게 있음"에 동의해 주세요.',
        DAILY_CAPTURE_CATEGORY_REQUIRED: '공식 자료를 캡처할 이슈·스포츠·자동차 분야를 선택해 주세요.',
        DAILY_IMAGE_MODE_REQUIRED: '이미지 방식을 선택한 뒤 저장해 주세요. 이전 화면에서는 캡처 설정을 바꿀 수 없으며 중지 버튼은 사용할 수 있습니다.',
        DAILY_SCHEDULE_MODE_REQUIRED: '예약발행 방식을 명시한 화면에서 저장해 주세요. 기존 계획의 중지는 가능합니다.',
        DAILY_SCHEDULE_LEAD_REQUIRED: '예약발행은 공개 예정 시각 1시간 전 준비 설정이 필요합니다.',
        DAILY_NATIVE_RESERVATION_ADAPTER_REQUIRED: '현재 앱은 실제 네이버 예약 목록 확인 연결이 준비되지 않았습니다. 중지 상태 저장과 기존 계획 중지는 가능합니다.',
        DAILY_ACCOUNT_NOT_FOUND: '앱에 등록된 계정을 다시 불러와 주세요.',
        DAILY_ACCOUNT_PAUSED: '앱 계정 관리에서 중단·진행 상태를 확인해 주세요.',
        DAILY_CATEGORY_INVALID: '현재 계정의 실제 카테고리를 다시 선택해 주세요.',
      };
      if (Object.prototype.hasOwnProperty.call(settings, code)) return { status: 422, body: { ok: false, code, error: settings[code] } };
      const invalid = code === 'DAILY_PLAN_INVALID';
      return { status: invalid ? 400 : 409, body: { ok: false, code: invalid ? 'INVALID_PLAN' : 'STATE_CONFLICT', error: invalid
        ? '계정·시간·편수를 확인해 주세요. 계정별 하루 최대 20편까지 설정할 수 있습니다.'
        : code === 'DAILY_REVISION_CONFLICT' ? '실행 상태가 바뀌었습니다. 최신 상태를 불러온 뒤 다시 저장해 주세요.'
        : '설정을 적용하지 못했습니다. 앱의 계정·카테고리·저장 공간을 확인한 뒤 다시 불러와 주세요.' } };
    }
  } };
}
