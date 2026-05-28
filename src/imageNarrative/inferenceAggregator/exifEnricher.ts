/**
 * EXIF metadata extraction for the image-narrative pipeline.
 *
 * Uses the `sharp` library (already installed) to read EXIF data from image
 * buffers or file paths. Always returns a partial result — never throws on
 * missing or malformed EXIF. Callers should handle absent fields gracefully.
 */

import sharp from 'sharp';
import { readFile } from 'fs/promises';
import type { ImageExif } from '../types.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Converts a GPS rational array [degrees, minutes, seconds] to decimal degrees.
 * Each element is a fraction represented as { numerator, denominator }.
 */
function rationalToDecimal(
  rational: Array<{ numerator: number; denominator: number }>,
): number {
  if (!Array.isArray(rational) || rational.length < 3) return 0;
  const [deg, min, sec] = rational;
  return (
    (deg?.numerator ?? 0) / (deg?.denominator ?? 1) +
    (min?.numerator ?? 0) / (min?.denominator ?? 1) / 60 +
    (sec?.numerator ?? 0) / (sec?.denominator ?? 1) / 3600
  );
}

/**
 * Converts an EXIF DateTimeOriginal string ("YYYY:MM:DD HH:MM:SS") to a Date.
 * Returns undefined if the format is invalid.
 */
function parseExifDateTime(raw: string): Date | undefined {
  if (!raw || typeof raw !== 'string') return undefined;
  // "2024:07:15 13:45:00"  →  "2024-07-15T13:45:00"
  const normalized = raw.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
  const d = new Date(normalized);
  return isNaN(d.getTime()) ? undefined : d;
}

// ---------------------------------------------------------------------------
// EXIF extraction
// ---------------------------------------------------------------------------

/**
 * Reads EXIF metadata from a raw image buffer.
 *
 * @param buffer - Raw image bytes (JPEG, PNG, HEIC, etc.).
 * @returns Partial ImageExif. Missing fields are omitted, never null.
 */
export async function extractExifFromBuffer(buffer: Buffer): Promise<ImageExif> {
  try {
    const metadata = await sharp(buffer).metadata();
    return parseSharpMetadata(metadata);
  } catch {
    // Damaged / unsupported format — return empty EXIF silently
    return {};
  }
}

/**
 * Reads EXIF metadata from a file path.
 *
 * @param filePath - Absolute path to the image file.
 * @returns Partial ImageExif. Missing fields are omitted.
 */
export async function extractExifFromFile(filePath: string): Promise<ImageExif> {
  try {
    const buffer = await readFile(filePath);
    return extractExifFromBuffer(buffer);
  } catch {
    return {};
  }
}

/**
 * Unified entry point. Accepts either a Buffer or an absolute file path string.
 */
export async function extractExif(
  source: Buffer | string,
): Promise<ImageExif> {
  if (typeof source === 'string') {
    return extractExifFromFile(source);
  }
  return extractExifFromBuffer(source);
}

// ---------------------------------------------------------------------------
// Sharp metadata parser
// ---------------------------------------------------------------------------

/**
 * Maps the raw sharp Metadata object to our typed ImageExif.
 * All fields are optional — absent data is simply omitted.
 */
function parseSharpMetadata(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata: any,
): ImageExif {
  const exif: Partial<ImageExif> = {};

  // sharp exposes parsed EXIF via metadata.exif (Buffer) — we decode inline
  // for common fields. For full EXIF we rely on metadata.exif being present.
  const raw = metadata?.exif;
  if (!raw || !Buffer.isBuffer(raw)) {
    // Attempt to recover from other sharp metadata fields
    if (metadata?.make || metadata?.model) {
      exif.camera = [metadata.make, metadata.model].filter(Boolean).join(' ');
    }
    return exif;
  }

  // Parse EXIF binary manually for the fields we care about
  try {
    const parsed = parseExifBinary(raw);

    if (parsed.dateTimeOriginal) {
      const d = parseExifDateTime(parsed.dateTimeOriginal);
      if (d) exif.takenAt = d.toISOString();
    }

    if (parsed.gpsLatitude != null && parsed.gpsLatitudeRef != null) {
      let lat = rationalToDecimal(parsed.gpsLatitude);
      if (parsed.gpsLatitudeRef === 'S') lat = -lat;
      exif.gpsLat = lat;
    }

    if (parsed.gpsLongitude != null && parsed.gpsLongitudeRef != null) {
      let lng = rationalToDecimal(parsed.gpsLongitude);
      if (parsed.gpsLongitudeRef === 'W') lng = -lng;
      exif.gpsLng = lng;
    }

    if (parsed.make || parsed.model) {
      exif.camera = [parsed.make, parsed.model].filter(Boolean).join(' ');
    }
  } catch {
    // Malformed EXIF binary — return what we have so far
  }

  return exif;
}

// ---------------------------------------------------------------------------
// Minimal EXIF binary parser
// ---------------------------------------------------------------------------

