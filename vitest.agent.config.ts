import { defineConfig } from 'vitest/config';

const windowsOnlyCoverage = process.platform === 'win32'
  ? ['src/agentCli/spawnHelper.ts']
  : [];

export default defineConfig({
  test: {
    root: '.',
    include: [
      'src/__tests__/agentCli.test.ts',
      'src/__tests__/agentGeneratePreflight.test.ts',
      'src/__tests__/agentGenerateRetry.test.ts',
      'src/__tests__/agentProcessTreeTermination.test.ts',
      'src/__tests__/agentInstaller.test.ts',
      'src/__tests__/agentLoginVerification.test.ts',
      'src/__tests__/agentLoginUrl.test.ts',
      'src/__tests__/agentLoginCliFixture.test.ts',
      'src/__tests__/agentLoginCodeFallback.test.ts',
      'src/__tests__/agentHandlersAuthState.test.ts',
      'src/__tests__/agentDetection.test.ts',
      'src/__tests__/agentSubscriptionEnv.test.ts',
      'src/__tests__/agentStatusRefreshCoordinator.test.ts',
      'src/__tests__/agentStatusRefreshRace.test.ts',
      'src/__tests__/agentSubscriptionUiGuard.test.ts',
      'src/__tests__/agentProductPolicy.test.ts',
      'src/__tests__/agentProductPolicyUi.test.ts',
      'src/__tests__/agentProductPolicyUnifiedDOM.test.ts',
      'src/__tests__/agentContentProviderPolicy.test.ts',
      'src/__tests__/agentVersionParser.test.ts',
      'src/__tests__/userVisibleError.test.ts',
    ],
    environment: 'node',
    globals: false,
    testTimeout: 10_000,
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      reportsDirectory: 'coverage/agent',
      include: [
      'src/agentCli/detect.ts',
      'src/agentCli/index.ts',
        'src/agentCli/installer.ts',
        'src/agentCli/loginUrl.ts',
        'src/agentCli/productPolicy.ts',
        'src/agentCli/subscriptionEnv.ts',
        'src/agentCli/version.ts',
        'src/renderer/utils/agentLoginCodePrompt.ts',
        'src/renderer/utils/agentProductPolicyUi.ts',
        'src/renderer/utils/agentStatusRefreshCoordinator.ts',
        'src/runtime/userVisibleError.ts',
        ...windowsOnlyCoverage,
      ],
      thresholds: {
        statements: 89,
        functions: 92,
        lines: 92,
        // Keep every metric at or above the repository-wide 80% quality floor.
        branches: 80,
      },
    },
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.mts', '.js', '.jsx', '.json'],
    alias: {
      electron: './src/__tests__/mocks/electron.ts',
    },
  },
});
