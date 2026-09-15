/**
 * [2026-09-15] 표기("## ")가 하나도 없는 본문에서 적용을 누르면 어떻게 되는가.
 *
 * 붙여넣기 직후에는 표기가 없고 휴리스틱이 소제목을 잡는다. 이 상태에서 적용이
 * 소제목을 통째로 지워 버리면 "적용했더니 미리보기가 망가졌다/안 바뀐다"가 된다.
 */

import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import path from 'path';
import {
  closeElectronTestSession,
  createElectronTestProfile,
  type ElectronTestProfile,
  waitForMainWindow,
} from './electronTestUtils';

let app: ElectronApplication;
let mainWindow: Page;
let testProfile: ElectronTestProfile;

const PLAIN_BODY = [
  '오늘은 청약통장 이야기를 해보겠습니다.',
  '',
  '신청 방법',
  '신청에 필요한 서류와 방문 절차를 안내합니다.',
  '',
  '이용 기준',
  '이용 가능한 날짜와 조건을 확인합니다.',
].join('\n');

test.beforeAll(async () => {
  testProfile = await createElectronTestProfile('bln-heading-unmarked-e2e-');
  app = await electron.launch({
    args: [path.join(__dirname, '..', 'dist', 'main.js')],
    cwd: path.join(__dirname, '..'),
    timeout: 60_000,
    env: { ...process.env, ...testProfile.env, E2E_TEST: '1' },
  });
  mainWindow = await waitForMainWindow(app);
});

test.afterAll(async () => {
  await closeElectronTestSession(app, testProfile);
});

test('표기 없는 본문에서 적용을 눌러도 소제목이 사라지지 않는다', async () => {
  const report = await mainWindow.evaluate(async (body: string) => {
    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    // 고정 대기는 게이트 전체 실행에서 흔들린다 — 조건 폴링으로 바꾼다.
    const until = async (check: () => boolean, budgetMs = 20000): Promise<void> => {
      const deadline = Date.now() + budgetMs;
      while (Date.now() < deadline) {
        if (check()) return;
        await wait(200);
      }
    };
    const cards = () => Array.from(
      (document.getElementById('unified-integrated-preview')?.innerHTML || '').matchAll(/📝 ([^<]+)</g),
    ).map((m) => m[1].trim());

    const textarea = document.getElementById('unified-generated-content') as HTMLTextAreaElement | null;
    if (!textarea) return { error: 'no textarea' };
    textarea.value = body;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await until(() => cards().length >= 2);

    const cardsBefore = cards();
    const panelRowsBefore = document.querySelectorAll('#heading-list input[data-heading-line]').length;

    (document.getElementById('heading-apply-to-preview') as HTMLButtonElement | null)?.click();
    await until(() => document.querySelectorAll('#heading-list input[data-heading-line]').length >= 2);
    await wait(1200);

    return {
      cardsBefore,
      panelRowsBefore,
      cardsAfterApply: cards(),
      structuredHeadings: ((window as any).currentStructuredContent?.headings || [])
        .map((h: any) => String(h?.title || '')),
    };
  }, PLAIN_BODY);

  console.log('[E2E] unmarked report:', JSON.stringify(report, null, 2));
  expect((report as any).error).toBeUndefined();
  expect((report as any).cardsAfterApply).toEqual((report as any).cardsBefore);
  expect((report as any).structuredHeadings.length).toBeGreaterThan(0);
});
