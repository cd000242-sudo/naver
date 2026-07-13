import { parsePrice } from '../../services/priceNormalizer.js';
import { BrandStoreProvider } from './providers/BrandStoreProvider.js';
import type { CollectionOptions, CollectionResult, ProductImage } from './types.js';

export interface BrandStoreAffiliateProduct {
  name: string;
  price: number;
  stock: number;
  options: unknown[];
  detailUrl: string;
  mainImage: string | null;
  galleryImages: string[];
  detailImages: string[];
  description?: string;
}

interface BrandStoreCollectionClient {
  collectImages(url: string, options?: CollectionOptions): Promise<CollectionResult>;
}

const OFFICIAL_IMAGE_TYPES = new Set<ProductImage['type']>([
  'main',
  'gallery',
  'gallery-thumb-fallback',
]);

function dedupeOfficialImages(images: ProductImage[]): ProductImage[] {
  const seen = new Set<string>();
  const official: ProductImage[] = [];

  for (const image of images) {
    if (!OFFICIAL_IMAGE_TYPES.has(image.type)) continue;
    const url = String(image.url || '').trim();
    if (!/^https?:\/\//i.test(url)) continue;
    const key = url.split('?')[0].toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    official.push({ ...image, url });
  }

  return official;
}

export function mapBrandStoreCollectionToAffiliateProduct(
  collection: CollectionResult,
  originalUrl: string,
): BrandStoreAffiliateProduct | null {
  const name = String(collection.productInfo?.name || '').trim();
  const price = parsePrice(collection.productInfo?.price);
  const officialImages = dedupeOfficialImages(collection.images || []);

  if (!collection.success || name.length < 3 || price === null || officialImages.length === 0) {
    return null;
  }

  const representative = officialImages.find(image => image.type === 'main') || officialImages[0];
  const galleryImages = [representative, ...officialImages.filter(image => image !== representative)]
    .map(image => image.url);
  const availability = String(collection.productInfo?.availability || '').toLowerCase();

  return {
    name,
    price,
    stock: availability.includes('outofstock') ? 0 : 1,
    options: Array.isArray(collection.productInfo?.options)
      ? [...collection.productInfo.options]
      : [],
    detailUrl: originalUrl,
    mainImage: representative.url,
    galleryImages,
    detailImages: [],
    description: String(collection.productInfo?.description || '').trim(),
  };
}

export async function crawlBrandStoreAffiliateProduct(
  url: string,
  client: BrandStoreCollectionClient = new BrandStoreProvider(),
): Promise<BrandStoreAffiliateProduct | null> {
  const result = await client.collectImages(url, {
    timeout: 45000,
    maxImages: 30,
    includeDetails: false,
    includeReviews: false,
    validateWithAI: false,
    useCache: false,
  });

  return mapBrandStoreCollectionToAffiliateProduct(result, url);
}
