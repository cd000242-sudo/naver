import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');

function sliceBetween(start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe('main-process scheduler serialization', () => {
  it('shares one heartbeat-backed direct automation lease with manual IPC runs', () => {
    expect(source).toContain('async function acquireDirectAutomationLease');
    expect(source).toContain('getExecutionLock()');
    expect(source).toContain('AutomationService.isRunning()');
    expect(source).toContain('AutomationService.updateLastRunTime()');
    expect(source).toContain('directAutomationLeaseCoordinator.tryAcquire(owner)');
  });

  it('holds and releases a lease around SmartScheduler browser work', () => {
    const block = sliceBetween('smartScheduler.setPublishCallback', '// ✅ [v2.10.42]');
    expect(block).toContain("acquireDirectAutomationLease(`smart-scheduler:");
    expect(block).toContain('finally');
    expect(block).toContain('directLease?.release()');
    expect(block).toContain('withAbortableDeadline');
    expect(block).toContain('AutomationService.executePostCycle');
  });

  it('prevents overlapping one-minute cron ticks and serializes each due post', () => {
    const block = sliceBetween("cron.schedule('* * * * *'", "cron.schedule('*/5 * * * *'");
    expect(source).toContain('let scheduledPostsCronRunning = false');
    expect(block).toContain('if (scheduledPostsCronRunning)');
    expect(block).toContain('scheduledPostsCronRunning = true');
    expect(block).toContain("acquireDirectAutomationLease(`scheduled-post:");
    expect(block).toContain('scheduledPostsCronRunning = false');
    expect(block).toContain('directLease.release()');
    expect(block).toContain('AutomationService.set(normalizedId, schedulerAutomation)');
    expect(block).toContain('AutomationService.setCurrentInstance(schedulerAutomation)');
    expect(block).toContain('withAbortableDeadline');
  });

  it('holds the same main-process lease for the entire multi-account batch', () => {
    const block = sliceBetween(
      "ipcMain.handle('multiAccount:publish'",
      "ipcMain.handle('multiAccount:cancel'",
    );

    expect(block).toContain('acquireDirectAutomationLease(');
    expect(block).toContain('multi-account:');
    expect(block).toContain('finally');
    expect(block).toContain('multiAccountLease.release()');
  });
});
