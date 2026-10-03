import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  migrateUserDataFolders,
  restoreFromMirrorIfEmpty,
  syncMasterIntoAccountSettings,
} from '../main/userDataMigration';

// Execute the real upgrade code without importing main.ts and starting Electron.
const source = fs.readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
const parsed = ts.createSourceFile('main.ts', source, ts.ScriptTarget.Latest, true);
const names = ['backupCredentialsFromAllSettings', 'wipeUserDataPreservingCredentials'];
const statements = parsed.statements.filter(statement =>
  (ts.isFunctionDeclaration(statement) && names.includes(statement.name?.text ?? ''))
  || (ts.isVariableStatement(statement) && statement.declarationList.declarations.some(
    declaration => ts.isIdentifier(declaration.name) && declaration.name.text === 'PRESERVE_FIELDS',
  )),
);
if (statements.length !== 3) throw new Error('Upgrade persistence harness source extraction failed');
const code = ts.transpileModule(statements.map(statement => statement.getText(parsed)).join('\n'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

type Settings = Record<string, unknown>;
type UpgradeHarness = {
  backup: (dir: string) => Promise<Settings>;
  wipe: (from: string, to: string) => Promise<void>;
};
const quietConsole = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
function upgradeHarness(dir: string): UpgradeHarness {
  return new Function('fs', 'path', 'app', 'console', `${code}\nreturn {
    backup: backupCredentialsFromAllSettings, wipe: wipeUserDataPreservingCredentials,
  };`)(fs.promises, path, { getPath: () => dir }, quietConsole);
}

let root: string;
beforeEach(() => { root = fs.mkdtempSync(path.join(tmpdir(), 'naver-hub-upgrade-')); });
afterEach(() => {
  const relative = path.relative(tmpdir(), root);
  if (relative.startsWith('naver-hub-upgrade-') && !relative.includes(path.sep)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
  vi.clearAllMocks();
});
function write(dir: string, settings: Settings, file = 'settings.json'): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, file), JSON.stringify(settings));
}
function read(dir: string, file = 'settings.json'): Settings {
  return JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
}

const fixtures = [
  { name: 'plaintext camelCase', settings: { naverHubClientId: 'fixture-hub-id', naverHubClientSecret: 'fixture-hub-secret' } },
  { name: 'encrypted camelCase', settings: { naverHubClientId: 'enc:v1:fixture-id', naverHubClientSecret: 'enc:v1:fixture-secret' } },
  { name: 'plaintext kebab-case', settings: { 'naver-hub-client-id': 'fixture-hub-id', 'naver-hub-client-secret': 'fixture-hub-secret' } },
  { name: 'encrypted kebab-case', settings: { 'naver-hub-client-id': 'enc:v1:fixture-id', 'naver-hub-client-secret': 'enc:v1:fixture-secret' } },
];

describe('Naver API HUB credentials survive a version upgrade', () => {
  for (const file of ['settings.json', 'settings_account.json']) {
    it.each(fixtures)(`${file}: preserves $name byte-for-byte through wipe and restore`, async ({ settings }) => {
      write(root, { ...settings, primaryGeminiTextModel: 'obsolete-model' }, file);
      write(root, { geminiApiKey: 'fixture-unrelated-key' }, 'settings_other.json');
      write(root, { scheduled: ['fixture-post'] }, 'scheduled-posts.json');
      const harness = upgradeHarness(root);
      expect(await harness.backup(root)).toMatchObject(settings);

      await harness.wipe('2.11.310', '2.11.311');

      expect(read(root)).toMatchObject({ ...settings, geminiApiKey: 'fixture-unrelated-key' });
      expect(read(root)).not.toHaveProperty('primaryGeminiTextModel');
      expect(fs.existsSync(path.join(root, 'settings_other.json'))).toBe(false);
      expect(read(root, 'scheduled-posts.json')).toEqual({ scheduled: ['fixture-post'] });
    });
  }

  it('uses the newest nonempty HUB values when multiple settings files exist', async () => {
    write(root, { naverHubClientId: 'old-id', naverHubClientSecret: 'old-secret' });
    write(root, { naverHubClientId: 'new-id', naverHubClientSecret: 'enc:v1:new-secret' }, 'settings_account.json');
    write(root, { naverHubClientId: '', naverHubClientSecret: '' }, 'settings_empty.json');
    ['settings.json', 'settings_account.json', 'settings_empty.json'].forEach((file, index) => {
      fs.utimesSync(path.join(root, file), 1_700_000_000 + index, 1_700_000_000 + index);
    });
    await upgradeHarness(root).wipe('2.11.310', '2.11.311');
    expect(read(root)).toMatchObject({ naverHubClientId: 'new-id', naverHubClientSecret: 'enc:v1:new-secret' });
  });

  it('leaves first-launch settings untouched', async () => {
    const settings = { naverHubClientId: 'fixture-id', primaryGeminiTextModel: 'existing-model' };
    write(root, settings);
    await upgradeHarness(root).wipe('', '2.11.311');
    expect(read(root)).toEqual(settings);
  });
});

describe('Naver API HUB credentials recover across account and backup paths', () => {
  it.each(fixtures)('syncs $name to an empty account without replacing existing account credentials', ({ settings }) => {
    write(root, settings);
    write(root, {}, 'settings_empty.json');
    const existing = { naverHubClientId: 'account-id', naverHubClientSecret: 'account-secret' };
    write(root, existing, 'settings_existing.json');
    syncMasterIntoAccountSettings(root);
    const values = Object.values(settings);
    expect(read(root, 'settings_empty.json')).toMatchObject({ naverHubClientId: values[0], naverHubClientSecret: values[1] });
    expect(read(root, 'settings_existing.json')).toEqual(existing);
  });

  it.each(fixtures)('restores a HUB-only $name mirror when no settings exist', ({ settings }) => {
    const mirror = path.join(root, 'mirror');
    const active = path.join(root, 'active');
    write(mirror, settings);
    expect(restoreFromMirrorIfEmpty(active, mirror)).toBe(true);
    expect(read(active)).toEqual(settings);
  });

  it.each(['mirror', 'sibling'])('fills missing HUB fields from %s without replacing current keys', mode => {
    const active = path.join(root, 'active');
    const backup = path.join(root, mode === 'mirror' ? 'mirror' : 'Better Life Naver');
    write(active, { geminiApiKey: 'current-key', naverHubClientId: 'current-hub-id' });
    write(backup, {
      geminiApiKey: 'old-key',
      'naver-hub-client-id': 'old-hub-id',
      'naver-hub-client-secret': 'enc:v1:fixture-backup-secret',
    });
    if (mode === 'mirror') restoreFromMirrorIfEmpty(active, backup);
    else migrateUserDataFolders(active);
    expect(read(active)).toEqual({
      geminiApiKey: 'current-key',
      naverHubClientId: 'current-hub-id',
      naverHubClientSecret: 'enc:v1:fixture-backup-secret',
    });
  });
});
