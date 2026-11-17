// @vitest-environment happy-dom
/**
 * [2026-11-17 owner] "처음에 엔진 선택부터 뜨는 것 없애고, 글은 클로드 코드 · 이미지는 코덱스, CLI 연동 상태만
 * 점검해서 자동 설치까지 되게." Buyers use their own subscription through the agent CLIs, so the app should be
 * usable right after launch.
 *
 * Contract:
 *   - no blocking engine window at startup;
 *   - once per install the text engine becomes Claude Code and the image engine Codex (owner decision:
 *     every existing user too); after that the user's own choice in settings is never touched again;
 *   - the three agent CLIs are installed in the background when missing;
 *   - login is never started automatically: a banner offers a [로그인] button, only for the engines in use;
 *   - nothing here ever switches to another engine when one is not ready.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AGENT_AUTO_SETUP_IMAGE_KEY,
  AGENT_AUTO_SETUP_MIGRATION_KEY,
  AGENT_AUTO_SETUP_PROVIDERS,
  AGENT_AUTO_SETUP_RETRY_MS,
  agentAutoSetupApplyImageDefault,
  agentAutoSetupApplyTextDefault,
  agentAutoSetupLoginProviders,
  agentAutoSetupNeedsMigration,
  initStartupAgentAutoSetup,
  runAgentAutoSetupInstalls,
} from '../renderer/modules/startupAgentAutoSetup';
import { AGENT_AUTO_SETUP_FAILED_PREFIX, agentAutoSetupRowText } from '../renderer/modules/startupAgentAutoSetupBanner';
import { resolveAgentRunModel, describeAgentModelLine } from '../agentCli/agentModelDefaults';

const src = (rel: string): string => readFileSync(join(process.cwd(), rel), 'utf8');
const status = (over: Record<string, unknown> = {}) => ({ success: true, status: { installed: true, loggedIn: true, available: true, ...over } });
/** A config store that behaves like config:set — a partial update merged into what is there. */
const configApi = (initial: Record<string, unknown>, options: { dropFlag?: boolean; ignoreSave?: boolean } = {}) => {
  let config = { ...initial };
  const saves: Array<Record<string, unknown>> = [];
  return {
    saves,
    read: () => config,
    getConfig: vi.fn(async () => ({ ...config })),
    saveConfig: vi.fn(async (update: Record<string, unknown>) => {
      saves.push(update);
      if (options.ignoreSave) return config;
      const next = { ...config, ...update };
      if (options.dropFlag) delete next[AGENT_AUTO_SETUP_MIGRATION_KEY];
      config = next;
      return config;
    }),
  };
};

beforeEach(() => { localStorage.clear(); document.body.innerHTML = ''; });

describe('one-time text default', () => {
  it('switches an existing user to Claude Code once, saving only its own fields', async () => {
    const api = configApi({ primaryGeminiTextModel: 'gemini-3.8-flash', defaultAiProvider: 'gemini', geminiApiKey: 'keep-me' });
    expect(await agentAutoSetupApplyTextDefault(api as never, localStorage)).toBe(true);
    expect(api.read()).toMatchObject({ primaryGeminiTextModel: 'agent-claude', geminiApiKey: 'keep-me', [AGENT_AUTO_SETUP_MIGRATION_KEY]: true });
    expect(Object.keys(api.saves[0]).sort()).toEqual([AGENT_AUTO_SETUP_MIGRATION_KEY, 'defaultAiProvider', 'primaryGeminiTextModel'].sort());
  });

  it('never touches the engine again after the user changes it in settings', async () => {
    const api = configApi({ primaryGeminiTextModel: 'agent-codex', [AGENT_AUTO_SETUP_MIGRATION_KEY]: true });
    expect(await agentAutoSetupApplyTextDefault(api as never, localStorage)).toBe(false);
    expect(api.saveConfig).not.toHaveBeenCalled();
    expect(api.read().primaryGeminiTextModel).toBe('agent-codex');
  });

  it('a cleared localStorage does not re-run it: the flag lives in the config', () => {
    expect(agentAutoSetupNeedsMigration({ [AGENT_AUTO_SETUP_MIGRATION_KEY]: true }, localStorage)).toBe(false);
    expect(agentAutoSetupNeedsMigration({}, localStorage)).toBe(true);
  });

  it('keeps a backup flag when the config does not keep it', async () => {
    const api = configApi({}, { dropFlag: true });
    expect(await agentAutoSetupApplyTextDefault(api as never, localStorage)).toBe(true);
    expect(localStorage.getItem(AGENT_AUTO_SETUP_MIGRATION_KEY)).toBe('1');
    expect(agentAutoSetupNeedsMigration(api.read(), localStorage)).toBe(false);
  });

  it('a save that did not stick sets no flag, so the next launch tries again', async () => {
    const api = configApi({ primaryGeminiTextModel: 'gemini-3.8-flash' }, { ignoreSave: true });
    await expect(agentAutoSetupApplyTextDefault(api as never, localStorage)).rejects.toThrow();
    expect(localStorage.getItem(AGENT_AUTO_SETUP_MIGRATION_KEY)).toBeNull();
    expect(agentAutoSetupNeedsMigration(api.read(), localStorage)).toBe(true);
  });
});

