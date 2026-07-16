import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  buildBatchImageFileName,
  resolveBatchImageDirectory,
} from '../main/ipc/imageDownloadPathPolicy';

describe('image download path policy', () => {
  it('keeps generic batches in their title subfolder', () => {
    expect(resolveBatchImageDirectory('C:/images', 'post-title')).toBe(
      path.join('C:/images', 'post-title'),
    );
    expect(buildBatchImageFileName(0, 'main', '.jpg', 'post-title')).toBe('1_main.jpg');
  });

  it('stores shopping batches directly in the configured root without filename collisions', () => {
    expect(resolveBatchImageDirectory(
      'C:/images',
      'product-title',
      'configured-root',
    )).toBe('C:/images');
    expect(buildBatchImageFileName(
      0,
      'main',
      '.jpg',
      'product-title',
      'configured-root',
      'batch-a1',
    )).toBe('shopping_product-title_batch-a1_1_main.jpg');
  });
});
