import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');

describe('main process cleanup lifecycle', () => {
  it('has one coordinated before-quit owner', () => {
    expect(source.match(/app\.on\('before-quit'/g) ?? []).toHaveLength(1);
    const block = source.slice(
      source.indexOf("app.on('before-quit'"),
      source.indexOf('// ffmpeg', source.indexOf("app.on('before-quit'")),
    );
    expect(block).toContain('event.preventDefault()');
    expect(block).toContain('_runFullCleanup(\'before-quit\')');
    expect(block).toContain('dialog.showMessageBox');
    expect(block).toContain('app.quit()');
  });

  it('puts every full-cleanup stage behind its own deadline', () => {
    expect(source).toContain("from './runtime/cleanupTimeout.js'");
    const cleanup = source.slice(
      source.indexOf('async function _runFullCleanup'),
      source.indexOf("app.on('window-all-closed'"),
    );
    expect(cleanup).toContain('runCleanupStep');
    expect(cleanup).toContain("runCleanupStep('browser sessions'");
    expect(cleanup).toContain("runCleanupStep('automation instances'");
    expect(cleanup).toContain("runCleanupStep('Flow context'");
    expect(cleanup).toContain("runCleanupStep('ImageFX context'");
    expect(cleanup).toContain("runCleanupStep('Dropshot contexts'");
    expect(cleanup).toContain("runCleanupStep('tracked child processes'");
  });

  it('includes usage flush and periodic-timer shutdown in the common cleanup', () => {
    const cleanup = source.slice(
      source.indexOf('async function _runFullCleanup'),
      source.indexOf("app.on('window-all-closed'"),
    );
    expect(cleanup).toContain('flushGeminiUsage');
    expect(cleanup).toContain('stopEventLoopWatchdog');
    expect(cleanup).toContain('stopPeriodicCheck');
  });

  it('keeps the zombie recovery lock when owned-resource cleanup is incomplete', () => {
    const cleanup = source.slice(
      source.indexOf('async function _runFullCleanup'),
      source.indexOf("app.on('window-all-closed'"),
    );
    expect(cleanup).toContain('resourceCleanupComplete');
    expect(cleanup).toContain('zombie recovery lock retained');
    expect(cleanup).toMatch(/if \(resourceCleanupComplete\)[\s\S]{0,600}clearLockOnNormalExit/);
  });
});