describe('one-time image default', () => {
  it('sets its flag only when the engine was really saved', () => {
    expect(agentAutoSetupApplyImageDefault(localStorage, () => false)).toBe(false);
    expect(localStorage.getItem(AGENT_AUTO_SETUP_IMAGE_KEY)).toBeNull();
    const apply = vi.fn(() => true);
    expect(agentAutoSetupApplyImageDefault(localStorage, apply)).toBe(true);
    expect(apply).toHaveBeenCalledWith('codex-image');
    expect(agentAutoSetupApplyImageDefault(localStorage, apply)).toBe(false);
    expect(apply).toHaveBeenCalledTimes(1);
  });
});

describe('which engines need a login prompt', () => {
  it('only the engines in use: the text agent and Codex when it draws the images', () => {
    expect(agentAutoSetupLoginProviders('agent-claude', 'codex-image')).toEqual(['claude', 'codex']);
    expect(agentAutoSetupLoginProviders('agent-codex', 'codex-image')).toEqual(['codex']);
    expect(agentAutoSetupLoginProviders('agent-gemini', 'nano-banana-2')).toEqual(['gemini']);
    expect(agentAutoSetupLoginProviders('gemini-3.8-flash', 'nano-banana-2')).toEqual([]);
    expect(agentAutoSetupLoginProviders('', '')).toEqual([]);
  });

  it('row text: login button, retry button, plain note; nothing for ready or unknown', () => {
    expect(agentAutoSetupRowText({ provider: 'claude', kind: 'login' })).toEqual({ text: 'Claude Code 로그인이 필요해요.', action: '로그인' });
    expect(agentAutoSetupRowText({ provider: 'codex', kind: 'install', installFailed: true, message: '네트워크 차단' })?.action).toBe('다시 시도');
    expect(agentAutoSetupRowText({ provider: 'claude', kind: 'unavailable', status: { detail: '구독 만료' } })).toEqual({ text: 'Claude Code: 구독 만료', action: '' });
    expect(agentAutoSetupRowText({ provider: 'claude', kind: 'ready' })).toBeNull();
    expect(agentAutoSetupRowText({ provider: 'claude', kind: 'delayed' })).toBeNull();
  });
});

