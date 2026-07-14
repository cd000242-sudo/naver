import { describe, expect, it } from 'vitest';
import {
  buildClaudeSubscriptionEnv,
  buildCodexSubscriptionEnv,
} from '../agentCli/subscriptionEnv';

describe('subscription agent environment isolation', () => {
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
      UNRELATED_APP_SECRET: 'must-not-leak',
    });

    expect(env).toEqual({
      PATH: 'C:\\tools',
      TEMP: 'C:\\temp',
      USERPROFILE: 'C:\\Users\\tester',
      CLAUDE_CONFIG_DIR: 'C:\\profiles\\claude',
    });
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
      UNRELATED_APP_SECRET: 'must-not-leak',
    });

    expect(env).toEqual({
      PATH: 'C:\\tools',
      TEMP: 'C:\\temp',
      USERPROFILE: 'C:\\Users\\tester',
      CODEX_HOME: 'C:\\profiles\\codex',
    });
  });
});
