/**
 * SPEC-IMAGE-RECOVERY-001 acceptance tests for the recovery layer.
 *
 * Covers acceptance.md sections A.1–A.8 + C (silent fallback absence).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  classifyError,
  RECOVERY_CONSTANTS,
} from '../image/recovery/classifier';
import {
  RecoveryCoordinator,
} from '../image/recovery/coordinator';
import { getRecoveryMetrics } from '../image/recovery/metrics';
import type {
  HeadingContext,
  RecoveryAttempts,
  ModalNotifier,
  ToastNotifier,
  CheckpointFlusher,
  UserChoice,
  BlockingModalCode,
  ModalOptions,
} from '../image/recovery/types';

const baseAttempts = (): RecoveryAttempts => ({
  r1Tried: false,
  r2Count: 0,
  r3SessionDisabled: false,
  r4SelectorFailed: new Set<string>(),
  r5LoginExtended: 0,
  r6SmallImageRetried: false,
  r7AHashFailed: false,
  r8ColdStartFailures: 0,
  c4Server503Count: 0,
});

const baseContext = (overrides: Partial<HeadingContext> = {}): HeadingContext => ({
  headingIndex: 0,
  totalHeadings: 5,
  heading: 'h1',
  postTitle: '테스트 글',
  engine: 'imageFx',
  ...overrides,
});

const SILENT_FALLBACK_ID = '__should_not_exist__';

class StubToast implements ToastNotifier {
  messages: string[] = [];
  notify(message: string): void {
    this.messages.push(message);
  }
}

class StubModal implements ModalNotifier {
  shownCalls: { code: BlockingModalCode; options: ModalOptions }[] = [];
  fixedChoice: UserChoice = { chosenId: 'cancel', choiceLabel: '취소', timestampMs: 0 };
  async show(code: BlockingModalCode, options: ModalOptions): Promise<UserChoice> {
    this.shownCalls.push({ code, options });
    return this.fixedChoice;
  }
}

class StubFlusher implements CheckpointFlusher {
  flushCalls: string[] = [];
  async flush(reason: string): Promise<void> {
    this.flushCalls.push(reason);
  }
}

beforeEach(() => {
  getRecoveryMetrics().reset();
});

describe('classifyError — A.1 R1 session 401', () => {
  it('첫 401에서 R1 retry 결정', () => {
    const decision = classifyError({
      errorMessage: 'Google 세션이 만료되었습니다',
      errorCode: 'IMAGEFX_AUTH_EXPIRED',
      attempts: baseAttempts(),
      context: baseContext(),
    });
    expect(decision.action).toBe('retry');
    if (decision.action === 'retry') {
      expect(decision.tag).toBe('R1');
      expect(decision.backoffMs).toBe(0);
    }
  });

  it('R1 이미 시도된 헤딩은 즉시 모달 B5', () => {
    const attempts = baseAttempts();
    attempts.r1Tried = true;
    const decision = classifyError({
      errorMessage: 'session expired',
      httpStatus: 401,
      attempts,
      context: baseContext(),
    });
    expect(decision.action).toBe('block');
    if (decision.action === 'block') {
      expect(decision.modalCode).toBe('B5');
    }
  });
});

describe('classifyError — A.2 R2 backoff', () => {
  it('백오프 시퀀스 2/4/8초', () => {
    expect(RECOVERY_CONSTANTS.R2_BACKOFF_MS).toEqual([2000, 4000, 8000]);
  });

  it('1차 503은 R2(2초)', () => {
    const decision = classifyError({
      errorMessage: 'Google ImageFX 서버 과부하',
      httpStatus: 503,
      attempts: baseAttempts(),
      context: baseContext(),
    });
    expect(decision.action).toBe('retry');
    if (decision.action === 'retry') {
      expect(decision.tag).toBe('R2');
      expect(decision.backoffMs).toBe(2000);
    }
  });

  it('2차 503은 4초, 3차는 8초', () => {
    const a1 = baseAttempts();
    a1.r2Count = 1;
    const d2 = classifyError({ errorMessage: 'srv', httpStatus: 503, attempts: a1, context: baseContext() });
    expect(d2.action === 'retry' && d2.backoffMs).toBe(4000);

    const a2 = baseAttempts();
    a2.r2Count = 2;
    const d3 = classifyError({ errorMessage: 'srv', httpStatus: 503, attempts: a2, context: baseContext() });
    expect(d3.action === 'retry' && d3.backoffMs).toBe(8000);
  });

  it('R2 한도(3회) 초과 시 헤딩 격리', () => {
    const attempts = baseAttempts();
    attempts.r2Count = RECOVERY_CONSTANTS.R2_MAX_ATTEMPTS;
    const decision = classifyError({
      errorMessage: 'timeout',
      httpStatus: 503,
      attempts,
      context: baseContext(),
    });
    expect(decision.action).toBe('skip-heading');
  });
});

describe('classifyError — A.5 R5 login activity', () => {
  it('첫 로그인 timeout은 R5 retry로 5분 연장', () => {
    const decision = classifyError({
      errorMessage: 'Google 로그인 시간 초과 (5분)',
      errorCode: 'FLOW_LOGIN_TIMEOUT',
      attempts: baseAttempts(),
      context: baseContext({ engine: 'flow' }),
    });
    expect(decision.action).toBe('retry');
    if (decision.action === 'retry') {
      expect(decision.tag).toBe('R5');
    }
  });

  it('R5_MAX_EXTENSIONS 초과 시 B5 모달', () => {
    const attempts = baseAttempts();
    attempts.r5LoginExtended = RECOVERY_CONSTANTS.R5_MAX_EXTENSIONS;
    const decision = classifyError({
      errorMessage: 'Google 로그인 시간 초과',
      attempts,
      context: baseContext(),
    });
    expect(decision.action).toBe('block');
    if (decision.action === 'block') {
      expect(decision.modalCode).toBe('B5');
    }
  });
});

describe('classifyError — B1/B2/B3 immediate blocks', () => {
  it('HTTP 403은 즉시 B1', () => {
    const decision = classifyError({
      errorMessage: 'forbidden',
      httpStatus: 403,
      attempts: baseAttempts(),
      context: baseContext(),
    });
    expect(decision.action).toBe('block');
    if (decision.action === 'block') {
      expect(decision.modalCode).toBe('B1');
    }
  });

  it('safety 키워드는 B2', () => {
    const decision = classifyError({
      errorMessage: 'blocked by safety filter',
      attempts: baseAttempts(),
      context: baseContext(),
    });
    expect(decision.action === 'block' && decision.modalCode).toBe('B2');
  });

  it('HTTP 429는 B3', () => {
    const decision = classifyError({
      errorMessage: 'too many',
      httpStatus: 429,
      attempts: baseAttempts(),
      context: baseContext(),
    });
    expect(decision.action === 'block' && decision.modalCode).toBe('B3');
  });
});

describe('classifyError — B6 Flow UI change', () => {
  it('FLOW_NEW_PROJECT_BUTTON_NOT_FOUND은 B6', () => {
    const decision = classifyError({
      errorMessage: 'page changed',
      errorCode: 'FLOW_NEW_PROJECT_BUTTON_NOT_FOUND',
      attempts: baseAttempts(),
      context: baseContext({ engine: 'flow' }),
    });
    expect(decision.action === 'block' && decision.modalCode).toBe('B6');
  });
});

describe('RecoveryCoordinator — heading isolation (E)', () => {
  it('startHeading 호출 시 모든 카운터 리셋된다', () => {
    const c = new RecoveryCoordinator();
    c.startHeading(baseContext());
    c.applyRetry({ action: 'retry', tag: 'R1', reason: 'first', backoffMs: 0 });
    expect(c.getAttempts().r1Tried).toBe(true);

    c.startHeading(baseContext({ headingIndex: 1 }));
    expect(c.getAttempts().r1Tried).toBe(false);
    expect(c.getAttempts().r2Count).toBe(0);
  });

  it('decide 전에 startHeading 안 부르면 throw', () => {
    const c = new RecoveryCoordinator();
    expect(() =>
      c.decide({ errorMessage: 'whatever' }),
    ).toThrow(/startHeading/);
  });
});

describe('RecoveryCoordinator — toast on retry', () => {
  it('applyRetry 시 toast 1회 호출', () => {
    const toast = new StubToast();
    const c = new RecoveryCoordinator({ toastNotifier: toast });
    c.startHeading(baseContext());
    c.applyRetry({ action: 'retry', tag: 'R2', reason: '백오프 1/3', backoffMs: 2000 });
    expect(toast.messages.length).toBe(1);
    expect(toast.messages[0]).toContain('R2');
    expect(toast.messages[0]).toContain('🔄');
  });
});

describe('RecoveryCoordinator — modal flushes checkpoint (M-4)', () => {
  it('showBlockingModal 호출 시 flush 먼저 실행', async () => {
    const flusher = new StubFlusher();
    const modal = new StubModal();
    const c = new RecoveryCoordinator({
      modalNotifier: modal,
      checkpointFlusher: flusher,
    });
    c.startHeading(baseContext());
    await c.showBlockingModal('B7', {
      title: 'X',
      message: 'Y',
      choices: [{ id: 'close', label: '닫기' }],
    });
    expect(flusher.flushCalls).toContain('modal:B7');
  });

  it('modalNotifier 부재 시 fallback choice가 cancel', async () => {
    const c = new RecoveryCoordinator();
    c.startHeading(baseContext());
    const choice = await c.showBlockingModal('B7', {
      title: 'X',
      message: 'Y',
      choices: [{ id: 'a', label: 'A' }],
    });
    expect(choice.chosenId).toBe('cancel');
  });
});

describe('Silent fallback absence (C.1)', () => {
  it('classifier가 imageSource나 model을 변경하지 않는다', () => {
    const decision = classifyError({
      errorMessage: 'whatever',
      attempts: baseAttempts(),
      context: baseContext(),
    });
    expect(JSON.stringify(decision)).not.toContain('imageSource');
    expect(JSON.stringify(decision)).not.toContain('subWorkProvider');
    expect(JSON.stringify(decision)).not.toContain(SILENT_FALLBACK_ID);
  });

  it('any block decision은 사용자 choice 없이 자동 진행되지 않는다', async () => {
    const modal = new StubModal();
    modal.fixedChoice = { chosenId: 'cancel', choiceLabel: '취소', timestampMs: 0 };
    const c = new RecoveryCoordinator({ modalNotifier: modal });
    c.startHeading(baseContext());
    const choice = await c.showBlockingModal('B1', {
      title: 'X',
      message: 'Y',
      choices: [{ id: 'cancel', label: '취소' }],
    });
    expect(choice.chosenId).toBe('cancel');
    expect(modal.shownCalls.length).toBe(1);
  });
});

describe('Phase 6 — C3: IMAGEFX_QUOTA_EXCEEDED → B3 (not B4)', () => {
  it('IMAGEFX_QUOTA_EXCEEDED는 B3 모달로 분류', () => {
    const decision = classifyError({
      errorMessage: 'quota exceeded',
      errorCode: 'IMAGEFX_QUOTA_EXCEEDED',
      attempts: baseAttempts(),
      context: baseContext(),
    });
    expect(decision.action).toBe('block');
    if (decision.action === 'block') {
      expect(decision.modalCode).toBe('B3');
    }
  });

  it('PLAYWRIGHT_INSTALL_FAILED는 B4 모달로 분류', () => {
    const decision = classifyError({
      errorMessage: 'install failed',
      errorCode: 'PLAYWRIGHT_INSTALL_FAILED',
      attempts: baseAttempts(),
      context: baseContext(),
    });
    expect(decision.action === 'block' && decision.modalCode).toBe('B4');
  });
});

describe('Phase 6 — C5: R6 small image classifier', () => {
  it('FLOW_IMAGE_DOWNLOAD_TINY는 R6 retry (5초 대기)', () => {
    const decision = classifyError({
      errorMessage: '다운로드된 이미지가 비정상적으로 작음',
      errorCode: 'FLOW_IMAGE_DOWNLOAD_TINY',
      attempts: baseAttempts(),
      context: baseContext({ engine: 'flow' }),
    });
    expect(decision.action).toBe('retry');
    if (decision.action === 'retry') {
      expect(decision.tag).toBe('R6');
      expect(decision.backoffMs).toBe(5000);
    }
  });

  it('R6 이미 시도한 헤딩은 skip-heading', () => {
    const a = baseAttempts();
    a.r6SmallImageRetried = true;
    const decision = classifyError({
      errorMessage: 'tiny',
      errorCode: 'FLOW_IMAGE_DOWNLOAD_TINY',
      attempts: a,
      context: baseContext(),
    });
    expect(decision.action).toBe('skip-heading');
  });
});

describe('Phase 6 — C4: 503 storm guard', () => {
  it('503 누적 임계 도달 시 B3로 escalate', () => {
    const a = baseAttempts();
    a.c4Server503Count = 2; // 임계값 도달
    const decision = classifyError({
      errorMessage: 'service unavailable',
      httpStatus: 503,
      attempts: a,
      context: baseContext(),
    });
    expect(decision.action).toBe('block');
    if (decision.action === 'block') {
      expect(decision.modalCode).toBe('B3');
      expect(decision.errorCode).toBe('C4_STORM');
    }
  });

  it('첫 503은 R2 retry (storm 미발동)', () => {
    const decision = classifyError({
      errorMessage: 'service unavailable',
      httpStatus: 503,
      attempts: baseAttempts(),
      context: baseContext(),
    });
    expect(decision.action === 'retry' && decision.tag).toBe('R2');
  });
});

describe('Phase 6 — V2: ReDoS 방어 (긴 입력 길이 상한)', () => {
  it('1000자 이상 errorMessage는 잘려서 처리됨 (regex 폭주 없음)', () => {
    const longMsg = 'x'.repeat(2000) + 'forbidden';
    const start = Date.now();
    const decision = classifyError({
      errorMessage: longMsg,
      attempts: baseAttempts(),
      context: baseContext(),
    });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(100); // 100ms 안에 처리
    // 잘려서 'forbidden'이 사라졌으므로 skip-heading으로 분류
    expect(['block', 'skip-heading']).toContain(decision.action);
  });
});

describe('Phase 6 — C8: heading-level outcome counters', () => {
  it('headingsAttempted/Succeeded/Skipped 추적', () => {
    const metrics = getRecoveryMetrics();
    metrics.recordHeadingAttempted();
    metrics.recordHeadingAttempted();
    metrics.recordHeadingSucceeded();
    metrics.recordHeadingSkipped();
    metrics.recordBatchAborted();
    const snap = metrics.snapshot();
    expect(snap.headingsAttempted).toBe(2);
    expect(snap.headingsSucceeded).toBe(1);
    expect(snap.headingsSkipped).toBe(1);
    expect(snap.batchesAborted).toBe(1);
  });
});

describe('Recovery metrics (D)', () => {
  it('성공 시도 누적 + avgRecoveryMs 계산', () => {
    const metrics = getRecoveryMetrics();
    metrics.recordRecoveryAttempt('R1', 100, true);
    metrics.recordRecoveryAttempt('R1', 300, true);
    const snap = metrics.snapshot();
    expect(snap.r1Count).toBe(2);
    expect(snap.avgRecoveryMs).toBe(200);
  });

  it('모달 노출 횟수 + user choice 분포', () => {
    const metrics = getRecoveryMetrics();
    metrics.recordModalShown('B1');
    metrics.recordModalShown('B1');
    metrics.recordModalShown('B3');
    metrics.recordUserChoice({ chosenId: 'cancel', choiceLabel: 'X', timestampMs: 0 });
    metrics.recordUserChoice({ chosenId: 'cancel', choiceLabel: 'X', timestampMs: 0 });
    metrics.recordUserChoice({ chosenId: 'edit-prompt', choiceLabel: 'Y', timestampMs: 0 });
    const snap = metrics.snapshot();
    expect(snap.modalShownCount.B1).toBe(2);
    expect(snap.modalShownCount.B3).toBe(1);
    expect(snap.userChoiceDistribution.cancel).toBe(2);
    expect(snap.userChoiceDistribution['edit-prompt']).toBe(1);
  });
});
