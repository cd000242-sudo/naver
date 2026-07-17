import { describe, expect, it } from 'vitest';
import {
  createGenerationRouteSnapshot,
  type GenerationRouteSnapshot,
} from '../generation/routeSnapshot';
import {
  GenerationRunLedger,
  type GenerationRunState,
} from '../generation/runLedger';

const createRouteSnapshot = (runId: string) => createGenerationRouteSnapshot({
  runId,
  accountId: 'blog-account-1',
  promptVersion: 'prompt-v1',
  promptHash: 'sha256:prompt-v1',
  text: {
    routeId: 'codex-mcp-text',
    mode: 'mcp',
    connectorId: 'codex',
    capability: 'text.generate',
    toolOrModelId: 'generate_post',
    billingKind: 'subscription',
  },
  image: {
    routeId: 'comfy-local-image',
    mode: 'mcp',
    connectorId: 'comfy-local',
    capability: 'image.generate.text',
    toolOrModelId: 'generate_image',
    billingKind: 'local-compute',
  },
});

const createTextOnlyRouteSnapshot = (runId: string) => createGenerationRouteSnapshot({
  runId,
  accountId: 'blog-account-1',
  promptVersion: 'prompt-v1',
  promptHash: 'sha256:prompt-v1',
  text: {
    routeId: 'codex-mcp-text',
    mode: 'mcp',
    connectorId: 'codex',
    capability: 'text.generate',
    toolOrModelId: 'generate_post',
    billingKind: 'subscription',
  },
});

function advanceTextToReady(ledger: GenerationRunLedger, runId: string): void {
  ledger.transition(runId, 'PREFLIGHT_OK');
  ledger.markExternalSubmission(runId, { stage: 'text', requestId: 'text-request-1' });
  ledger.markExternalPending(runId, 'text');
  ledger.recordExternalResult(runId, { stage: 'text', outcome: 'ready' });
}

