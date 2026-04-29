// v2.7.48 — 자식 프로세스 레지스트리
//
// 사용자 보고: "앱은 꺼놓은 상태인데 작업표시줄이 깜빡임"
// 원인: detached:true + child.unref()로 spawn한 LEWORD가 본 앱 종료 후에도 살아남아
//        자체 Electron/GPU 렌더로 작업표시줄 깜빡임 유발.
// 해결: 본 앱이 spawn한 자식 PID를 모두 추적하고 종료 시 kill.

import { spawn } from 'child_process';

interface TrackedChild {
  pid: number;
  label: string;
  spawnedAt: number;
}

const trackedChildren = new Map<number, TrackedChild>();

/**
 * 자식 프로세스 PID 추적 등록
 *   spawn 직후 child.pid가 있으면 호출
 */
export function trackChild(pid: number | undefined, label: string): void {
  if (!pid || pid <= 0) return;
  trackedChildren.set(pid, { pid, label, spawnedAt: Date.now() });
  // eslint-disable-next-line no-console
  console.log(`[ChildRegistry] 추적 등록: ${label} (pid=${pid}, 총 ${trackedChildren.size}개)`);
}

/**
 * 자식 프로세스 추적 해제 (정상 종료된 경우 호출)
 */
export function untrackChild(pid: number): void {
  if (trackedChildren.delete(pid)) {
    // eslint-disable-next-line no-console
    console.log(`[ChildRegistry] 추적 해제: pid=${pid} (남은 ${trackedChildren.size}개)`);
  }
}

/**
 * 추적 중인 모든 자식 프로세스 강제 종료
 *   Windows: taskkill /T /F (process tree 전체)
 *   Unix: process.kill(pid, 'SIGTERM') → 1초 후 SIGKILL
 */
export async function killAllTrackedChildren(): Promise<void> {
  const all = Array.from(trackedChildren.values());
  if (all.length === 0) return;
  // eslint-disable-next-line no-console
  console.log(`[ChildRegistry] 🧹 ${all.length}개 자식 프로세스 종료 시작`);

  for (const child of all) {
    try {
      if (process.platform === 'win32') {
        // Windows: taskkill로 process tree 전체 정리 (LEWORD가 spawn한 chromium까지)
        await new Promise<void>((resolve) => {
          const tk = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
            windowsHide: true,
            shell: false,
            timeout: 5000,
          });
          tk.on('exit', () => resolve());
          tk.on('error', () => resolve());
        });
        // eslint-disable-next-line no-console
        console.log(`[ChildRegistry] ✅ taskkill ${child.label} (pid=${child.pid})`);
      } else {
        try {
          process.kill(child.pid, 'SIGTERM');
          // 1초 후 SIGKILL 폴백
          setTimeout(() => {
            try { process.kill(child.pid, 'SIGKILL'); } catch { /* ignore */ }
          }, 1000);
        } catch (e) {
          // 이미 종료됐거나 권한 없음
          // eslint-disable-next-line no-console
          console.warn(`[ChildRegistry] kill ${child.label} 실패:`, (e as Error).message);
        }
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(`[ChildRegistry] ${child.label} 종료 중 오류:`, (e as Error).message);
    }
  }
  trackedChildren.clear();
}

export function getTrackedChildren(): ReadonlyArray<TrackedChild> {
  return Array.from(trackedChildren.values());
}
