import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: '.',
    include: ['src/__tests__/**/*.test.ts'],
    environment: 'node',
    globals: false,
    // The runtime-closure and attestation suites traverse the complete
    // production source graph. They finish well below this limit in isolation
    // but can exceed 10s under the full parallel release gate on Windows.
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      include: [
        'src/errorRecovery.ts',
        'src/configManager.ts',
        'src/contentGenerator.ts',
        'src/automation/typingUtils.ts',
        'src/renderer/modules/fullAutoFlow.ts',
      ],
    },
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.mts', '.js', '.jsx', '.json'],
    alias: {
      electron: './src/__tests__/mocks/electron.ts',
    },
  },
});
