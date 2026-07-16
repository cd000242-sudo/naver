export interface BatchImageDownloadSummary {
  readonly success: boolean;
  readonly partial: boolean;
  readonly successCount: number;
  readonly failCount: number;
  readonly shouldConsumeQuota: boolean;
}

export function summarizeBatchImageDownloads(
  results: ReadonlyArray<unknown | null>,
  requestedCount: number,
): BatchImageDownloadSummary {
  const boundedRequestedCount = Math.max(0, Math.trunc(requestedCount));
  const successCount = Math.min(
    boundedRequestedCount,
    results.filter(result => result !== null && result !== undefined).length,
  );
  const failCount = Math.max(0, boundedRequestedCount - successCount);
  const success = successCount > 0;

  return Object.freeze({
    success,
    partial: success && failCount > 0,
    successCount,
    failCount,
    shouldConsumeQuota: success,
  });
}
