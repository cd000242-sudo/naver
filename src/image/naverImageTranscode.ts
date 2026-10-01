// src/image/naverImageTranscode.ts
// 네이버가 받지 않는 이미지 포맷(AVIF/HEIC)을 업로드 가능한 JPEG 로 바꾼다.
//
// [2026-10-01 사용자 요청 "avif 파일도 인식해서 올라가게"] 실측된 실패 경로:
//   1. 뉴스사 이미지가 Content-Type: image/avif 로 내려온다.
//   2. resolveExtensionFromBytes 가 AVIF 매직 바이트를 몰라서 폴백 '.jpg' 를 돌려주고,
//      AVIF 바이트가 .jpg 이름으로 저장된다.
//   3. 발행 단계에서 네이버 에디터가 "파일 전송 오류 — 알 수 없는 파일"로 거부한다.
// 네이버 허용 목록(jpg/jpeg/png/gif/bmp/webp)에 AVIF 가 없으므로 이름이 아니라
// 내용을 바꿔야 한다. sharp 에 포함된 libheif 가 AVIF/HEIC 를 디코딩한다.

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import {
  sniffTranscodableFormat,
  type TranscodableImageFormat,
} from '../main/ipc/imageExtensionPolicy.js';

/** 수집 이미지의 재인코딩이므로 열화를 최소화한다. */
const JPEG_QUALITY = 92;

/** ISO-BMFF 브랜드는 선두 16바이트로 판별된다. */
const SNIFF_BYTES = 16;

export interface TranscodeBufferResult {
  readonly buffer: Buffer;
  readonly converted: boolean;
  readonly from: TranscodableImageFormat | null;
}

export interface TranscodeFileResult {
  readonly filePath: string;
  readonly converted: boolean;
  readonly from: TranscodableImageFormat | null;
}

async function toJpegBuffer(buffer: Buffer): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  // rotate() 는 EXIF 방향을 적용한다 — 아이폰 HEIC 사진이 눕는 것을 막는다.
  return await sharp(buffer).rotate().jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer();
}

/**
 * 버퍼가 AVIF/HEIC 면 JPEG 버퍼로 바꿔 돌려준다. 아니면 원본 그대로.
 * 변환 실패(깨진 파일 등)는 원본을 돌려준다 — 여기서 던지면 기존에 올라가던
 * 이미지까지 같이 떨어진다. 깨진 바이트 판정은 verifyImagePayload 의 몫이다.
 */
export async function ensureNaverDecodableBuffer(
  buffer: Buffer,
  log?: (msg: string) => void,
): Promise<TranscodeBufferResult> {
  const from = sniffTranscodableFormat(buffer);
  if (!from) return { buffer, converted: false, from: null };

  try {
    const jpeg = await toJpegBuffer(buffer);
    log?.(
      `🔄 ${from.toUpperCase()} → JPG 변환: ${(buffer.length / 1024).toFixed(1)}KB → ` +
      `${(jpeg.length / 1024).toFixed(1)}KB (네이버가 ${from.toUpperCase()} 를 받지 않음)`,
    );
    return { buffer: jpeg, converted: true, from };
  } catch (error) {
    log?.(`⚠️ ${from.toUpperCase()} → JPG 변환 실패(원본 유지): ${(error as Error).message}`);
    return { buffer, converted: false, from };
  }
}

/** 파일 선두만 읽어 변환 대상인지 본다. 큰 파일을 통째로 읽지 않는다. */
async function sniffFile(filePath: string): Promise<TranscodableImageFormat | null> {
  let handle: Awaited<ReturnType<typeof fs.open>> | null = null;
  try {
    handle = await fs.open(filePath, 'r');
    const head = Buffer.alloc(SNIFF_BYTES);
    const { bytesRead } = await handle.read(head, 0, SNIFF_BYTES, 0);
    if (bytesRead < SNIFF_BYTES) return null;
    return sniffTranscodableFormat(head);
  } catch {
    return null;
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

/**
 * 파일이 AVIF/HEIC 면 임시 .jpg 로 변환해 그 경로를 돌려준다. 아니면 원본 경로.
 * 확장자를 믿지 않고 내용으로 판정한다 — 구버전이 저장해 둔 "AVIF 바이트인 .jpg"
 * 파일이 이미 수집 폴더에 남아 있다.
 * converted=true 면 호출자가 임시 파일로 취급해 업로드 후 지워야 한다.
 */
export async function ensureNaverDecodableFile(
  filePath: string,
  log?: (msg: string) => void,
): Promise<TranscodeFileResult> {
  const from = await sniffFile(filePath);
  if (!from) return { filePath, converted: false, from: null };

  try {
    const original = await fs.readFile(filePath);
    const jpeg = await toJpegBuffer(original);
    const convertedPath = path.join(
      os.tmpdir(),
      `naver-blog-img-transcode-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`,
    );
    await fs.writeFile(convertedPath, jpeg);
    log?.(
      `   🔄 ${from.toUpperCase()} → JPG 변환: ${path.basename(filePath)} ` +
      `(${(original.length / 1024).toFixed(1)}KB → ${(jpeg.length / 1024).toFixed(1)}KB)`,
    );
    return { filePath: convertedPath, converted: true, from };
  } catch (error) {
    log?.(`   ⚠️ ${from.toUpperCase()} → JPG 변환 실패(원본으로 계속): ${(error as Error).message}`);
    return { filePath, converted: false, from };
  }
}
