import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// mirrorToSafe suppresses repeat calls for a minute, so every test loads a fresh module.
async function freshMirror(): Promise<typeof import('../main/userDataMigration').mirrorToSafe> {
  vi.resetModules();
  return (await import('../main/userDataMigration')).mirrorToSafe;
}

let base = '';
beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'bln-mirror-'));
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(base, { recursive: true, force: true });
});

function listAll(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (
    entry.isDirectory() ? listAll(join(dir, entry.name)).map((name) => `${entry.name}/${name}`) : [entry.name]
  ));
}

describe('saved agent accounts stay out of the backup mirror', () => {
  it('never copies agent-profiles, even next to files that are mirrored', async () => {
    const userData = join(base, 'userData');
    const mirror = join(base, 'mirror');
    mkdirSync(join(userData, 'agent-profiles', 'codex', 'acct-0123456789ab'), { recursive: true });
    writeFileSync(join(userData, 'agent-profiles', 'codex', 'acct-0123456789ab', 'auth.json'), '{"tokens":{"refresh_token":"SECRET"}}');
    writeFileSync(join(userData, 'agent-profiles', 'registry.json'), '{}');
    writeFileSync(join(userData, 'settings.json'), '{"ok":true}');

    (await freshMirror())(userData, mirror);

    expect(existsSync(join(mirror, 'settings.json'))).toBe(true);
    const copied = listAll(mirror);
    expect(copied.some((name) => name.includes('agent-profiles') || name.includes('auth.json') || name.includes('registry.json'))).toBe(false);
  });

  it('skips the folder by name even when it sits inside a mirrored folder', async () => {
    const userData = join(base, 'userData2');
    const mirror = join(base, 'mirror2');
    mkdirSync(join(userData, 'license', 'agent-profiles'), { recursive: true });
    writeFileSync(join(userData, 'license', 'agent-profiles', 'auth.json'), 'SECRET');
    writeFileSync(join(userData, 'license', 'license.json'), '{}');

    (await freshMirror())(userData, mirror);

    expect(existsSync(join(mirror, 'license', 'license.json'))).toBe(true);
    expect(existsSync(join(mirror, 'license', 'agent-profiles'))).toBe(false);
  });
});
