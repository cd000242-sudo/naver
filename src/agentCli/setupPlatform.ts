import { release } from 'node:os';

/** Deliberately narrower than every upstream binary: obsolete/32-bit PCs fail explicitly. */
export function agentSetupPlatform(platform: string = process.platform, arch: string = process.arch, osRelease: string = release()) {
  if (!['win32', 'darwin', 'linux'].includes(platform) || !['x64', 'arm64'].includes(arch)) {
    throw new Error('이 PC는 원클릭 설치 지원 대상이 아닙니다. Windows·macOS·Linux의 x64/ARM64 환경이 필요합니다.');
  }
  const [major = 0, , build = 0] = osRelease.split('.').map(Number);
  if (!Number.isFinite(major) || (platform === 'win32' && (major < 10 || (major === 10 && build < 17763)))
    || (platform === 'darwin' && major < 22)) {
    throw new Error('이 운영체제 버전은 원클릭 설치 지원 대상이 아닙니다. Windows 10 1809 이상 또는 macOS 13 이상이 필요합니다.');
  }
  return Object.freeze({ platform, arch });
}
