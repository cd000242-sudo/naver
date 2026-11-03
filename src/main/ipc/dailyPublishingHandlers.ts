import type { DailyPublishingApi } from '../ldb-daily-publishing.js';

/** The app UI and extension share one durable scheduler; no renderer can supply executable commands. */
export function createDailyPublishingIpc(deps: {
  trusted(event: unknown): boolean;
  ensure(): Promise<DailyPublishingApi | undefined>;
}) {
  return async (event: unknown, method: unknown, path: unknown, body?: unknown) => {
    if (!deps.trusted(event)) return { status: 403, body: { ok: false, error: '앱의 운영 화면에서 실행해 주세요.' } };
    if (!(method === 'GET' && path === '/v1/automations/status')
      && !(method === 'POST' && ['/v1/automations/plan', '/v1/automations/stop'].includes(String(path)))) {
      return { status: 400, body: { ok: false, error: '지원하지 않는 운영 요청입니다.' } };
    }
    try {
      if (JSON.stringify(body ?? null).length > 65536 || (method === 'GET' && body !== undefined)) throw Error();
    } catch { return { status: 400, body: { ok: false, error: '운영 설정 형식이나 크기를 확인해 주세요.' } }; }
    try {
      const api = await deps.ensure();
      if (!api) throw Error();
      return await api.request(String(method), String(path), body);
    } catch { return { status: 503, body: { ok: false, error: '앱 실행 상태와 로그인을 확인한 뒤 다시 불러와 주세요.' } }; }
  };
}
