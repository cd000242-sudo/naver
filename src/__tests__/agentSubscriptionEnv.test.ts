import { describe, expect, it } from 'vitest';
import { delimiter } from 'path';
import {
  buildNpmInstallEnv,
  buildClaudeSubscriptionEnv,
  buildCodexSubscriptionEnv,
  buildGeminiSubscriptionEnv,
} from '../agentCli/subscriptionEnv';

/**
 * [v2.11.144] Subscription envs prepend the app-owned CLI prefix to PATH so a CLI the app
 * installed is found without the system PATH ever changing. The allowlist is still asserted
 * exactly — PATH is just checked separately, since its value is now composed.
 */
function withoutPath(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(env).filter(([key]) => key.toUpperCase() !== 'PATH'));
}

function pathEntriesOf(env: NodeJS.ProcessEnv): string[] {
  const key = Object.keys(env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH';
  return String(env[key] ?? '').split(delimiter);
}

function expectManagedPathAhead(env: NodeJS.ProcessEnv, inherited: string): void {
  const entries = pathEntriesOf(env);
  expect(entries[0]).toContain('agent-runtime');
  // The inherited PATH must survive: a CLI the user installed globally still resolves.
  expect(entries).toContain(inherited);
}

describe('subscription agent environment isolation', () => {
  it('keeps a custom npm global prefix only for the installer environment', () => {
    const source = {
      PATH: 'C:\\tools',
      TEMP: 'C:\\temp',
      NPM_CONFIG_PREFIX: 'C:\\Users\\tester\\npm-global',
      NPM_TOKEN: 'must-not-leak',
      OPENAI_API_KEY: 'must-not-leak',
    };

    expect(buildNpmInstallEnv(source)).toEqual({
      PATH: 'C:\\tools',
      TEMP: 'C:\\temp',
      NPM_CONFIG_PREFIX: 'C:\\Users\\tester\\npm-global',
    });
    expect(buildCodexSubscriptionEnv(source)).not.toHaveProperty('NPM_CONFIG_PREFIX');
    expect(buildClaudeSubscriptionEnv(source)).not.toHaveProperty('NPM_CONFIG_PREFIX');
  });

  it('allows only runtime and Claude profile paths while dropping every unrelated secret', () => {
    const env = buildClaudeSubscriptionEnv({
      PATH: 'C:\\tools',
      TEMP: 'C:\\temp',
      USERPROFILE: 'C:\\Users\\tester',
      CLAUDE_CONFIG_DIR: 'C:\\profiles\\claude',
      ANTHROPIC_API_KEY: 'secret',
      ANTHROPIC_AUTH_TOKEN: 'token',
      ANTHROPIC_BASE_URL: 'https://paid-proxy.example',
      CLAUDE_CODE_USE_BEDROCK: '1',
      CLAUDE_CODE_USE_VERTEX: '1',
      CLAUDE_CODE_USE_FOUNDRY: '1',
      CLAUDE_CODE_USE_MANTLE: '1',
      ANTHROPIC_AWS_API_KEY: 'aws-secret',
      AWS_BEARER_TOKEN_BEDROCK: 'bedrock-secret',
      ANTHROPIC_FOUNDRY_API_KEY: 'foundry-secret',
      ANTHROPIC_FOUNDRY_RESOURCE: 'foundry-resource',
      ANTHROPIC_VERTEX_PROJECT_ID: 'vertex-project',
      CLOUD_ML_REGION: 'us-east5',
      NAVER_PASSWORD: 'naver-secret',
      GEMINI_API_KEY: 'gemini-secret',
      GH_TOKEN: 'github-secret',
      HTTPS_PROXY: 'https://user:password@proxy.example',
      NO_PROXY: 'localhost,127.0.0.1',
      UNRELATED_APP_SECRET: 'must-not-leak',
    });

    expect(withoutPath(env)).toEqual({
      TEMP: 'C:\\temp',
      USERPROFILE: 'C:\\Users\\tester',
      CLAUDE_CONFIG_DIR: 'C:\\profiles\\claude',
      HTTPS_PROXY: 'https://user:password@proxy.example',
      NO_PROXY: 'localhost,127.0.0.1',
    });
    expectManagedPathAhead(env, 'C:\\tools');
  });

  it('allows only runtime and Codex profile paths while dropping every unrelated secret', () => {
    const env = buildCodexSubscriptionEnv({
      PATH: 'C:\\tools',
      TEMP: 'C:\\temp',
      USERPROFILE: 'C:\\Users\\tester',
      CODEX_HOME: 'C:\\profiles\\codex',
      OPENAI_API_KEY: 'secret',
      OPENAI_BASE_URL: 'https://paid-proxy.example',
      AZURE_OPENAI_API_KEY: 'azure-secret',
      AZURE_OPENAI_ENDPOINT: 'https://azure.example',
      NAVER_PASSWORD: 'naver-secret',
      ANTHROPIC_API_KEY: 'anthropic-secret',
      GH_TOKEN: 'github-secret',
      HTTPS_PROXY: 'https://user:password@proxy.example',
      NO_PROXY: 'localhost,127.0.0.1',
      UNRELATED_APP_SECRET: 'must-not-leak',
    });

    expect(withoutPath(env)).toEqual({
      TEMP: 'C:\\temp',
      USERPROFILE: 'C:\\Users\\tester',
      CODEX_HOME: 'C:\\profiles\\codex',
      HTTPS_PROXY: 'https://user:password@proxy.example',
      NO_PROXY: 'localhost,127.0.0.1',
    });
    expectManagedPathAhead(env, 'C:\\tools');
  });

  it('[v2.11.140] Gemini는 GCA를 강제하지 않고 API 키도 제거한다 (auth는 settings.json oauth-personal)', () => {
    const env = buildGeminiSubscriptionEnv({
      PATH: 'C:\\tools',
      TEMP: 'C:\\temp',
      USERPROFILE: 'C:\\Users\\tester',
      GEMINI_API_KEY: 'must-not-leak',
      GOOGLE_API_KEY: 'must-not-leak',
      GOOGLE_GENAI_API_KEY: 'must-not-leak',
      NAVER_PASSWORD: 'naver-secret',
      UNRELATED_APP_SECRET: 'must-not-leak',
    });

    // GCA(Google Code Assist)는 개인 계정에서 IneligibleTierError를 유발 → 강제하지 않는다.
    // auth 방식은 ensureGeminiOAuthPersonalConfig()가 settings.json에 oauth-personal로 기록.
    expect(env).not.toHaveProperty('GOOGLE_GENAI_USE_GCA');
    // API 키는 여전히 제거 — silent API-key 과금 폴백 금지.
    expect(env).not.toHaveProperty('GEMINI_API_KEY');
    expect(env).not.toHaveProperty('GOOGLE_API_KEY');
    expect(env).not.toHaveProperty('GOOGLE_GENAI_API_KEY');
    expect(env).not.toHaveProperty('NAVER_PASSWORD');
    expect(env).not.toHaveProperty('UNRELATED_APP_SECRET');
    expect(withoutPath(env)).toEqual({ TEMP: 'C:\\temp', USERPROFILE: 'C:\\Users\\tester' });
    expectManagedPathAhead(env, 'C:\\tools');
  });
});
