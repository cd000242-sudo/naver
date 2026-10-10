// src/image/genspark/gensparkCollect.ts
// [2026-10-10] 젠스파크 작업 화면 확인(checkGensparkJob)과 이미지 내려받기(downloadGensparkImage).
//   서버는 화면을 떠나도 계속 생성하므로, 작업 주소로 돌아가 결과 이미지(/api/files/s/<id>)를 수거한다.
import { writeImageFile } from '../imageUtils.js';
import { GENSPARK_ORIGIN, readGensparkJobImages, readGensparkPageSignals } from './gensparkSelectors';
import {
  GENSPARK_CHALLENGE,
  GENSPARK_DOWNLOAD_FAILED,
  GENSPARK_DUPLICATE_IMAGE,
  GENSPARK_LOGIN_REQUIRED,
  GENSPARK_RATE_LIMITED,
  GENSPARK_JOB_FAILED,
  GensparkError,
} from './gensparkErrors';
import type { GensparkCollectResult, GensparkGeneratedImage, GensparkJob, GensparkPageLike } from './gensparkTypes';

const MIN_IMAGE_BYTES = 1024;

export interface GensparkCollectDeps {
  sleep(ms: number): Promise<void>;
  /** 작업 화면이 그려지길 기다리는 최대 시간(기본 8초, 0.5초 간격으로 다시 읽음) */
  settleMs?: number;
}

/** 페이지 안에서 이미지를 받아 base64 로 돌려준다(page.evaluate 직렬화 — 자기완결). */
export async function fetchGensparkImageBytes(url: string): Promise<{
  ok: boolean;
  status: number;
  type: string;
  size: number;
  b64: string;
}> {
  const res = await fetch(url, { credentials: 'include' });
  const type = res.headers.get('content-type') || '';
  if (!res.ok) return { ok: false, status: res.status, type, size: 0, b64: '' };
  const bytes = new Uint8Array(await res.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
  }
  return { ok: true, status: res.status, type, size: bytes.length, b64: btoa(bin) };
}

/**
 * [2026-10-10 실측] 작업 화면 하나는 데이터 요청 30여 개(3.2MB)라 바쁜 PC 에선 열기만 30초+였다. 결과는 /api/project?id= 하나에
 *   있다(0.5초): 갤러리 assets_gallery[].generated_asset_uri, 그림 작업 media_task_results[].status/url. data.status 는 대화 단계라
 *   시작하자마자 FINISHED 이므로 보지 않는다. 화면에 보이는 그림 주소만 쓴다(url_nowatermark 는 쓰지 않음).
 *   page.evaluate 로 직렬화되므로 자기완결. 같은 출처(쿠키) 화면에서만 부른다.
 */
export async function fetchGensparkProjectResult(jobId: string): Promise<{ ok: boolean; images: string[]; failed: boolean }> {
  try {
    const res = await fetch('/api/project?id=' + encodeURIComponent(jobId), { credentials: 'include' });
    if (!res.ok) return { ok: false, images: [], failed: false };
    const body = await res.json();
    const state = body && body.data && body.data.session_state;
    if (!state || typeof state !== 'object') return { ok: false, images: [], failed: false };
    const images: string[] = [];
    const add = (value: unknown): void => {
      const url = String(value || '');
      if (url.indexOf('/api/files/s/') >= 0 && images.indexOf(url) < 0) images.push(url);
    };
    for (const asset of Array.isArray(state.assets_gallery) ? state.assets_gallery : []) add(asset && asset.generated_asset_uri);
    let failed = false;
    for (const message of Array.isArray(state.messages) ? state.messages : []) {
      const results = message && message.session_state && message.session_state.media_task_results;
      if (!results || typeof results !== 'object') continue;
      for (const result of Object.values(results) as Array<{ status?: unknown; url?: unknown }>) {
        const status = String((result && result.status) || '');
        if (/fail|error/i.test(status)) failed = true;
        if (/success/i.test(status)) add(result.url);
      }
    }
    return { ok: true, images, failed };
  } catch {
    return { ok: false, images: [], failed: false };
  }
}

/**
 * 작업 화면을 열어 결과를 확인한다. seenUrls = 이번 실행에서 이미 받은 이미지 주소(호출자가 받은 뒤 추가한다).
 * 새 주소가 있으면 done(화면 순서 첫 번째), 전부 이미 받은 주소면 failed(중복), 없으면 pending, 실패 문구면 failed.
 * 로그인 풀림·보안 확인은 배치 전체를 멈추는 오류로 던진다.
 */
