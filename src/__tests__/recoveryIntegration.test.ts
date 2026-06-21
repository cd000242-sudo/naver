/**
 * SPEC-IMAGE-RECOVERY-001 integration scenarios (acceptance.md §H).
 *
 * Tests the coordinator behavior end-to-end for the three canonical paths:
 *   - Scenario A: ImageFX 401 -> R1 auto-relogin -> next heading clean
 *   - Scenario B: Flow selector multi-fallback succeeds on attempt N
 *   - Scenario C: HTTP 403 -> immediate B1 modal -> user "cancel" ends batch
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RecoveryCoordinator } from '../image/recovery/coordinator';
import { classifyError } from '../image/recovery/classifier';
import { getRecoveryMetrics } from '../image/recovery/metrics';
import type {
  ToastNotifier,
  ModalNotifier,
  CheckpointFlusher,
  HeadingContext,
  UserChoice,
  BlockingModalCode,
  ModalOptions,
} from '../image/recovery/types';

class StubToast implements ToastNotifier {
  messages: string[] = [];
  notify(m: string) { this.messages.push(m); }
}

class StubModal implements ModalNotifier {
  shown: { code: BlockingModalCode; options: ModalOptions }[] = [];
  nextChoice: UserChoice = { chosenId: 'cancel', choiceLabel: '취소', timestampMs: 0 };
  async show(code: BlockingModalCode, options: ModalOptions): Promise<UserChoice> {
    this.shown.push({ code, options });
    return this.nextChoice;
  }
}

class StubFlusher implements CheckpointFlusher {
  flushed: string[] = [];
  async flush(reason: string): Promise<void> { this.flushed.push(reason); }
}

const ctx = (i: number, engine: 'imageFx' | 'flow' = 'imageFx'): HeadingContext => ({
  headingIndex: i,
  totalHeadings: 5,
  heading: `h${i}`,
  postTitle: 'post',
  engine,
});

beforeEach(() => getRecoveryMetrics().reset());

describe('Scenario A — ImageFX 401 R1 auto recovery', () => {
  it('첫 헤딩 401 → R1 retry → 다음 헤딩 카운터 리셋', () => {
    const toast = new StubToast();
    const c = new RecoveryCoordinator({ toastNotifier: toast });

    // Heading 0: 401 → R1
    c.startHeading(ctx(0));
    let dec = c.decide({ errorMessage: 'session expired', httpStatus: 401 });
    expect(dec.action).toBe('retry');
    if (dec.action === 'retry') {
      expect(dec.tag).toBe('R1');
      c.applyRetry(dec);
    }
    expect(c.getAttempts().r1Tried).toBe(true);
    expect(toast.messages.some((m) => m.includes('R1'))).toBe(true);

    // 헤딩 1 시작 — 카운터 리셋되어야 함
    c.startHeading(ctx(1));
    expect(c.getAttempts().r1Tried).toBe(false);
    dec = c.decide({ errorMessage: 'session expired', httpStatus: 401 });
    if (dec.action === 'retry') {
      expect(dec.tag).toBe('R1'); // 다시 시도 가능
    } else {
      throw new Error('새 헤딩에서 R1이 다시 시도되어야 함');
    }
  });

  it('같은 헤딩에서 R1 두 번째 발생은 B5 모달', async () => {
    const modal = new StubModal();
    const c = new RecoveryCoordinator({ modalNotifier: modal });
    c.startHeading(ctx(0));
    const d1 = c.decide({ errorMessage: '세션', httpStatus: 401 });
    if (d1.action === 'retry') c.applyRetry(d1);

    const d2 = c.decide({ errorMessage: '세션', httpStatus: 401 });
    expect(d2.action).toBe('block');
    if (d2.action === 'block') {
      expect(d2.modalCode).toBe('B5');
    }
  });
});

describe('Scenario B — R2 backoff sequence persists across retries', () => {
  it('503 두 번째 호출 시 4초 백오프', () => {
    const c = new RecoveryCoordinator();
    c.startHeading(ctx(0));

    const d1 = c.decide({ errorMessage: 'srv', httpStatus: 503 });
    expect(d1.action === 'retry' && d1.backoffMs).toBe(2000);
    if (d1.action === 'retry') c.applyRetry(d1);

    const d2 = c.decide({ errorMessage: 'srv', httpStatus: 503 });
    expect(d2.action === 'retry' && d2.backoffMs).toBe(4000);
    if (d2.action === 'retry') c.applyRetry(d2);

    const d3 = c.decide({ errorMessage: 'srv', httpStatus: 503 });
    expect(d3.action === 'retry' && d3.backoffMs).toBe(8000);
    if (d3.action === 'retry') c.applyRetry(d3);

    const d4 = c.decide({ errorMessage: 'srv', httpStatus: 503 });
    expect(d4.action).toBe('skip-heading');
  });
});

describe('Scenario C — HTTP 403 immediate B1 modal + user cancel', () => {
  it('403 → B1 모달 → 사용자 cancel → 메트릭에 기록', async () => {
    const modal = new StubModal();
    modal.nextChoice = { chosenId: 'cancel', choiceLabel: '취소', timestampMs: 0 };
    const flusher = new StubFlusher();
    const c = new RecoveryCoordinator({
      modalNotifier: modal,
      checkpointFlusher: flusher,
    });
    c.startHeading(ctx(0));

    const decision = c.decide({ errorMessage: 'forbidden', httpStatus: 403 });
    expect(decision.action).toBe('block');
    if (decision.action !== 'block') return;
    expect(decision.modalCode).toBe('B1');

    const choice = await c.showBlockingModal('B1', {
      title: 'X',
      message: 'Y',
      choices: [{ id: 'cancel', label: '취소' }],
    });
    expect(choice.chosenId).toBe('cancel');

    // SPEC M-4 — 모달 노출 시 flush 트리거
    expect(flusher.flushed).toContain('modal:B1');

    // SPEC D — 메트릭 기록
    const snap = getRecoveryMetrics().snapshot();
    expect(snap.modalShownCount.B1).toBe(1);
    expect(snap.userChoiceDistribution.cancel).toBe(1);
  });
});

describe('Pure classifier — silent fallback absence (C.1)', () => {
  it('decision 객체에 imageSource/subWorkProvider 단어가 없다', () => {
    const cases = [
      { errorMessage: 'safety blocked', attempts: { r1Tried: false, r2Count: 0, r3SessionDisabled: false, r4SelectorFailed: new Set<string>(), r5LoginExtended: 0, r6SmallImageRetried: false, r7AHashFailed: false, r8ColdStartFailures: 0, c4Server503Count: 0 }, context: ctx(0) },
      { errorMessage: 'forbidden', httpStatus: 403, attempts: { r1Tried: false, r2Count: 0, r3SessionDisabled: false, r4SelectorFailed: new Set<string>(), r5LoginExtended: 0, r6SmallImageRetried: false, r7AHashFailed: false, r8ColdStartFailures: 0, c4Server503Count: 0 }, context: ctx(0) },
      { errorMessage: 'srv', httpStatus: 503, attempts: { r1Tried: false, r2Count: 1, r3SessionDisabled: false, r4SelectorFailed: new Set<string>(), r5LoginExtended: 0, r6SmallImageRetried: false, r7AHashFailed: false, r8ColdStartFailures: 0 }, context: ctx(0) },
    ];
    for (const args of cases) {
      const decision = classifyError(args);
      const blob = JSON.stringify(decision);
      expect(blob).not.toContain('imageSource');
      expect(blob).not.toContain('subWorkProvider');
    }
  });
});

describe('Phase 5 — FLOW_BOT_BLOCKED fail-fast 분류', () => {
  const emptyAttempts = {
    r1Tried: false, r2Count: 0, r3SessionDisabled: false, r4SelectorFailed: new Set<string>(),
    r5LoginExtended: 0, r6SmallImageRetried: false, r7AHashFailed: false, r8ColdStartFailures: 0, c4Server503Count: 0,
  };

  it('FLOW_BOT_BLOCKED → block B3 (배치 중단 + 다른 엔진 안내)', () => {
    const decision = classifyError({
      errorCode: 'FLOW_BOT_BLOCKED',
      errorMessage: 'FLOW_BOT_BLOCKED:모든 우회 후에도 생성 거부',
      attempts: emptyAttempts,
      context: ctx(0, 'flow'),
    });
    expect(decision.action).toBe('block');
    if (decision.action !== 'block') return;
    expect(decision.modalCode).toBe('B3');
    expect(decision.errorCode).toBe('FLOW_BOT_BLOCKED');
  });

  it('FLOW_QUOTA_EXCEEDED → block B3 (무료 할당량 — 업그레이드/다른 엔진)', () => {
    const decision = classifyError({
      errorCode: 'FLOW_QUOTA_EXCEEDED',
      errorMessage: 'FLOW_QUOTA_EXCEEDED:Flow 무료 할당량 한도 도달',
      attempts: emptyAttempts,
      context: ctx(0, 'flow'),
    });
    expect(decision.action).toBe('block');
    if (decision.action !== 'block') return;
    expect(decision.modalCode).toBe('B3');
    expect(decision.errorCode).toBe('FLOW_QUOTA_EXCEEDED');
  });
});
