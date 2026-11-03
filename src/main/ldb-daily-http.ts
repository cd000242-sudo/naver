import type http from 'node:http';
import type { DailyPublishingApi } from './ldb-daily-publishing.js';

/** Called only after the original bridge's Origin and bearer checks have succeeded. */
export function handleDailyPublishingHttp(req: http.IncomingMessage, res: http.ServerResponse,
  pathname: string, api: DailyPublishingApi | undefined,
  respond: (status: number, body: unknown) => void): void {
  if (!api) { respond(404, { ok: false, error: '매일 자동 발행을 지원하는 앱으로 업데이트해 주세요.' }); return; }
  const dispatch = (body?: unknown) => void api.request(req.method || '', pathname, body)
    .then(result => { if (!res.writableEnded) respond(result.status, result.body); })
    .catch(() => { if (!res.writableEnded) respond(503, { ok: false, error: '자동 발행 상태를 읽지 못했습니다. 앱을 확인한 뒤 다시 불러와 주세요.' }); });
  if (req.method === 'GET') { dispatch(); return; }
  if (req.method !== 'POST') { respond(404, { ok: false, error: '지원하지 않는 요청입니다.' }); return; }
  let size = 0; const chunks: Buffer[] = [];
  req.setTimeout(10_000, () => { if (!res.writableEnded) respond(408, { ok: false, error: '설정 요청이 지연됐습니다. 상태를 다시 불러와 주세요.' }); req.destroy(); });
  req.on('data', (chunk: Buffer) => {
    size += chunk.length;
    if (size > 64 * 1024) { if (!res.writableEnded) respond(413, { ok: false, error: '설정이 너무 큽니다. 주제와 시간대를 줄여 주세요.' }); req.destroy(); return; }
    chunks.push(chunk);
  });
  req.on('error', () => {});
  req.on('end', () => {
    if (res.writableEnded) return;
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { respond(400, { ok: false, error: '설정 형식을 읽지 못했습니다. 최신 상태에서 다시 저장해 주세요.' }); return; }
    dispatch(body);
  });
}
