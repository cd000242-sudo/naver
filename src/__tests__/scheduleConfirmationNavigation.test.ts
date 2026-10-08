/**
 * [2026-10-08 고객 진단 리포트] 예약 확인을 누른 뒤 6초 안에 "예약 … 완료되었습니다" 알림이 없으면 무조건 결과 미확정
 * (SCHEDULE_PUBLISH_OUTCOME_UNKNOWN)으로 멈췄다. 네이버는 예약 뒤 그런 알림 대신 글쓰기 화면을 닫고 블로그로 보낸다
 * (사장님 PC 기록 60건: 2초 시점 글쓰기 화면 45, 블로그 홈 15). 같은 블로그로 넘어간 것도 완료 증거로 본다.
 */
import { expect, it, vi } from 'vitest';
import { waitForScheduleConfirmation } from '../automation/scheduleConfirmation';

const editor = 'https://blog.naver.com/mici19?Redirect=Write&';
const noWait = async () => {};
const sequence = (...states: Array<{ url: string; notices: string[] } | Error>) => {
  const read = vi.fn();
  for (const state of states.slice(0, -1)) {
    if (state instanceof Error) read.mockRejectedValueOnce(state); else read.mockResolvedValueOnce(state);
  }
  const last = states.at(-1)!;
  if (last instanceof Error) read.mockRejectedValue(last); else read.mockResolvedValue(last);
  return read;
};

it.each([
  'https://blog.naver.com/mici19',
  'https://blog.naver.com/mici19/',
  'https://blog.naver.com/PostList.naver?blogId=mici19&categoryNo=0',
  'https://m.blog.naver.com/mici19',
])('leaving the editor for the same blog (%s) confirms the reservation', async destination => {
  const read = sequence({ url: editor, notices: [] }, { url: editor, notices: [] }, { url: destination, notices: [] });
  await expect(waitForScheduleConfirmation(read, [], noWait, editor)).resolves.toBeUndefined();
});

it('waits through the page swap (a destroyed context while navigating is not a failure)', async () => {
  const read = sequence({ url: editor, notices: [] }, new Error('Execution context was destroyed, most likely because of a navigation.'),
    new Error('Attempted to use detached Frame'), { url: 'https://blog.naver.com/mici19', notices: [] });
  await expect(waitForScheduleConfirmation(read, [], noWait, editor)).resolves.toBeUndefined();
});

it('waits longer than the old 6 seconds for the redirect', async () => {
  const states = [...Array.from({ length: 20 }, () => ({ url: editor, notices: [] })), { url: 'https://blog.naver.com/mici19', notices: [] }];
  await expect(waitForScheduleConfirmation(sequence(...states), [], noWait, editor)).resolves.toBeUndefined();
});

it.each([
  ['another blog', 'https://blog.naver.com/someone_else'],
  ['the login page', 'https://nid.naver.com/nidlogin.login'],
  ['a look-alike host', 'https://blog.naver.com.attacker.test/mici19'],
  ['the editor form itself', 'https://blog.naver.com/PostWriteForm.naver?blogId=mici19'],
])('never confirms after landing on %s', async (_label, destination) => {
  const read = sequence({ url: editor, notices: [] }, { url: destination, notices: [] });
  await expect(waitForScheduleConfirmation(read, [], noWait, editor)).rejects.toMatchObject({ code: 'SCHEDULE_PUBLISH_OUTCOME_UNKNOWN' });
});

it('an error notice keeps the reservation unknown even if the page then moves', async () => {
  const read = sequence({ url: editor, notices: ['예약 발행에 실패했습니다.'] }, { url: 'https://blog.naver.com/mici19', notices: [] });
  await expect(waitForScheduleConfirmation(read, [], noWait, editor)).rejects.toMatchObject({ code: 'SCHEDULE_PUBLISH_OUTCOME_UNKNOWN' });
});

it('staying in the editor with no notice stays unknown, with bounded polling (~30s)', async () => {
  const read = vi.fn().mockResolvedValue({ url: editor, notices: [] });
  await expect(waitForScheduleConfirmation(read, [], noWait, editor)).rejects.toMatchObject({ code: 'SCHEDULE_PUBLISH_OUTCOME_UNKNOWN' });
  expect(read.mock.calls.length).toBeGreaterThan(12);
  expect(read.mock.calls.length).toBeLessThanOrEqual(61);
});

it('a closed browser is still unknown at once', async () => {
  const read = vi.fn().mockRejectedValue(new Error('Target closed'));
  await expect(waitForScheduleConfirmation(read, [], noWait, editor)).rejects.toMatchObject({ code: 'SCHEDULE_PUBLISH_OUTCOME_UNKNOWN' });
  expect(read).toHaveBeenCalledTimes(1);
});
