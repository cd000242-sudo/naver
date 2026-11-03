import { GEMINI_IMAGE_MODELS } from '../runtime/modelRegistry.js';

export type StylePreviewEngineKind =
  | 'flow'
  | 'gemini'
  | 'pollinations'
  | 'imagefx';

export interface StylePreviewEngineRoute {
  readonly engine: string;
  readonly kind: StylePreviewEngineKind;
  readonly cacheKey: string;
  readonly model?: string;
}

const ROUTES: Readonly<Record<string, StylePreviewEngineRoute>> = Object.freeze({
  flow: { engine: 'flow', kind: 'flow', cacheKey: 'flow' },
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
  imagefx: { engine: 'imagefx', kind: 'imagefx', cacheKey: 'imagefx' },
});

/** Resolve only engines the style-preview implementation can actually call. */
export function resolveStylePreviewEngine(value: unknown): StylePreviewEngineRoute | null {
  const requested = String(value || 'flow').trim().toLowerCase();
  // [2026-10-10] 나노바나나 프로·2.5는 화면에서 내려감 — 옛 값은 나노바나나2 경로로
  const effective = requested === 'nano-banana-pro' || requested === 'nano-banana' ? 'nano-banana-2' : requested;
  return ROUTES[effective] || null;
}
