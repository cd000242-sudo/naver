/**
 * imageNarrativeSupportHandlers.ts — 사진 모드 업로드 지원 IPC.
 *
 * [v2.11.135] The renderer has called electronAPI.convertHeic / extractExif
 * since the photo-mode launch, but neither handler ever existed (dead
 * wiring): iPhone HEIC uploads reached vision providers unconverted and
 * failed with 400 unsupported-image (live user report, 20260619_143854.heic).
 * heic-convert is pure JS (WASM libheif) — no native build deps, safe to
 * package.
 *
 * [2026-10-01] AVIF 도 같은 채널로 처리한다. 채널 이름은 'convert-heic' 로 두되(preload
 * 화이트리스트·기존 테스트가 이 이름을 잠근다) 1순위 변환기를 sharp 로 바꿨다 —
 * heic-convert 는 HEIC 전용이어서 AVIF 가 들어오면 실패했다.
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
      const inputBuffer = Buffer.from(base64, 'base64');

      // [2026-10-01] 1순위 sharp(libheif) — AVIF 와 HEIC 를 모두 디코딩한다.
      //   heic-convert 는 HEIC 전용이라 AVIF 가 들어오면 실패했고, 그래서 사진 모드가
      //   AVIF 를 아예 안 받았다. 업로드/저장 경로와 같은 변환기를 쓴다.
      const { ensureNaverDecodableBuffer } = await import('../../image/naverImageTranscode.js');
      const decodable = await ensureNaverDecodableBuffer(inputBuffer, (msg) => console.log(`[ImageNarrative] ${msg}`));
      if (decodable.converted) {
        return { success: true, base64: decodable.buffer.toString('base64') };
      }

      // 2순위 heic-convert(WASM libheif) — sharp 가 못 읽은 HEIC 변종 대비.
      //   v2.11.135 부터 쓰던 경로이므로 그대로 남겨 둔다.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const heicConvert = require('heic-convert') as HeicConvertFn;
      const output = await heicConvert({ buffer: inputBuffer, format: 'JPEG', quality: 0.9 });
      const outBuffer = Buffer.isBuffer(output) ? output : Buffer.from(output as ArrayBuffer);
      console.log(
        `[ImageNarrative] 🔁 HEIC → JPEG 변환(heic-convert 폴백): ${inputBuffer.length.toLocaleString()} → ${outBuffer.length.toLocaleString()} bytes`,
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
