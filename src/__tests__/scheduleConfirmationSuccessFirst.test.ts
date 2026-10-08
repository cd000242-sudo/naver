/**
 * [2026-10-09 outcome audit] Two ways a real reservation still ended as SCHEDULE_PUBLISH_OUTCOME_UNKNOWN:
 *  (a) the notice scan ran before the "left the editor for the same blog" evidence, so an unrelated alert/status
 *      element on the blog page that happened to contain an error word (오류, 제한, ...) overrode the success;
 *  (b) the editor URL was GoBlogWrite.naver without a blogId, so the same-blog comparison had nothing to compare to.
 * Everything ambiguous (editor stays, foreign host, another blog, closed browser) must remain unknown.
 */
import { expect, it, vi } from 'vitest';
import { leftEditorForSameBlog, waitForScheduleConfirmation } from '../automation/scheduleConfirmation';

const editor = 'https://blog.naver.com/mici19?Redirect=Write&';
const bareEditor = 'https://blog.naver.com/GoBlogWrite.naver';
const noWait = async () => {};
type State = { url: string; notices: string[] };
const sequence = (...states: State[]) => {
  const read = vi.fn();
  for (const state of states.slice(0, -1)) read.mockResolvedValueOnce(state);
  read.mockResolvedValue(states.at(-1)!);
  return read;
};
const unknown = { code: 'SCHEDULE_PUBLISH_OUTCOME_UNKNOWN' };

it.each([
  '일시적인 오류가 있을 수 있습니다',
  '이웃 추가 제한 안내',
  '불가능한 요청은 처리되지 않습니다',
])('leaving the editor for the same blog wins over an unrelated alert on the new page (%s)', async (notice) => {
  const read = sequence({ url: editor, notices: [] }, { url: 'https://blog.naver.com/mici19', notices: [notice] });
  await expect(waitForScheduleConfirmation(read, [], noWait, editor)).resolves.toBeUndefined();
});

it('an error notice that is still shown inside the editor stays unknown', async () => {
  const read = sequence({ url: editor, notices: ['예약 발행에 실패했습니다.'] }, { url: editor, notices: [] });
  await expect(waitForScheduleConfirmation(read, [], noWait, editor)).rejects.toMatchObject(unknown);
});

it('an error notice on a page that is NOT this blog stays unknown', async () => {
  const read = sequence({ url: editor, notices: [] }, { url: 'https://blog.naver.com/someone_else', notices: ['오류가 발생했습니다'] });
  await expect(waitForScheduleConfirmation(read, [], noWait, editor)).rejects.toMatchObject(unknown);
});

it('a bare GoBlogWrite editor URL has no blog id of its own, so it stays unknown without an expected id', async () => {
  const read = sequence({ url: bareEditor, notices: [] }, { url: 'https://blog.naver.com/mici19', notices: [] });
  await expect(waitForScheduleConfirmation(read, [], noWait, bareEditor)).rejects.toMatchObject(unknown);
});

it.each(['mici19', 'MICI19', ' mici19 '])('the expected blog id (%s) makes the same-blog landing count when the editor URL has none', async (expected) => {
  const read = sequence({ url: bareEditor, notices: [] }, { url: bareEditor, notices: [] }, { url: 'https://blog.naver.com/mici19', notices: [] });
  await expect(waitForScheduleConfirmation(read, [], noWait, bareEditor, expected)).resolves.toBeUndefined();
});

it.each([
  ['another blog', 'https://blog.naver.com/someone_else'],
  ['the login page', 'https://nid.naver.com/nidlogin.login'],
  ['a look-alike host', 'https://blog.naver.com.attacker.test/mici19'],
  ['the editor form', 'https://blog.naver.com/PostWriteForm.naver?blogId=mici19'],
])('the expected blog id never confirms a landing on %s', async (_label, destination) => {
  const read = sequence({ url: bareEditor, notices: [] }, { url: destination, notices: [] });
  await expect(waitForScheduleConfirmation(read, [], noWait, bareEditor, 'mici19')).rejects.toMatchObject(unknown);
});

it('staying in the bare editor stays unknown even with an expected blog id', async () => {
  const read = vi.fn().mockResolvedValue({ url: bareEditor, notices: [] });
  await expect(waitForScheduleConfirmation(read, [], noWait, bareEditor, 'mici19')).rejects.toMatchObject(unknown);
  expect(read.mock.calls.length).toBeLessThanOrEqual(61);
});

it('a closed browser is still unknown at once, expected id or not', async () => {
  const read = vi.fn().mockRejectedValue(new Error('Target closed'));
  await expect(waitForScheduleConfirmation(read, [], noWait, bareEditor, 'mici19')).rejects.toMatchObject(unknown);
  expect(read).toHaveBeenCalledTimes(1);
});

it('a URL blog id wins over the expected one (the editor really opened that blog)', () => {
  expect(leftEditorForSameBlog(new URL('https://blog.naver.com/mici19'), editor, 'other_blog')).toBe(true);
  expect(leftEditorForSameBlog(new URL('https://blog.naver.com/other_blog'), editor, 'other_blog')).toBe(false);
});

it('leftEditorForSameBlog needs the expected id only when the editor URL has none', () => {
  expect(leftEditorForSameBlog(new URL('https://blog.naver.com/mici19'), bareEditor)).toBe(false);
  expect(leftEditorForSameBlog(new URL('https://blog.naver.com/mici19'), bareEditor, 'mici19')).toBe(true);
  expect(leftEditorForSameBlog(new URL('https://blog.naver.com/mici19'), bareEditor, '')).toBe(false);
  expect(leftEditorForSameBlog(new URL('https://blog.naver.com/PostList.naver?blogId=mici19'), bareEditor, 'mici19')).toBe(true);
});

it('the call site passes the expected blog id from the app configuration, not from a page', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../automation/publishHelpers.ts', import.meta.url), 'utf8');
  expect(source).toMatch(/waitForScheduleConfirmation\(readConfirmation, beforeNotices, ms => self\.delay\(ms\), beforeState\.url, [^)]*[Ee]xpectedBlogId[^)]*\)/);
  expect(source).toMatch(/getExpectedBlogId/);
});
