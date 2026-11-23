import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const holder = vi.hoisted(() => {
  const state = { root: '', packaged: false };
  const electron = () => ({
    app: {
      getPath: () => state.root,
      getVersion: () => '0.0.0-test',
      isReady: () => true,
      whenReady: () => Promise.resolve(),
      get isPackaged() { return state.packaged; },
    },
    safeStorage: { isEncryptionAvailable: () => false },
  });
  return { state, electron };
});
vi.mock('electron', () => holder.electron());
vi.mock('./mocks/electron', () => holder.electron());

import { FIRST_RUN_ENGINE_DEFAULTS, withFirstRunEngineDefaults } from '../configFirstRunDefaults';

beforeEach(() => {
  holder.state.root = mkdtempSync(join(tmpdir(), 'bln-config-'));
  holder.state.packaged = false;
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(holder.state.root, { recursive: true, force: true });
});

const freshConfigManager = async () => {
  vi.resetModules();
  return import('../configManager');
};

describe('first-run engine defaults: Claude Code for text, Codex for images', () => {
  it('names exactly the two approved defaults', () => {
    expect(FIRST_RUN_ENGINE_DEFAULTS).toMatchObject({
      primaryGeminiTextModel: 'agent-claude',
      defaultAiProvider: 'agent-claude',
      globalImageSource: 'codex-image',
    });
  });

  it('fills only what is missing and never changes a value that is already there', () => {
    expect(withFirstRunEngineDefaults({})).toMatchObject(FIRST_RUN_ENGINE_DEFAULTS);
    const chosen = { primaryGeminiTextModel: 'claude-haiku', defaultAiProvider: 'claude', globalImageSource: 'nano-banana-2' };
    expect(withFirstRunEngineDefaults(chosen)).toEqual(chosen);
    expect(withFirstRunEngineDefaults({ globalImageSource: 'flow' })).toMatchObject({ globalImageSource: 'flow', primaryGeminiTextModel: 'agent-claude' });
  });

  it('does not mutate its input', () => {
    const input = Object.freeze({ other: 1 });
    expect(withFirstRunEngineDefaults(input)).not.toBe(input);
    expect(input).toEqual({ other: 1 });
  });

  it('applies to a person who never saved settings (no settings file)', async () => {
    const { loadConfig } = await freshConfigManager();
    expect(await loadConfig()).toMatchObject(FIRST_RUN_ENGINE_DEFAULTS);
  });

  it('applies to a first-run packaged install and writes them once', async () => {
    holder.state.packaged = true;
    const { loadConfig } = await freshConfigManager();
    expect(await loadConfig()).toMatchObject(FIRST_RUN_ENGINE_DEFAULTS);
    expect(existsSync(join(holder.state.root, 'settings.json'))).toBe(true);
  });

  it('never touches someone who already saved settings, even if they never chose an engine', async () => {
    writeFileSync(join(holder.state.root, 'settings.json'), JSON.stringify({ geminiApiKey: '', dailyPostLimit: 3 }));
    const { loadConfig } = await freshConfigManager();
    const config = await loadConfig() as Record<string, unknown>;
    expect(config.primaryGeminiTextModel).toBeUndefined();
    expect(config.globalImageSource).toBeUndefined();
  });

  it('keeps an existing choice exactly as saved', async () => {
    writeFileSync(join(holder.state.root, 'settings.json'), JSON.stringify({ primaryGeminiTextModel: 'agent-codex', globalImageSource: 'flow' }));
    const { loadConfig } = await freshConfigManager();
    const config = await loadConfig() as Record<string, unknown>;
    expect(config.primaryGeminiTextModel).toBe('agent-codex');
    expect(config.globalImageSource).toBe('flow');
  });

  it('does not treat a damaged settings file as a first run', async () => {
    writeFileSync(join(holder.state.root, 'settings.json'), '{broken json');
    const { loadConfig } = await freshConfigManager();
    const config = await loadConfig() as Record<string, unknown>;
    expect(config.primaryGeminiTextModel).toBeUndefined();
    expect(config.globalImageSource).toBeUndefined();
  });
});
