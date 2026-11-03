import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { isIP } from 'node:net';
import sharp from 'sharp';
import type { DailyCaptureCategory } from '../../scheduler/dailyPublishingTypes.js';

export interface DailyOfficialCaptureBinding {
  readonly jobId: string; readonly accountId: string; readonly blogId: string; readonly categoryId: string;
  readonly captureCategory: DailyCaptureCategory; readonly sourceUrl: string;
  readonly title: string; readonly headings: readonly string[];
}
export interface DailyOfficialCaptureInput extends DailyOfficialCaptureBinding { readonly userDataDir: string }
/** Operator-reviewed configuration, stored separately from the agent-produced batch. */
export interface DailyOfficialSourceApproval {
  readonly verified: true;
  readonly id: string; readonly publisher: string; readonly captureCategory: DailyCaptureCategory;
  readonly host: string; readonly reviewedBy: string; readonly reviewedAt: string;
  readonly verificationUrl: string; readonly verificationEvidence: string; readonly approvedPageUrls: readonly string[];
  readonly channelId?: string; readonly channelUrl?: string;
}
/** Structural publish payload: collected is an existing real-photo provider, never an AI label. */
export interface DailyOfficialCapturedImage {
  readonly filePath: string; readonly heading: string; readonly isThumbnail: boolean;
  readonly provider: 'collected'; readonly isCollected: true; readonly disableTextOverlay: true;
  readonly sourceUrl: string; readonly caption: string; readonly width: number; readonly height: number;
  readonly sha256: string; readonly createdAt: number;
}
type RecordValue = Record<string, unknown>;
const categories = new Set(['issue', 'sports', 'auto']);
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const review = (): never => { throw new Error('DAILY_CAPTURE_REVIEW_REQUIRED: 공식 캡처 파일·출처·권리·글 배치 검수가 필요합니다.'); };
function object(value: unknown): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return review();
  return value as RecordValue;
}
function text(value: unknown, minimum = 1): string {
  if (typeof value !== 'string' || value.trim().length < minimum || value.length > 8_000) return review();
  return value;
}
function time(value: unknown): number {
  const stamp = text(value);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u.test(stamp)) return review();
  const result = Date.parse(stamp);
  if (!Number.isFinite(result) || result > Date.now() + 300_000) return review();
  return result;
}
function normalizedUrl(value: unknown): string {
  const url = new URL(text(value));
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return review();
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$)/iu.test(key)) url.searchParams.delete(key);
  url.searchParams.sort(); return url.toString();
}
function officialPage(value: unknown): URL {
  const url = new URL(normalizedUrl(value));
  if (url.protocol !== 'https:' || url.port || !url.hostname.includes('.') || isIP(url.hostname.replace(/^\[|\]$/gu, ''))
    || /(?:^|\.)(?:localhost|local|test|invalid|internal|lan|example|onion)$/iu.test(url.hostname)) return review();
  return url;
}
function inside(directory: string, file: string): boolean {
  const relative = path.relative(directory, file);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}
