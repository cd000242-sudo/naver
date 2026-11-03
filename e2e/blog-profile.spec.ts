/**
 * [2026-10-21] 블로그별 초기 설정 · 성과 환류 — 실제 UI · preload · IPC 를 격리 프로필로 끝까지 돈다.
 * 같은 라이선스 아래 두 블로그 계정을 만들고, 한 계정에만 설정을 저장한 뒤 앱을 다시 켜도 남는지,
 * 다른 계정에 섞이지 않는지, 성과 CSV(이 블로그 글만)를 가져오면 요약이 보이는지, 블로그 주소를 바꾸면
 * 옛 설정을 쓰지 않는다고 알려 주는지 확인한다. 네이버 창은 열지 않고 실제 생성 · 발행도 하지 않는다.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { closeElectronTestSession, createElectronTestProfile, waitForMainWindow, closeElectronApp, type ElectronTestProfile } from './electronTestUtils';

let app: ElectronApplication; let page: Page; let profile: ElectronTestProfile;
let carId: string; let issueId: string;
const shots = path.join(__dirname, '..', 'tmp');
const launch = async () => {
  app = await electron.launch({ args: [path.join(__dirname, '..', 'dist', 'main.js')], cwd: path.join(__dirname, '..'), timeout: 60_000, env: { ...process.env, ...profile.env } });
  page = await waitForMainWindow(app);
  await page.waitForFunction(() => typeof (window as any).api?.getBlogProfile === 'function' && typeof (window as any).loadMainAccountList === 'function');
};
const apiProfile = (id: string) => page.evaluate(async (wanted) => (window as any).api.getBlogProfile(wanted), id);
const openSettings = async (id: string) => {
  await page.locator('#main-manage-accounts-btn').click();
  const dialog = page.locator('#account-manage-window');
  await expect(dialog).toBeVisible();
  await dialog.locator(`[data-account-id="${id}"]`).getByRole('button', { name: '블로그 설정', exact: true }).click();
  await expect(dialog.locator('#account-manage-title')).toContainText('블로그 설정');
  return dialog;
};
const closeDialog = async () => { await page.locator('#account-manage-window [data-action="close"]').click(); };

test.beforeAll(async () => {
  await fs.mkdir(shots, { recursive: true });
  profile = await createElectronTestProfile('bln-blog-profile-e2e-');
  // 앱 발행 기록 — 3일 전 발행했는데 성과를 아직 안 넣은 글 1편(발행 대조 목록에 떠야 한다)
  const published = [{ id: 'e2e_pub_1', publishedAt: new Date(Date.now() - 74 * 3_600_000).toISOString(), keyword: '경고등', mode: 'homefeed',
    blogId: 'e2e_car_blog', logNo: '224450000009', url: 'https://blog.naver.com/e2e_car_blog/224450000009', title: '경고등 점등 후 할 일',
    evaluator: { finalScore: 80, modeScore: 80, safetyScore: 80, humanlikeScore: 70, decision: 'pass', details: {} }, exposureChecks: [] }];
  await fs.mkdir(String(profile.env.E2E_USER_DATA_DIR), { recursive: true });
  await fs.writeFile(path.join(String(profile.env.E2E_USER_DATA_DIR), 'published-posts.json'), JSON.stringify(published), 'utf8');
  await launch();
  [carId, issueId] = await page.evaluate(async () => {
    const add = async (name: string, blog: string, login: string) => {
      const result = await (window as any).api.addBlogAccount(name, blog, login, 'fixture-only', {});
      if (!result.success) throw new Error('fixture account failed');
      return result.account.id as string;
    };
    const ids = [await add('E2E 자동차', 'e2e_car_blog', 'e2e_car_login'), await add('E2E 이슈', 'e2e_issue_blog', 'e2e_issue_login')];
    await (window as any).loadMainAccountList();
    return ids;
  });
});
test.afterAll(async () => { await closeElectronTestSession(app, profile); });

test('save a profile for one blog, restart, keep blogs separate, import its performance, detect a moved blog', async () => {
  test.setTimeout(240_000);
  // 1) 새 블로그 — 설정 없음 안내
  let dialog = await openSettings(carId);
  await expect(dialog).toContainText('아직 설정이 없습니다');
  // 2) 입력 · 저장
  await dialog.locator('input[name="blog-profile-intent"][value="search"]').check();
  const fields = dialog.locator('form label');
  await fields.filter({ hasText: '다루는 주제' }).locator('textarea').fill('자동차 고장\n수입차 관리');
  await fields.filter({ hasText: '다루지 않을 주제' }).locator('textarea').fill('보험 영업');
  await fields.filter({ hasText: '주 독자' }).locator('input').fill('차를 처음 산 30대');
  await fields.filter({ hasText: '독자 질문' }).locator('textarea').fill('트렁크 경고음이 왜 날까');
  await fields.filter({ hasText: '주로 확인할 1차 출처' }).locator('textarea').fill('제조사 | https://www.hyundai.com/kr/ko');
  await page.screenshot({ path: path.join(shots, 'blog-profile-form-e2e.png') });
  await dialog.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.locator('#account-manage-notice')).toContainText('블로그 설정을 저장했습니다(버전 1)');
  const saved = await apiProfile(carId);
  expect(saved.profile).toMatchObject({ intent: 'search', boundBlogId: 'e2e_car_blog', profileVersion: 1, status: 'initial', reader: { who: '차를 처음 산 30대', questions: ['트렁크 경고음이 왜 날까'] } });
  expect(saved.profile.subject).toEqual({ topics: ['자동차 고장', '수입차 관리'], exclusions: ['보험 영업'] });
  expect((await apiProfile(issueId)).profile, 'the other blog has no profile').toBeNull();
  await closeDialog();

  // 3) 앱을 다시 켜도 남는다
  await closeElectronApp(app);
  await launch();
  expect((await apiProfile(carId)).profile.profileVersion).toBe(1);
  expect((await apiProfile(issueId)).profile).toBeNull();

  // 4) 이 블로그 성과 CSV 가져오기 — 다른 블로그 줄은 제외, 요약이 보인다
  dialog = await openSettings(carId);
  await expect(dialog).toContainText('설정 버전 1');
  const csv = ['번호,제목,발행일시_KST,발행URL,대표사진번호,24h_PV,24h_홈피드유입수,24h_홈피드비율,72h_PV,72h_홈피드유입수,7d_PV,7d_홈피드유입수,비고',
    '1,트렁크 경고음 원인,2026-10-20 08:00,https://blog.naver.com/e2e_car_blog/224450000001,1,12,0,,40,3,,,',
    '2,신차 출시 소식,2026-10-20 10:30,https://blog.naver.com/e2e_car_blog/224450000002,1,2,,,3,,,,',
    '3,남의 블로그 글,2026-10-20 12:00,https://blog.naver.com/someone_else/224450000003,1,99,,,99,,,,',
    '4,주소 없는 글,,,1,,,,,,,,'].join('\n');
  const csvPath = path.join(profile.root, 'perf.csv');
  await fs.writeFile(csvPath, csv, 'utf8');
  await dialog.locator('input[type="file"]').setInputFiles(csvPath);
  await expect(page.locator('#account-manage-notice')).toContainText('성과 4건을 가져왔습니다');
  await expect(page.locator('#account-manage-notice')).toContainText('다른 블로그 글 1줄');
  await expect(page.locator('#account-manage-notice')).toContainText('글 주소 없음 1줄');
  await expect(dialog).toContainText('발행 후 72시간: 측정 2편');
  await expect(dialog).toContainText('잘된 글: 트렁크 경고음 원인 (40)');
  await expect(dialog).toContainText('인과');
  await page.screenshot({ path: path.join(shots, 'blog-profile-performance-e2e.png') });
  const summary = await page.evaluate(async (id) => (window as any).api.getBlogPerformanceSummary(id), issueId);
  expect(summary.digest.windows, 'the other blog sees no performance').toEqual([]);
  await expect(dialog.getByRole('button', { name: '최근 글로 추천 받기' })).toBeVisible();
  // 발행 기록과 대조 — 3일 전 발행했는데 측정이 없는 글이 목록에 뜨고, 그 자리에서 숫자를 넣으면 요약에 들어간다
  const pendingRow = dialog.locator('[data-post-id="224450000009"]');
  await expect(pendingRow).toContainText('경고등 점등 후 할 일 · 발행 후 24시간');
  await pendingRow.getByLabel('조회수').fill('30');
  await pendingRow.getByLabel('홈판').fill('0');
  await pendingRow.getByRole('button', { name: '기록' }).click();
  await expect(page.locator('#account-manage-notice')).toContainText('발행 후 24시간 성과를 기록했습니다');
  await expect(dialog).toContainText('발행 후 24시간: 측정 3편');
  await expect(pendingRow).toContainText('발행 후 72시간');
  await page.screenshot({ path: path.join(shots, 'blog-profile-pending-e2e.png') });
  await closeDialog();

  // 5) 블로그 주소가 바뀌면 옛 설정을 쓰지 않는다고 알린다
  await page.evaluate(async (id) => {
    const result = await (window as any).api.updateBlogAccount(id, { blogId: 'e2e_moved_blog' });
    if (!result?.success) throw new Error('update failed');
  }, carId);
  const moved = await apiProfile(carId);
  expect(moved.profile).toBeNull();
  expect(moved.warning).toBe('BLOG_PROFILE_BINDING_MISMATCH');
  dialog = await openSettings(carId);
  await expect(dialog).toContainText('다른 블로그 주소로 만든 것이라 지금은 쓰지 않습니다');
  await page.screenshot({ path: path.join(shots, 'blog-profile-moved-e2e.png') });
});