describe('background install', () => {
  it('installs every missing CLI, one at a time, and leaves the ready ones alone', async () => {
    const installed = new Set<string>(['codex']);
    const order: string[] = [];
    const api = {
      agentStatus: vi.fn(async (provider: string) => status({ installed: installed.has(provider), loggedIn: installed.has(provider), available: installed.has(provider) })),
      agentInstall: vi.fn(async (provider: string) => { order.push(provider); installed.add(provider); return { success: true }; }),
    };
    const results = await runAgentAutoSetupInstalls(api as never, () => undefined);
    expect(order).toEqual(['claude', 'gemini']);
    expect(results.map((r) => [r.provider, r.kind])).toEqual([['claude', 'ready'], ['codex', 'ready'], ['gemini', 'ready']]);
    expect(AGENT_AUTO_SETUP_PROVIDERS).toEqual(['claude', 'codex', 'gemini']);
  });

  it('updates a CLI that is older than the app needs', async () => {
    let updated = false;
    const api = {
      agentStatus: vi.fn(async (provider: string) => (provider === 'claude' && !updated ? status({ available: false, errorCode: 'update_required' }) : status())),
      agentInstall: vi.fn(async () => { updated = true; return { success: true }; }),
    };
    await runAgentAutoSetupInstalls(api as never, () => undefined);
    expect(api.agentInstall).toHaveBeenCalledTimes(1);
    expect(api.agentInstall).toHaveBeenCalledWith('claude');
  });

  it('never installs on a probe that could not answer, and never throws', async () => {
    const api = {
      agentStatus: vi.fn(async (provider: string) => {
        if (provider === 'claude') return status({ available: false, errorCode: 'timeout' });
        if (provider === 'codex') throw new Error('ipc down');
        return { success: false, message: 'x' };
      }),
      agentInstall: vi.fn(async () => ({ success: true })),
    };
    const results = await runAgentAutoSetupInstalls(api as never, () => undefined);
    expect(api.agentInstall).not.toHaveBeenCalled();
    expect(results.map((r) => r.kind)).toEqual(['delayed', 'delayed', 'delayed']);
  });

  it('a failed install is reported with its reason, and is not retried on every launch', async () => {
    let clock = 1_000_000;
    const api = {
      agentStatus: vi.fn(async () => status({ installed: false, loggedIn: false, available: false })),
      agentInstall: vi.fn(async (provider: string) => (provider === 'claude' ? { success: false, message: '네트워크 차단' } : { success: true })),
    };
    const lines: string[] = [];
    const first = await runAgentAutoSetupInstalls(api as never, (line) => lines.push(line), { store: localStorage, now: () => clock });
    expect(first[0]).toMatchObject({ provider: 'claude', kind: 'install', installFailed: true, message: '네트워크 차단' });
    expect(api.agentInstall).toHaveBeenCalledTimes(3);
    expect(lines.join('\n')).toContain('Claude Code');
    expect(localStorage.getItem(AGENT_AUTO_SETUP_FAILED_PREFIX + 'claude')).toBe(String(clock));

    api.agentInstall.mockClear();
    clock += 60_000; // next launch a minute later: claude is skipped, the other two try again
    const second = await runAgentAutoSetupInstalls(api as never, () => undefined, { store: localStorage, now: () => clock });
    expect(api.agentInstall.mock.calls.map((c) => c[0])).toEqual(['codex', 'gemini']);
    expect(second[0]).toMatchObject({ provider: 'claude', installFailed: true });

    api.agentInstall.mockClear();
    clock += AGENT_AUTO_SETUP_RETRY_MS; // after the wait it is tried again
    await runAgentAutoSetupInstalls(api as never, () => undefined, { store: localStorage, now: () => clock });
    expect(api.agentInstall.mock.calls.map((c) => c[0])).toContain('claude');
  });

  it('"busy" (the person is installing from settings) is not a failure', async () => {
    const api = {
      agentStatus: vi.fn(async () => status({ installed: false, loggedIn: false, available: false })),
      agentInstall: vi.fn(async () => ({ success: false, code: 'busy', message: '이미 진행 중' })),
    };
    const results = await runAgentAutoSetupInstalls(api as never, () => undefined, { store: localStorage });
    expect(results.every((r) => r.kind === 'delayed' && !r.installFailed)).toBe(true);
    expect(localStorage.getItem(AGENT_AUTO_SETUP_FAILED_PREFIX + 'claude')).toBeNull();
  });
});

