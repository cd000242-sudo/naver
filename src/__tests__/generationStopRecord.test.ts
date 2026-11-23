import { describe, expect, it } from 'vitest';
import { gstopBuildRecord, gstopParseRecords, gstopQueueForResume, gstopResumeSummary } from '../generationStop/resumeRecord.js';
import type { GstopInfo } from '../generationStop/stopClassifier.js';

const info: GstopInfo = { stage: 'image', cause: 'limit', engine: 'codex-image', detail: 'x', resetAt: new Date(2026, 10, 24, 15, 20).getTime() };

describe('이어 가기 기록', () => {
  it('기록은 멈춘 단계·원인·진행분을 담는다', () => {
    const record = gstopBuildRecord({ kind: 'continuous', info, label: '키워드 A', article: { selectedTitle: 'T' },
      images: [{ filePath: '/a.png' }], now: 1000, id: 'r1', stoppedItemId: 'q2' });
    expect(record).toMatchObject({ id: 'r1', kind: 'continuous', stage: 'image', cause: 'limit', stoppedItemId: 'q2', createdAt: 1000 });
    expect(record.images).toEqual([{ filePath: '/a.png' }]);
    expect(record.summary).toContain('이미지 생성이 멈췄어요');
  });

  it('깨진 저장본은 걸러내고 정상 기록만 읽는다', () => {
    const good = gstopBuildRecord({ kind: 'daily', info, label: 'L', now: 1, id: 'g' });
    expect(gstopParseRecords([good, null, { id: 5 }, { id: 'x', kind: 'weird' }, 'text'])).toEqual([good]);
    expect(gstopParseRecords('not an array')).toEqual([]);
  });

  it('대기열: 끝난 글은 완료로 남고 멈춘 글부터 다시 시작한다', () => {
    const queue = [
      { id: 'q1', status: 'completed' }, { id: 'q2', status: 'processing' },
      { id: 'q3', status: 'pending' }, { id: 'q4', status: 'failed' },
    ];
    const next = gstopQueueForResume(queue, 'q2');
    expect(next.map((q) => q.status)).toEqual(['completed', 'pending', 'pending', 'failed']);
    expect(queue[1].status).toBe('processing'); // 원본은 바뀌지 않는다
  });

  it('카드 요약: 몇 번째 글이 어디서 멈췄는지', () => {
    const queue = [{ id: 'q1', status: 'completed' }, { id: 'q2', status: 'processing' }, { id: 'q3', status: 'pending' }];
    const record = gstopBuildRecord({ kind: 'continuous', info, label: 'A', now: 1, id: 'r', stoppedItemId: 'q2', queue });
    expect(gstopResumeSummary(record)).toBe('완료 1 · 멈춤 1 · 남음 1');
  });
});
