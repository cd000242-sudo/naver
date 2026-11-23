import { mkdtempSync, existsSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const holder = vi.hoisted(() => ({ root: '' }));
vi.mock('electron', () => ({ app: { getPath: () => holder.root } }));
vi.mock('./mocks/electron', () => ({ app: { getPath: () => holder.root } }));

import {
  DEFAULT_ACCOUNT_ID,
  createAgentAccountRecord,
  getActiveAgentAccountId,
  getAgentAccountDir,
  getAgentProfilesRoot,
  hasAgentAccount,
  isValidAgentAccountId,
  listAgentAccountRecords,
  removeAgentAccountRecord,
  resetAgentAccountRegistryCache,
  setActiveAgentAccount,
} from '../agentCli/accounts/accountRegistry';

beforeEach(() => {
  holder.root = mkdtempSync(join(tmpdir(), 'bln-acct-'));
  resetAgentAccountRegistryCache();
});
afterEach(() => {
  resetAgentAccountRegistryCache();
  rmSync(holder.root, { recursive: true, force: true });
});

describe('agent account registry', () => {
  it('starts on the default account and never touches disk just by reading', () => {
    expect(getActiveAgentAccountId('codex')).toBe(DEFAULT_ACCOUNT_ID);
    expect(getActiveAgentAccountId('claude')).toBe(DEFAULT_ACCOUNT_ID);
    expect(listAgentAccountRecords('codex')).toEqual([]);
    expect(existsSync(getAgentProfilesRoot())).toBe(false);
  });

  it('creates an isolated folder under agent-profiles/<provider>/<id>', () => {
    const record = createAgentAccountRecord('codex');
    expect(isValidAgentAccountId(record.id)).toBe(true);
    const dir = getAgentAccountDir('codex', record.id);
    expect(dir).toBe(join(holder.root, 'agent-profiles', 'codex', record.id));
    expect(existsSync(dir)).toBe(true);
    expect(listAgentAccountRecords('codex').map((item) => item.id)).toEqual([record.id]);
    expect(listAgentAccountRecords('claude')).toEqual([]);
    expect(hasAgentAccount('codex', record.id)).toBe(true);
    expect(hasAgentAccount('claude', record.id)).toBe(false);
  });

  it('keeps the active choice per provider and survives a cold restart', () => {
    const a = createAgentAccountRecord('codex');
    const b = createAgentAccountRecord('claude');
    setActiveAgentAccount('codex', a.id);
    expect(getActiveAgentAccountId('codex')).toBe(a.id);
    expect(getActiveAgentAccountId('claude')).toBe(DEFAULT_ACCOUNT_ID);
    resetAgentAccountRegistryCache();
    expect(getActiveAgentAccountId('codex')).toBe(a.id);
    setActiveAgentAccount('codex', DEFAULT_ACCOUNT_ID);
    setActiveAgentAccount('claude', b.id);
    resetAgentAccountRegistryCache();
    expect(getActiveAgentAccountId('codex')).toBe(DEFAULT_ACCOUNT_ID);
    expect(getActiveAgentAccountId('claude')).toBe(b.id);
  });

  it('refuses to activate an account that does not exist or belongs to another provider', () => {
    const a = createAgentAccountRecord('codex');
    expect(() => setActiveAgentAccount('claude', a.id)).toThrow();
    expect(() => setActiveAgentAccount('codex', 'acct-000000000000')).toThrow();
    expect(getActiveAgentAccountId('codex')).toBe(DEFAULT_ACCOUNT_ID);
  });

  it('rejects ids that could escape the profile folder', () => {
    for (const bad of ['../x', '..', 'default', 'acct-../..', 'ACCT-AAAAAAAAAAAA', 'acct-12', '', 'a/b', 'acct-0123456789ab/..']) {
      expect(isValidAgentAccountId(bad), bad).toBe(false);
      expect(() => getAgentAccountDir('codex', bad), bad).toThrow();
    }
  });

  it('removes only the chosen account folder and falls back to default only when the active one is removed', () => {
    const a = createAgentAccountRecord('codex');
    const b = createAgentAccountRecord('codex');
    writeFileSync(join(getAgentAccountDir('codex', a.id), 'auth.json'), '{"x":1}');
    writeFileSync(join(getAgentAccountDir('codex', b.id), 'auth.json'), '{"x":2}');
    setActiveAgentAccount('codex', a.id);

    expect(removeAgentAccountRecord('codex', b.id)).toEqual({ removedActive: false });
    expect(existsSync(getAgentAccountDir('codex', b.id))).toBe(false);
    expect(existsSync(getAgentAccountDir('codex', a.id))).toBe(true);
    expect(getActiveAgentAccountId('codex')).toBe(a.id);

    expect(removeAgentAccountRecord('codex', a.id)).toEqual({ removedActive: true });
    expect(getActiveAgentAccountId('codex')).toBe(DEFAULT_ACCOUNT_ID);
    expect(listAgentAccountRecords('codex')).toEqual([]);
  });

  it('never removes the default account', () => {
    expect(() => removeAgentAccountRecord('codex', DEFAULT_ACCOUNT_ID)).toThrow();
  });

  it('stores only ids and timestamps in the registry, never credentials', () => {
    const a = createAgentAccountRecord('claude');
    writeFileSync(join(getAgentAccountDir('claude', a.id), '.credentials.json'), '{"accessToken":"SECRET-TOKEN-VALUE"}');
    setActiveAgentAccount('claude', a.id);
    const raw = readFileSync(join(getAgentProfilesRoot(), 'registry.json'), 'utf8');
    expect(raw).not.toContain('SECRET-TOKEN-VALUE');
    expect(raw).not.toMatch(/token|password|secret|email/i);
    expect(JSON.parse(raw)).toMatchObject({ version: 1 });
  });

  it('survives a corrupt registry file by behaving like a fresh install', () => {
    mkdirSync(getAgentProfilesRoot(), { recursive: true });
    writeFileSync(join(getAgentProfilesRoot(), 'registry.json'), '{not json');
    resetAgentAccountRegistryCache();
    expect(getActiveAgentAccountId('codex')).toBe(DEFAULT_ACCOUNT_ID);
    expect(listAgentAccountRecords('codex')).toEqual([]);
    const created = createAgentAccountRecord('codex');
    expect(listAgentAccountRecords('codex').map((item) => item.id)).toEqual([created.id]);
  });

  it('ignores an active pointer to an unknown account instead of inventing a folder for it', () => {
    mkdirSync(getAgentProfilesRoot(), { recursive: true });
    writeFileSync(join(getAgentProfilesRoot(), 'registry.json'), JSON.stringify({
      version: 1, active: { codex: 'acct-aaaaaaaaaaaa' }, accounts: { codex: [], claude: [] },
    }));
    resetAgentAccountRegistryCache();
    expect(getActiveAgentAccountId('codex')).toBe(DEFAULT_ACCOUNT_ID);
  });
});
