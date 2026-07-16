import { describe, expect, it } from 'vitest';
import { loadContentPolicy } from '../contentPolicy/policyLoader';
import { evaluatePublishGuard, partitionPublishGuardReasons } from '../contentPolicy/publishGuard';
import { createInitialPublicationState } from '../contentPolicy/exposureMonitor';
import { makePassPolicyResult } from './contentPolicyFixtures';

describe('PublishGuard', () => {
  it('allows only PASS results when state and cadence are safe', async () => {
    const decision = evaluatePublishGuard({
      policyResult: makePassPolicyResult(),
      state: createInitialPublicationState(),
      accountId: 'account-a',
      now: new Date('2026-01-02T12:00:00.000Z'),
      config: await loadContentPolicy(),
      env: { MIN_PUBLISH_INTERVAL_MINUTES: '30', DAILY_PUBLISH_CAP: '3' },
    });

    expect(decision.allowed).toBe(true);
    expect(decision.reasons).toEqual([]);
  });

  it('blocks when the operator paused all publishing', async () => {
    const state = { ...createInitialPublicationState(), status: 'PAUSED' as const, pause_reason: 'manual stop' };
    const decision = evaluatePublishGuard({
      policyResult: makePassPolicyResult(),
      state,
      accountId: 'account-a',
      now: new Date('2026-01-02T12:00:00.000Z'),
      config: await loadContentPolicy(),
      env: {},
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reasons).toContain('BLOCK_PUBLISH_PAUSED');
  });

  it('downgrades only the consecutive-pattern quality heuristic to a warning', () => {
    expect(partitionPublishGuardReasons([
      'BLOCK_PUBLISH_PAUSED',
      'BLOCK_MIN_PUBLISH_INTERVAL',
      'BLOCK_DAILY_PUBLISH_CAP',
      'BLOCK_CONSECUTIVE_PATTERN',
    ])).toEqual({
      blockingReasons: [
        'BLOCK_PUBLISH_PAUSED',
        'BLOCK_MIN_PUBLISH_INTERVAL',
        'BLOCK_DAILY_PUBLISH_CAP',
      ],
      advisoryReasons: ['BLOCK_CONSECUTIVE_PATTERN'],
    });
  });

  it('keeps invalid schedules and failed policy decisions as hard stops', () => {
    expect(partitionPublishGuardReasons([
      'BLOCK_INVALID_SCHEDULE_DATE',
      'BLOCK_POLICY_DECISION',
      'BLOCK_POLICY_PUBLICATION',
    ])).toEqual({
      blockingReasons: [
        'BLOCK_INVALID_SCHEDULE_DATE',
        'BLOCK_POLICY_DECISION',
        'BLOCK_POLICY_PUBLICATION',
      ],
      advisoryReasons: [],
    });
  });

  it('blocks a consecutive template, structure, or angle', async () => {
    const state = createInitialPublicationState();
    state.history = [{
      article_id: 'previous',
      account_id: 'account-a',
      published_at: '2026-01-02T10:00:00.000Z',
      template_id: 'reader-guide-v1',
      structure_type: 'decision_checklist',
      topic_angle: 'storage_and_sorting',
    }];
    const decision = evaluatePublishGuard({
      policyResult: makePassPolicyResult(),
      state,
      accountId: 'account-a',
      now: new Date('2026-01-02T12:00:00.000Z'),
      config: await loadContentPolicy(),
      env: { MIN_PUBLISH_INTERVAL_MINUTES: '30' },
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reasons).toContain('BLOCK_CONSECUTIVE_PATTERN');
  });

  it('does not let a distant future reservation block the current interval', async () => {
    const state = createInitialPublicationState();
    state.history = [{
      article_id: 'future-reservation',
      account_id: 'account-a',
      published_at: '2026-01-03T12:00:00.000Z',
      template_id: 'other-template',
      structure_type: 'other-structure',
      topic_angle: 'other-angle',
    }];

    const decision = evaluatePublishGuard({
      policyResult: makePassPolicyResult(),
      state,
      accountId: 'account-a',
      now: new Date('2026-01-02T12:00:00.000Z'),
      config: await loadContentPolicy(),
      env: { MIN_PUBLISH_INTERVAL_MINUTES: '30' },
    });

    expect(decision.reasons).not.toContain('BLOCK_MIN_PUBLISH_INTERVAL');
  });

  it('blocks when the nearest future reservation is inside the interval', async () => {
    const state = createInitialPublicationState();
    state.history = [{
      article_id: 'near-future-reservation',
      account_id: 'account-a',
      published_at: '2026-01-02T12:10:00.000Z',
      template_id: 'other-template',
      structure_type: 'other-structure',
      topic_angle: 'other-angle',
    }];

    const decision = evaluatePublishGuard({
      policyResult: makePassPolicyResult(),
      state,
      accountId: 'account-a',
      now: new Date('2026-01-02T12:00:00.000Z'),
      config: await loadContentPolicy(),
      env: { MIN_PUBLISH_INTERVAL_MINUTES: '30' },
    });

    expect(decision.reasons).toContain('BLOCK_MIN_PUBLISH_INTERVAL');
  });
});
