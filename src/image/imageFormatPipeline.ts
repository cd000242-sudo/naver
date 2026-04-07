/**
 * imageFormatPipeline.ts
 *
 * 네이버 블로그 업로드용 이미지 포맷 변환/검증/메타데이터 정리 파이프라인.
 * - magic bytes 기반 포맷 감지
 * - WebP/GIF → JPEG 자동 변환
 * - EXIF/IPTC/XMP 메타데이터 제거 (AI 생성 흔적 제거)
 * - 네이버 호환 크기 검증 및 자동 리사이즈
 */

import sharp from 'sharp';
import fs from 'fs/promises';

// ─── Types ──────────────────────────────────────────────────────────────────

export type ImageFormat = 'jpeg' | 'png' | 'webp' | 'gif' | 'unknown';

export interface ConversionResult {
  readonly buffer: Buffer;
  readonly format: ImageFormat;
  readonly wasConverted: boolean;
  readonly originalFormat: ImageFormat;
  readonly sizeReduction: number;
}

export interface DimensionResult {
  readonly width: number;
  readonly height: number;
  readonly wasResized: boolean;
  readonly meetsMinimum: boolean;
}

export interface ProcessedImage {
  readonly buffer: Buffer;
  readonly format: ImageFormat;
  readonly width: number;
  readonly height: number;
  readonly sizeBytes: number;
  readonly wasModified: boolean;
  readonly modifications: readonly string[];
}

export interface ConversionOptions {
  readonly quality?: number;
  readonly forceFormat?: 'jpeg' | 'png';
}

export interface DimensionOptions {
  readonly minWidth?: number;
  readonly maxWidth?: number;
}