describe('GenerationRunLedger', () => {
  it('creates a run only from an immutable route snapshot and keeps a frozen snapshot record', () => {
    const ledger = new GenerationRunLedger();
    const routeSnapshot = createRouteSnapshot('run-immutable');

    const record = ledger.create(routeSnapshot);

    expect(record.state).toBe('CREATED');
    expect(record.routeSnapshot).toEqual(routeSnapshot);
    expect(Object.isFrozen(record)).toBe(true);
    expect(Object.isFrozen(record.routeSnapshot)).toBe(true);
    expect(Object.isFrozen(record.routeSnapshot.text)).toBe(true);

    const mutableSnapshot = {
      ...routeSnapshot,
      text: { ...routeSnapshot.text },
    } as GenerationRouteSnapshot;

    expect(() => ledger.create(mutableSnapshot)).toThrow(/immutable/i);
  });

  it('rejects duplicate run IDs without replacing the original record', () => {
    const ledger = new GenerationRunLedger();
    const original = ledger.create(createRouteSnapshot('run-duplicate'));

    expect(() => ledger.create(createRouteSnapshot('run-duplicate'))).toThrow(/already exists/i);
    expect(ledger.get('run-duplicate')).toBe(original);
  });

  it('allows only legal monotonic state transitions', () => {
    const ledger = new GenerationRunLedger();
    ledger.create(createRouteSnapshot('run-state-machine'));

    expect(() => ledger.transition('run-state-machine', 'TEXT_READY')).toThrow(/illegal transition/i);

    const preflight = ledger.transition('run-state-machine', 'PREFLIGHT_OK');
    expect(preflight.state).toBe('PREFLIGHT_OK');
    expect(() => ledger.transition('run-state-machine', 'CREATED' as GenerationRunState))
      .toThrow(/illegal transition/i);
    expect(ledger.get('run-state-machine')?.state).toBe('PREFLIGHT_OK');
  });

  it('requires an external submission marker before accepting an external result', () => {
    const ledger = new GenerationRunLedger();
    ledger.create(createRouteSnapshot('run-submission-contract'));
    ledger.transition('run-submission-contract', 'PREFLIGHT_OK');

    expect(() => ledger.recordExternalResult('run-submission-contract', {
      stage: 'text',
      outcome: 'ready',
    })).toThrow(/submission/i);

    const submitting = ledger.markExternalSubmission('run-submission-contract', {
      stage: 'text',
      requestId: 'text-request-1',
    });
    expect(submitting.state).toBe('TEXT_SUBMITTING');
    expect(submitting.submissions.text).toMatchObject({
      requestId: 'text-request-1',
      status: 'submitting',
    });

    const pending = ledger.markExternalPending('run-submission-contract', 'text');
    expect(pending.state).toBe('TEXT_PENDING');

    const completed = ledger.recordExternalResult('run-submission-contract', {
      stage: 'text',
      outcome: 'ready',
    });
    expect(completed.state).toBe('TEXT_READY');
    expect(completed.submissions.text?.status).toBe('ready');
  });

  it('preserves an UNKNOWN external result and permits status-check metadata only', () => {
    const ledger = new GenerationRunLedger();
    ledger.create(createRouteSnapshot('run-unknown'));
    ledger.transition('run-unknown', 'PREFLIGHT_OK');
    ledger.markExternalSubmission('run-unknown', { stage: 'text', requestId: 'text-timeout' });
    ledger.markExternalPending('run-unknown', 'text');

    const unknown = ledger.recordExternalResult('run-unknown', {
      stage: 'text',
      outcome: 'unknown',
      reason: 'provider timeout after request submission',
    });

    expect(unknown.state).toBe('TEXT_UNKNOWN');
    expect(unknown.submissions.text).toMatchObject({
      requestId: 'text-timeout',
      status: 'unknown',
      reason: 'provider timeout after request submission',
    });
    expect(() => ledger.markExternalSubmission('run-unknown', {
      stage: 'text',
      requestId: 'would-be-retry',
    })).toThrow(/illegal transition|unknown/i);
    expect(() => ledger.recordExternalResult('run-unknown', {
      stage: 'text',
      outcome: 'ready',
    })).toThrow(/unknown|final/i);

    const checked = ledger.recordExternalStatusCheck('run-unknown', 'text', {
      checkedAt: 1234,
      detail: 'job status remains unavailable',
    });
    expect(checked.state).toBe('TEXT_UNKNOWN');
    expect(checked.submissions.text?.statusChecks).toEqual([{
      checkedAt: 1234,
      detail: 'job status remains unavailable',
    }]);

    const defaultTimestampCheck = ledger.recordExternalStatusCheck('run-unknown', 'text');
    expect(defaultTimestampCheck.submissions.text?.statusChecks).toHaveLength(2);
    expect(defaultTimestampCheck.submissions.text?.statusChecks[1]?.checkedAt)
      .toBeGreaterThan(checked.updatedAt);
  });

  it('rejects closed result updates, non-UNKNOWN status checks, and missing image routes', () => {
    const ledger = new GenerationRunLedger();
    ledger.create(createRouteSnapshot('run-closed-submission'));
    advanceTextToReady(ledger, 'run-closed-submission');

    expect(() => ledger.markExternalPending('run-closed-submission', 'text'))
      .toThrow(/already ready/i);
    expect(() => ledger.recordExternalResult('run-closed-submission', {
      stage: 'text',
      outcome: 'ready',
    })).toThrow(/final/i);
    expect(() => ledger.recordExternalStatusCheck('run-closed-submission', 'text'))
      .toThrow(/only for unknown/i);

    ledger.create(createTextOnlyRouteSnapshot('run-without-image'));
    advanceTextToReady(ledger, 'run-without-image');
    expect(() => ledger.markExternalSubmission('run-without-image', {
      stage: 'image',
      requestId: 'must-not-fallback',
    })).toThrow(/image route is not configured/i);
  });

  it('rejects invalid status-check timestamps without changing an UNKNOWN run', () => {
    const ledger = new GenerationRunLedger();
    ledger.create(createRouteSnapshot('run-invalid-check'));
    ledger.transition('run-invalid-check', 'PREFLIGHT_OK');
    ledger.markExternalSubmission('run-invalid-check', { stage: 'text' });
    ledger.recordExternalResult('run-invalid-check', { stage: 'text', outcome: 'unknown' });

    expect(() => ledger.recordExternalStatusCheck('run-invalid-check', 'text', {
      checkedAt: -1,
    })).toThrow(/non-negative finite timestamp/i);
    expect(ledger.get('run-invalid-check')?.state).toBe('TEXT_UNKNOWN');
    expect(ledger.get('run-invalid-check')?.submissions.text?.statusChecks).toEqual([]);
  });

  it('moves through image and publish only after the preceding stage is ready', () => {
    const ledger = new GenerationRunLedger();
    ledger.create(createRouteSnapshot('run-publish'));
    advanceTextToReady(ledger, 'run-publish');

    expect(() => ledger.markExternalSubmission('run-publish', {
      stage: 'publish',
      requestId: 'publish-too-early',
    })).toThrow(/illegal transition/i);

    const imageSubmitting = ledger.markExternalSubmission('run-publish', {
      stage: 'image',
      requestId: 'image-request-1',
    });
    expect(imageSubmitting.state).toBe('IMAGE_SUBMITTING');
    ledger.markExternalPending('run-publish', 'image');
    const imagesReady = ledger.recordExternalResult('run-publish', {
      stage: 'image',
      outcome: 'ready',
    });
    expect(imagesReady.state).toBe('IMAGES_READY');

    const readyToPublish = ledger.transition('run-publish', 'READY_TO_PUBLISH');
    expect(readyToPublish.state).toBe('READY_TO_PUBLISH');
  });

  it('records a pending publish acknowledgment without changing the submitting state', () => {
    const ledger = new GenerationRunLedger();
    ledger.create(createRouteSnapshot('run-publish-pending'));
    advanceTextToReady(ledger, 'run-publish-pending');
    ledger.markExternalSubmission('run-publish-pending', {
      stage: 'image',
      requestId: 'image-request-3',
    });
    ledger.recordExternalResult('run-publish-pending', { stage: 'image', outcome: 'ready' });
    ledger.transition('run-publish-pending', 'READY_TO_PUBLISH');
    ledger.markExternalSubmission('run-publish-pending', {
      stage: 'publish',
      requestId: 'publish-request-pending',
    });

    const pending = ledger.markExternalPending('run-publish-pending', 'publish');

    expect(pending.state).toBe('PUBLISH_SUBMITTING');
    expect(pending.submissions.publish).toMatchObject({
      requestId: 'publish-request-pending',
      status: 'pending',
    });
  });

  it('never regresses PUBLISHED and retains every earlier record as immutable history', () => {
    const ledger = new GenerationRunLedger();
    const created = ledger.create(createRouteSnapshot('run-published'));
    advanceTextToReady(ledger, 'run-published');
    ledger.markExternalSubmission('run-published', { stage: 'image', requestId: 'image-request-2' });
    ledger.recordExternalResult('run-published', { stage: 'image', outcome: 'ready' });
    ledger.transition('run-published', 'READY_TO_PUBLISH');
    ledger.markExternalSubmission('run-published', { stage: 'publish', requestId: 'publish-request-1' });
    const published = ledger.recordExternalResult('run-published', {
      stage: 'publish',
      outcome: 'ready',
    });

    expect(published.state).toBe('PUBLISHED');
    expect(created.state).toBe('CREATED');
    expect(() => ledger.transition('run-published', 'PUBLISH_FAILED')).toThrow(/illegal transition/i);
    expect(() => ledger.markExternalSubmission('run-published', {
      stage: 'publish',
      requestId: 'duplicate-publish',
    })).toThrow(/illegal transition|published/i);
    expect(ledger.get('run-published')?.state).toBe('PUBLISHED');
    expect(Object.isFrozen(published.history)).toBe(true);

    expect(() => {
      (published as unknown as { state: GenerationRunState }).state = 'PUBLISH_FAILED';
    }).toThrow(TypeError);
    expect(published.state).toBe('PUBLISHED');
  });
});
