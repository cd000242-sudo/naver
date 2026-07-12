import { afterEach, describe, expect, it } from 'vitest';

import { createPipelineFormDataSnapshot } from '../renderer/modules/pipelineConfig';

function installMutableStorage(values: Record<string, string>): void {
  (globalThis as any).localStorage = {
    getItem: (key: string) => values[key] ?? null,
  };
}

afterEach(() => {
  delete (globalThis as any).localStorage;
});

describe('createPipelineFormDataSnapshot', () => {
  it('captures one immutable configuration for the lifetime of a publish item', () => {
    const values: Record<string, string> = {
      headingImageMode: 'thumbnail-only',
      imageStyle: 'illustration',
      imageRatio: '16:9',
      thumbnailImageRatio: '1:1',
      subheadingImageRatio: '4:3',
      fullAutoImageSource: 'flow',
      imageFallbackPolicy: 'engine-only',
      scSubImageMode: 'ai',
      scAIImageEngine: 'nano-banana-pro',
    };
    installMutableStorage(values);

    const snapshot = createPipelineFormDataSnapshot('full-auto', { title: 'snapshot test' });
    values.headingImageMode = 'none';
    values.fullAutoImageSource = 'imagefx';

    expect(snapshot.headingImageMode).toBe('thumbnail-only');
    expect(snapshot.imageSource).toBe('flow');
    expect(snapshot.imageStyle).toBe('illustration');
    expect(snapshot.subheadingImageRatio).toBe('4:3');
    expect(snapshot.scSubImageMode).toBe('ai');
    expect(snapshot.skipImages).toBe(false);
    expect(Object.isFrozen(snapshot.pipelineConfigSnapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.pipelineConfigSnapshot.image)).toBe(true);
  });

  it('preserves explicit caller choices and makes image-none authoritative', () => {
    installMutableStorage({
      headingImageMode: 'all',
      fullAutoImageSource: 'flow',
    });

    const snapshot = createPipelineFormDataSnapshot('full-auto', {
      headingImageMode: 'none',
      imageSource: 'local-folder',
      imageStyle: 'photorealistic',
      skipImages: false,
    });

    expect(snapshot.headingImageMode).toBe('none');
    expect(snapshot.imageSource).toBe('local-folder');
    expect(snapshot.imageStyle).toBe('photorealistic');
    expect(snapshot.skipImages).toBe(true);
  });

  it('reuses an existing snapshot instead of reading changed settings again', () => {
    const values: Record<string, string> = { headingImageMode: 'all' };
    installMutableStorage(values);
    const first = createPipelineFormDataSnapshot('full-auto', { title: 'first' });

    values.headingImageMode = 'none';
    const second = createPipelineFormDataSnapshot('full-auto', {
      ...first,
      title: 'second',
    });

    expect(second.pipelineConfigSnapshot).toBe(first.pipelineConfigSnapshot);
    expect(second.headingImageMode).toBe('all');
    expect(second.skipImages).toBe(false);
  });
});
