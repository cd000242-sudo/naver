import { createSchedulePublishOutcomeUnknownError } from './schedulePublishCommitPolicy.js';
import { parseNaverSessionUrl } from './loginPageNavigationPolicy.js';
export type ScheduleConfirmationSnapshot = { url: string; notices: string[] };

const BLOG_HOSTS = ['blog.naver.com', 'm.blog.naver.com'];
// ~30s: Naver often takes longer than the old 6s window to close the editor after a reservation.
const ATTEMPTS = 60;
const BROWSER_GONE = /target closed|session closed|browser has disconnected/i;

function isEditor(url: URL): boolean {
  return /PostWriteForm|GoBlogWrite/i.test(url.pathname) || url.searchParams.get('Redirect') === 'Write';
}
/** The blog id of a Naver blog URL: /{id}, /{id}/{logNo}, or ?blogId= on PostList/PostView/PostWriteForm. */
function blogIdOf(url: URL): string {
  const param = url.searchParams.get('blogId');
  if (param) return param.toLowerCase();
  const first = url.pathname.split('/').filter(Boolean)[0] || '';
  return /^[A-Za-z0-9_-]+$/.test(first) ? first.toLowerCase() : '';
}
/**
 * [2026-10-08 고객 진단 리포트] Naver answers a reservation by closing the editor and opening the same blog, usually
 * without a notice (owner's logs: 15 of 60 already on the blog home 2s after the click, the rest still in the editor).
 */
export function leftEditorForSameBlog(current: URL, editorUrl?: string): boolean {
  const editor = editorUrl ? parseNaverSessionUrl(editorUrl) : null;
  if (!editor || !BLOG_HOSTS.includes(editor.hostname) || isEditor(current)) return false;
  const id = blogIdOf(editor);
  return Boolean(id) && blogIdOf(current) === id;
}

/** Ambiguous completion stays pending; never retry a potentially accepted click. */
export async function waitForScheduleConfirmation(
  read: () => Promise<ScheduleConfirmationSnapshot>, before: readonly string[], delay: (ms: number) => Promise<void>,
  editorUrl?: string,
): Promise<void> {
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let state: ScheduleConfirmationSnapshot | null = null;
    try {
      state = await Promise.race([read(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error('confirmation timeout')), 1500); })]);
    } catch (error) {
      // The editor closing destroys its contexts for a moment; only a browser that is gone ends the wait.
      if (BROWSER_GONE.test(String((error as Error)?.message || error))) throw createSchedulePublishOutcomeUnknownError();
    } finally { if (timer) clearTimeout(timer); }
    if (state) {
      const url = parseNaverSessionUrl(state.url);
      if (!url || !BLOG_HOSTS.includes(url.hostname)) throw createSchedulePublishOutcomeUnknownError();
      const notices = state.notices.filter(text => !before.includes(text));
      if (notices.some(text => /실패|오류|불가|제한|완료되지|보호조치/.test(text))) throw createSchedulePublishOutcomeUnknownError();
      if (notices.some(text => /예약\s*(?:발행|등록|설정)?(?:이|가)?\s*(?:완료되었습니다|완료됐습니다|되었습니다|됐습니다)/.test(text))) return;
      if (leftEditorForSameBlog(url, editorUrl)) return;
      // Out of the editor but not on this blog (another blog, an unexpected page): never a confirmation.
      if (!isEditor(url)) throw createSchedulePublishOutcomeUnknownError();
    }
    if (attempt < ATTEMPTS - 1) await delay(500);
  }
  throw createSchedulePublishOutcomeUnknownError();
}
