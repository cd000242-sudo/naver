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

/*
 * 게이트 전체 실행 뒤에는 이 앱이 아주 느리다 — 단위 테스트 9천여 건과 커버리지·빌드를
 * 막 끝낸 머신에서 뜬다. 미리보기는 디바운스(450ms) 뒤 비동기 분석을 거치므로 그 지연이
 * 크게 늘어난다. 실제로 단독 실행은 늘 통과하는데 게이트에서만 두 번 떨어졌다.
 * 기본 타임아웃(60초)으로는 모자라서 이 스펙만 넉넉히 준다.
 */
test.setTimeout(120_000);

test('표기 없는 본문에서 적용을 눌러도 소제목이 사라지지 않는다', async () => {
  const report = await mainWindow.evaluate(async (body: string) => {
    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    // 고정 대기는 게이트 전체 실행에서 흔들린다 — 조건 폴링으로 바꾼다.
    const until = async (check: () => boolean, budgetMs = 45000): Promise<void> => {
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
    /*
     * 적용은 감지된 소제목을 본문 표기로 굳힌 뒤 재분석을 건다. 게이트 전체를 돌릴 때는
     * 그 재분석이 늦어 카드가 잠깐 비는 순간이 있었다 — 고정 대기로는 그 순간을 찍는다.
     * 그래서 판정할 조건 자체가 참이 될 때까지 기다린다.
     */
    await until(() => document.querySelectorAll('#heading-list input[data-heading-line]').length >= 2
      && cards().length >= cardsBefore.length);
    await wait(800);

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
