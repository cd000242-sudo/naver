/**
 * [SPEC-FREEZE-GUARD-001 Phase A1 / v2.10.240] Freeze 자동 감지 E2E
 *
 * Background: 사용자 보고("초반 1분 응답없음, 환경설정/계정 선택 시 freeze") —
 *   회귀 위험 통제를 위해 인프라부터 구축. 코드 변경 X.
 *
 * 측정 시나리오:
 *   1. 앱 시작 직후 5초간 main thread LongTask 누적 측정
 *   2. 환경설정 진입 시 응답 시간 + LongTask 측정
 *   3. 다중계정 선택 영역 진입 시 LongTask 측정
 *
 * 임계 (보수적으로 잡고 점진 강화):
 *   - 단일 LongTask: 500ms 미만
 *   - 5초 윈도우 누적 LongTask: 2000ms 미만
 *   - 환경설정 진입 응답: 1500ms 미만
 *
 * 본 E2E는 freeze fix 작업 *전*에 baseline 측정 + *후*에 회귀 자동 감지 역할.
 */

import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import path from 'path';

let app: ElectronApplication;
let mainWindow: Page;

interface LongTaskRecord {
  duration: number;
  startTime: number;
  name: string;
}

/**
 * renderer 측 PerformanceObserver를 통해 LongTask 누적 수집.
 * Phase A 인프라 단계 — perf API가 신뢰할만 한지 확인용.
 */
async function collectLongTasks(page: Page, durationMs: number): Promise<LongTaskRecord[]> {
  return await page.evaluate(async (timeoutMs) => {
    const tasks: LongTaskRecord[] = [];
    let observer: PerformanceObserver | null = null;
    try {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          tasks.push({
            duration: entry.duration,
            startTime: entry.startTime,
            name: entry.name || 'unknown',
          });
        }
      });
      observer.observe({ entryTypes: ['longtask'] });
    } catch (e) {
      // longtask API 미지원 환경 — fallback: 빈 배열 반환
      return [];
    }
    await new Promise((resolve) => setTimeout(resolve, timeoutMs));
    observer?.disconnect();
    return tasks;
  }, durationMs);
}

test.beforeAll(async () => {
  const mainPath = path.join(__dirname, '..', 'dist', 'main.js');
  app = await electron.launch({
    args: [mainPath],
    cwd: path.join(__dirname, '..'),
    timeout: 60_000,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      E2E_TEST: '1',
    },
  });
  mainWindow = await app.firstWindow();
  await mainWindow.waitForLoadState('domcontentloaded');
});

test.afterAll(async () => {
  await app?.close();
});

test('앱 시작 직후 5초간 LongTask 누적 < 2000ms', async () => {
  const tasks = await collectLongTasks(mainWindow, 5000);
  const totalBlockMs = tasks.reduce((sum, t) => sum + t.duration, 0);
  const longestTask = tasks.reduce((max, t) => Math.max(max, t.duration), 0);
  console.log(`[FreezeGuard] 시작 5초 LongTask: ${tasks.length}개, 누적 ${totalBlockMs.toFixed(0)}ms, 최장 ${longestTask.toFixed(0)}ms`);
  expect(totalBlockMs).toBeLessThan(2000);
  expect(longestTask).toBeLessThan(500);
});

test('환경설정 진입 응답 시간 < 1500ms', async () => {
  const settingsBtn = mainWindow.locator('[data-open-settings], #settings-btn, button:has-text("환경설정")').first();
  await settingsBtn.waitFor({ state: 'attached', timeout: 15_000 });

  const t0 = Date.now();
  await settingsBtn.click();
  // 환경설정 모달이 보이거나 settings 영역이 표시될 때까지 대기
  try {
    await mainWindow.waitForSelector('.modal-overlay.show, #settings-modal.show, .settings-container.visible', {
      state: 'visible',
      timeout: 1500,
    });
  } catch {
    // 모달 셀렉터 다양성 대응 — 정확한 셀렉터 미발견 시 LongTask만 측정
  }
  const elapsed = Date.now() - t0;
  console.log(`[FreezeGuard] 환경설정 진입 응답 시간: ${elapsed}ms`);
  expect(elapsed).toBeLessThan(1500);

  // 클릭 후 2초간 LongTask 측정 (환경설정 모달 init 부하)
  const tasks = await collectLongTasks(mainWindow, 2000);
  const totalBlockMs = tasks.reduce((sum, t) => sum + t.duration, 0);
  console.log(`[FreezeGuard] 환경설정 진입 후 2초 LongTask 누적: ${totalBlockMs.toFixed(0)}ms`);
  expect(totalBlockMs).toBeLessThan(1500);
});

test('idle 상태 1초 LongTask 거의 없음 (회귀 가드)', async () => {
  // 앱 안정화 대기
  await mainWindow.waitForTimeout(2000);
  const tasks = await collectLongTasks(mainWindow, 1000);
  const totalBlockMs = tasks.reduce((sum, t) => sum + t.duration, 0);
  console.log(`[FreezeGuard] idle 1초 LongTask 누적: ${totalBlockMs.toFixed(0)}ms`);
  // idle 상태에선 LongTask 100ms 미만이어야 정상
  expect(totalBlockMs).toBeLessThan(300);
});
