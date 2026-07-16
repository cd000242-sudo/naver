import * as path from 'path';

export type BatchImageDestination = 'title-subfolder' | 'configured-root';

export function resolveBatchImageDirectory(
  basePath: string,
  safeTitle: string,
  destination: BatchImageDestination = 'title-subfolder',
): string {
  return destination === 'configured-root'
    ? basePath
    : path.join(basePath, safeTitle);
}

export function buildBatchImageFileName(
  index: number,
  safeHeading: string,
  extension: string,
  safeTitle: string,
  destination: BatchImageDestination = 'title-subfolder',
  batchToken = '',
): string {
  if (destination === 'configured-root') {
    const safeToken = batchToken.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 32) || 'batch';
    return `shopping_${safeTitle}_${safeToken}_${index + 1}_${safeHeading}${extension}`;
  }
  return `${index + 1}_${safeHeading}${extension}`;
}
