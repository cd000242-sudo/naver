import type { DailyPublishingApi } from '../ldb-daily-publishing.js';
import { dailyId, dailyObject, resolveDailyKeywordSource } from '../../scheduler/dailyPublishingModel.js';

const PREVIEW_PATH = '/v1/automations/leword-preview';
const PREVIEW_LIMIT = 5;

/** Strict shape of a preview request; anything else is a 400 and never reaches the supplier. */
function previewRequest(body: unknown): { accountId: string; topics: string[]; limit: number } | null {
  try {
    const value = dailyObject(body, ['accountId', 'topics']);
    const source = resolveDailyKeywordSource({ type: 'leword-today-picks', topics: value.topics });
    return { accountId: dailyId(value.accountId), topics: source!.topics, limit: PREVIEW_LIMIT };
  } catch { return null; }
}

/** The app UI and extension share one durable scheduler; no renderer can supply executable commands. */
export function createDailyPublishingIpc(deps: {
  trusted(event: unknown): boolean;
  ensure(): Promise<DailyPublishingApi | undefined>;
  /** Next LEWORD candidates for a plan's topics. Read-only: it must not reserve or write anything. */
  previewLeword?(request: { accountId: string; topics: string[]; limit: number }): Promise<Record<string, unknown>>;
}) {
  return async (event: unknown, method: unknown, path: unknown, body?: unknown) => {
    if (!deps.trusted(event)) return { status: 403, body: { ok: false, error: '앱의 운영 화면에서 실행해 주세요.' } };
    if (!(method === 'GET' && path === '/v1/automations/status')
      && !(method === 'POST' && ['/v1/automations/plan', '/v1/automations/stop', PREVIEW_PATH].includes(String(path)))) {
      return { status: 400, body: { ok: false, error: '지원하지 않는 운영 요청입니다.' } };
    }
    try {
      if (JSON.stringify(body ?? null).length > 65536 || (method === 'GET' && body !== undefined)) throw Error();
    } catch { return { status: 400, body: { ok: false, error: '운영 설정 형식이나 크기를 확인해 주세요.' } }; }
    if (path === PREVIEW_PATH) {
      const request = previewRequest(body);
      if (!request) return { status: 400, body: { ok: false, error: '미리 볼 주제를 1~3개 선택해 주세요.' } };
      try {
        if (!deps.previewLeword) throw Error();
        return { status: 200, body: { ok: true, ...await deps.previewLeword(request) } };
      } catch (error) {
        if (error instanceof Error && error.message === 'ANNUAL_PLAN_REQUIRED') {
          return { status: 403, body: { ok: false, error: '매일 자동 발행은 유효한 1년 이상 이용권이 필요합니다. 앱의 이용권을 다시 확인해 주세요.' } };
        }
        return { status: 503, body: { ok: false, error: 'LEWORD 추천을 가져오지 못했습니다. 잠시 뒤 다시 눌러 주세요.' } };
      }
    }
    try {
      const api = await deps.ensure();
      if (!api) throw Error();
      return await api.request(String(method), String(path), body);
    } catch { return { status: 503, body: { ok: false, error: '앱 실행 상태와 로그인을 확인한 뒤 다시 불러와 주세요.' } }; }
  };
}