describe('startup entry', () => {
  const bridge = (over: Record<string, unknown> = {}) => {
    const cfg = configApi({ primaryGeminiTextModel: 'gemini-3.8-flash' });
    return {
      cfg,
      api: {
        getConfig: cfg.getConfig, saveConfig: cfg.saveConfig,
        agentStatus: vi.fn(async () => status()), agentInstall: vi.fn(async () => ({ success: true })),
        getAppInfo: vi.fn(async () => ({ e2eTest: false })), ...over,
      },
    };
  };

  it('does nothing under E2E_TEST: no default, no install', async () => {
    const { api, cfg } = bridge({ getAppInfo: vi.fn(async () => ({ e2eTest: true })) });
    (window as any).api = api;
    await initStartupAgentAutoSetup();
    expect(cfg.saveConfig).not.toHaveBeenCalled();
    expect(api.agentStatus).not.toHaveBeenCalled();
  });

  it('does nothing without the IPC bridge', async () => {
    (window as any).api = undefined;
    await expect(initStartupAgentAutoSetup()).resolves.toBeUndefined();
  });

  it('applies the default, then checks the CLIs; no banner when everything is ready', async () => {
    const { api, cfg } = bridge();
    (window as any).api = api;
    await initStartupAgentAutoSetup();
    expect(cfg.read().primaryGeminiTextModel).toBe('agent-claude');
    await vi.waitFor(() => expect(api.agentStatus).toHaveBeenCalledTimes(3));
    await vi.waitFor(() => expect((window as any).__agentAutoSetupInstalling).toBe(false));
    expect(api.agentInstall).not.toHaveBeenCalled();
    expect(document.getElementById('agent-auto-setup-banner')).toBeNull();
  });

  it('shows a [로그인] button for the engine in use and starts no login by itself', async () => {
    const agentLogin = vi.fn();
    const { api } = bridge({
      agentStatus: vi.fn(async (provider: string) => (provider === 'claude' ? status({ loggedIn: false, available: false }) : status())),
      agentLogin,
    });
    (window as any).api = api;
    await initStartupAgentAutoSetup();
    await vi.waitFor(() => expect(document.querySelector('#agent-auto-setup-banner button[type="button"]:not([aria-label])')).not.toBeNull());
    const banner = document.getElementById('agent-auto-setup-banner')!;
    expect(banner.textContent).toContain('Claude Code 로그인이 필요해요.');
    expect(agentLogin).not.toHaveBeenCalled();
    (banner.querySelector('button[aria-label="닫기"]') as HTMLButtonElement).click();
    expect(document.getElementById('agent-auto-setup-banner')).toBeNull();
  });
});

describe('Gemini CLI default model', () => {
  it('is 3.8 Flash when the user named none; a named model still wins', () => {
    expect(resolveAgentRunModel('gemini', '')).toBe('gemini-3.8-flash-medium');
    expect(resolveAgentRunModel('gemini', '', 'light')).toBe('gemini-3.8-flash-low');
    expect(resolveAgentRunModel('gemini', 'gemini-4-argon-high')).toBe('gemini-4-argon-high');
    expect(describeAgentModelLine('gemini', '')).toBe('기본 모델: Gemini 3.8 Flash');
    expect(src('src/agentCli/geminiRunner.ts')).toMatch(/resolveAgentRunModel\('gemini', opts\.model, opts\.tier\)/);
  });

  it('Claude Code stays on Sonnet 5.5 and Codex images on the small model', () => {
    expect(resolveAgentRunModel('claude', '')).toBe('claude-sonnet-5-5');
    expect(src('src/agentCli/agentModelDefaults.ts')).toMatch(/codex: Object\.freeze\(\{ model: 'gpt-6-luna', effort: 'low' as const \}\)/);
  });
});

