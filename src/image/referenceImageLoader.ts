import axios from 'axios';
import { lookup } from 'dns/promises';
import { promises as fs } from 'fs';
import { BlockList, isIP } from 'net';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { getShoppingReferenceSourceCandidates } from './shoppingReferenceGeneration.js';

export interface LoadedReferenceImageData {
  buffer: Buffer;
  mimeType: string;
  source: string;
}

export interface ReferenceImageRemoteResponse {
  data: ArrayBuffer | ArrayBufferView | Buffer | string;
  headers?: Record<string, unknown>;
}

export interface ReferenceImageLoadOptions {
  timeoutMs?: number;
  allowedLocalRoots?: string[];
  maxBytes?: number;
  fetchRemote?: (
    url: string,
    timeoutMs: number,
    resolvedAddresses: string[],
  ) => Promise<ReferenceImageRemoteResponse>;
  resolveHost?: ReferenceImageHostResolver;
}

export type ReferenceImageHostResolver = (hostname: string) => Promise<string[]>;

const DEFAULT_MAX_REFERENCE_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_REFERENCE_IMAGE_PIXELS = 80_000_000;
const REFERENCE_IMAGE_MIME_TYPES: Readonly<Record<string, string>> = {
  avif: 'image/avif',
  gif: 'image/gif',
  heif: 'image/heif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  tiff: 'image/tiff',
  webp: 'image/webp',
};

const blockedReferenceAddresses = new BlockList();
[
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
].forEach(([network, prefix]) => blockedReferenceAddresses.addSubnet(
  network as string,
  prefix as number,
  'ipv4',
));
[
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['100::', 64],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
].forEach(([network, prefix]) => blockedReferenceAddresses.addSubnet(
  network as string,
  prefix as number,
  'ipv6',
));

async function defaultHostResolver(hostname: string): Promise<string[]> {
  const records = await lookup(hostname, { all: true, verbatim: true });
  return records.map(record => record.address);
}

function isBlockedReferenceAddress(address: string): boolean {
  if (/^::ffff:/i.test(address)) return true;
  const family = isIP(address);
  if (family === 4) return blockedReferenceAddresses.check(address, 'ipv4');
  if (family === 6) return blockedReferenceAddresses.check(address, 'ipv6');
  return true;
}

export async function assertPublicRemoteReferenceUrl(
  source: string,
  resolveHost: ReferenceImageHostResolver = defaultHostResolver,
): Promise<string[]> {
  let parsed: URL;
  try {
    parsed = new URL(source);
  } catch {
    throw new Error('UNSAFE_REFERENCE_IMAGE_URL: malformed remote image URL');
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error('UNSAFE_REFERENCE_IMAGE_URL: only credential-free HTTP(S) image URLs are allowed');
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!hostname || hostname === 'localhost' || /(?:^|\.)(?:localhost|local|internal|home\.arpa)$/.test(hostname)) {
    throw new Error('UNSAFE_REFERENCE_IMAGE_URL: local network hosts are blocked');
  }
  if (/^::ffff:/i.test(hostname)) {
    throw new Error('UNSAFE_REFERENCE_IMAGE_URL: IPv4-mapped literal addresses are blocked');
  }

  const literalFamily = isIP(hostname);
  const addresses = literalFamily ? [hostname] : await resolveHost(hostname);
  if (addresses.length === 0 || addresses.some(isBlockedReferenceAddress)) {
    throw new Error('UNSAFE_REFERENCE_IMAGE_URL: private, local, or reserved network addresses are blocked');
  }
  return addresses;
}

function isUnsafeLocalPath(source: string): boolean {
  const normalized = String(source || '').trim();
  if (!normalized) return true;
  if (/^(?:\\\\|\/\/|\\\\[?.]\\)/.test(normalized)) return true;
  if (/^[a-z]:[^\\/]/i.test(normalized)) return true;
  return /^[a-z]:[\\/].*:/i.test(normalized);
}

function normalizeRootCandidate(value: unknown): string {
  const candidate = String(value || '').trim();
  if (!candidate || isUnsafeLocalPath(candidate)) return '';
  return path.isAbsolute(candidate) ? path.resolve(candidate) : '';
}

export function buildAllowedReferenceImageRoots(
  customRoot?: unknown,
  extraRoots: readonly unknown[] = [],
): string[] {
  const roots = [
    path.join(os.homedir(), 'Downloads', 'naver-blog-images'),
    path.join(os.homedir(), '.naver-blog-automation', 'generated-images'),
    customRoot,
    ...(process.env.TEST_MODE ? [process.env.GENERATED_IMAGES_DIR] : []),
    ...extraRoots,
  ];
  const seen = new Set<string>();
  return roots.flatMap(root => {
    const normalized = normalizeRootCandidate(root);
    if (!normalized) return [];
    const key = process.platform === 'win32' ? normalized.toLowerCase() : normalized;
    if (seen.has(key)) return [];
    seen.add(key);
    return [normalized];
  });
}