export interface ProcessOptions {
  readonly quality?: number;
  readonly forceFormat?: 'jpeg' | 'png';
  readonly minWidth?: number;
  readonly maxWidth?: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_QUALITY = 85;
const DEFAULT_MIN_WIDTH = 400;
const DEFAULT_MAX_WIDTH = 4096;

const NAVER_COMPATIBLE_FORMATS: ReadonlySet<ImageFormat> = new Set(['jpeg', 'png']);

// ─── Magic Bytes ────────────────────────────────────────────────────────────

const MAGIC_JPEG = [0xff, 0xd8] as const;
const MAGIC_PNG = [0x89, 0x50, 0x4e, 0x47] as const;
const MAGIC_GIF = [0x47, 0x49, 0x46] as const;
// WebP: starts with RIFF (4 bytes), then 4 bytes size, then WEBP
const MAGIC_RIFF = [0x52, 0x49, 0x46, 0x46] as const;
const MAGIC_WEBP = [0x57, 0x45, 0x42, 0x50] as const;

// ─── Format Detection ───────────────────────────────────────────────────────

/**
 * magic bytes로 이미지 포맷을 감지한다.
 *
 * 비유: 파일 확장자가 가짜일 수 있으므로, 파일 내용의 "지문"(magic bytes)을 직접 확인하는 것.
 * 마치 신분증 사진이 아닌 실제 얼굴로 본인 확인하는 것과 같다.
 */
export function detectFormat(buffer: Buffer): ImageFormat {
  if (!buffer || buffer.length < 12) {
    return 'unknown';
  }

  // JPEG: FF D8
  if (buffer[0] === MAGIC_JPEG[0] && buffer[1] === MAGIC_JPEG[1]) {
    return 'jpeg';
  }

  // PNG: 89 50 4E 47
  if (
    buffer[0] === MAGIC_PNG[0] &&
    buffer[1] === MAGIC_PNG[1] &&
    buffer[2] === MAGIC_PNG[2] &&
    buffer[3] === MAGIC_PNG[3]
  ) {
    return 'png';
  }

  // WebP: RIFF....WEBP
  if (
    buffer[0] === MAGIC_RIFF[0] &&
    buffer[1] === MAGIC_RIFF[1] &&
    buffer[2] === MAGIC_RIFF[2] &&
    buffer[3] === MAGIC_RIFF[3] &&
    buffer[8] === MAGIC_WEBP[0] &&
    buffer[9] === MAGIC_WEBP[1] &&
    buffer[10] === MAGIC_WEBP[2] &&
    buffer[11] === MAGIC_WEBP[3]
  ) {
    return 'webp';
  }

  // GIF: 47 49 46
  if (
    buffer[0] === MAGIC_GIF[0] &&
    buffer[1] === MAGIC_GIF[1] &&
    buffer[2] === MAGIC_GIF[2]
  ) {
    return 'gif';
  }

  return 'unknown';
}

// ─── Format Conversion ─────────────────────────────────────────────────────

/**
 * 네이버 호환 포맷(JPEG/PNG)이 아닌 이미지를 자동 변환한다.
 *
 * 비유: 외국 여권을 국내용 신분증으로 교환하는 것.
 * WebP/GIF는 네이버에서 문제가 될 수 있으므로 JPEG로 변환한다.
 */
export async function convertToNaverCompatible(
  buffer: Buffer,
  options?: ConversionOptions
): Promise<ConversionResult> {
  const originalFormat = detectFormat(buffer);
  const quality = options?.quality ?? DEFAULT_QUALITY;
  const targetFormat = options?.forceFormat ?? 'jpeg';

  // 이미 네이버 호환 포맷이면 변환 불필요
  if (NAVER_COMPATIBLE_FORMATS.has(originalFormat)) {
    return {
      buffer,
      format: originalFormat,
      wasConverted: false,
      originalFormat,
      sizeReduction: 0,
    };
  }

  try {
    const sharpInstance = sharp(buffer);

    const converted =
      targetFormat === 'png'
        ? await sharpInstance.png().toBuffer()
        : await sharpInstance.jpeg({ quality, mozjpeg: true }).toBuffer();

    return {
      buffer: converted,
      format: targetFormat,
      wasConverted: true,
      originalFormat,
      sizeReduction: buffer.length - converted.length,
    };
  } catch (error) {
    // fail-safe: 변환 실패 시 원본 반환
    console.error('[ImageFormatPipeline] 포맷 변환 실패, 원본 반환:', error);
    return {
      buffer,
      format: originalFormat,
      wasConverted: false,
      originalFormat,
      sizeReduction: 0,
    };
  }
}

// ─── EXIF Metadata Stripping ────────────────────────────────────────────────

/**
 * EXIF/IPTC/XMP 메타데이터를 완전 제거한다.
 * AI 생성 도구 흔적(Software, Creator 등)을 제거하여 자연스러운 이미지로 만든다.
 * ICC 프로필은 sRGB로 변환 후 유지한다.
 *
 * 비유: 사진 뒷면에 적힌 촬영 정보(카메라, 날짜, GPS 등)를 모두 지우는 것.
 * AI가 만든 이미지라는 "발자국"도 함께 지운다.
 */
export async function stripExifMetadata(buffer: Buffer): Promise<Buffer> {
  try {
    const stripped = await sharp(buffer)
      .withMetadata({}) // ICC 프로필 기본값(sRGB) 유지, EXIF/IPTC/XMP 제거
      .toColourspace('srgb')
      .toBuffer();

    return stripped;
  } catch (error) {
    // fail-safe: 메타데이터 제거 실패 시 원본 반환
    console.error('[ImageFormatPipeline] 메타데이터 제거 실패, 원본 반환:', error);
    return buffer;
  }
}

// ─── Dimension Validation ───────────────────────────────────────────────────

/**
 * 이미지 크기를 확인하고 필요 시 자동 리사이즈한다.
 * - 최소 너비 미달: 업스케일하지 않고 부적합으로 표시
 * - 최대 너비 초과: 다운스케일 (비율 유지)
 *
 * 비유: 액자에 사진을 넣기 전에 사이즈를 재는 것.
 * 너무 작으면 "이건 안 돼"라고 알려주고, 너무 크면 줄여서 맞춘다.
 */
export async function validateImageDimensions(
  buffer: Buffer,
  options?: DimensionOptions
): Promise<{ buffer: Buffer; dimensions: DimensionResult }> {
  const minWidth = options?.minWidth ?? DEFAULT_MIN_WIDTH;
  const maxWidth = options?.maxWidth ?? DEFAULT_MAX_WIDTH;

  try {
    const metadata = await sharp(buffer).metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;

    const meetsMinimum = width >= minWidth;

    // 최대 크기 초과 시 리사이즈
    if (width > maxWidth) {
      const resized = await sharp(buffer)
        .resize({ width: maxWidth, withoutEnlargement: true })
        .toBuffer();

      const resizedMeta = await sharp(resized).metadata();

      return {
        buffer: resized,
        dimensions: {
          width: resizedMeta.width ?? maxWidth,
          height: resizedMeta.height ?? 0,
          wasResized: true,
          meetsMinimum,
        },
      };
    }

    return {
      buffer,
      dimensions: {
        width,
        height,
        wasResized: false,
        meetsMinimum,
      },
    };
  } catch (error) {
    // fail-safe: 검증 실패 시 원본 반환
    console.error('[ImageFormatPipeline] 크기 검증 실패, 원본 반환:', error);
    return {
      buffer,
      dimensions: {
        width: 0,
        height: 0,
        wasResized: false,
        meetsMinimum: false,
      },
    };
  }
}

// ─── Integrated Pipeline ────────────────────────────────────────────────────

/**
 * 통합 이미지 처리 파이프라인.
 * 포맷감지 → 변환 → EXIF제거 → 크기검증 → 최종 반환.
 *
 * 비유: 공항 보안 검색대와 같다.
 * 1단계: 여권(포맷) 확인
 * 2단계: 비자 발급(포맷 변환)
 * 3단계: 소지품 검사(메타데이터 제거)
 * 4단계: 수하물 크기 확인(크기 검증)
 * 모든 단계를 통과해야 탑승(업로드) 가능.
 */
export async function processImageForUpload(
  inputPath: string,
  options?: ProcessOptions
): Promise<ProcessedImage> {
  const modifications: string[] = [];

  try {
    // 1. 파일 읽기
    const originalBuffer = await fs.readFile(inputPath);

    // 2. 포맷 감지
    const detectedFormat = detectFormat(originalBuffer);
    if (detectedFormat !== 'unknown') {
      modifications.push(`포맷 감지: ${detectedFormat}`);
    }

    // 3. 네이버 호환 포맷으로 변환
    const conversionResult = await convertToNaverCompatible(originalBuffer, {
      quality: options?.quality,
      forceFormat: options?.forceFormat,
    });
    if (conversionResult.wasConverted) {
      modifications.push(
        `포맷 변환: ${conversionResult.originalFormat} → ${conversionResult.format} (${conversionResult.sizeReduction > 0 ? `-${conversionResult.sizeReduction} bytes` : `+${Math.abs(conversionResult.sizeReduction)} bytes`})`
      );
    }

    // 4. EXIF 메타데이터 제거
    const strippedBuffer = await stripExifMetadata(conversionResult.buffer);
    if (strippedBuffer.length !== conversionResult.buffer.length) {
      modifications.push('EXIF/IPTC/XMP 메타데이터 제거');
    }

    // 5. 크기 검증 및 리사이즈
    const { buffer: finalBuffer, dimensions } = await validateImageDimensions(
      strippedBuffer,
      {
        minWidth: options?.minWidth,
        maxWidth: options?.maxWidth,
      }
    );
    if (dimensions.wasResized) {
      modifications.push(`리사이즈: → ${dimensions.width}x${dimensions.height}`);
    }
    if (!dimensions.meetsMinimum) {
      modifications.push(`최소 너비 미달: ${dimensions.width}px < ${options?.minWidth ?? DEFAULT_MIN_WIDTH}px`);
    }

    const finalFormat = detectFormat(finalBuffer);
    const wasModified =
      conversionResult.wasConverted ||
      strippedBuffer.length !== conversionResult.buffer.length ||
      dimensions.wasResized;

    return {
      buffer: finalBuffer,
      format: finalFormat !== 'unknown' ? finalFormat : conversionResult.format,
      width: dimensions.width,
      height: dimensions.height,
      sizeBytes: finalBuffer.length,
      wasModified,
      modifications,
    };
  } catch (error) {
    // fail-safe: 전체 파이프라인 실패 시 원본 파일 그대로 반환
    console.error('[ImageFormatPipeline] 파이프라인 실패, 원본 반환:', error);

    try {
      const fallbackBuffer = await fs.readFile(inputPath);
      const fallbackFormat = detectFormat(fallbackBuffer);
      const fallbackMeta = await sharp(fallbackBuffer).metadata();

      return {
        buffer: fallbackBuffer,
        format: fallbackFormat,
        width: fallbackMeta.width ?? 0,
        height: fallbackMeta.height ?? 0,
        sizeBytes: fallbackBuffer.length,
        wasModified: false,
        modifications: ['파이프라인 실패 — 원본 반환'],
      };
    } catch {
      // 파일 읽기조차 실패한 경우
      throw new Error(`이미지 파일을 읽을 수 없습니다: ${inputPath}`);
    }
  }
}
