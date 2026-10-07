import { createSchedulePublishOutcomeUnknownError } from './schedulePublishCommitPolicy.js';
import { parseNaverSessionUrl } from './loginPageNavigationPolicy.js';
export type ScheduleConfirmationSnapshot = { url: string; notices: string[] };
/** Ambiguous completion stays pending; never retry a potentially accepted click. */
export async function waitForScheduleConfirmation(
 read: () => Promise<ScheduleConfirmationSnapshot>, before: readonly string[], delay: (ms: number) => Promise<void>,
): Promise<void> {
 for (let attempt=0; attempt<12; attempt++) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
   const state = await Promise.race([read(), new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('confirmation timeout')),1500);})]);
   const url = parseNaverSessionUrl(state.url);
   if (!url || !['blog.naver.com','m.blog.naver.com'].includes(url.hostname)) throw Error('unexpected destination');
   const notices = state.notices.filter(text => !before.includes(text));
   if (notices.some(text => /실패|오류|불가|제한|완료되지|보호조치/.test(text))) throw Error('reservation not confirmed');
   if (notices.some(text => /예약\s*(?:발행|등록|설정)?(?:이|가)?\s*(?:완료되었습니다|완료됐습니다|되었습니다|됐습니다)/.test(text))) return;
  } catch { throw createSchedulePublishOutcomeUnknownError(); }
  finally { if (timer) clearTimeout(timer); }
  if (attempt<11) await delay(500);
 }
 throw createSchedulePublishOutcomeUnknownError();
}