export function buildAppManagedReferenceImageRoots(
  customRoot?: unknown,
  userDataRoot?: unknown,
  tempRoot?: unknown,
): string[] {
  const userData = normalizeRootCandidate(userDataRoot);
  const temp = normalizeRootCandidate(tempRoot);
  return buildAllowedReferenceImageRoots(customRoot, [
    ...(userData ? [
      path.join(userData, 'generated-images'),
      path.join(userData, 'images'),
      path.join(userData, 'blobs'),
      path.join(userData, 'style-previews'),
    ] : []),
    ...(temp ? [
      path.join(temp, 'better-life-thumbnails'),
      path.join(temp, 'better-life-naver-blobs'),
      path.join(temp, 'better-life-naver-reference-images'),
    ] : []),
  ]);
}

function assertPercentEncodedPayloadWithinLimit(payload: string, maxBytes: number): void {
  let decodedBytes = 0;
  for (let index = 0; index < payload.length;) {
    if (payload[index] === '%') {
      if (!/^[0-9a-f]{2}$/i.test(payload.slice(index + 1, index + 3))) {
        throw new Error('INVALID_REFERENCE_IMAGE: malformed percent-encoded data image');
      }
      decodedBytes += 1;
      index += 3;
    } else {
      const codePoint = payload.codePointAt(index);
      if (codePoint === undefined) break;
      decodedBytes += Buffer.byteLength(String.fromCodePoint(codePoint), 'utf8');
      index += codePoint > 0xffff ? 2 : 1;
    }
    if (decodedBytes > maxBytes) {
      throw new Error(`REFERENCE_IMAGE_TOO_LARGE: maximum ${maxBytes} bytes`);
    }
  }
}

function decodeDataImage(source: string, maxBytes: number): Buffer | null {
  const match = source.match(/^data:(image\/[a-z0-9.+-]+)(?:;[^,]*)?,(.*)$/is);
  if (!match) return null;
  const metadata = source.slice(0, source.indexOf(','));
  if (/;base64/i.test(metadata) && Math.ceil(match[2].length * 0.75) > maxBytes) {
    throw new Error(`REFERENCE_IMAGE_TOO_LARGE: maximum ${maxBytes} bytes`);
  }
  if (!/;base64/i.test(metadata)) {
    assertPercentEncodedPayloadWithinLimit(match[2], maxBytes);
  }
  const buffer = /;base64/i.test(metadata)
    ? Buffer.from(match[2], 'base64')
    : Buffer.from(decodeURIComponent(match[2]), 'utf8');
  return buffer.length > 0 ? buffer : null;
}

function toBuffer(data: ReferenceImageRemoteResponse['data']): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (typeof data === 'string') return Buffer.from(data);
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  }
  return Buffer.from(data);
}

async function defaultRemoteFetcher(
  url: string,
  timeoutMs: number,
  resolvedAddresses: string[],
): Promise<ReferenceImageRemoteResponse> {
  let currentUrl = url;
  let currentAddresses = [...resolvedAddresses];
  const pinnedLookup = (
    _hostname: string,
    optionsOrCallback: any,
    callbackMaybe?: any,
  ): void => {
    const options = typeof optionsOrCallback === 'function' ? {} : (optionsOrCallback || {});
    const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : callbackMaybe;
    if (options.all === true) {
      callback(null, currentAddresses.map(address => ({ address, family: isIP(address) })));
      return;
    }
    const address = currentAddresses[0];
    callback(null, address, isIP(address));
  };
  for (let redirectCount = 0; redirectCount <= 3; redirectCount++) {
    const response = await axios.get(currentUrl, {
      responseType: 'arraybuffer',
      timeout: timeoutMs,
      maxContentLength: DEFAULT_MAX_REFERENCE_IMAGE_BYTES,
      maxBodyLength: DEFAULT_MAX_REFERENCE_IMAGE_BYTES,
      maxRedirects: 0,
      lookup: pinnedLookup,
      validateStatus: status => status >= 200 && status < 400,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    if (response.status < 300) return response;

    const location = String(response.headers?.location || '').trim();
    if (!location || redirectCount === 3) {
      throw new Error('REFERENCE_IMAGE_REDIRECT_BLOCKED: invalid or excessive redirect chain');
    }
    currentUrl = new URL(location, currentUrl).toString();
    currentAddresses = await assertPublicRemoteReferenceUrl(currentUrl);
  }
  throw new Error('REFERENCE_IMAGE_REDIRECT_BLOCKED: excessive redirect chain');
}

function assertReferenceImageSize(buffer: Buffer, maxBytes: number): void {
  if (buffer.length === 0) throw new Error('INVALID_REFERENCE_IMAGE: empty image data');
  if (buffer.length > maxBytes) {
    throw new Error(`REFERENCE_IMAGE_TOO_LARGE: maximum ${maxBytes} bytes`);
  }
}

async function validateReferenceImage(
  buffer: Buffer,
  maxBytes: number,
): Promise<{ buffer: Buffer; mimeType: string }> {
  assertReferenceImageSize(buffer, maxBytes);
  try {
    const metadata = await sharp(buffer, {
      failOn: 'error',
      limitInputPixels: MAX_REFERENCE_IMAGE_PIXELS,
    }).metadata();
    const mimeType = REFERENCE_IMAGE_MIME_TYPES[String(metadata.format || '').toLowerCase()];
    if (!mimeType || !metadata.width || !metadata.height) {
      throw new Error('unsupported or dimensionless raster image');
    }
    return { buffer, mimeType };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`INVALID_REFERENCE_IMAGE: ${message}`);
  }
}

function isPathWithinRoot(candidatePath: string, rootPath: string): boolean {
  const comparableCandidate = process.platform === 'win32' ? candidatePath.toLowerCase() : candidatePath;
  const comparableRoot = process.platform === 'win32' ? rootPath.toLowerCase() : rootPath;
  const relative = path.relative(comparableRoot, comparableCandidate);
  return relative === '' || (
    relative !== '..'
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative)
  );
}

