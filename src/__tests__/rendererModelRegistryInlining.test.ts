import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const copyStaticSource = readFileSync(
  resolve(process.cwd(), 'scripts', 'copy-static.mjs'),
  'utf8',
);

describe('renderer model registry inlining', () => {
  it('inlines the runtime registry before renderer modules use its helpers', () => {
    expect(copyStaticSource).toMatch(
      /const runtimeModules = \[[\s\S]*['"]geminiTextModelNormalization\.js['"]/,
    );
  });

  it('fails the build if the Gemini normalizer disappears from the bundle', () => {
    expect(copyStaticSource).toMatch(
      /REQUIRED_RENDERER_RUNTIME_SYMBOLS[\s\S]*['"]normalizeGeminiTextModelId['"]/,
    );
  });
});