interface RawExifFields {
  dateTimeOriginal?: string;
  gpsLatitude?: Array<{ numerator: number; denominator: number }>;
  gpsLatitudeRef?: string;
  gpsLongitude?: Array<{ numerator: number; denominator: number }>;
  gpsLongitudeRef?: string;
  make?: string;
  model?: string;
}

/**
 * Parses key EXIF fields from a raw binary EXIF buffer.
 * This is a minimal parser targeting only the fields needed for narrative
 * generation. It does NOT implement the full EXIF/TIFF spec.
 *
 * Implementation strategy: use a regex/string scan over the string-decoded
 * buffer for ASCII fields, and a basic IFD walk for GPS rationals.
 * This avoids adding an exif-parser dependency while remaining robust.
 */
function parseExifBinary(exifBuf: Buffer): RawExifFields {
  const result: RawExifFields = {};
  if (!exifBuf || exifBuf.length < 8) return result;

  // Check for Exif header
  const header = exifBuf.toString('ascii', 0, 6);
  if (!header.startsWith('Exif')) return result;

  // Byte order: 'II' = little-endian, 'MM' = big-endian
  const byteOrderOffset = 6;
  const byteOrder = exifBuf.toString('ascii', byteOrderOffset, byteOrderOffset + 2);
  const le = byteOrder === 'II';

  const read16 = (offset: number) =>
    le ? exifBuf.readUInt16LE(offset) : exifBuf.readUInt16BE(offset);
  const read32 = (offset: number) =>
    le ? exifBuf.readUInt32LE(offset) : exifBuf.readUInt32BE(offset);
  const readStr = (offset: number, len: number) =>
    exifBuf.toString('ascii', offset, offset + len).replace(/\0/g, '').trim();

  const base = byteOrderOffset; // all offsets in EXIF block are relative to this

  // Walk IFD0
  try {
    const ifd0Offset = base + read32(base + 4);
    walkIFD(ifd0Offset);
  } catch {
    // Non-standard EXIF layout
  }

  return result;

  function readRational(offset: number): { numerator: number; denominator: number } {
    return {
      numerator: read32(offset),
      denominator: read32(offset + 4),
    };
  }

  function readRationals(
    offset: number,
    count: number,
  ): Array<{ numerator: number; denominator: number }> {
    const rationals: Array<{ numerator: number; denominator: number }> = [];
    for (let i = 0; i < count; i++) {
      rationals.push(readRational(offset + i * 8));
    }
    return rationals;
  }

  function walkIFD(ifdOffset: number): void {
    if (ifdOffset + 2 > exifBuf.length) return;
    const entryCount = read16(ifdOffset);
    for (let i = 0; i < entryCount; i++) {
      const entryOffset = ifdOffset + 2 + i * 12;
      if (entryOffset + 12 > exifBuf.length) break;

      const tag = read16(entryOffset);
      const type = read16(entryOffset + 2);
      const count = read32(entryOffset + 4);
      const valueOffset = entryOffset + 8;

      // For values <= 4 bytes, value is inline; otherwise offset points to data
      const dataOffset =
        typeSize(type) * count > 4
          ? base + read32(valueOffset)
          : valueOffset;

      if (dataOffset + typeSize(type) * count > exifBuf.length) continue;

      switch (tag) {
        case 0x010f: // Make
          result.make = readStr(dataOffset, count);
          break;
        case 0x0110: // Model
          result.model = readStr(dataOffset, count);
          break;
        case 0x9003: // DateTimeOriginal
          result.dateTimeOriginal = readStr(dataOffset, count);
          break;
        case 0x8769: // ExifIFD pointer
          walkIFD(base + read32(valueOffset));
          break;
        case 0x8825: { // GPSInfoIFD pointer
          const gpsIfdOffset = base + read32(valueOffset);
          walkGPSIFD(gpsIfdOffset);
          break;
        }
      }
    }
  }

  function walkGPSIFD(ifdOffset: number): void {
    if (ifdOffset + 2 > exifBuf.length) return;
    const entryCount = read16(ifdOffset);
    for (let i = 0; i < entryCount; i++) {
      const entryOffset = ifdOffset + 2 + i * 12;
      if (entryOffset + 12 > exifBuf.length) break;

      const tag = read16(entryOffset);
      const type = read16(entryOffset + 2);
      const count = read32(entryOffset + 4);
      const valueOffset = entryOffset + 8;
      const dataOffset =
        typeSize(type) * count > 4
          ? base + read32(valueOffset)
          : valueOffset;

      if (dataOffset + typeSize(type) * count > exifBuf.length) continue;

      switch (tag) {
        case 0x0001: // GPSLatitudeRef
          result.gpsLatitudeRef = readStr(dataOffset, count);
          break;
        case 0x0002: // GPSLatitude
          result.gpsLatitude = readRationals(dataOffset, count);
          break;
        case 0x0003: // GPSLongitudeRef
          result.gpsLongitudeRef = readStr(dataOffset, count);
          break;
        case 0x0004: // GPSLongitude
          result.gpsLongitude = readRationals(dataOffset, count);
          break;
      }
    }
  }

  function typeSize(type: number): number {
    const sizes: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8 };
    return sizes[type] ?? 1;
  }
}
