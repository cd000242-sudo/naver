/**
 * Audit 2026-10-09 item 3: the app scheduler and SmartScheduler threw `SCHEDULED_PUBLISH_FAILED…` without the code main
 * reported, so a paused account was classified UNKNOWN and an unknown publish outcome was saved as a plain failure
 * (quota refunded, post not flagged for a manual check).
 */
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  createFailedScheduledPostState,
  createScheduledPublishError,
  type ScheduledPost,
} from '../scheduledPostsManager';

const post: ScheduledPost = {
  id: 'scheduled-1',
  title: '예약 글',
  scheduleDate: '2026-10-09 10:00',
  createdAt: '2026-10-09T00:00:00.000Z',
  status: 'publishing',
};
const stateFor = (result: Record<string, unknown>) => createFailedScheduledPostState(post, createScheduledPublishError(result as never));

describe('createScheduledPublishError', () => {
  it('carries the failure code and the real reason from the main result', () => {
    const error = createScheduledPublishError({ success: false, message: '[NETWORK_WAIT] 글쓰기 화면을 확인하지 못했습니다.', failureCode: 'NETWORK_WAIT' }) as Error & Record<string, unknown>;
    expect(error.code).toBe('NETWORK_WAIT');
    expect(error.message).toContain('글쓰기 화면을 확인하지 못했습니다');
  });

  it('keeps the old text when main gave neither a message nor a code', () => {
    const error = createScheduledPublishError({ success: false }) as Error & Record<string, unknown>;
    expect(error.message).toContain('SCHEDULED_PUBLISH_FAILED');
    expect(error.code).toBeUndefined();
  });
});

describe('scheduled post state after a failed run', () => {
  it('reports a paused account as that stop, not UNKNOWN', () => {
    const state = stateFor({ success: false, message: '[LOGIN_REQUIRED] 네이버 로그인이 필요합니다', failureCode: 'LOGIN_REQUIRED' });
    expect(state.status).toBe('failed');
    expect(state.failureCode).toBe('LOGIN_REQUIRED');
    expect(state.error).toContain('네이버 로그인이 필요합니다');
  });

  it('saves a genuinely unknown outcome as uncertain so the quota is kept and the user checks Naver', () => {
    const state = stateFor({ success: false, message: '[PUBLISH_OUTCOME_UNKNOWN] 발행 결과를 확인하지 못했습니다', failureCode: 'PUBLISH_OUTCOME_UNKNOWN' });
    expect(state.status).toBe('uncertain');
    expect(state.failureCode).toBe('PUBLISH_OUTCOME_UNKNOWN');
  });

  it('does not call a post uncertain when main refused it before opening any browser', () => {
    const state = stateFor({ success: false, message: '[PUBLISH_OUTCOME_UNKNOWN] 이전 발행 결과가 확인되지 않았습니다', failureCode: 'PUBLISH_OUTCOME_UNKNOWN', refusedBeforeStart: true });
    expect(state.status).toBe('failed');
    expect(state.failureCode).toBe('PUBLISH_OUTCOME_UNKNOWN');
  });

  it('keeps an unrelated failure as a plain failure', () => {
    const state = stateFor({ success: false, message: '에디터 로딩 실패', failureCode: 'EDITOR_NOT_READY' });
    expect(state.status).toBe('failed');
    expect(state.failureCode).toBe('EDITOR_NOT_READY');
  });

  it('still reads an unclassified failure as before', () => {
    const state = stateFor({ success: false });
    expect(state.status).toBe('failed');
  });
});

describe('scheduler wiring', () => {
  const main = fs.readFileSync(path.join(process.cwd(), 'src', 'main.ts'), 'utf8').replace(/\r\n/g, '\n');

  it('both schedulers throw the error that carries the code', () => {
    expect(main).toContain('throw createScheduledPublishError(automationResult);');
    expect(main).toContain('throw createScheduledPublishError(runResult);');
    expect(main).not.toContain("throw new Error('SCHEDULED_PUBLISH_FAILED: automation did not report success');");
    expect(main).not.toContain("throw new Error('SCHEDULED_PUBLISH_FAILED: SmartScheduler publish did not succeed');");
  });
});
