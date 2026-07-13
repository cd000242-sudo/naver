import fs from 'node:fs/promises';
import path from 'node:path';

export interface E2EPublishCaptureResult {
  success: true;
  url?: string;
  message: string;
}

function sanitizePayload(payload: Record<string, any>): Record<string, any> {
  return {
    ...payload,
    naverPassword: payload.naverPassword ? '[redacted]' : undefined,
    generatedImages: Array.isArray(payload.generatedImages)
      ? payload.generatedImages.map((image: any) => ({
        heading: image?.heading,
        filePath: image?.filePath,
        provider: image?.provider,
        isThumbnail: image?.isThumbnail === true,
      }))
      : [],
  };
}

export async function captureE2EPublishPayload(
  payload: Record<string, any>,
  env: NodeJS.ProcessEnv = process.env,
  allowCapture = true,
): Promise<E2EPublishCaptureResult | null> {
  const filePath = String(env.E2E_PUBLISH_CAPTURE_FILE || '').trim();
  if (!allowCapture || env.E2E_TEST !== '1' || !filePath) return null;

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify({
    capturedAt: new Date().toISOString(),
    payload: sanitizePayload(payload),
  })}\n`, 'utf8');

  const publishMode = String(payload.publishMode || 'publish');
  return {
    success: true,
    url: publishMode === 'publish'
      ? 'https://blog.naver.com/e2e-runtime/223000001'
      : undefined,
    message: `E2E_PUBLISH_CAPTURED:${publishMode}`,
  };
}
