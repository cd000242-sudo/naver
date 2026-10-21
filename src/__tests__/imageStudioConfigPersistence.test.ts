import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { app } from 'electron';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ root: '' }));
vi.mock('../security/safeStoragePort.js', () => ({ port: {
  isEncryptionAvailable: () => true,
  encryptString: (value: string) => Buffer.from(`test-encrypted:${value}`),
  decryptString: (value: Buffer) => value.toString().replace(/^test-encrypted:/, ''),
} }));
vi.mock('../main/userDataMigration.js', () => ({ mirrorToSafe: vi.fn(), getMirrorDir: vi.fn(() => ''), syncMasterIntoAccountSettings: vi.fn() }));

beforeEach(async () => {
  state.root = await fs.mkdtemp(path.join(os.tmpdir(), 'bln-studio-settings-test-'));
  vi.spyOn(app, 'getPath').mockImplementation(() => state.root);
});
afterEach(async () => {
  if (path.dirname(state.root) !== os.tmpdir() || !path.basename(state.root).startsWith('bln-studio-settings-test-')) throw new Error('Unexpected test cleanup path');
  await fs.rm(state.root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('studio preference migration uses the existing encrypted config lifecycle', () => {
  it('normalizes load/cache without writing decrypted secrets, then persists via encrypted save', async () => {
    const { encryptString } = await import('../security/safeStorageWrapper');
    const original = { openaiApiKey: encryptString('fixture-studio-key'), configEncrypted: true,
      aiMarkAllImages: true, thumbnailQualityMode: 'high', headingImageTextInclude: true, imageLook: 'editorial' };
    const file = path.join(state.root, 'settings.json');
    const before = JSON.stringify(original);
    await fs.writeFile(file, before);
    const { loadConfig, getConfigSync, saveConfig } = await import('../configManager');
    const loaded = await loadConfig();
    expect(loaded).toMatchObject({ openaiApiKey: 'fixture-studio-key', aiMarkAllImages: true,
      thumbnailQualityMode: 'standard', headingImageTextInclude: false, imageLook: 'stock', imageStudioPreferencesVersion: 1 });
    expect(getConfigSync()).toMatchObject({ imageStudioPreferencesVersion: 1, thumbnailQualityMode: 'standard' });
    expect(await fs.readFile(file, 'utf8')).toBe(before);
    const saved = await saveConfig({ aiMarkAllImages: false });
    expect(saved.aiMarkAllImages).toBe(false);
    const persisted = JSON.parse(await fs.readFile(file, 'utf8'));
    expect(persisted).toMatchObject({ imageStudioPreferencesVersion: 1, aiMarkAllImages: false, thumbnailQualityMode: 'standard' });
    expect(persisted.openaiApiKey).toMatch(/^enc:v1:/);
    expect((await loadConfig()).openaiApiKey).toBe('fixture-studio-key');
    expect((await loadConfig()).aiMarkAllImages).toBe(false);
  });
});
