import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: '.',
    include: [
      'src/__tests__/contentGeminiSamplingPolicy.test.ts',
      'src/__tests__/contentGenerationShadowSnapshot.test.ts',
      'src/__tests__/contentPipeline*.test.ts',
      'src/__tests__/contentQualityBaselineManifest.test.ts',
      'src/__tests__/contentQualityLegacyBaseline.test.ts',
      'src/__tests__/contentQualityV3*.test.ts',
    ],
    environment: 'node',
    globals: false,
    testTimeout: 15_000,
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      reportsDirectory: 'coverage/content-quality-v3',
      include: [
        'src/contentGeminiSamplingPolicy.ts',
        'src/contentPipeline/**/*.ts',
        'src/contentQualityV3/**/*.ts',
      ],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
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
