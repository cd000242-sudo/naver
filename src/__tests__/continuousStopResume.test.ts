import { describe, expect, it } from 'vitest';
import { gstopBuildRecord } from '../generationStop/resumeRecord';
import { continuousStopContext, continuousStopQueueSnapshot, continuousStopRestoreQueue } from '../renderer/modules/continuousStopResume';

const info = { stage: 'image', cause: 'limit', engine: 'codex-image', detail: 'x' } as const;
const queue = () => [
  { id: 'q1', value: 'A', status: 'completed' },
  { id: 'q2', value: 'B', status: 'processing', structuredContent: { huge: 'x'.repeat(50) }, contentMode: 'affiliate' },
  { id: 'q3', value: 'C', status: 'pending' },
];

describe('연속발행 이어 가기', () => {
  it('저장용 대기열에서는 무거운 생성물을 뺀다', () => {
    const snap = continuousStopQueueSnapshot(queue());
    expect(snap[1]).not.toHaveProperty('structuredContent');
    expect(snap.map((s) => s.status)).toEqual(['completed', 'processing', 'pending']);
  });

  it('멈춤 맥락: 기록 id·멈춘 글·장부·쇼핑 여부를 담는다', () => {
    const q = queue();
    const ctx = continuousStopContext(q[1], q, () => ({ selectedTitle: 'T' }), '2번째 글');
    expect(ctx).toMatchObject({ kind: 'continuous', recordId: 'continuous-q2', stoppedItemId: 'q2', shopping: true });
    ctx.ledger!.set('k', { filePath: '/a.png' });
    expect((q[1] as any)._resumeLedger.get('k')).toEqual({ filePath: '/a.png' }); // 글에 붙어 다음 시도로 이어진다
    expect(ctx.queue!().find((e) => e.id === 'q2')).not.toHaveProperty('_resumeLedger');
  });

  it('앱을 껐다 켠 뒤: 끝난 글은 완료로, 멈춘 글부터 다시. 글·이미지 진행분을 되돌려 준다', () => {
    const q = queue();
    const ctx = continuousStopContext(q[1], q, () => ({ selectedTitle: 'T' }), '2번째 글');
    ctx.ledger!.set('k', { filePath: '/a.png' });
    const record = gstopBuildRecord({ kind: 'continuous', info, label: 'B', id: 'continuous-q2', now: 1,
      article: { selectedTitle: 'T' }, ledger: ctx.ledger!.entries(), queue: ctx.queue!(), stoppedItemId: 'q2' });
    const live: any[] = [{ id: 'old', value: 'zzz', status: 'pending' }];
    expect(continuousStopRestoreQueue(live, record)).toBe(3);
    expect(live.map((i) => i.status)).toEqual(['completed', 'pending', 'pending']);
    expect(live[1]._resumeArticle).toEqual({ selectedTitle: 'T' });
    expect(live[1]._resumeLedger.get('k')).toEqual({ filePath: '/a.png' });
  });

  it('대기열이 없는 기록은 아무것도 바꾸지 않는다', () => {
    const live: any[] = [{ id: 'keep', value: 'x', status: 'pending' }];
    const record = gstopBuildRecord({ kind: 'full-auto', info, label: 'x', id: 'r', now: 1 });
    expect(continuousStopRestoreQueue(live, record)).toBe(0);
    expect(live).toHaveLength(1);
  });
});
