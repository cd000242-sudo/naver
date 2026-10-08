import { createHash } from 'crypto';
import { constants } from 'fs';
import { lstat, open, realpath } from 'fs/promises';
import path from 'path';

const DOWNLOAD_FOLDER = 'LDB Image Ultra';
const MAX_IMAGE_BYTES = 1536 * 1024;
type DownloadReference = { relativePath: string; sha256: string; byteLength: number; mime: 'image/png' | 'image/jpeg' | 'image/webp' };

/** Only these fixed messages may cross the HTTP boundary. Filesystem errors can contain private paths. */
export class LdbDownloadImageError extends Error {
  readonly code = 'DOWNLOAD_IMAGE_UNAVAILABLE';
  constructor(message = '다운로드에 저장된 이미지를 확인하지 못했습니다. 확장프로그램에서 이미지를 다시 저장해주세요.') { super(message); }
}

function safeComponent(value: string): boolean {
  return value.length > 0 && value.length <= 100 && value !== '.' && value !== '..'
    && !/[\p{Cc}<>:"/\\|?*%]/u.test(value) && !/[. ]$/u.test(value)
    && !/^(?:CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])(?:\.|$)/iu.test(value);
}

export function validateDownloadReference(value: unknown): DownloadReference {
  const ref = value as DownloadReference;
  if (!ref || typeof ref !== 'object' || Array.isArray(ref) || typeof ref.relativePath !== 'string') throw new LdbDownloadImageError();
  const parts = ref.relativePath.split('/');
  if (parts.length !== 3 || parts[0] !== DOWNLOAD_FOLDER || !parts.every(safeComponent)
    || !Number.isSafeInteger(ref.byteLength) || ref.byteLength <= 0 || ref.byteLength > MAX_IMAGE_BYTES
    || typeof ref.sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(ref.sha256)) throw new LdbDownloadImageError();
  const extension = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' }[ref.mime];
  if (!extension || !parts[2].endsWith(extension)) throw new LdbDownloadImageError('저장된 이미지의 파일 형식을 확인해주세요.');
  return { relativePath: ref.relativePath, sha256: ref.sha256, byteLength: ref.byteLength, mime: ref.mime };
}

function isWithin(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

async function checkedPath(root: string, relativePath: string): Promise<{ filename: string; stat: Awaited<ReturnType<typeof lstat>> }> {
  let filename = root;
  const parts = relativePath.split('/');
  for (let index = 0; index < parts.length; index++) {
    filename = path.join(filename, parts[index]);
    const stat = await lstat(filename);
    if (stat.isSymbolicLink() || !isWithin(root, await realpath(filename))
      || (index < parts.length - 1 ? !stat.isDirectory() : !stat.isFile() || stat.nlink !== 1)) throw new LdbDownloadImageError();
    if (index === parts.length - 1) return { filename, stat };
  }
  throw new LdbDownloadImageError();
}

/** Bounded reads prevent a changed file from allocating more memory than the verified manifest permits. */
async function readVerifiedFile(root: string, ref: DownloadReference): Promise<Buffer> {
  const before = await checkedPath(root, ref.relativePath);
  const handle = await open(before.filename, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.nlink !== 1 || opened.size !== ref.byteLength
      || opened.ino !== before.stat.ino || opened.dev !== before.stat.dev) throw new LdbDownloadImageError();
    const bytes = Buffer.alloc(ref.byteLength + 1);
    let offset = 0;
    while (offset < bytes.length) {
      const read = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (!read.bytesRead) break;
      offset += read.bytesRead;
    }
    const after = await checkedPath(root, ref.relativePath);
    if (offset !== ref.byteLength || after.stat.ino !== opened.ino || after.stat.dev !== opened.dev
      || after.stat.size !== ref.byteLength || after.stat.mtimeMs !== opened.mtimeMs) throw new LdbDownloadImageError();
    const result = bytes.subarray(0, offset);
    if (createHash('sha256').update(result).digest('hex') !== ref.sha256) throw new LdbDownloadImageError('저장된 이미지가 변경되었습니다. 확장프로그램에서 이미지를 다시 저장해주세요.');
    return result;
  } finally { await handle.close(); }
}

/** The app supplies its OS Downloads directory; the caller cannot choose a root or supply absolute paths. */
export async function readLdbDownloadImage(value: unknown, downloadsDirectory?: string): Promise<string> {
  const ref = validateDownloadReference(value);
  if (!downloadsDirectory) throw new LdbDownloadImageError('다운로드 이미지 연결을 지원하는 최신 앱으로 업데이트해주세요.');
  try {
    const bytes = await readVerifiedFile(await realpath(downloadsDirectory), ref);
    return `data:${ref.mime};base64,${bytes.toString('base64')}`;
  } catch (error) {
    if (error instanceof LdbDownloadImageError) throw error;
    throw new LdbDownloadImageError();
  }
}