describe('startup wiring', () => {
  const renderer = src('src/renderer/renderer.ts');
  const core = src('src/renderer/modules/startupAgentAutoSetup.ts');
  const banner = src('src/renderer/modules/startupAgentAutoSetupBanner.ts');

  it('the blocking engine window is no longer opened at startup', () => {
    expect(renderer).not.toMatch(/initStartupEngineGate/);
    expect(renderer).toMatch(/await initStartupAgentAutoSetup\(\)/);
  });

  it('only the one-time defaults are awaited; the install runs in the background', () => {
    expect(core).toMatch(/void agentAutoSetupRunBackground\(/);
    expect(core).not.toMatch(/await agentAutoSetupRunBackground\(/);
  });

  it('a login can start in one place only: the banner click handler', () => {
    expect(core).not.toMatch(/agentLogin\(|agentConnectRun\(/);
    const beforeClick = banner.slice(0, banner.indexOf('async function agentAutoSetupOnLoginClick'));
    expect(beforeClick).not.toMatch(/agentLogin\(|agentConnectRun\(/);
    expect(banner.match(/agentConnectRun\(/g)?.length).toBe(1);
  });

  it('no engine switch: never picks another engine when one is not ready', () => {
    expect(core + banner).not.toMatch(/agentConnectPickDefault/);
    expect(core.match(/api\.saveConfig\(/g)?.length).toBe(1);
  });

  it('is bundled after the modules it uses and is part of the runtime fingerprint', () => {
    const copy = src('scripts/copy-static.mjs');
    const at = (name: string) => copy.indexOf(`'${name}'`);
    for (const dependency of ['agentConnectFlow.js', 'startupImageEngineGate.js', 'startupAgentAutoSetupBanner.js']) {
      expect(at(dependency), dependency).toBeGreaterThan(0);
      expect(at('startupAgentAutoSetup.js'), dependency).toBeGreaterThan(at(dependency));
    }
    const fingerprint = src('src/contentQualityV3/candidateRuntimeFingerprint.ts');
    expect(fingerprint).toContain("'src/renderer/modules/startupAgentAutoSetup.ts'");
    expect(fingerprint).toContain("'src/renderer/modules/startupAgentAutoSetupBanner.ts'");
  });

  it('the generation guard says "being installed" while the background install runs', () => {
    expect(src('src/renderer/utils/agentModeGuard.ts')).toMatch(/__agentAutoSetupInstalling === true/);
    expect(core).toMatch(/__agentAutoSetupInstalling = true[\s\S]*__agentAutoSetupInstalling = false/);
  });
});

// [2026-11-17 owner] "이미지는 쇼츠 연계도 생각해서" — the LDB short is built from the published post's pictures and
// only fills the vertical screen with pictures narrower than 0.8, so body pictures default to portrait 3:4.
describe('body picture ratio for shorts', () => {
  it('the old default (unset or 1:1) becomes 3:4 once; a ratio picked on purpose is kept', async () => {
    const { AGENT_AUTO_SETUP_RATIO_KEY, agentAutoSetupApplyRatioDefault } = await import('../renderer/modules/startupAgentAutoSetup');
    const apply = vi.fn();
    expect(agentAutoSetupApplyRatioDefault(localStorage, apply)).toBe(true);
    expect(apply).toHaveBeenCalledWith('3:4');
    expect(localStorage.getItem(AGENT_AUTO_SETUP_RATIO_KEY)).toBe('1');
    expect(agentAutoSetupApplyRatioDefault(localStorage, apply)).toBe(false);
    expect(apply).toHaveBeenCalledTimes(1);

    localStorage.clear();
    localStorage.setItem('subheadingImageRatio', '1:1');
    expect(agentAutoSetupApplyRatioDefault(localStorage, apply)).toBe(true);

    localStorage.clear();
    localStorage.setItem('subheadingImageRatio', '16:9');
    expect(agentAutoSetupApplyRatioDefault(localStorage, apply)).toBe(false);
    expect(apply).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem('subheadingImageRatio')).toBe('16:9');
  });

  it('settings show 3:4 when nothing is saved; the thumbnail stays 1:1', () => {
    const settings = src('src/renderer/components/HeadingImageSettings.ts');
    expect(settings).toMatch(/DEFAULT_SUBHEADING_IMAGE_RATIO: ImageAspectRatio = '3:4'/);
    expect(settings).toMatch(/safeLocalStorageGet\('thumbnailImageRatio', '1:1'\)/);
    expect(settings).not.toMatch(/localStorage\.getItem\('imageRatio'\) \|\| '1:1'/);
  });

  it('Codex keeps the subject and letters inside the part the short does not crop', () => {
    expect(src('src/image/codex/codexImageInstruction.ts')).toMatch(/'3:4': 'portrait 3:4\. Keep the main subject and all text inside the central three quarters of the width'/);
  });
});
