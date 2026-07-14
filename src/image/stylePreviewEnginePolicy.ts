import { GEMINI_IMAGE_MODELS } from '../runtime/modelRegistry.js';

export type StylePreviewEngineKind =
  | 'flow'
  | 'deepinfra'
  | 'gemini'
  | 'pollinations'
  | 'leonardoai'
  | 'stability'
  | 'imagefx';

export interface StylePreviewEngineRoute {
  readonly engine: string;
  readonly kind: StylePreviewEngineKind;
  readonly cacheKey: string;
  readonly model?: string;
}

const ROUTES: Readonly<Record<string, StylePreviewEngineRoute>> = Object.freeze({
  flow: { engine: 'flow', kind: 'flow', cacheKey: 'flow' },
  deepinfra: { engine: 'deepinfra', kind: 'deepinfra', cacheKey: 'deepinfra' },
  'deepinfra-flux': { engine: 'deepinfra', kind: 'deepinfra', cacheKey: 'deepinfra' },
  'deepinfra-flux-2': { engine: 'deepinfra', kind: 'deepinfra', cacheKey: 'deepinfra' },
  gemini: {
    engine: 'gemini',
    kind: 'gemini',
    cacheKey: 'gemini-lite',
    model: GEMINI_IMAGE_MODELS.NANO_BANANA_LITE,
  },
  'nano-banana': {
    engine: 'nano-banana',
    kind: 'gemini',
    cacheKey: 'nano-banana',
    model: GEMINI_IMAGE_MODELS.STANDARD,
  },
  'nano-banana-2': {
    engine: 'nano-banana-2',
    kind: 'gemini',
    cacheKey: 'nano-banana-2',
    model: GEMINI_IMAGE_MODELS.NANO_BANANA_2,
  },
  'nano-banana-pro': {
    engine: 'nano-banana-pro',
    kind: 'gemini',
    cacheKey: 'nano-banana-pro',
    model: GEMINI_IMAGE_MODELS.NANO_BANANA_PRO,
  },
  pollinations: { engine: 'pollinations', kind: 'pollinations', cacheKey: 'pollinations' },
  leonardoai: { engine: 'leonardoai', kind: 'leonardoai', cacheKey: 'leonardoai' },
  stability: { engine: 'stability', kind: 'stability', cacheKey: 'stability' },
  imagefx: { engine: 'imagefx', kind: 'imagefx', cacheKey: 'imagefx' },
});

/** Resolve only engines the style-preview implementation can actually call. */
export function resolveStylePreviewEngine(value: unknown): StylePreviewEngineRoute | null {
  const requested = String(value || 'flow').trim().toLowerCase();
  return ROUTES[requested] || null;
}