/** No batch, registry, image or evidence may resolve through a symlink/junction. */
async function checkedFile(root: string, file: unknown, maximum = 20_000_000): Promise<Buffer> {
  const target = text(file);
  if (!path.isAbsolute(target) || !inside(root, path.resolve(target))) return review();
  const relative = path.relative(root, target);
  for (const segmentPath of [root, ...relative.split(path.sep).map((_, index, segments) => path.join(root, ...segments.slice(0, index + 1)))]) {
    if ((await lstat(segmentPath)).isSymbolicLink()) return review();
  }
  const actual = await realpath(target);
  if (path.resolve(actual).toLowerCase() !== path.resolve(target).toLowerCase()) return review();
  const stat = await lstat(target);
  if (!stat.isFile() || stat.size < 1 || stat.size > maximum) return review();
  const bytes = await readFile(actual);
  if (bytes.length !== stat.size) return review();
  return bytes;
}
export function getDailyOfficialCaptureBatchDirectory(userDataDir: string, jobId: string): string {
  return path.join(userDataDir, 'daily-official-captures', hash(text(jobId)));
}
/** This registry is an explicit operator review, not an automatic ownership classifier. */
export async function readDailyOfficialSources(userDataDir: string): Promise<readonly DailyOfficialSourceApproval[]> {
  try {
    const config = object(JSON.parse((await checkedFile(userDataDir, path.join(userDataDir, 'daily-official-sources.json'), 1_000_000)).toString('utf8')));
    if (config.schema !== 1 || !Array.isArray(config.sources) || config.sources.length > 64) return review();
    const ids = new Set<string>();
    const sources: DailyOfficialSourceApproval[] = [];
    for (const value of config.sources) {
      const source = object(value); const id = text(source.id);
      if (source.verified !== true || !/^[A-Za-z0-9_-]{1,80}$/u.test(id) || ids.has(id) || !categories.has(String(source.captureCategory))) return review();
      ids.add(id); text(source.publisher); text(source.reviewedBy); time(source.reviewedAt);
      officialPage(source.verificationUrl); await checkedFile(userDataDir, source.verificationEvidence, 10_000_000);
      const host = text(source.host);
      if (officialPage(`https://${host}/`).host !== host) return review();
      if (!Array.isArray(source.approvedPageUrls) || !source.approvedPageUrls.length || source.approvedPageUrls.length > 100) return review();
      const pages = source.approvedPageUrls.map(value => {
        const page = officialPage(value); if (page.host !== host) return review(); return page.toString();
      });
      if (['youtube.com', 'www.youtube.com', 'youtu.be', 'm.youtube.com'].includes(host)) {
        const channelId = text(source.channelId); const channel = officialPage(source.channelUrl);
        if (!/^UC[A-Za-z0-9_-]{22}$/u.test(channelId) || !['youtube.com', 'www.youtube.com'].includes(channel.host)
          || channel.pathname !== `/channel/${channelId}`) return review();
      }
      sources.push(Object.freeze({ ...source, approvedPageUrls: Object.freeze(pages) }) as unknown as DailyOfficialSourceApproval);
    }
    return Object.freeze(sources);
  } catch { return review(); }
}
function checkBinding(manifest: RecordValue, input: DailyOfficialCaptureInput): void {
  if (manifest.schema !== 1 || !categories.has(input.captureCategory) || !Array.isArray(input.headings)
    || !input.headings.length || input.headings.length > 30 || !/^[1-9]\d{0,15}$/u.test(input.categoryId)) return review();
  for (const key of ['jobId', 'accountId', 'blogId', 'categoryId', 'captureCategory', 'title'] as const) {
    if (text(manifest[key]) !== text(input[key])) return review();
  }
  if (normalizedUrl(manifest.sourceUrl) !== normalizedUrl(input.sourceUrl)
    || JSON.stringify(manifest.headings) !== JSON.stringify(input.headings)) return review();
  input.headings.forEach(value => text(value));
}
function checkRights(value: unknown): void {
  const rights = object(value);
  if (rights.decision !== 'approved' || !['quotation', 'permission', 'licensed', 'owned'].includes(String(rights.basis))) return review();
  text(rights.reviewedBy); time(rights.reviewedAt); text(rights.note, 8); officialPage(rights.evidenceUrl);
}
async function verifiedCapture(
  value: unknown, input: DailyOfficialCaptureInput, directory: string, sources: readonly DailyOfficialSourceApproval[],
): Promise<{ image: DailyOfficialCapturedImage; slot: number; scene: string }> {
  const capture = object(value); const slot = capture.slotIndex;
  if (!Number.isInteger(slot) || Number(slot) < 0 || Number(slot) > input.headings.length) return review();
  const heading = Number(slot) === 0 ? input.title : input.headings[Number(slot) - 1];
  if (capture.heading !== heading || capture.originType !== 'official-capture'
    || !['page-screenshot', 'video-frame'].includes(String(capture.captureMethod)) || capture.aiEngine !== undefined
    || (capture.provider !== undefined && !['collected', 'official-capture'].includes(String(capture.provider)))) return review();
  checkRights(capture.rightsReview);
  const source = sources.find(source => source.id === capture.sourceApprovalId);
  const page = officialPage(capture.pageUrl);
  if (!source || source.captureCategory !== input.captureCategory || page.host !== source.host
    || !source.approvedPageUrls.includes(page.toString())) return review();
  if (source.channelId && (capture.channelId !== source.channelId || capture.captureMethod !== 'video-frame')) return review();
  const scene = text(capture.scene, 8).normalize('NFKC').replace(/\s+/gu, ' ').trim();
  const bytes = await checkedFile(directory, capture.filePath);
  const sha256 = hash(bytes);
  if (typeof capture.sha256 !== 'string' || sha256 !== capture.sha256.toLowerCase()) return review();
  const evidence = object(JSON.parse((await checkedFile(directory, capture.captureEvidence, 100_000)).toString('utf8')));
  if (evidence.schema !== 1) return review();
  for (const key of ['jobId', 'accountId', 'blogId', 'categoryId', 'captureCategory'] as const) if (evidence[key] !== input[key]) return review();
  for (const key of ['sha256', 'capturedAt', 'captureMethod', 'originType', 'scene'] as const) if (evidence[key] !== capture[key]) return review();
  if (normalizedUrl(evidence.pageUrl) !== page.toString()) return review();
  const metadata = await sharp(bytes, { limitInputPixels: 32_000_000 }).metadata();
  if (!['png', 'jpeg', 'webp'].includes(String(metadata.format)) || !metadata.width || !metadata.height
    || metadata.width !== capture.width || metadata.height !== capture.height
    || Math.min(metadata.width, metadata.height) < 300 || Math.max(metadata.width, metadata.height) < 600) return review();
  await sharp(bytes, { limitInputPixels: 32_000_000, failOn: 'warning' }).raw().toBuffer();
  const capturedAt = time(capture.capturedAt);
  const image: DailyOfficialCapturedImage = Object.freeze({ filePath: text(capture.filePath), heading, isThumbnail: slot === 0,
    provider: 'collected', isCollected: true, disableTextOverlay: true, sourceUrl: page.toString(),
    caption: `${scene}. ${source.publisher} 공식 자료 인용.`, width: metadata.width, height: metadata.height, sha256, createdAt: capturedAt });
  return { image, slot: Number(slot), scene: `${source.id}:${scene}` };
}
/** Consume prepared evidence only. This function never captures, searches, generates or publishes. */
export async function loadDailyOfficialCaptureBatch(input: DailyOfficialCaptureInput): Promise<readonly DailyOfficialCapturedImage[]> {
  const directory = getDailyOfficialCaptureBatchDirectory(input.userDataDir, input.jobId);
  const manifestFile = path.join(directory, 'manifest.json');
  try { await lstat(manifestFile); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error('DAILY_CAPTURE_PENDING: 실제 공식 자료 캡처 묶음을 먼저 준비해 주세요.');
    return review();
  }
  try {
    const manifest = object(JSON.parse((await checkedFile(input.userDataDir, manifestFile, 1_000_000)).toString('utf8')));
    checkBinding(manifest, input);
    if (!Array.isArray(manifest.captures) || manifest.captures.length < 5 || manifest.captures.length > 31) return review();
    const sources = await readDailyOfficialSources(input.userDataDir);
    const results = []; const hashes = new Set<string>(); const scenes = new Set<string>(); const slots = new Set<number>();
    for (const capture of manifest.captures) {
      const result = await verifiedCapture(capture, input, directory, sources);
      if (hashes.has(result.image.sha256) || scenes.has(result.scene) || (result.slot === 0 && slots.has(0))) return review();
      hashes.add(result.image.sha256); scenes.add(result.scene); slots.add(result.slot); results.push(result);
    }
    for (let slot = 0; slot <= input.headings.length; slot += 1) if (!slots.has(slot)) return review();
    return Object.freeze(results.sort((left, right) => left.slot - right.slot).map(result => result.image));
  } catch { return review(); }
}
export function createDailyOfficialCaptureLoader(userDataDir: string) {
  return (binding: DailyOfficialCaptureBinding) => loadDailyOfficialCaptureBatch({ ...binding, userDataDir });
}
