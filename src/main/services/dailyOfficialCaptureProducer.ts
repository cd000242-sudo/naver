import { createHash, randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { lstat, realpath, readFile, writeFile, mkdir, mkdtemp, link, unlink, rm } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { BrowserContext } from 'playwright';
import { guardDailyCapturePage, waitForCapture as wait } from './dailyOfficialCaptureNetwork.js';
import { launchAdaptedBrowser, type AdaptedBrowser } from '../../automation/browserAdapter.js';
import { getDailyOfficialCaptureBatchDirectory, loadDailyOfficialCaptureBatch, readDailyOfficialSources,
  type DailyOfficialCaptureInput, type DailyOfficialCapturedImage, type DailyOfficialSourceApproval } from './dailyOfficialCapture.js';

export interface DailyOfficialCaptureOptions { readonly signal?: AbortSignal }
export interface DailyOfficialCapturePlan {
  readonly schema: 1;
  readonly jobId: string; readonly accountId: string; readonly blogId: string; readonly categoryId: string;
  readonly captureCategory: string; readonly sourceUrl: string; readonly title: string; readonly headings: readonly string[];
  readonly review: { readonly decision: 'approved'; readonly reviewedBy: string; readonly reviewedAt: string };
  readonly captures: readonly ReviewedScene[];
}
interface ReviewedScene {
  readonly slotIndex: number; readonly heading: string; readonly pageUrl: string; readonly sourceApprovalId: string;
  readonly scene: string; readonly selector?: string; readonly clip?: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly rightsReview: { readonly decision: 'approved'; readonly basis: string; readonly reviewedBy: string;
    readonly reviewedAt: string; readonly note: string; readonly evidenceUrl: string };
}
type CapturedScene = ReviewedScene & { readonly filePath: string; readonly captureEvidence: string; readonly sha256: string;
  readonly capturedAt: string; readonly width: number; readonly height: number; readonly captureMethod: 'page-screenshot'; readonly originType: 'official-capture' };
const MAX_BYTES = 20_000_000;
const MAX_PIXELS = 32_000_000;
const activeJobs = new Set<string>();
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const review = (): never => { throw new Error('DAILY_CAPTURE_REVIEW_REQUIRED: 승인된 페이지·영역·권리·글 배치 계획을 확인해 주세요.'); };
const cancelled = (signal?: AbortSignal): void => { if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new Error('DAILY_CANCELLED'); };
function text(value: unknown, minimum = 1): string {
  if (typeof value !== 'string' || value.trim().length < minimum || value.length > 8000) return review();
  return value;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return review();
  return value as Record<string, unknown>;
}
function timestamp(value: unknown): void {
  const date = text(value);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u.test(date)
    || !Number.isFinite(Date.parse(date)) || Date.parse(date) > Date.now() + 300_000) review();
}
function normalized(value: unknown): string {
  const url = new URL(text(value));
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return review();
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$)/iu.test(key)) url.searchParams.delete(key);
  url.searchParams.sort(); return url.toString();
}
function publicUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !url.hostname.includes('.')
    || isIP(url.hostname.replace(/^\[|\]$/gu, '')) || /(?:^|\.)(?:localhost|local|test|invalid|internal|lan|example|onion)$/iu.test(url.hostname)) return review();
  return url;
}
function inside(root: string, file: string): boolean {
  const relative = path.relative(root, file);
  return Boolean(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}
async function checkedPath(root: string, file: string): Promise<void> {
  if (!path.isAbsolute(root) || !inside(root, file)) return review();
  const parts = path.relative(root, file).split(path.sep);
  for (const item of [root, ...parts.map((_, i) => path.join(root, ...parts.slice(0, i + 1)))]) {
    if ((await lstat(item)).isSymbolicLink()) return review();
  }
  if ((await realpath(file)).toLowerCase() !== path.resolve(file).toLowerCase()) review();
}
async function boundedFile(root: string, file: string, maximum: number): Promise<Buffer> {
  await checkedPath(root, file);
  const stat = await lstat(file);
  if (!stat.isFile() || stat.size < 1 || stat.size > maximum) return review();
  const bytes = await readFile(file);
  if (bytes.length !== stat.size) return review();
  return bytes;
}
function checkReview(value: unknown, rights = false): void {
  const item = object(value);
  if (item.decision !== 'approved') return review();
  text(item.reviewedBy); timestamp(item.reviewedAt);
  if (rights) {
    if (!['quotation', 'permission', 'licensed', 'owned'].includes(String(item.basis))) return review();
    text(item.note, 8); publicUrl(text(item.evidenceUrl));
  }
}
function dimensions(box: Record<string, unknown>): void {
  if (!['x', 'y', 'width', 'height'].every(key => typeof box[key] === 'number' && Number.isFinite(box[key]))
    || Number(box.x) < 0 || Number(box.y) < 0 || Number(box.x) > 100_000 || Number(box.y) > 100_000
    || Math.min(Number(box.width), Number(box.height)) < 300 || Math.max(Number(box.width), Number(box.height)) < 600
    || Number(box.width) * Number(box.height) > MAX_PIXELS) review();
}
async function readPlan(input: DailyOfficialCaptureInput, directory: string, sources: readonly DailyOfficialSourceApproval[]): Promise<DailyOfficialCapturePlan> {
  const raw = object(JSON.parse((await boundedFile(input.userDataDir, path.join(directory, 'capture-plan.json'), 1_000_000)).toString('utf8')));
  if (raw.schema !== 1 || !['issue', 'sports', 'auto'].includes(input.captureCategory) || !/^[1-9]\d{0,15}$/u.test(input.categoryId)
    || !Array.isArray(input.headings) || input.headings.length < 1 || input.headings.length > 30) return review();
  for (const key of ['jobId', 'accountId', 'blogId', 'categoryId', 'captureCategory', 'title'] as const) if (text(raw[key]) !== text(input[key])) return review();
  if (normalized(raw.sourceUrl) !== normalized(input.sourceUrl) || JSON.stringify(raw.headings) !== JSON.stringify(input.headings)) return review();
  input.headings.forEach(heading => text(heading)); checkReview(raw.review);
  if (!Array.isArray(raw.captures) || raw.captures.length < 5 || raw.captures.length > 31) return review();
  const slots = new Set<number>(); const scenes = new Set<string>();
  for (const value of raw.captures) {
    const scene = object(value); const slot = Number(scene.slotIndex);
    if (!Number.isInteger(scene.slotIndex) || slot < 0 || slot > input.headings.length || (slot === 0 && slots.has(0))
      || scene.heading !== (slot === 0 ? input.title : input.headings[slot - 1])) return review();
    checkReview(scene.rightsReview, true);
    const page = publicUrl(normalized(scene.pageUrl));
    const source = sources.find(source => source.id === scene.sourceApprovalId);
    if (!source || source.captureCategory !== input.captureCategory || source.host !== page.host || !source.approvedPageUrls.includes(page.toString())) return review();
    if (source.channelId || (scene.captureMethod !== undefined && scene.captureMethod !== 'page-screenshot'))
      throw new Error('DAILY_CAPTURE_VIDEO_UNSUPPORTED: 영상 프레임은 별도의 검토된 캡처 묶음이 필요합니다.');
    const sceneKey = `${source.id}:${text(scene.scene, 8).normalize('NFKC').replace(/\s+/gu, ' ').trim()}`;
    if (scenes.has(sceneKey) || (scene.selector === undefined) === (scene.clip === undefined)) return review();
    if (scene.selector !== undefined) { if (text(scene.selector).length > 500) return review(); }
    else dimensions(object(scene.clip));
    slots.add(slot); scenes.add(sceneKey);
  }
  for (let slot = 0; slot <= input.headings.length; slot++) if (!slots.has(slot)) return review();
  return raw as unknown as DailyOfficialCapturePlan;
}

async function captureOne(context: BrowserContext, input: DailyOfficialCaptureInput, scene: ReviewedScene, directory: string, index: number, signal: AbortSignal): Promise<CapturedScene> {
  const page = await wait(context.newPage(), signal);
  let disposeGuard = () => {};
  try {
    page.setDefaultTimeout(10_000);
    const pageUrl = normalized(scene.pageUrl);
    const guard = await guardDailyCapturePage(context, page, pageUrl, signal, publicUrl, normalized);
    disposeGuard = guard.dispose;
    let bytes: Buffer;
    if (scene.selector) {
      const target = page.locator(scene.selector);
      await wait(target.waitFor({ state: 'visible', timeout: 10_000 }), signal);
      const box = await wait(target.boundingBox(), signal); if (!box) return review(); dimensions(box);
      bytes = await wait(target.screenshot({ type: 'png', animations: 'disabled', timeout: 10_000 }), signal);
    } else bytes = await wait(page.screenshot({ type: 'png', clip: scene.clip, animations: 'disabled', timeout: 10_000 }), signal);
    guard.assertSafe(); if (bytes.length > MAX_BYTES) return review();
    const metadata = await sharp(bytes, { limitInputPixels: MAX_PIXELS }).metadata();
    if (!metadata.width || !metadata.height) return review();
    dimensions({ x: 0, y: 0, width: metadata.width, height: metadata.height });
    const captured: CapturedScene = { ...scene, pageUrl, filePath: path.join(directory, `${index}.png`),
      captureEvidence: path.join(directory, `${index}.evidence.json`), sha256: hash(bytes), capturedAt: new Date().toISOString(),
      width: metadata.width, height: metadata.height, captureMethod: 'page-screenshot', originType: 'official-capture' };
    const { userDataDir: _, ...binding } = input;
    await writeFile(captured.filePath, bytes, { flag: 'wx' });
    await writeFile(captured.captureEvidence, JSON.stringify({ schema: 1, ...binding, ...captured }), { flag: 'wx' });
    return captured;
  } finally { disposeGuard(); await page.close().catch(() => undefined); }
}
async function stageRegistry(input: DailyOfficialCaptureInput, root: string, sources: readonly DailyOfficialSourceApproval[]): Promise<void> {
  const copied = [];
  for (const source of sources) {
    const verificationEvidence = path.join(root, `${source.id}.source-evidence`);
    await writeFile(verificationEvidence, await boundedFile(input.userDataDir, source.verificationEvidence, 10_000_000), { flag: 'wx' });
    copied.push({ ...source, verificationEvidence });
  }
  await writeFile(path.join(root, 'daily-official-sources.json'), JSON.stringify({ schema: 1, sources: copied }), { flag: 'wx' });
}
async function publish(input: DailyOfficialCaptureInput, directory: string, captures: readonly CapturedScene[], signal: AbortSignal): Promise<readonly DailyOfficialCapturedImage[]> {
  cancelled(signal); await checkedPath(input.userDataDir, directory);
  const output = path.join(directory, `run-${randomUUID()}`); await mkdir(output); await checkedPath(input.userDataDir, output);
  const finalCaptures = [];
  for (const [index, capture] of captures.entries()) {
    cancelled(signal);
    const filePath = path.join(output, `${index}.png`); const captureEvidence = path.join(output, `${index}.evidence.json`);
    await writeFile(filePath, await readFile(capture.filePath), { flag: 'wx' });
    await writeFile(captureEvidence, await readFile(capture.captureEvidence), { flag: 'wx' });
    finalCaptures.push({ ...capture, filePath, captureEvidence });
  }
  const { userDataDir: _, ...binding } = input;
  const temporary = path.join(directory, `manifest-${randomUUID()}.tmp`);
  await writeFile(temporary, JSON.stringify({ schema: 1, ...binding, captures: finalCaptures }), { flag: 'wx' });
  try {
    cancelled(signal);
    // A hard link atomically exposes the complete bytes and cannot overwrite another process's batch.
    await link(temporary, path.join(directory, 'manifest.json'));
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
  finally { await unlink(temporary); }
  cancelled(signal); return loadDailyOfficialCaptureBatch(input);
}

async function produce(input: DailyOfficialCaptureInput, directory: string, plan: DailyOfficialCapturePlan, sources: readonly DailyOfficialSourceApproval[], signal: AbortSignal): Promise<readonly DailyOfficialCapturedImage[]> {
  const staging = await mkdtemp(path.join(input.userDataDir, '.daily-capture-stage-'));
  let browser: AdaptedBrowser | undefined;
  const close = () => { void browser?.close().catch(() => undefined); };
  signal.addEventListener('abort', close, { once: true });
  try {
    await checkedPath(input.userDataDir, staging);
    await stageRegistry(input, staging, sources);
    const stagedDirectory = getDailyOfficialCaptureBatchDirectory(staging, input.jobId); await mkdir(stagedDirectory, { recursive: true });
    const launching = launchAdaptedBrowser({ headless: true }).then(value => { browser = value; if (signal.aborted) close(); return value; });
    await wait(launching, signal);
    // Block service workers so no requests can bypass the DNS-pinned route handler.
    const context = await wait(browser!.raw.newContext({ serviceWorkers: 'block', acceptDownloads: false, viewport: { width: 1280, height: 1000 } }), signal);
    await context.routeWebSocket('**/*', socket => socket.close());
    const captures: CapturedScene[] = []; const hashes = new Set<string>();
    for (const [index, scene] of plan.captures.entries()) {
      cancelled(signal);
      const capture = await captureOne(context, input, scene, stagedDirectory, index, signal);
      if (hashes.has(capture.sha256)) return review(); hashes.add(capture.sha256); captures.push(capture);
    }
    const { userDataDir: _, ...binding } = input;
    await writeFile(path.join(stagedDirectory, 'manifest.json'), JSON.stringify({ schema: 1, ...binding, captures }), { flag: 'wx' });
    await wait(loadDailyOfficialCaptureBatch({ ...input, userDataDir: staging }), signal);
    return await publish(input, directory, captures, signal);
  } finally {
    signal.removeEventListener('abort', close);
    await browser?.close().catch(() => undefined);
    if (inside(input.userDataDir, staging) && path.basename(staging).startsWith('.daily-capture-stage-')) await rm(staging, { recursive: true, force: true });
  }
}

/** Reuse a verified batch, or capture only an explicit job-specific operator-reviewed plan. Never publishes a blog post. */
export async function ensureDailyOfficialCaptureBatch(input: DailyOfficialCaptureInput, options: DailyOfficialCaptureOptions = {}): Promise<readonly DailyOfficialCapturedImage[]> {
  if (options.signal?.aborted) throw new Error('DAILY_CANCELLED');
  const directory = getDailyOfficialCaptureBatchDirectory(input.userDataDir, input.jobId);
  try {
    await lstat(path.join(directory, 'manifest.json'));
    if (options.signal?.aborted) throw new Error('DAILY_CANCELLED');
    const result = await loadDailyOfficialCaptureBatch(input);
    if (options.signal?.aborted) throw new Error('DAILY_CANCELLED');
    return result;
  }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  if (activeJobs.has(directory)) throw new Error('DAILY_CAPTURE_IN_PROGRESS: 이 작업의 캡처가 이미 진행 중입니다.');
  activeJobs.add(directory);
  const controller = new AbortController();
  const abort = () => controller.abort(new Error('DAILY_CANCELLED'));
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) abort();
  const timer = setTimeout(() => controller.abort(new Error('DAILY_CAPTURE_TIMEOUT: 캡처 제한 시간을 초과했습니다.')), 180_000);
  try {
    try { await lstat(path.join(directory, 'capture-plan.json')); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error('DAILY_CAPTURE_PLAN_REQUIRED: 작업 폴더의 capture-plan.json에 승인된 원문 URL·캡처 영역·장면·권리 검토를 준비해 주세요.');
      throw error;
    }
    const sources = await wait(readDailyOfficialSources(input.userDataDir), controller.signal);
    const plan = await wait(readPlan(input, directory, sources), controller.signal);
    return await produce(input, directory, plan, sources, controller.signal);
  } finally { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); activeJobs.delete(directory); }
}
