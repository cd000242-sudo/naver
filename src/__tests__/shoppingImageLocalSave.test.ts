import fs from 'fs';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveCollectedShoppingImagesToLocal } from '../renderer/utils/shoppingImageLocalSave';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('saveCollectedShoppingImagesToLocal', () => {
  it('requests the configured image root so the local-folder loader can see shopping images', async () => {
    const downloadAndSaveMultipleImages = vi.fn().mockResolvedValue({
      success: true,
      folderPath: 'C:/configured-images',
      savedImages: [{ filePath: 'C:/configured-images/product_1_main.jpg' }],
    });
    vi.stubGlobal('window', { api: { downloadAndSaveMultipleImages } });

    const result = await saveCollectedShoppingImagesToLocal(
      [{ url: 'https://example.com/product.jpg', heading: 'main' }],
      'product',
    );

    expect(downloadAndSaveMultipleImages).toHaveBeenCalledWith(
      [{ url: 'https://example.com/product.jpg', heading: 'main' }],
      'product',
      { destination: 'configured-root' },
    );
    expect(result).toMatchObject({
      savedCount: 1,
      folderPath: 'C:/configured-images',
    });
    expect(result.images[0]).toMatchObject({
      localPath: 'C:/configured-images/product_1_main.jpg',
      savedToLocal: 'C:/configured-images/product_1_main.jpg',
    });
  });

  it('keeps the manual shopping-collection save path in the configured root too', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src', 'renderer', 'modules', 'headingImageGen.ts'),
      'utf8',
    );
    const shoppingCollectionStart = source.indexOf('const shoppingCollectBtn');
    const saveCallStart = source.indexOf(
      'const saveResult = await window.api.downloadAndSaveMultipleImages(',
      shoppingCollectionStart,
    );
    const manualShoppingSaveCall = source.slice(
      saveCallStart,
      source.indexOf(');', saveCallStart) + 2,
    );

    expect(manualShoppingSaveCall).toMatch(
      /downloadAndSaveMultipleImages\(\s*allImagesToSave,\s*sanitizedFolderName,\s*\{\s*destination:\s*'configured-root'\s*}\s*,?\s*\)/,
    );
  });
});
