/** Native agy release transport from Google's official installer. Never execute downloaded scripts.
 * https://antigravity.google/cli/install.sh and install.ps1 (reviewed 2026-10-21).
 */
import { createHash, randomUUID } from 'node:crypto';
import { chmod, lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const RELEASE_ORIGIN = 'https://antigravity-cli-auto-updater-974169037036.us-central1.run.app';
export function agyManifestPlatform(platform: string, arch: string): string {
  if (!['win32', 'darwin', 'linux'].includes(platform) || !['x64', 'arm64'].includes(arch)) throw Error('지원하지 않는 Antigravity 설치 환경입니다.');
  return `${platform === 'win32' ? 'windows' : platform}_${arch === 'x64' ? 'amd64' : 'arm64'}`;
}
interface AgyInstallOptions {
  readonly root: string; readonly platform?: string; readonly arch?: string;
  readonly fetchImpl?: typeof fetch; readonly onProgress?: (message: string) => void;
}
async function download(url: string, limit: number, fetchImpl: typeof fetch): Promise<Buffer> {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 120_000);
  try {
    const response = await fetchImpl(url, { signal: controller.signal, redirect: 'error', credentials: 'omit', cache: 'no-store' });
    if (!response.ok || Number(response.headers.get('content-length')) > limit || !response.body) throw Error('공식 Antigravity 다운로드에 실패했습니다. 네트워크·방화벽을 확인해주세요.');
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.byteLength; if (size > limit) { await reader.cancel(); throw Error('설치 파일의 허용 크기를 초과했습니다.'); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    return Buffer.concat(chunks);
  } finally { controller.abort(); clearTimeout(timer); }
}
export async function installAgyBinary(options: AgyInstallOptions): Promise<{ executable: string; version: string }> {
  const platform = options.platform || process.platform, arch = options.arch || process.arch;
  const target = agyManifestPlatform(platform, arch); const fetchImpl = options.fetchImpl || fetch;
  const progress = (value: string) => { try { options.onProgress?.(value); } catch { /* UI observer only. */ } };
  progress('Google 공식 Antigravity 설치 정보를 확인하고 있습니다.');
  const manifest = JSON.parse((await download(`${RELEASE_ORIGIN}/manifests/${target}.json`, 64_000, fetchImpl)).toString('utf8')) as Record<string, unknown>;
  if (typeof manifest.version !== 'string' || !/^\d+\.\d+\.\d+(?:[-.][A-Za-z0-9]+)*$/u.test(manifest.version)
    || typeof manifest.sha512 !== 'string' || !/^[a-fA-F0-9]{128}$/u.test(manifest.sha512)
    || typeof manifest.url !== 'string') throw Error('공식 설치 manifest 형식을 확인하지 못했습니다.');
  const url = new URL(manifest.url);
  const expectedFolder = `${platform === 'win32' ? 'windows' : platform}-${arch === 'arm64' ? 'arm' : arch}`;
  if (url.origin !== 'https://storage.googleapis.com' || url.username || url.password || url.search || url.hash
    || !/^\/antigravity-public\/antigravity-cli\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/u.test(url.pathname)
    || url.pathname.split('/')[4] !== expectedFolder
    || (platform === 'win32' ? !url.pathname.endsWith('.exe') : !url.pathname.endsWith('.tar.gz'))) throw Error('공식 Google 배포 주소가 아닙니다. 설치를 중단했습니다.');
  const executable = path.join(options.root, platform === 'win32' ? 'agy.exe' : 'agy');
  const receiptPath = path.join(options.root, '.agy-install.json');
  const archivePath = path.join(options.root, '.agy-release.tgz');
  let bytes: Buffer | undefined;
  try {
    const cacheFile = platform === 'win32' ? executable : archivePath;
    const cached = await lstat(cacheFile);
    if (cached.isFile() && !cached.isSymbolicLink() && cached.size > 0 && cached.size <= 200_000_000) {
      const payload = await readFile(cacheFile);
      if (createHash('sha512').update(payload).digest('hex') === manifest.sha512.toLowerCase()) {
        if (platform === 'win32') {
          progress('Google SHA512와 일치하는 기존 설치 파일을 다시 사용합니다.');
          return Object.freeze({ executable, version: manifest.version });
        }
        // Re-extract the authoritative archive: a mutable receipt never authenticates a binary.
        bytes = payload; progress('Google SHA512로 확인한 압축 캐시를 다시 사용합니다.');
      }
    }
  } catch { /* Missing or unreadable cached bytes: retry a clean staged download. */ }
  if (!bytes) progress('공식 Antigravity 파일을 내려받고 SHA512를 확인합니다.');
  bytes ??= await download(url.toString(), 200_000_000, fetchImpl);
  if (!bytes.length || createHash('sha512').update(bytes).digest('hex') !== manifest.sha512.toLowerCase()) throw Error('Antigravity 파일 무결성 검증에 실패했습니다.');
  await mkdir(options.root, { recursive: true });
  if ((await lstat(options.root)).isSymbolicLink()) throw Error('설치 폴더 연결을 확인해주세요.');
  const staging = path.join(options.root, `.agy-staging-${randomUUID()}`); await mkdir(staging);
  try {
    const stagedBinary = path.join(staging, 'antigravity');
    if (platform === 'win32') await writeFile(stagedBinary, bytes, { flag: 'wx' });
    else {
      const archive = path.join(staging, 'release.tgz'); await writeFile(archive, bytes, { flag: 'wx' });
      const tar = await import('tar');
      await tar.x({ file: archive, cwd: staging, strict: true, filter: (name, entry) => name === 'antigravity'
        && 'type' in entry && entry.type === 'File' && typeof entry.size === 'number' && entry.size > 0 && entry.size <= 200_000_000 });
      const stat = await lstat(stagedBinary);
      if (!stat.isFile() || stat.isSymbolicLink() || !stat.size || stat.size > 200_000_000) throw Error('Antigravity 압축 파일 구성이 다릅니다.');
      await chmod(stagedBinary, 0o700);
    }
    const binarySha512 = createHash('sha512').update(await readFile(stagedBinary)).digest('hex');
    await rename(stagedBinary, executable);
    if (platform !== 'win32') await rename(path.join(staging, 'release.tgz'), archivePath);
    const receipt = path.join(staging, 'receipt.json');
    await writeFile(receipt, JSON.stringify({ version: manifest.version, archiveSha512: manifest.sha512, binarySha512 }), { flag: 'wx' });
    await rename(receipt, receiptPath);
    progress('설치 파일 준비 완료. 실제 CLI를 다시 확인합니다.');
    return Object.freeze({ executable, version: manifest.version });
  } finally { await rm(staging, { recursive: true, force: true }); }
}
