/**
 * imageNarrativeSupportHandlers.ts — 사진 모드 업로드 지원 IPC.
 *
 * [v2.11.135] The renderer has called electronAPI.convertHeic / extractExif
 * since the photo-mode launch, but neither handler ever existed (dead
 * wiring): iPhone HEIC uploads reached vision providers unconverted and
 * failed with 400 unsupported-image (live user report, 20260619_143854.heic).
 * heic-convert is pure JS (WASM libheif) — no native build deps, safe to
 * package.
 */
import { ipcMain } from 'electron';

type HeicConvertFn = (input: {
  buffer: Buffer;
  format: 'JPEG' | 'PNG';
  quality?: number;
}) => Promise<Buffer | ArrayBuffer | Uint8Array>;

export function registerImageNarrativeSupportHandlers(): void {
  ipcMain.handle('image-narrative:convert-heic', async (_event, payload: { base64?: string }) => {
    try {
      const base64 = payload?.base64;
      if (!base64 || typeof base64 !== 'string') {
        return { success: false, message: 'base64 payload missing' };
      }
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const heicConvert = require('heic-convert') as HeicConvertFn;
      const inputBuffer = Buffer.from(base64, 'base64');
      const output = await heicConvert({ buffer: inputBuffer, format: 'JPEG', quality: 0.9 });
      const outBuffer = Buffer.isBuffer(output) ? output : Buffer.from(output as ArrayBuffer);
      console.log(
        `[ImageNarrative] 🔁 HEIC → JPEG 변환: ${inputBuffer.length.toLocaleString()} → ${outBuffer.length.toLocaleString()} bytes`,
      );
      return { success: true, base64: outBuffer.toString('base64') };
    } catch (error) {
      console.warn(`[ImageNarrative] ⚠️ HEIC 변환 실패: ${(error as Error).message}`);
      return { success: false, message: (error as Error).message };
    }
  });

  ipcMain.handle('image-narrative:extract-exif', async (_event, payload: { base64?: string }) => {
    try {
      const base64 = payload?.base64;
      if (!base64 || typeof base64 !== 'string') return {};
      const { extractExifFromBuffer } = await import('../../imageNarrative/inferenceAggregator/exifEnricher.js');
      return await extractExifFromBuffer(Buffer.from(base64, 'base64'));
    } catch {
      // EXIF is best-effort — the upload flow treats it as optional.
      return {};
    }
  });
}
