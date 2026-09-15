/**
 * [2026-09-15 사장님] "적용하기 눌러도 미리보기가 안 바뀌던데 확인해봐."
 *
 * 소제목 패널의 편집 결과가 실제 앱에서 소제목별 구조 미리보기(#unified-integrated-preview)
 * 까지 도달하는지를 진짜 Electron 창에서 확인한다. jsdom 하네스는 미리보기 렌더러를
 * 스텁으로 대체하므로 이 구간을 증명하지 못한다.
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

const BODY = [
  '오늘은 청약통장 이야기를 해보겠습니다.',
  '',
  '## 첫 번째 소제목',
  '첫 번째 소제목의 본문 내용입니다.',
  '',
  '## 두 번째 소제목',
  '두 번째 소제목의 본문 내용입니다.',
  '',
  '## 세 번째 소제목',
  '세 번째 소제목의 본문 내용입니다.',
].join('\n');

const RENAMED = '고친 첫 번째 소제목';

test.beforeAll(async () => {
  testProfile = await createElectronTestProfile('bln-heading-apply-e2e-');
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

test('소제목 편집이 구조 미리보기까지 도달한다', async () => {
  const report = await mainWindow.evaluate(async (input: { body: string; renamed: string }) => {
    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    /*
     * 고정 대기는 게이트 전체를 돌릴 때(앞선 스위트로 머신이 바쁠 때) 흔들린다 —
     * 실제로 단독 실행은 통과하고 게이트에서만 실패했다. 조건이 참이 될 때까지 폴링한다.
     */
    const until = async (check: () => boolean, budgetMs = 20000): Promise<void> => {
      const deadline = Date.now() + budgetMs;
      while (Date.now() < deadline) {
        if (check()) return;
        await wait(200);
      }
    };
    const previewHtml = () => document.getElementById('unified-integrated-preview')?.innerHTML || '';
    // 구조 미리보기의 소제목 카드 제목만 뽑는다.
    const cards = () => Array.from(previewHtml().matchAll(/📝 ([^<]+)</g)).map((m) => m[1].trim());
    const panelTitles = () => Array.from(
      document.querySelectorAll('#heading-list input[data-heading-line]'),
    ).map((el) => (el as HTMLInputElement).value);

    const textarea = document.getElementById('unified-generated-content') as HTMLTextAreaElement | null;
    if (!textarea) return { error: 'no textarea' };

    textarea.value = input.body;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await until(() => panelTitles().length === 3 && cards().length === 3);

    const panelTitlesBefore = panelTitles();
    const cardsBefore = cards();

    // 1) 해제 — 적용을 누르지 않는다.
    const unmark = document.querySelectorAll('#heading-list button[data-heading-unmark]');
    if (unmark.length < 3) return { error: `panel rows: ${unmark.length}` };
    (unmark[2] as HTMLButtonElement).click();
    await until(() => cards().length === 2);
    const cardsAfterUnmark = cards();

    // 2) 이름 수정 — 역시 적용 없이.
    const first = document.querySelector('#heading-list input[data-heading-line]') as HTMLInputElement | null;
    if (!first) return { error: 'no rename input' };
    first.value = input.renamed;
    first.dispatchEvent(new Event('change', { bubbles: true }));
    await until(() => cards()[0] === input.renamed);
    const cardsAfterRename = cards();

    // 3) 적용 버튼.
    (document.getElementById('heading-apply-to-preview') as HTMLButtonElement | null)?.click();
    await until(() => cards().length === 2 && cards()[0] === input.renamed);
    // 적용 뒤 뒤늦게 덮어쓰는 경로가 없는지 한 박자 더 본다.
    await wait(1200);

    return {
      panelTitlesBefore,
      panelTitlesEnd: panelTitles(),
      cardsBefore,
      cardsAfterUnmark,
      cardsAfterRename,
      cardsAfterApply: cards(),
      previewSectionDisplay: (document.getElementById('unified-preview-section') as HTMLElement | null)?.style.display,
      structuredHeadings: ((window as any).currentStructuredContent?.headings || [])
        .map((h: any) => String(h?.title || '')),
    };
  }, { body: BODY, renamed: RENAMED });

  console.log('[E2E] report:', JSON.stringify(report, null, 2));

  expect((report as any).error).toBeUndefined();
  expect((report as any).previewSectionDisplay).toBe('block');
  expect((report as any).panelTitlesBefore).toHaveLength(3);
  expect((report as any).cardsBefore).toEqual(['첫 번째 소제목', '두 번째 소제목', '세 번째 소제목']);
  // 적용을 누르지 않아도 미리보기가 따라와야 한다.
  expect((report as any).cardsAfterUnmark).toEqual(['첫 번째 소제목', '두 번째 소제목']);
  expect((report as any).cardsAfterRename).toEqual([RENAMED, '두 번째 소제목']);
  // 적용을 눌러도 같은 상태를 유지한다.
  expect((report as any).cardsAfterApply).toEqual([RENAMED, '두 번째 소제목']);
  expect((report as any).structuredHeadings).toEqual([RENAMED, '두 번째 소제목']);
});
