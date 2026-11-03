import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PublicationStateStore } from '../contentPolicy/publicationStateStore';
import { loadContentPolicy } from '../contentPolicy/policyLoader';
import { evaluatePublicationAvailability } from '../contentPolicy/publishGuard';
import type { PublicationState } from '../contentPolicy/types';

const exactReason = 'POLICY_POST_PUBLISH_RECORD_FAILED:RECENT_POST_RECORD_INCOMPLETE';
const recoveryAdvisory = `RECOVERED_NONCRITICAL_RECORD_PAUSE:${exactReason}`;
const directories: string[] = [];
const now = new Date('2026-10-24T06:00:00.000Z');

function pausedState(): PublicationState {
  return {
    status: 'PAUSED',
    pause_reason: exactReason,
    pause_origin: 'integrity',
    paused_at: '2026-10-20T09:12:12.429Z',
    paused_templates: ['legacy-generated-post'],
    paused_structures: ['comparison_matrix'],
    confirmed_missing_streak: 2,
    history: Array.from({ length: 147 }, (_, index) => ({
      article_id: `article-${index}`,
      account_id: 'test-account',
      published_at: new Date(now.getTime() - (147 - index) * 60_000).toISOString(),
      template_id: 'legacy-generated-post',
      structure_type: 'comparison_matrix',
      topic_angle: 'test-angle',
    })),
  };
}

async function fixture(state = pausedState()) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'policy-pause-recovery-'));
  directories.push(directory);
  const store = new PublicationStateStore(directory);
  await store.save(state);
  return { store, directory, original: await fs.readFile(store.filePath, 'utf8') };
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(directories.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })));
});

