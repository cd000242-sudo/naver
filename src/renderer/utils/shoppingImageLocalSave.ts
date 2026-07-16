type RawShoppingImage = string | {
  url?: string;
  filePath?: string;
  localPath?: string;
  thumbnailUrl?: string;
  referenceImageUrl?: string;
  referenceImagePath?: string;
  heading?: string;
  title?: string;
  alt?: string;
  provider?: string;
  [key: string]: any;
};

type LocalSaveOptions = {
  headingPrefix?: string;
  onLog?: (message: string) => void;
};

function getRawImageUrl(image: RawShoppingImage): string {
  if (typeof image === 'string') return image.trim();
  return String(
    image.url ||
    image.filePath ||
    image.localPath ||
    image.thumbnailUrl ||
    image.referenceImageUrl ||
    image.referenceImagePath ||
    ''
  ).trim();
}

function getRawHeading(image: RawShoppingImage, index: number, prefix: string): string {
  if (typeof image === 'string') return `${prefix} ${index + 1}`;
  return String(image.heading || image.title || image.alt || `${prefix} ${index + 1}`).trim();
}

function toLocalShoppingImage(
  image: RawShoppingImage,
  originalUrl: string,
  localPath: string | undefined,
  heading: string,
): any {
  const base: any = typeof image === 'string' ? {} : { ...image };
  const finalPath = localPath || originalUrl;
  return {
    ...base,
    url: finalPath,
    filePath: finalPath,
    localPath: localPath || base.localPath,
    previewDataUrl: finalPath,
    originalUrl,
    sourceUrl: originalUrl,
    referenceImageUrl: base.referenceImageUrl || originalUrl,
    referenceImagePath: localPath || base.referenceImagePath || originalUrl,
    heading,
    provider: base.provider || 'collected',
    savedToLocal: localPath || base.savedToLocal || false,
  };
}

export async function saveCollectedShoppingImagesToLocal(
  images: RawShoppingImage[],
  title: string,
  options: LocalSaveOptions = {},
): Promise<{ images: any[]; savedCount: number; folderPath?: string }> {
  const headingPrefix = options.headingPrefix || 'product image';
  const candidates = (Array.isArray(images) ? images : [])
    .map((image, index) => ({
      image,
      index,
      url: getRawImageUrl(image),
      heading: getRawHeading(image, index, headingPrefix),
    }))
    .filter((item) => item.url.length > 0);

  if (candidates.length === 0) {
    return { images: [], savedCount: 0 };
  }

  const api = (window as any)?.api;
  if (!api?.downloadAndSaveMultipleImages) {
    const fallbackImages = candidates.map((item) =>
      toLocalShoppingImage(item.image, item.url, undefined, item.heading)
    );
    return { images: fallbackImages, savedCount: 0 };
  }

  try {
    const saveResult = await api.downloadAndSaveMultipleImages(
      candidates.map((item) => ({ url: item.url, heading: item.heading })),
      title || 'shopping-images',
      { destination: 'configured-root' },
    );

    const savedImages = Array.isArray(saveResult?.savedImages) ? saveResult.savedImages : [];
    const localImages = candidates.map((item, index) => {
      const saved = savedImages[index];
      const savedPath = typeof saved?.filePath === 'string'
        ? saved.filePath
        : (typeof saved?.savedToLocal === 'string' ? saved.savedToLocal : undefined);
      return toLocalShoppingImage(item.image, item.url, savedPath, item.heading);
    });
    const savedCount = localImages.filter((image) => typeof image.localPath === 'string' && image.localPath.length > 0).length;

    if (saveResult?.folderPath) {
      options.onLog?.(`Saved collected shopping images: ${saveResult.folderPath}`);
    }

    return {
      images: localImages,
      savedCount,
      folderPath: saveResult?.folderPath,
    };
  } catch (error) {
    console.warn('[ShoppingImageLocalSave] Local save failed; keeping remote image URLs:', error);
    const fallbackImages = candidates.map((item) =>
      toLocalShoppingImage(item.image, item.url, undefined, item.heading)
    );
    return { images: fallbackImages, savedCount: 0 };
  }
}
