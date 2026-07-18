import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { sanitizeRendererRuntimeDependency } from '../../scripts/rendererRuntimeDependencyInline.mjs';

describe('copy-static runtime inline contract', () => {
  const copyStaticSource = readFileSync(join(process.cwd(), 'scripts', 'copy-static.mjs'), 'utf8');
  const rendererSource = readFileSync(join(process.cwd(), 'src', 'renderer', 'renderer.ts'), 'utf8');

  it('inlines runtime modules imported by the browser renderer entrypoint', () => {
    expect(rendererSource).toContain("from '../runtime/imageProviderMigration.js'");
    expect(copyStaticSource).toContain('runtimeModules');
    expect(copyStaticSource).toContain("'imageProviderMigration.js'");
  });

  it('inlines shopping reference dependencies and guards their runtime symbols', () => {
    expect(copyStaticSource).toContain('rendererRuntimeDependencyFiles');
    expect(copyStaticSource).toContain("'referenceImagePolicy.js'");
    expect(copyStaticSource).toContain("'shoppingReferenceGeneration.js'");
    expect(copyStaticSource).toContain("'publishImageSequence.js'");

    for (const symbol of [
      'deduplicateReferenceImages',
      'extractShoppingReferenceSource',
      'isShoppingReferenceImageEngine',
      'resolveShoppingImageGenerationPolicy',
      'resolveShoppingRepresentativeReference',
      'resolveShoppingCollectedImagePlacement',
      'resolveUsableShoppingReferenceSource',
      'createShoppingRepresentativeThumbnail',
      'normalizePublishImageSequence',
    ]) {
      expect(copyStaticSource).toContain(`'${symbol}'`);
    }
  });

  it('inlines contextual image prompt helpers and guards every renderer runtime symbol', () => {
    expect(copyStaticSource).toContain("label: 'image/contextualImagePrompt.js'");
    expect(copyStaticSource).toContain(
      "filePath: path.join(projectRoot, 'dist', 'image', 'contextualImagePrompt.js')",
    );

    for (const symbol of [
      'buildContextAwarePromptCacheKey',
      'compactImageContextText',
      'enrichImageItemsWithArticleContext',
      'resolveSectionContentForImage',
      'shouldUseStructuredImageContext',
    ]) {
      expect(copyStaticSource).toMatch(
        new RegExp(`REQUIRED_RENDERER_RUNTIME_SYMBOLS[\\s\\S]*['"]${symbol}['"]`),
      );
    }
  });

  it('inlines the FTC preset SSOT before the browser renderer consumes it', () => {
    expect(rendererSource).toContain("from '../automation/ftcDisclosurePresets.js'");
    expect(copyStaticSource).toContain("label: 'automation/ftcDisclosurePresets.js'");
    expect(copyStaticSource).toContain(
      "filePath: path.join(projectRoot, 'dist', 'automation', 'ftcDisclosurePresets.js')",
    );
    expect(copyStaticSource).toMatch(
      /REQUIRED_RENDERER_RUNTIME_VALUES[\s\S]*['"]FTC_DISCLOSURE_PRESETS['"]/,
    );
  });

  it('sanitizes the compiled CommonJS dependency shape without unresolved aliases', () => {
    const compiledSource = [
      '"use strict";',
      'Object.defineProperty(exports, "__esModule", { value: true });',
      'exports.SHOPPING_ENGINES = void 0;',
      'exports.runtimeHelper = runtimeHelper;',
      'const referenceImagePolicy_js_1 = require("./referenceImagePolicy.js");',
      'exports.SHOPPING_ENGINES = ["nano-banana-2"];',
      'function runtimeHelper(value) {',
      '  return (0, referenceImagePolicy_js_1.extractReferenceImageUrl)(value);',
      '}',
    ].join('\n');

    const sanitized = sanitizeRendererRuntimeDependency(compiledSource);

    expect(sanitized).toContain('const SHOPPING_ENGINES = ["nano-banana-2"]');
    expect(sanitized).toContain('function runtimeHelper(value)');
    expect(sanitized).toContain('return extractReferenceImageUrl(value);');
    expect(sanitized).not.toMatch(/\brequire\s*\(/);
    expect(sanitized).not.toContain('referenceImagePolicy_js_1');
    expect(sanitized).not.toContain('exports.');
  });
});
