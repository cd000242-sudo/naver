import { describe, expect, it } from 'vitest';
import {
  assertRouteSnapshotMatch,
  createGenerationRouteSnapshot,
  type GenerationRouteSnapshotInput,
} from '../generation/routeSnapshot';

const baseInput: GenerationRouteSnapshotInput = {
  runId: 'run-001',
  accountId: 'account-a',
  promptVersion: 'content-v3',
  promptHash: 'prompt-hash-001',
  text: {
    routeId: 'mcp-codex-text',
    mode: 'mcp',
    connectorId: 'codex-mcp',
    capability: 'text.generate',
    toolOrModelId: 'codex',
    billingKind: 'subscription',
  },
  image: {
    routeId: 'agent-dropshot-image',
    mode: 'agent',
    connectorId: 'dropshot-browser',
    capability: 'image.generate.text',
    toolOrModelId: 'dropshot',
    billingKind: 'subscription',
  },
};

describe('GenerationRouteSnapshot', () => {
  it('creates a deeply immutable manual-only snapshot for a single run', () => {
    const snapshot = createGenerationRouteSnapshot(baseInput);

    expect(snapshot).toMatchObject({
      runId: 'run-001',
      accountId: 'account-a',
      promptVersion: 'content-v3',
      promptHash: 'prompt-hash-001',
      fallbackPolicy: 'manual-only',
      text: baseInput.text,
      image: baseInput.image,
      vision: undefined,
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.text)).toBe(true);
    expect(Object.isFrozen(snapshot.image)).toBe(true);
  });

  it('does not retain mutable references owned by the caller', () => {
    const mutableInput: GenerationRouteSnapshotInput = {
      ...baseInput,
      text: { ...baseInput.text },
    };
    const snapshot = createGenerationRouteSnapshot(mutableInput);
    mutableInput.text.connectorId = 'unexpected-provider';

    expect(snapshot.text.connectorId).toBe('codex-mcp');
  });

  it('rejects malformed or incomplete route definitions before any provider can run', () => {
    expect(() => createGenerationRouteSnapshot({
      ...baseInput,
      text: { ...baseInput.text, capability: 'image.generate.text' },
    })).toThrow(/text route/i);

    expect(() => createGenerationRouteSnapshot({
      ...baseInput,
      image: { ...baseInput.image, billingKind: 'free' as never },
    })).toThrow(/billing/i);
  });

  it('allows only the route captured when the run was created', () => {
    const snapshot = createGenerationRouteSnapshot(baseInput);

    expect(() => assertRouteSnapshotMatch(snapshot, 'text', {
      ...baseInput.text,
    })).not.toThrow();
    expect(() => assertRouteSnapshotMatch(snapshot, 'text', {
      ...baseInput.text,
      routeId: 'api-openai-text',
      mode: 'api',
      connectorId: 'openai-api',
      toolOrModelId: 'gpt-5.6',
      billingKind: 'metered-api',
    })).toThrow(/route mismatch/i);
  });
});
