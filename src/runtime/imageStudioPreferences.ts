export const DEFAULT_IMAGE_STUDIO_SOURCE = 'openai-image';

/** A saved choice outranks the HTML default; invalid legacy values do not. */
export function resolveImageStudioSource(
  globalSource: string | null,
  fullAutoSource: string | null,
  availableSources: readonly string[],
): string {
  return [fullAutoSource, globalSource].find(value => value && availableSources.includes(value))
    || DEFAULT_IMAGE_STUDIO_SOURCE;
}

interface StudioPreferences {
  imageStudioPreferencesVersion?: number;
  thumbnailQualityMode?: string;
  headingImageTextInclude?: boolean;
  imageLook?: string;
}

/** Retire the removed switches once, without persisting decrypted settings outside the normal save queue. */
export function normalizeImageStudioPreferences<T extends StudioPreferences>(config: T): T & StudioPreferences {
  if ((config.imageStudioPreferencesVersion ?? 0) >= 1) return { ...config };
  return {
    ...config,
    thumbnailQualityMode: 'standard',
    headingImageTextInclude: false,
    imageLook: 'stock',
    imageStudioPreferencesVersion: 1,
  };
}