export async function checkGensparkJob(
  page: GensparkPageLike,
  job: GensparkJob,
  seenUrls: ReadonlySet<string>,
  deps?: GensparkCollectDeps,
): Promise<GensparkCollectResult> {
  const sleep = deps?.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  // 1) 가벼운 확인 — 작업 화면을 열지 않고 결과 데이터만 묻는다. 못 하면(형식 변경·로그인 풀림) 아래 화면 확인으로.
  if (String(page.url() || '').startsWith(GENSPARK_ORIGIN)) {
    const light = await page.evaluate(fetchGensparkProjectResult, job.jobId).catch(() => null);
    if (light && light.ok) {
      const fresh = light.images.filter((u) => !seenUrls.has(u));
      if (fresh.length > 0) return { status: 'done', imageUrl: fresh[0] };
      if (light.images.length > 0) return { status: 'failed', reason: `${GENSPARK_DUPLICATE_IMAGE}: 이미 받은 이미지 주소만 보임` };
      if (light.failed) return { status: 'failed', reason: `${GENSPARK_JOB_FAILED}: 그림 작업 실패 표시` };
      return { status: 'pending' };
    }
  }
  // 2) 화면 확인
  try {
    await page.goto(job.jobUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  } catch (error) {
    // [2026-10-10 실측] CPU 가 바쁜 PC 에서 작업 화면 열기가 30초를 넘겼다. 전송은 이미 됐으니 "전송 실패"로 같은 그림을 새로
    //   요청하지 않고 진행 중으로 두어 다음 확인 때 다시 연다. 계속 안 열리면 작업별 한도(jobDeadlineMs)에서 시간 초과로 끝난다.
    console.warn(`[젠스파크] 작업 화면 열기 지연 — 다음 확인 때 다시 엽니다: ${String((error as Error)?.message || error).slice(0, 80)}`);
    return { status: 'pending' };
  }

  // [2026-10-10 실측] 작업 화면은 열고 1~4초 뒤에야 결과가 그려진다 — 1초 한 번만 보면 늘 '진행 중'으로 오판했다.
  const settleMs = deps?.settleMs ?? 8_000;
  let images = await page.evaluate(readGensparkJobImages);
  for (let waited = 0; images.length === 0 && waited + 500 <= settleMs; waited += 500) {
    await sleep(500);
    images = await page.evaluate(readGensparkJobImages);
  }
  if (images.length > 0) {
    const fresh = images.filter((u) => !seenUrls.has(u));
    if (fresh.length > 0) return { status: 'done', imageUrl: fresh[0] };
    return { status: 'failed', reason: `${GENSPARK_DUPLICATE_IMAGE}: 이미 받은 이미지 주소만 보임` };
  }

  const signals = await page.evaluate(readGensparkPageSignals);
  if (signals.challenge) throw new GensparkError(GENSPARK_CHALLENGE);
  if (signals.loginRequired) throw new GensparkError(GENSPARK_LOGIN_REQUIRED);
  if (signals.rateLimited) return { status: 'failed', reason: `${GENSPARK_RATE_LIMITED}: 요청 제한 문구` };
  if (signals.failed) return { status: 'failed', reason: `${GENSPARK_JOB_FAILED}: 실패 문구가 보임` };
  return { status: 'pending' };
}

export interface GensparkDownloadMeta {
  heading: string;
  /** 출처 표시에 쓰는 모델 라벨(예: 'GPT Image 2.5') */
  modelLabel: string;
  postTitle?: string;
  postId?: string;
  originalIndex?: number;
  isThumbnail?: boolean;
}

function extensionOf(mime: string): string {
  const sub = (mime.split('/')[1] || 'jpeg').split(';')[0].trim().toLowerCase();
  return sub === 'jpeg' ? 'jpg' : sub || 'jpg';
}

/** 페이지 안 fetch 로 받아 형식(image/*)과 크기(1KB 초과)를 검사하고 앱 저장 함수로 저장한다. */
export async function downloadGensparkImage(
  page: GensparkPageLike,
  url: string,
  meta: GensparkDownloadMeta,
): Promise<GensparkGeneratedImage> {
  let fetched: Awaited<ReturnType<typeof fetchGensparkImageBytes>>;
  try {
    fetched = await page.evaluate(fetchGensparkImageBytes, url);
  } catch (error) {
    throw new GensparkError(GENSPARK_DOWNLOAD_FAILED, (error as Error)?.message || String(error));
  }
  if (!fetched || !fetched.ok) {
    throw new GensparkError(GENSPARK_DOWNLOAD_FAILED, `HTTP ${fetched?.status ?? '?'}`);
  }
  if (!fetched.type.toLowerCase().startsWith('image/')) {
    throw new GensparkError(GENSPARK_DOWNLOAD_FAILED, `이미지가 아닌 응답(${fetched.type || '형식 없음'})`);
  }
  const buffer = Buffer.from(fetched.b64, 'base64');
  if (buffer.length <= MIN_IMAGE_BYTES) {
    throw new GensparkError(GENSPARK_DOWNLOAD_FAILED, `이미지가 너무 작음(${buffer.length}바이트)`);
  }

  let saved: Awaited<ReturnType<typeof writeImageFile>>;
  try {
    saved = await writeImageFile(buffer, extensionOf(fetched.type), meta.heading, meta.postTitle, meta.postId);
  } catch (error) {
    throw new GensparkError(GENSPARK_DOWNLOAD_FAILED, `저장 실패: ${(error as Error)?.message || error}`);
  }

  return {
    heading: meta.heading,
    filePath: saved.savedToLocal || saved.filePath,
    previewDataUrl: saved.previewDataUrl,
    provider: 'genspark',
    requestedProvider: 'genspark',
    actualProvider: 'genspark',
    fallbackUsed: false,
    savedToLocal: saved.savedToLocal,
    originalIndex: meta.originalIndex,
    isThumbnail: meta.isThumbnail,
    sourceUrl: `젠스파크 · ${meta.modelLabel}`,
    blobId: saved.blobId,
    mimeType: saved.mimeType,
    width: saved.width,
    height: saved.height,
    byteSize: saved.byteSize,
    sha256: saved.sha256,
    createdAt: saved.createdAt,
  };
}
