import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

/**
 * Guard against the dead-router IPC pattern: handlers registered only inside
 * registerAllHandlers() are never live, because main.ts registers handler
 * groups individually and never calls the router.
 * The same failure shipped twice: v2.10.203 (SERP) and v2.11.x (blob store —
 * "No handler registered for 'blob:hasMany'", which pushed images back into
 * base64 localStorage and blew the quota).
 */
describe('main-process IPC wiring guards', () => {
  it('registers every preload-consumed handler group directly in main.ts', () => {
    const main = read('main.ts');
    for (const call of [
      'registerBlobHandlers()',
      'registerMigrationHandlers()',
      'registerRecoveryHandlers()',
      'registerSerpProbeHandlers()',
      'registerMiscHandlers()',
    ]) {
      expect(main).toContain(call);
    }
  });

  it('keeps blob channels paired between preload and main handlers', () => {
    const preload = read('preload.ts');
    const blobHandlers = read('main/ipc/blobHandlers.ts');
    const channels = ['blob:read', 'blob:has', 'blob:hasMany', 'blob:write', 'blob:materializeTempFile'];
    for (const channel of channels) {
      if (preload.includes(`'${channel}'`)) {
        expect(blobHandlers).toContain(`'${channel}'`);
      }
    }
  });
});
