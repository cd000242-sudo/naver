import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function readSource(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
}

describe('headingImageMode=none skip guard', () => {
  const costAndAutoGenSource = readSource('renderer/modules/costAndAutoGen.ts');
  const fullAutoFlowSource = readSource('renderer/modules/fullAutoFlow.ts');
  const publishingHandlersSource = readSource('renderer/modules/publishingHandlers.ts');

  it('blocks paid image generation at the shared cost-safety boundary', () => {
    expect(costAndAutoGenSource).toContain('_headingImageNoneFlag');
    expect(costAndAutoGenSource).toMatch(
      /rawPipeline\.headingImageMode\s*===\s*'none'[\s\S]{0,260}const _skipImagesFlag =[\s\S]{0,160}_headingImageNoneFlag/,
    );
  });

  it('treats image placement mode none as skipImages in direct full-auto collection', () => {
    expect(fullAutoFlowSource).toMatch(
      /const skipImages =[\s\S]{0,160}pipelineCfg\.image\.headingImageMode\s*===\s*'none'/,
    );
    expect(fullAutoFlowSource).toContain('headingImageMode: pipelineCfg.image.headingImageMode');
  });

  it('treats image placement mode none as skipImages in full-auto publish', () => {
    expect(publishingHandlersSource).toMatch(
      /const skipImagesForGuard =[\s\S]{0,120}pipelineCfg\.image\.headingImageMode\s*===\s*'none'/,
    );
    expect(publishingHandlersSource).toMatch(
      /const skipImagesFromHeadingMode =[\s\S]{0,120}pipelineCfg\.image\.headingImageMode\s*===\s*'none'/,
    );
    expect(publishingHandlersSource).toMatch(
      /const skipImages =[\s\S]{0,180}skipImagesFromHeadingMode/,
    );
  });
});
