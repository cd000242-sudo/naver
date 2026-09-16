/**
 * LDB IMAGE ULTRA 수신 브리지 — 확장프로그램이 완성한 원고를 이 앱의 글 목록으로 바로 넣는다.
 *
 *   확장 사이드패널 → http://127.0.0.1:47630/v1/posts → 이 브리지 → 렌더러 importSelectedPosts()
 *
 * 설계 원칙 (web-bridge.ts 와 같은 기준):
 *   - 127.0.0.1 에만 바인드 — 밖에서 못 들어온다.
 *   - 토큰 필수. 실행할 때마다 파일에서 읽고, 없으면 만들어 저장한다.
 *   - Origin 허용목록 — 확장(chrome-extension://) 만. 일반 웹사이트는 403.
 *   - **발행하지 않는다** — 받은 글을 목록에 넣기만 한다. 임시저장/예약/발행은 사용자가 직접 누른다.
 *   - 자격증명을 받지도 저장하지도 않는다.
 *
 * 순수 Node http. Electron 의존은 주입으로 받아 테스트에서 분리한다.
 */

import http from 'http';
import { randomBytes } from 'crypto';
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';

export const LDB_BRIDGE_PORT = 47630;
const MAX_BODY_BYTES = 4 * 1024 * 1024;
const MAX_POSTS = 30;

export interface LdbBridgeDeps {
  /** 렌더러로 글을 보낸다. 실제로는 mainWindow.webContents.send(...) */
  deliver: (posts: unknown[]) => void;
  token: string;
}

/** 확장만 허용한다. 일반 웹페이지는 이 브리지를 부를 수 없다. */
export function originAllowed(origin?: string | null): boolean {
  if (!origin) return true; // 브라우저가 아닌 호출(진단·테스트)
  return /^chrome-extension:\/\/[a-p]{32}$/.test(origin);
}

/** 토큰을 파일에 보관해 앱을 껐다 켜도 같은 값을 쓴다. 매번 바뀌면 붙여넣기가 불가능하다. */
export function loadBridgeToken(file: string): string {
  try {
    const saved = String(readFileSync(file, 'utf8')).trim();
    if (/^[A-Za-z0-9_-]{16,}$/.test(saved)) return saved;
  } catch { /* 없으면 새로 만든다 */ }
  const token = randomBytes(24).toString('base64url');
  try { writeFileSync(file, token, { encoding: 'utf8', mode: 0o600 }); } catch { /* 저장 못 해도 이번 실행에는 쓴다 */ }
  return token;
}

/** 받은 글이 이 앱이 아는 모양인지 확인한다. 발행 상태로 온 글은 거절한다. */
export function validatePosts(payload: unknown): { posts: unknown[] } | { error: string } {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { error: 'JSON 객체가 필요합니다.' };
  const posts = (payload as { posts?: unknown }).posts;
  if (!Array.isArray(posts) || !posts.length) return { error: '보낼 글이 없습니다.' };
  if (posts.length > MAX_POSTS) return { error: `한 번에 ${MAX_POSTS}개까지 보낼 수 있습니다.` };
  for (const post of posts) {
    if (!post || typeof post !== 'object' || Array.isArray(post)) return { error: '글 형식이 올바르지 않습니다.' };
    const value = post as Record<string, unknown>;
    if (typeof value.title !== 'string' || !value.title.trim()) return { error: '제목이 없는 글이 있습니다.' };
    if (typeof value.content !== 'string' || !value.content.trim()) return { error: '본문이 없는 글이 있습니다.' };
    if (value.isPublished === true || value.publishMode === 'publish') {
      return { error: '발행 상태로 표시된 글은 받지 않습니다. 임시저장으로만 받습니다.' };
    }
  }
  return { posts };
}

function send(res: http.ServerResponse, status: number, body: unknown, origin?: string | null): void {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Headers': 'content-type, authorization',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    // 이게 없으면 크롬의 사설망 접근(PNA) 프리플라이트에서 막힌다.
    'Access-Control-Allow-Private-Network': 'true',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

export function createLdbBridge(deps: LdbBridgeDeps): http.Server {
  return http.createServer((req, res) => {
    const origin = (req.headers.origin as string | undefined) ?? null;
    if (!originAllowed(origin)) { send(res, 403, { ok: false, error: '허용되지 않은 출처입니다.' }); return; }
    if (req.method === 'OPTIONS') { send(res, 204, {}, origin); return; }

    const url = new URL(req.url || '/', `http://127.0.0.1:${LDB_BRIDGE_PORT}`);
    if (req.method === 'GET' && url.pathname === '/v1/status') {
      send(res, 200, { ok: true, app: 'naver-automation', accepts: 'draft-only' }, origin);
      return;
    }
    if (req.method !== 'POST' || url.pathname !== '/v1/posts') {
      send(res, 404, { ok: false, error: '지원하지 않는 경로입니다.' }, origin);
      return;
    }
    if (req.headers.authorization !== `Bearer ${deps.token}`) {
      send(res, 401, { ok: false, error: '브리지 토큰이 맞지 않습니다.' }, origin);
      return;
    }

    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) { send(res, 413, { ok: false, error: '요청이 너무 큽니다.' }, origin); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (res.writableEnded) return;
      let payload: unknown;
      try { payload = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { send(res, 400, { ok: false, error: 'JSON 본문을 읽을 수 없습니다.' }, origin); return; }
      const checked = validatePosts(payload);
      if ('error' in checked) { send(res, 400, { ok: false, error: checked.error }, origin); return; }
      try {
        deps.deliver(checked.posts);
        send(res, 200, { ok: true, imported: checked.posts.length }, origin);
      } catch {
        send(res, 500, { ok: false, error: '글 목록에 넣지 못했습니다. 앱 화면이 열려 있는지 확인해 주세요.' }, origin);
      }
    });
  });
}

/** 앱 시작 때 한 번 호출한다. 실패해도 앱 기능에는 영향을 주지 않는다. */
export function startLdbBridge(userDataPath: string, deliver: (posts: unknown[]) => void): { token: string; server: http.Server } | null {
  try {
    const token = loadBridgeToken(path.join(userDataPath, 'ldb-bridge-token'));
    const server = createLdbBridge({ deliver, token });
    server.on('error', (error) => { console.error('[LDB 브리지] 시작 실패:', error); });
    server.listen(LDB_BRIDGE_PORT, '127.0.0.1', () => {
      console.log(`[LDB 브리지] http://127.0.0.1:${LDB_BRIDGE_PORT} · 토큰 ${token}`);
    });
    return { token, server };
  } catch (error) {
    console.error('[LDB 브리지] 준비 실패:', error);
    return null;
  }
}
