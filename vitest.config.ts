import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: '.',
    include: ['src/__tests__/**/*.test.ts'],
    environment: 'node',
    globals: false,
    testTimeout: 10000,
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
    alias: {
      electron: './src/__tests__/mocks/electron.ts',
    },
  },
});
