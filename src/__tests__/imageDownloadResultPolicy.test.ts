import { describe, expect, it } from 'vitest';
import { summarizeBatchImageDownloads } from '../main/ipc/imageDownloadResultPolicy';

describe('batch image download result policy', () => {
  it('reports a total failure and never consumes quota for null result slots', () => {
    expect(summarizeBatchImageDownloads([null, null], 2)).toEqual({
      success: false,
      partial: false,
      successCount: 0,
      failCount: 2,
      shouldConsumeQuota: false,
    });
  });

  it('reports partial success and consumes once when at least one file exists', () => {
    expect(summarizeBatchImageDownloads([
      { filePath: 'C:/images/one.jpg', heading: 'one' },
      null,
    ], 2)).toEqual({
      success: true,
      partial: true,
      successCount: 1,
      failCount: 1,
      shouldConsumeQuota: true,
    });
  });

  it('reports complete success without counting beyond the requested input size', () => {
    expect(summarizeBatchImageDownloads([
      { filePath: 'C:/images/one.jpg', heading: 'one' },
      { filePath: 'C:/images/two.jpg', heading: 'two' },
    ], 2)).toEqual({
      success: true,
      partial: false,
      successCount: 2,
      failCount: 0,
      shouldConsumeQuota: true,
    });
  });
});
