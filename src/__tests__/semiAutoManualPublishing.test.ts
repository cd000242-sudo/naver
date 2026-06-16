import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('semi-auto manual publishing', () => {
  const publishingHandlersSource = readFileSync(
    new URL('../renderer/modules/publishingHandlers.ts', import.meta.url),
    'utf8',
  );
  const fullAutoFlowSource = readFileSync(
    new URL('../renderer/modules/fullAutoFlow.ts', import.meta.url),
    'utf8',
  );
  const rendererSource = readFileSync(
    new URL('../renderer/renderer.ts', import.meta.url),
    'utf8',
  );

  it('auto-detects subheadings from manually edited chatbot content before publishing', () => {
    expect(publishingHandlersSource).toContain("from '../utils/semiAutoHeadingExtractor.js'");
    expect(publishingHandlersSource).toContain('extractSemiAutoHeadingsFromBody(content)');
    expect(rendererSource).toContain('function _extractSemiAutoManualHeadings');
    expect(rendererSource).toContain("from './utils/semiAutoHeadingExtractor.js'");
    expect(rendererSource).toContain('function _scheduleSemiAutoHeadingAnalysis');
  });

  it('allows semi-auto publishing without images when the image management tab is empty', () => {
    expect(publishingHandlersSource).toContain('semi-auto:text-only-when-no-images');
    expect(publishingHandlersSource).toContain('normalizedImagesForPublish.length === 0');
    expect(publishingHandlersSource).toContain('!skipImages && !hasPreloadedImages');
    expect(fullAutoFlowSource).toContain('semi-auto:text-only-empty-image-management');
    expect(fullAutoFlowSource).toContain('formData.skipImages = true');
  });
});
