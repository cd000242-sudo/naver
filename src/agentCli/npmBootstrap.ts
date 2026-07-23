/**
 * npmBootstrap.ts — fetch a pinned npm into userData so agent install never needs the
 * user's Node.js.
 *
 * npm is a pure-JS package, so it runs on the Node 20 runtime Electron already ships
 * (ELECTRON_RUN_AS_NODE=1). Bootstrapping npm rather than unpacking each CLI tarball
 * ourselves keeps npm responsible for optionalDependencies (the platform binaries
 * codex/claude/gemini ship) and postinstall — so an upstream packaging change does not
 * require an app release.
 *
 * Same shape as browserInstaller.ts: one shared in-flight promise, failures are not cached.
 */
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { getAgentRuntimeDir } from './agentRuntime.js';

/**
 * Pinned deliberately. npm 10.9.2 declares engines ^18.17.0 || >=20.5.0 and Electron 31
 * runs Node 20.18.0 — verified live via `electron --run-as-node npm-cli.js --version`.
 * Bump only together with an Electron upgrade, and refresh INTEGRITY from the registry.
 */
export const PINNED_NPM_VERSION = '10.9.2';
const NPM_TARBALL_URL = `https://registry.npmjs.org/npm/-/npm-${PINNED_NPM_VERSION}.tgz`;
/** dist.integrity from registry.npmjs.org for the pinned version. */
const NPM_TARBALL_INTEGRITY =
  'sha512-iriPEPIkoMYUy3F6f3wwSZAU93E0Eg6cHwIR6jzzOXWSy+SD/rOODEs74cVONHKSx2obXtuUoyidVEhISrisgQ==';

const DOWNLOAD_TIMEOUT_MS = 120_000;

export type NpmBootstrapProgress = (message: string) => void;

let bootstrapPromise: Promise<string> | null = null;

function npmHomeDir(): string {
  return join(getAgentRuntimeDir(), 'npm');
}

/** Path to the bootstrapped npm CLI entrypoint. */
export function getBootstrappedNpmCli(): string {
  return join(npmHomeDir(), 'bin', 'npm-cli.js');
}

/** True when a complete, correctly-versioned npm is already extracted. */
export function isNpmBootstrapped(): boolean {
  try {
    if (!existsSync(getBootstrappedNpmCli())) return false;
    const manifest = JSON.parse(readFileSync(join(npmHomeDir(), 'package.json'), 'utf8')) as {
      version?: unknown;
    };
    return manifest.version === PINNED_NPM_VERSION;
  } catch {
    return false;
  }
}

function integrityOf(payload: Buffer): string {
  return `sha512-${createHash('sha512').update(payload).digest('base64')}`;
}

async function downloadNpmTarball(): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    const response = await fetch(NPM_TARBALL_URL, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`npm 다운로드 실패 (HTTP ${response.status})`);
    }
    return Buffer.from(await response.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}

async function extractNpmTarball(payload: Buffer): Promise<void> {
  const runtimeDir = getAgentRuntimeDir();
  mkdirSync(runtimeDir, { recursive: true });

  // Stage in a sibling directory and swap, so an interrupted extract never leaves a
  // half-written npm that isNpmBootstrapped() would have to guess about.
  const stagingDir = join(runtimeDir, `npm.staging-${process.pid}`);
  const tarballPath = join(runtimeDir, `npm-${PINNED_NPM_VERSION}.tgz`);
  rmSync(stagingDir, { recursive: true, force: true });
  mkdirSync(stagingDir, { recursive: true });

  try {
    writeFileSync(tarballPath, payload);
    const tar = await import('tar');
    await tar.x({ file: tarballPath, cwd: stagingDir, strip: 1 });

    const finalDir = npmHomeDir();
    rmSync(finalDir, { recursive: true, force: true });
    renameSync(stagingDir, finalDir);
  } finally {
    rmSync(tarballPath, { force: true });
    rmSync(stagingDir, { recursive: true, force: true });
  }
}

/**
 * Ensure the pinned npm is present under userData and return its CLI path.
 * Idempotent; concurrent callers share one download. Rejects (without caching the failure)
 * when the download, integrity check, or extraction fails.
 */
export async function ensureBootstrappedNpm(
  onProgress?: NpmBootstrapProgress,
): Promise<string> {
  if (isNpmBootstrapped()) return getBootstrappedNpmCli();
  if (bootstrapPromise) return bootstrapPromise;

  bootstrapPromise = (async () => {
    onProgress?.('설치 도구를 준비하고 있어요... (최초 1회, 약 3MB)');
    console.log(`[NpmBootstrap] npm ${PINNED_NPM_VERSION} 다운로드 시작`);

    const payload = await downloadNpmTarball();
    const actual = integrityOf(payload);
    if (actual !== NPM_TARBALL_INTEGRITY) {
      throw new Error(
        `npm 무결성 검증 실패 — 파일이 손상되었거나 변조되었습니다 (${actual.slice(0, 24)}...)`,
      );
    }

    onProgress?.('설치 도구 압축을 푸는 중...');
    await extractNpmTarball(payload);

    if (!isNpmBootstrapped()) {
      throw new Error('npm 압축 해제는 끝났지만 실행 파일을 찾지 못했습니다.');
    }
    console.log(`[NpmBootstrap] ✅ npm ${PINNED_NPM_VERSION} 준비 완료: ${npmHomeDir()}`);
    return getBootstrappedNpmCli();
  })().catch((err) => {
    bootstrapPromise = null; // let a later attempt retry instead of caching the failure
    console.error(`[NpmBootstrap] ❌ npm 준비 실패: ${(err as Error)?.message ?? err}`);
    throw err;
  });

  return bootstrapPromise;
}

/** Test seam — drops the cached in-flight promise. */
export function resetNpmBootstrapCache(): void {
  bootstrapPromise = null;
}
