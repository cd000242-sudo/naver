import {
  ensureDropshotControls,
  isLoggedIn,
  launchBrowser,
  navigateToDropshotBoard,
  openDropshotImageWorkspace,
} from './dropshotBrowser.js';
import {
  closeTrackedDropshotContext,
  DropshotCleanupIncompleteError,
  setCached,
} from './dropshotSession.js';

async function closeContext(context: unknown): Promise<void> {
  const closed = await closeTrackedDropshotContext(context);
  if (!closed) throw new DropshotCleanupIncompleteError();
}

/**
 * Reopens the persisted Dropshot profile without a visible window and caches it
 * only after authentication, workspace, and image controls all pass.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function reopenDropshotHeadlessGenerationContext(
  profileDir: string,
  onLog?: (message: string) => void,
): Promise<any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let context: any = null;
  try {
    context = await launchBrowser(profileDir, true);
    const page = context.pages()[0] || (await context.newPage());
    const boardOpened = await navigateToDropshotBoard(page, onLog);
    if (!boardOpened) {
      throw new Error('Dropshot 사이트 연결 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.');
    }
    if (!(await isLoggedIn(page))) {
      throw new Error('Dropshot 로그인 세션을 숨김 브라우저에서 불러오지 못했습니다. 로그인 확인을 다시 실행해주세요.');
    }
    if (!(await openDropshotImageWorkspace(page, onLog))) {
      throw new Error('Dropshot 이미지 작업 화면을 숨김 브라우저에서 열지 못했습니다.');
    }

    await ensureDropshotControls(page, onLog);
    setCached(context, page);
    context = null;
    return page;
  } catch (error) {
    if (context) await closeContext(context);
    throw error;
  }
}