describe('exact noncritical record pause recovery', () => {
  it('persists recovery while preserving all 147 history entries and scoped diagnostic evidence', async () => {
    const original = pausedState();
    const { store } = await fixture(original);
    const loaded = await store.load();
    const persisted = JSON.parse(await fs.readFile(store.filePath, 'utf8'));

    expect(loaded.status).toBe('ACTIVE');
    expect(persisted).toEqual(JSON.parse(JSON.stringify(loaded)));
    expect(loaded.history).toEqual(original.history);
    expect(loaded.paused_templates).toEqual(original.paused_templates);
    expect(loaded.paused_structures).toEqual(original.paused_structures);
    expect(loaded.confirmed_missing_streak).toBe(2);
    expect(loaded.pause_reason).toBeUndefined();
    expect(loaded.paused_at).toBeUndefined();
    expect(loaded.pause_origin).toBeUndefined();
    expect(loaded.last_advisory_reason).toBe(recoveryAdvisory);
    expect(Number.isFinite(Date.parse(loaded.last_advisory_at || ''))).toBe(true);
    expect(loaded.resume_approval).toBeUndefined();
    expect(loaded.manual_test_evidence).toBeUndefined();
    expect(original.status).toBe('PAUSED');
  });

  it.each([
    { name: 'operator', patch: { pause_origin: 'operator' } },
    { name: 'unknown origin', patch: { pause_origin: 'unknown' } },
    { name: 'missing origin', patch: { pause_origin: undefined } },
    { name: 'ledger storage error', patch: { pause_reason: 'POLICY_POST_PUBLISH_RECORD_FAILED:disk full' } },
    { name: 'additional failure detail', patch: { pause_reason: `${exactReason}:disk full` } },
    { name: 'leading whitespace', patch: { pause_reason: ` ${exactReason}` } },
    { name: 'case variation', patch: { pause_reason: exactReason.toLowerCase() } },
    { name: 'already active', patch: { status: 'ACTIVE' } },
    { name: 'unknown state', patch: { status: 'UNKNOWN' } },
  ])('leaves $name unchanged', async ({ patch }) => {
    const originalState = { ...pausedState(), ...patch } as PublicationState;
    const { store, original } = await fixture(originalState);
    const loaded = await store.load();
    expect(loaded).toEqual(originalState);
    expect(await fs.readFile(store.filePath, 'utf8')).toBe(original);
  });

  it('preserves existing approval and incident records without creating a new human approval', async () => {
    const original = {
      ...pausedState(),
      resume_approval: {
        approved_by: 'previous-reviewer', approved_at: '2026-10-01T00:00:00.000Z',
        root_cause_reviewed: true, manual_test_verified: true,
      },
      pause_incident: {
        article_id: 'earlier-exposure-incident', template_id: 'legacy-generated-post',
        structure_type: 'comparison_matrix', detected_at: '2026-10-01T00:00:00.000Z',
      },
    };
    const { store } = await fixture(original);
    const loaded = await store.load();
    expect(loaded.status).toBe('ACTIVE');
    expect(loaded.resume_approval).toEqual(original.resume_approval);
    expect(loaded.pause_incident).toEqual(original.pause_incident);
  });

  it('is persisted once and does not replace the recovery timestamp on the next load', async () => {
    const { store, directory } = await fixture();
    await store.load();
    const recovered = await fs.readFile(store.filePath, 'utf8');
    const write = vi.spyOn(fs, 'writeFile');
    expect((await new PublicationStateStore(directory).load()).status).toBe('ACTIVE');
    expect(await fs.readFile(store.filePath, 'utf8')).toBe(recovered);
    expect(write).not.toHaveBeenCalled();
  });

  it('keeps the existing ledger and pause when recovery persistence fails', async () => {
    const { store, directory, original } = await fixture();
    vi.spyOn(fs, 'rename').mockRejectedValueOnce(Object.assign(new Error('recovery write blocked'), { code: 'EACCES' }));
    await expect(store.load()).rejects.toThrow('recovery write blocked');
    expect(await fs.readFile(store.filePath, 'utf8')).toBe(original);
    expect(await fs.readdir(directory)).toEqual(['content-policy-publication-state.json']);
  });

  it('serializes a simultaneous explicit pause after recovery without losing the new pause', async () => {
    const { store, directory } = await fixture();
    const writeFile = fs.writeFile.bind(fs);
    let release!: () => void;
    let entered!: () => void;
    const gated = new Promise<void>(resolve => { release = resolve; });
    const writing = new Promise<void>(resolve => { entered = resolve; });
    const write = vi.spyOn(fs, 'writeFile').mockImplementation(async (...args) => {
      if (String(args[1]).includes(recoveryAdvisory)) {
        entered();
        await gated;
      }
      return writeFile(...args);
    });
    const recovery = store.load();
    await Promise.race([writing, recovery]);
    try {
      expect(write).toHaveBeenCalled();
      const pause = new PublicationStateStore(directory).pauseAll('new operator stop');
      release();
      await Promise.all([recovery, pause]);
    } finally { release(); }
    const final = JSON.parse(await fs.readFile(store.filePath, 'utf8'));
    expect(final.status).toBe('PAUSED');
    expect(final.pause_origin).toBe('operator');
    expect(final.pause_reason).toBe('new operator stop');
    expect(final.history).toEqual(pausedState().history);
  });

  it('reads after an already queued operator pause rather than recovering stale state', async () => {
    const { store, directory } = await fixture();
    const pause = store.pauseAll('new operator stop');
    const read = new PublicationStateStore(directory).load();
    await pause;
    expect(await read).toMatchObject({ status: 'PAUSED', pause_reason: 'new operator stop', pause_origin: 'operator' });
  });

  it.each([
    { patch: {}, approval: { approvedBy: 'reviewer', rootCauseReviewed: false, manualTestVerified: false }, error: 'ROOT_CAUSE_REVIEW_REQUIRED' },
    { patch: {}, approval: { approvedBy: '', rootCauseReviewed: true, manualTestVerified: false }, error: 'RESUME_APPROVER_REQUIRED' },
    { patch: {}, approval: { approvedBy: 'reviewer', rootCauseReviewed: true, manualTestVerified: true }, error: 'MANUAL_TEST_EVIDENCE_REQUIRED' },
    { patch: { status: 'ACTIVE' }, approval: { approvedBy: 'reviewer', rootCauseReviewed: true, manualTestVerified: true }, error: 'PUBLICATION_NOT_PAUSED' },
  ])('retains existing explicit resume validation: $error', async ({ patch, approval, error }) => {
    const state = { ...pausedState(), pause_origin: 'operator', ...patch } as PublicationState;
    const { store, original } = await fixture(state);
    await expect(store.resume(approval)).rejects.toThrow(error);
    expect(await fs.readFile(store.filePath, 'utf8')).toBe(original);
  });

  it('preserves publication interval and daily cap protections after recovery', async () => {
    const { store } = await fixture();
    const state = await store.load();
    const config = await loadContentPolicy();
    const result = evaluatePublicationAvailability({
      state, config, accountId: 'test-account', now,
      env: { [config.publication.min_interval_minutes_env]: '60', [config.publication.daily_cap_env]: '1' },
    });
    expect(result.allowed).toBe(false);
    expect(result.reasons).not.toContain('BLOCK_PUBLISH_PAUSED');
    expect(result.reasons).toContain('BLOCK_MIN_PUBLISH_INTERVAL');
    expect(result.reasons).toContain('BLOCK_DAILY_PUBLISH_CAP');
  });
});
