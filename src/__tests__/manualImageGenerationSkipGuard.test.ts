import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');

function read(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), 'utf-8');
}

describe('manual image generation skip guard', () => {
  const costAndAutoGen = read('renderer/modules/costAndAutoGen.ts');
  const headingImageGen = read('renderer/modules/headingImageGen.ts');
  const renderer = read('renderer/renderer.ts');
  const settingsModal = read('renderer/utils/settingsModal.ts');

  it('explicit manual image requests bypass stale text-only publish state', () => {
    expect(costAndAutoGen).toMatch(/function\s+isExplicitUserImageGenerationRequest/);
    expect(costAndAutoGen).toMatch(/options\?\.skipImages\s*===\s*true/);
    expect(costAndAutoGen).toMatch(/!_forceImageGeneration[\s\S]{0,220}textOnlyPublish/);
    expect(costAndAutoGen).toMatch(/disableTextOnlyPublishForExplicitImageGeneration/);
  });

  it('manual prompt image generation marks the whole batch as a user image request', () => {
    expect(headingImageGen).toMatch(/__manualImageGenerationInProgress\s*=\s*true/);
    expect(headingImageGen).toMatch(/delete\s+\(window\s+as\s+any\)\.__manualImageGenerationInProgress/);
  });

  it('content heading image generation opts into explicit image generation', () => {
    const block = renderer.match(/generateImagesWithCostSafety\(\{[\s\S]+?collectedImages/);
    expect(block).toBeTruthy();
    expect(block![0]).toMatch(/forceImageGeneration\s*:\s*true/);
  });

  it('settings modal owns a local schema stripper so API key loading cannot crash on a missing import binding', () => {
    expect(settingsModal).toMatch(/function\s+stripSecretSchemaArtifacts/);
    expect(settingsModal).not.toMatch(/import\s*\{[\s\S]{0,120}stripSecretSchemaArtifacts/);
  });
});
