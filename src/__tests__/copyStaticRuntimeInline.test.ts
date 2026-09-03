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

  it('inlines renderer text-model constants before prompt translation consumes them', () => {
    expect(copyStaticSource).toContain("label: 'runtime/textModelConstants.js'");
    expect(copyStaticSource).toContain(
      "filePath: path.join(projectRoot, 'dist', 'runtime', 'textModelConstants.js')",
    );

    for (const symbol of ['CLAUDE_MODELS', 'OPENAI_TEXT_MODELS']) {
      expect(copyStaticSource).toMatch(
        new RegExp(`REQUIRED_RENDERER_RUNTIME_VALUES[\\s\\S]*['"]${symbol}['"]`),
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

  // [2026-09-03] runtime/modelRegistry 를 등록하자 렌더러 번들이 통째로 죽던 뿌리:
  //   `export { X } from './y.js'` 를 tsc 가 `var y_js_2 = require(...)` + defineProperty getter 로 내는데
  //   정제기는 `const` require 와 `_js_1` 만 알았다. 같은 모듈을 두 import 문으로 들여도 `_js_2` 가 남는다(renderer.ts 의 settingsModal).
  it('strips re-export getters, var/let requires and _js_N aliases beyond _js_1', () => {
    const compiledSource = [
      'Object.defineProperty(exports, "__esModule", { value: true });',
      'exports.isAgentTextProvider = exports.AGENT_TEXT_PROVIDERS = void 0;',
      'const textModelConstants_js_1 = require("./textModelConstants.js");',
      'var geminiTextModelNormalization_js_2 = require("./geminiTextModelNormalization.js");',
      'Object.defineProperty(exports, "GEMINI_TEXT_MODELS", { enumerable: true, get: function () { return geminiTextModelNormalization_js_2.GEMINI_TEXT_MODELS; } });',
      'var textModelConstants_js_2 = require("./textModelConstants.js");',
      'Object.defineProperty(exports, "CLAUDE_MODELS", { enumerable: true, get: function () { return textModelConstants_js_2.CLAUDE_MODELS; } });',
      'let settingsModal_js_3 = require("./utils/settingsModal.js");',
      'exports.AGENT_TEXT_PROVIDERS = ["agent-codex"];',
      'function isAgentTextProvider(value) {',
      '    return (0, settingsModal_js_3.restoreTextModelRadio)(value) || textModelConstants_js_1.CLAUDE_MODELS.includes(value);',
      '}',
      'exports.isAgentTextProvider = isAgentTextProvider;',
    ].join('\n');

    const sanitized = sanitizeRendererRuntimeDependency(compiledSource);

    expect(sanitized).toContain('const AGENT_TEXT_PROVIDERS = ["agent-codex"]');
    expect(sanitized).toContain('return restoreTextModelRadio(value) || CLAUDE_MODELS.includes(value);');
    expect(sanitized).not.toMatch(/\brequire\s*\(/);
    expect(sanitized).not.toMatch(/\bexports\b/);
    expect(sanitized).not.toMatch(/_js_\d+/);
    expect(sanitized).not.toContain('defineProperty');
  });
});
