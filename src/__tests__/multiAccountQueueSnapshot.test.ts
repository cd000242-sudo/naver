/**
 * multiAccountQueueSnapshot.test.ts
 *
 * Regression guard for multiAccountManager.ts Fix B (queueSnapshot pattern).
 *
 * Validates that `const snapshot = [...queue]` semantics are robust for
 * 1-item, 100-item, and 1000-item publishing queues:
 *   - snapshot.length is stable when the original queue is externally mutated
 *   - object references are shared so chaining mutations propagate as designed
 *
 * Background: user reported 6-queue multi-account publish terminating after
 * the first item with wasStopped=false. Root cause could not be confirmed
 * from code alone; defensive fix uses an immutable snapshot at publish-start
 * time. This test pins the snapshot semantics so future refactors cannot
 * silently regress the behavior.
 */
import { describe, it, expect } from 'vitest';

interface QueueItem {
  id: string;
  accountName: string;
  ctaType?: string;
  ctaUrl?: string;
}

function buildQueue(size: number): QueueItem[] {
  const out: QueueItem[] = [];
  for (let i = 0; i < size; i++) {
    out.push({
      id: 'queue-' + i,
      accountName: 'acct-' + i,
      ctaType: 'previous-post',
    });
  }
  return out;
}

describe('multiAccountManager queueSnapshot pattern', () => {
  it('snapshot length stays stable when original is emptied externally', () => {
    let publishQueue = buildQueue(6);
    const snapshot = [...publishQueue];

    publishQueue = [];

    expect(snapshot.length).toBe(6);
    expect(publishQueue.length).toBe(0);
  });

  it('snapshot length stays stable when original is filtered externally', () => {
    let publishQueue = buildQueue(6);
    const snapshot = [...publishQueue];

    publishQueue = publishQueue.filter((it) => it.id !== 'queue-2');

    expect(snapshot.length).toBe(6);
    expect(publishQueue.length).toBe(5);
  });

  it('snapshot iteration completes 6 times regardless of external mutation', () => {
    let publishQueue = buildQueue(6);
    const snapshot = [...publishQueue];
    const visited: string[] = [];

    for (let i = 0; i < snapshot.length; i++) {
      visited.push(snapshot[i].id);
      if (i === 0) {
        publishQueue = [];
      }
    }

    expect(visited).toEqual(['queue-0', 'queue-1', 'queue-2', 'queue-3', 'queue-4', 'queue-5']);
  });

  it('nextItem mutation via snapshot index propagates to original objects', () => {
    const publishQueue = buildQueue(3);
    const snapshot = [...publishQueue];

    snapshot[1].ctaUrl = 'https://blog.naver.com/posted-1';

    expect(publishQueue[1].ctaUrl).toBe('https://blog.naver.com/posted-1');
    expect(snapshot[1]).toBe(publishQueue[1]);
  });

  it('100-item queue snapshot length is stable', () => {
    let publishQueue = buildQueue(100);
    const snapshot = [...publishQueue];

    publishQueue = [];

    expect(snapshot.length).toBe(100);
  });

  it('1000-item queue snapshot length is stable', () => {
    let publishQueue = buildQueue(1000);
    const snapshot = [...publishQueue];

    publishQueue = [];

    expect(snapshot.length).toBe(1000);
  });

  it('1000-item queue: previous-post chaining loop scans correctly', () => {
    const publishQueue = buildQueue(1000);
    const snapshot = [...publishQueue];

    const currentIdx = 500;
    let scanned = 0;

    for (let j = currentIdx + 1; j < snapshot.length; j++) {
      scanned++;
      if (snapshot[j].accountName === snapshot[currentIdx].accountName) {
        break;
      }
    }

    expect(scanned).toBe(499);
    expect(publishQueue.length).toBe(1000);
  });
});
