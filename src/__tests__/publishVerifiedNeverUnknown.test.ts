/**
 * [2026-10-09 outcome audit] A real, verified publish/reservation must never end as PUBLISH_OUTCOME_UNKNOWN,
 * while anything ambiguous must stay unknown (no duplicate posts, no re-click, no editor re-open).
 *
 * These tests drive the real NaverBlogAutomation methods on a bare instance (no browser): the journal and the
 * account guard are replaced by temp-dir instances, the page is a two-method fake.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const holder = vi.hoisted(() => ({ journal: undefined as any, guard: undefined as any }));

vi.mock('../automation/publicationCommitJournal.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../automation/publicationCommitJournal.js')>()),
  getPublicationCommitJournal: () => holder.journal,
}));
vi.mock('../automation/accountExecutionGuard.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../automation/accountExecutionGuard.js')>()),
  getAccountExecutionGuard: () => holder.guard,
}));

let NaverBlogAutomation: any;
let PublicationCommitJournal: any;
let AccountExecutionGuard: any;
let tempDir = '';

const editorUrl = 'https://blog.naver.com/acc1?Redirect=Write&';
const postUrl = 'https://blog.naver.com/acc1/223000001';
const redirectUrl = 'https://blog.naver.com/acc1?Redirect=Update&categoryNo=3&logNo=223000009';
const source = readFileSync(new URL('../naverBlogAutomation.ts', import.meta.url), 'utf8');

// Importing the whole automation module graph is slow on a cold cache.
beforeAll(async () => {
  ({ NaverBlogAutomation } = await import('../naverBlogAutomation'));
  ({ PublicationCommitJournal } = await import('../automation/publicationCommitJournal.js'));
  ({ AccountExecutionGuard } = await import('../automation/accountExecutionGuard.js'));
}, 240_000);

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'publish-verified-'));
  holder.journal = new PublicationCommitJournal({ storageDir: join(tempDir, 'journal') });
  holder.guard = new AccountExecutionGuard({ storageDir: join(tempDir, 'guard') });
});
afterEach(() => {
  vi.useRealTimers();
  rmSync(tempDir, { recursive: true, force: true });
});

function makeAutomation() {
  const logs: string[] = [];
  const automation: any = Object.create(NaverBlogAutomation.prototype);
  Object.assign(automation, {
    options: { naverId: 'acc1' },
    logger: (message: string) => logs.push(message),
    publishedUrl: null,
    accountWorkId: '',
    immediatePublishCommitAttempted: false,
  });
  return { automation, logs };
}

/** Page that has landed on `url`; the post-page screen check is stubbed as passing. */
function landOn(automation: any, url: string) {
  automation.page = { url: () => url };
  automation.waitForPublishedPostPageConfirmation = async () => undefined;
}

/** What beforeIrreversibleCommit does just before the publish click. */
function submit(automation: any) {
  holder.journal.markSubmitting('acc1', automation.accountWorkId);
}

describe('a verified immediate publish is confirmed in the journal at once', () => {
  it('marks the journal confirmed (with the post URL) the moment verification succeeds', async () => {
    const { automation } = makeAutomation();
    landOn(automation, postUrl);
    let pendingAfterVerify: boolean | undefined;
    let recorded: unknown;

    await automation.withAccountExecution(async () => {
      submit(automation);
      await automation.verifyImmediatePublishOutcome(editorUrl);
      pendingAfterVerify = holder.journal.hasUnconfirmed('acc1');
      recorded = holder.journal.getConfirmed('acc1', automation.accountWorkId);
      return { success: true };
    });

    expect(pendingAfterVerify).toBe(false);
    expect(recorded).toEqual({ confirmed: true, url: postUrl });
  });

  it('a failure AFTER the verified publish keeps its own error and does not pause the account', async () => {
    const { automation } = makeAutomation();
    landOn(automation, postUrl);

    await expect(automation.withAccountExecution(async () => {
      submit(automation);
      await automation.verifyImmediatePublishOutcome(editorUrl);
      throw new Error('later step failed');
    })).rejects.toThrow('later step failed');

    expect(holder.guard.getStatus('acc1').paused).toBe(false);
    expect(holder.journal.hasUnconfirmed('acc1')).toBe(false);
  });

  it('accepts the Redirect=Update landing as the post and records the normalised URL', async () => {
    const { automation } = makeAutomation();
    landOn(automation, redirectUrl);
    let recorded: unknown;

    await automation.withAccountExecution(async () => {
      submit(automation);
      await automation.verifyImmediatePublishOutcome(editorUrl);
      recorded = holder.journal.getConfirmed('acc1', automation.accountWorkId);
      return { success: true };
    });

    expect(automation.publishedUrl).toBe('https://blog.naver.com/acc1/223000009');
    expect(recorded).toEqual({ confirmed: true, url: 'https://blog.naver.com/acc1/223000009' });
  });

  it('confirmPublicationInJournal is a no-op when nothing is pending', async () => {
    const { automation } = makeAutomation();
    automation.accountWorkId = 'job-without-submission';
    expect(() => automation.confirmPublicationInJournal()).not.toThrow();
    expect(holder.journal.hasUnconfirmed('acc1')).toBe(false);
  });
});

