/**
 * [Phase 2/v2.10.139] Playwright E2E config — Electron 앱 회귀 자동 감지 baseline.
 *
 * 목적: god file 분해 시 회귀를 *자동으로* 감지. 사용자 수동 검증 시간 절약.
 *
 * 실행:
 *   npm run e2e          - 전체 E2E 실행
 *   npm run e2e:ui       - UI 모드 (디버깅용)
 *
 * 주의:
 *   - Electron app은 동시 launch 불가 → workers: 1
 *   - 첫 실행 전 npm run build 필요 (dist/main.js 생성)
 *   - 라이선스/API 키 검증 흐름은 테스트에서 우회 필요
 */

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
  ],
  use: {
    actionTimeout: 10_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