async function resolveAllowedLocalReferencePath(
  source: string,
  allowedLocalRoots: readonly string[],
): Promise<string> {
  if (isUnsafeLocalPath(source)) {
    throw new Error('UNSAFE_REFERENCE_IMAGE_PATH: network, device, drive-relative, and alternate-stream paths are blocked');
  }

  let localPath = source;
  if (/^file:/i.test(source)) {
    let fileUrl: URL;
    try {
      fileUrl = new URL(source);
    } catch {
      throw new Error('UNSAFE_REFERENCE_IMAGE_PATH: malformed file URL');
    }
    if (fileUrl.protocol !== 'file:' || fileUrl.hostname) {
      throw new Error('UNSAFE_REFERENCE_IMAGE_PATH: network file URLs are blocked');
    }
    localPath = fileURLToPath(fileUrl);
  }

  if (isUnsafeLocalPath(localPath) || !path.isAbsolute(localPath)) {
    throw new Error('UNSAFE_REFERENCE_IMAGE_PATH: only absolute local paths are allowed');
  }

  const realPath = await fs.realpath(localPath);
  const roots = await Promise.all(allowedLocalRoots.map(async root => {
    try {
      return await fs.realpath(root);
    } catch {
      return path.resolve(root);
    }
  }));
  if (!roots.some(root => isPathWithinRoot(realPath, root))) {
    throw new Error('REFERENCE_IMAGE_PATH_NOT_ALLOWED: local image is outside managed image folders');
  }

  const stat = await fs.stat(realPath);
  if (!stat.isFile()) {
    throw new Error('INVALID_REFERENCE_IMAGE: local reference is not a regular file');
  }
  return realPath;
}

function summarizeReferenceSource(source: string): string {
  if (/^data:/i.test(source)) return 'data:image/...';
  return source.length > 180 ? `${source.slice(0, 177)}...` : source;
}

export async function loadReferenceImageData(
  candidate: unknown,
  options: ReferenceImageLoadOptions = {},
): Promise<LoadedReferenceImageData | null> {
  const timeoutMs = Math.max(1_000, Number(options.timeoutMs) || 15_000);
  const fetchRemote = options.fetchRemote || defaultRemoteFetcher;
  const resolveHost = options.resolveHost || defaultHostResolver;
  const maxBytes = Math.max(1, Math.min(
    Number(options.maxBytes) || DEFAULT_MAX_REFERENCE_IMAGE_BYTES,
    DEFAULT_MAX_REFERENCE_IMAGE_BYTES,
  ));
  const allowedLocalRoots = buildAllowedReferenceImageRoots(undefined, options.allowedLocalRoots || []);
  const failures: string[] = [];

  for (const sourceCandidate of getShoppingReferenceSourceCandidates(candidate)) {
    const { source, allowLocalFile } = sourceCandidate;
    try {
      if (/^data:image\//i.test(source)) {
        const decoded = decodeDataImage(source, maxBytes);
        if (decoded) {
          const validated = await validateReferenceImage(decoded, maxBytes);
          return { ...validated, source };
        }
        throw new Error('empty data image');
      }

      if (/^https?:\/\//i.test(source)) {
        const resolvedAddresses = await assertPublicRemoteReferenceUrl(source, resolveHost);
        const response = await fetchRemote(source, timeoutMs, resolvedAddresses);
        const buffer = toBuffer(response.data);
        const validated = await validateReferenceImage(buffer, maxBytes);
        return { ...validated, source };
      }

      if (!allowLocalFile) {
        throw new Error('UNSAFE_REFERENCE_IMAGE_SOURCE: URL fields may contain only HTTP(S) or data image URLs');
      }
      const localPath = await resolveAllowedLocalReferencePath(source, allowedLocalRoots);
      const buffer = await fs.readFile(localPath);
      const validated = await validateReferenceImage(buffer, maxBytes);
      return { ...validated, source: localPath };
    } catch (error) {
      failures.push(`${summarizeReferenceSource(source)}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`REFERENCE_IMAGE_LOAD_FAILED: ${failures.join(' | ')}`);
  }
  return null;
}

export function createReferenceImageDataUrl(reference: LoadedReferenceImageData): string {
  const mimeType = /^image\/[a-z0-9.+-]+$/i.test(reference.mimeType)
    ? reference.mimeType.toLowerCase()
    : 'image/png';
  return `data:${mimeType};base64,${reference.buffer.toString('base64')}`;
}