describe('anything ambiguous stays unknown', () => {
  it('an error before verification ends as PUBLISH_OUTCOME_UNKNOWN and pauses the account', async () => {
    const { automation } = makeAutomation();

    await expect(automation.withAccountExecution(async () => {
      submit(automation);
      throw new Error('click acknowledgement lost');
    })).rejects.toMatchObject({ code: 'PUBLISH_OUTCOME_UNKNOWN' });

    expect(holder.guard.getStatus('acc1')).toMatchObject({ paused: true, code: 'PUBLISH_OUTCOME_UNKNOWN' });
    expect(holder.journal.hasUnconfirmed('acc1')).toBe(true);
  });

  it('a post screen that cannot be confirmed is not recorded as confirmed', async () => {
    const { automation } = makeAutomation();
    automation.page = { url: () => postUrl };
    automation.waitForPublishedPostPageConfirmation = async () => { throw new Error('PUBLISH_UNCONFIRMED:post screen not readable'); };

    await expect(automation.withAccountExecution(async () => {
      submit(automation);
      await automation.verifyImmediatePublishOutcome(editorUrl);
      return { success: true };
    })).rejects.toMatchObject({ code: 'PUBLISH_OUTCOME_UNKNOWN' });

    expect(holder.journal.hasUnconfirmed('acc1')).toBe(true);
  });

  it('a landing that is still the editor is not recorded as confirmed', async () => {
    const { automation } = makeAutomation();
    landOn(automation, editorUrl);

    await expect(automation.withAccountExecution(async () => {
      submit(automation);
      await automation.verifyImmediatePublishOutcome(editorUrl);
      return { success: true };
    })).rejects.toMatchObject({ code: 'PUBLISH_OUTCOME_UNKNOWN' });
    expect(holder.journal.hasUnconfirmed('acc1')).toBe(true);
  });
});

describe('the generic unknown error no longer hides the cause', () => {
  it('logs the original error (scrubbed) before replacing it', async () => {
    const { automation, logs } = makeAutomation();

    await expect(automation.withAccountExecution(async () => {
      submit(automation);
      throw new Error('Execution context was destroyed password=hunter2');
    })).rejects.toMatchObject({ code: 'PUBLISH_OUTCOME_UNKNOWN' });

    const line = logs.find(entry => entry.includes('Execution context was destroyed'));
    expect(line).toBeDefined();
    expect(line).toContain('PUBLISH_OUTCOME_UNKNOWN');
    expect(logs.join('\n')).not.toContain('hunter2');
  });
});

describe('no editor re-activation after a verified publish or reservation', () => {
  it.each(['publish', 'schedule'])('%s mode never touches the editor frame again', async (mode) => {
    const { automation } = makeAutomation();
    automation.getAttachedFrame = vi.fn(async () => { throw new Error('editor gone'); });

    await automation.activateEditorAfterRun(mode);

    expect(automation.getAttachedFrame).not.toHaveBeenCalled();
    expect(holder.guard.getStatus('acc1').paused).toBe(false);
  });

  it('draft mode still re-activates the editor for editing', async () => {
    const { automation } = makeAutomation();
    automation.activateEditorForEditing = vi.fn(async () => undefined);
    await automation.activateEditorAfterRun('draft');
    expect(automation.activateEditorForEditing).toHaveBeenCalledTimes(1);
  });

  it('activateEditorForEditing itself can no longer throw when the frame is gone', async () => {
    const { automation } = makeAutomation();
    automation.getAttachedFrame = vi.fn(async () => { throw new Error('editor gone'); });
    await expect(automation.activateEditorForEditing()).resolves.toBeUndefined();
  });

  it('the run uses the mode-aware call and the reservation path confirms the journal after its success check', () => {
    const run = source.slice(source.indexOf('  private async runAccountInternal('));
    expect(run).not.toContain('await this.activateEditorForEditing();');
    expect(run).toContain('await this.activateEditorAfterRun(resolvedOptions.publishMode);');
    const gate = source.indexOf('if (!scheduleSuccess) {');
    const mark = source.indexOf('this.confirmPublicationInJournal();', gate);
    expect(gate).toBeGreaterThan(-1);
    expect(mark).toBeGreaterThan(gate);
    expect(mark - gate).toBeLessThan(400);
  });
});
