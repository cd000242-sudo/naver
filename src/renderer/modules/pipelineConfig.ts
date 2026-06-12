// [SPEC-STABILITY-2026 Phase 7.1] Single resolution point for publish-pipeline
// settings. Each flow entry calls resolvePipelineConfig() ONCE per publish item
// and passes the object down — downstream/shared code must not read
// localStorage directly (pipeline-map §5-1). Key names and defaults are
// defined HERE and nowhere else; three flows must never interpret the same
// key with different defaults again.

export type PipelineFlow = 'full-auto' | 'continuous' | 'multi-account';

export interface ImagePipelineConfig {
  headingImageMode: string;
  thumbnailTextInclude: boolean;
  textOnlyPublish: boolean;
  imageStyle: string;
  imageRatio: string;
  thumbnailImageRatio: string;
  subheadingImageRatio: string;
}

export interface PipelineConfig {
  flow: PipelineFlow;
  resolvedAt: number;
  image: ImagePipelineConfig;
}

function pipelineReadString(key: string, fallback: string): string {
  try {
    if (typeof localStorage === 'undefined') return fallback;
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function pipelineReadBool(key: string): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(key) === 'true';
  } catch {
    return false;
  }
}

export function resolvePipelineConfig(flow: PipelineFlow): PipelineConfig {
  return {
    flow,
    resolvedAt: Date.now(),
    image: {
      headingImageMode: pipelineReadString('headingImageMode', 'all'),
      thumbnailTextInclude: pipelineReadBool('thumbnailTextInclude'),
      textOnlyPublish: pipelineReadBool('textOnlyPublish'),
      imageStyle: pipelineReadString('imageStyle', 'realistic'),
      imageRatio: pipelineReadString('imageRatio', '1:1'),
      thumbnailImageRatio: pipelineReadString('thumbnailImageRatio', '1:1'),
      subheadingImageRatio: pipelineReadString('subheadingImageRatio', '1:1'),
    },
  };
}
