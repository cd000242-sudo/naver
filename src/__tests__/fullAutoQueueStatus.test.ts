/**
 * NAVER FULL AUTO — reservation queue rows (spec §21; T21).
 */
import { describe, expect, it } from 'vitest';
import { describeFullAutoQueueItem, formatFullAutoQueueWhen } from '../image/fullAuto/fullAutoQueueStatus';

describe('FULL AUTO reservation queue status', () => {
  it('T21: the spec example — READY, 4/6 generating, waiting', () => {
    const ready = describeFullAutoQueueItem({
      status: 'completed', publishMode: 'schedule', scheduleDate: '2026-09-24', scheduleTime: '18:00',
      contentMode: 'seo', imageStrategy: 'naver-homefeed', imageProgress: { done: 6, planned: 6 }, fullAutoStage: 'publishing',
    });
    expect(ready).toMatchObject({
      when: '9/24 18:00', contentModeLabel: 'SEO', imageStrategyLabel: '홈판 이미지',
      textStatus: '글 ✓', imageStatus: '이미지 6/6 ✓', finalStatus: 'READY · 네이버 예약 등록 완료', tone: 'ok',
    });

    const generating = describeFullAutoQueueItem({
      status: 'processing', publishMode: 'schedule', scheduleDate: '2026-09-24', scheduleTime: '19:30',
      contentMode: 'seo', fullAutoStage: 'images', imageProgress: { done: 4, planned: 6 },
    });
    expect(generating).toMatchObject({ when: '9/24 19:30', textStatus: '글 ✓', imageStatus: '이미지 4/6', finalStatus: '이미지 생성 중', tone: 'active' });

    const waiting = describeFullAutoQueueItem({
      status: 'pending', publishMode: 'schedule', scheduleDate: '2026-09-24', scheduleTime: '21:00', contentMode: 'homefeed',
    });
    expect(waiting).toMatchObject({
      when: '9/24 21:00', contentModeLabel: '홈판', textStatus: '글 대기', imageStatus: '예정: 썸네일 1 + 소제목 전체', finalStatus: '대기',
    });
  });

  it('a held post says so and carries the reasons', () => {
    const held = describeFullAutoQueueItem({
      status: 'image-review', publishMode: 'schedule', scheduleDate: '2026-09-24', scheduleTime: '20:00',
      imageProgress: { done: 5, planned: 6 }, imageReviewReasons: ['소제목 3 이미지 생성 실패'],
    });
    expect(held.finalStatus).toContain('이미지 검토 필요');
    expect(held.tone).toBe('warn');
    expect(held.detail).toContain('소제목 3');
    expect(held.textStatus).toBe('글 ✓');
  });

  it('writing mode and image strategy are shown separately; business is 업체, not 홈판', () => {
    expect(describeFullAutoQueueItem({ status: 'pending', contentMode: 'business' }).contentModeLabel).toBe('업체');
    expect(describeFullAutoQueueItem({ status: 'pending' }).contentModeLabel).toBe('SEO');
    expect(describeFullAutoQueueItem({ status: 'pending', imageStrategy: 'user-settings' }).imageStrategyLabel).toBe('내 이미지 설정');
    expect(describeFullAutoQueueItem({ status: 'pending', imageSource: 'skip' }).imageStrategyLabel).toBe('이미지 없음');
    expect(describeFullAutoQueueItem({ status: 'pending', headingImageScope: 'odd' }).imageStatus).toBe('예정: 썸네일 1 + 소제목 홀수');
  });

  it('date + time, not time only (combined and separate field formats)', () => {
    expect(formatFullAutoQueueWhen({ publishMode: 'schedule', scheduleDate: '2026-10-01T07:05' })).toBe('10/1 07:05');
    expect(formatFullAutoQueueWhen({ publishMode: 'publish' })).toBe('즉시');
    expect(formatFullAutoQueueWhen({ publishMode: 'draft' })).toBe('임시저장');
  });

  it('a run that skipped images because of "이미지 없음 / 글만 발행" says so instead of showing a plan', () => {
    const skipped = describeFullAutoQueueItem({ status: 'completed', publishMode: 'schedule', imageProgress: { done: 0, planned: 0 } });
    expect(skipped.imageStatus).toBe('이미지 없음(설정)');
  });

  it('failure before the article existed is a text failure', () => {
    expect(describeFullAutoQueueItem({ status: 'failed', fullAutoStage: 'writing' })).toMatchObject({ textStatus: '글 실패', finalStatus: '실패', tone: 'error' });
  });
});
