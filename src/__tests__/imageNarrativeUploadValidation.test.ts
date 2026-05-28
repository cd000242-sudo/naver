/**
 * imageNarrativeUploadValidation.test.ts
 *
 * Unit tests for upload validation logic in imageNarrativeUpload.ts.
 *
 * Covers:
 * - _isAcceptedImage: accepted/rejected MIME types and extensions
 * - isHeicFile: HEIC/HEIF detection by MIME type and extension
 * - UPLOAD_MIN / UPLOAD_MAX constants
 *
 * Phase 3 — SPEC-IMAGE-NARRATIVE-2026
 */

import { describe, it, expect } from 'vitest';
import {
  _isAcceptedImage,
  isHeicFile,
  UPLOAD_MIN,
  UPLOAD_MAX,
} from '../renderer/modules/imageNarrativeUpload.js';

// ---------------------------------------------------------------------------
// Helper: build a minimal File-like object for Node (vitest/node environment)
// ---------------------------------------------------------------------------

function makeFile(name: string, type: string, size = 1024): File {
  // Node 18+ has a global File class
  const content = new Uint8Array(size);
  return new File([content], name, { type });
}

// ---------------------------------------------------------------------------
// UPLOAD_MIN / UPLOAD_MAX constraints
// ---------------------------------------------------------------------------

describe('upload constraints', () => {
  it('UPLOAD_MIN is 3', () => {
    expect(UPLOAD_MIN).toBe(3);
  });

  it('UPLOAD_MAX is 30', () => {
    expect(UPLOAD_MAX).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// _isAcceptedImage — accepted files
// ---------------------------------------------------------------------------

describe('_isAcceptedImage — accepted types', () => {
  it('accepts image/jpeg MIME type', () => {
    expect(_isAcceptedImage(makeFile('photo.jpg', 'image/jpeg'))).toBe(true);
  });

  it('accepts image/png MIME type', () => {
    expect(_isAcceptedImage(makeFile('photo.png', 'image/png'))).toBe(true);
  });

  it('accepts image/heic MIME type', () => {
    expect(_isAcceptedImage(makeFile('photo.heic', 'image/heic'))).toBe(true);
  });

  it('accepts image/heif MIME type', () => {
    expect(_isAcceptedImage(makeFile('photo.heif', 'image/heif'))).toBe(true);
  });

  it('accepts image/webp MIME type', () => {
    expect(_isAcceptedImage(makeFile('photo.webp', 'image/webp'))).toBe(true);
  });

  it('accepts .heic extension when MIME type is empty (browser gap)', () => {
    expect(_isAcceptedImage(makeFile('photo.heic', ''))).toBe(true);
  });

  it('accepts .HEIC extension (case-insensitive)', () => {
    expect(_isAcceptedImage(makeFile('photo.HEIC', ''))).toBe(true);
  });

  it('accepts .jpg extension when MIME type is empty', () => {
    expect(_isAcceptedImage(makeFile('photo.jpg', ''))).toBe(true);
  });

  it('accepts .jpeg extension when MIME type is empty', () => {
    expect(_isAcceptedImage(makeFile('photo.jpeg', ''))).toBe(true);
  });

  it('accepts .png extension when MIME type is empty', () => {
    expect(_isAcceptedImage(makeFile('photo.png', ''))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// _isAcceptedImage — rejected files
// ---------------------------------------------------------------------------

describe('_isAcceptedImage — rejected types', () => {
  it('rejects text/plain files', () => {
    expect(_isAcceptedImage(makeFile('readme.txt', 'text/plain'))).toBe(false);
  });

  it('rejects application/pdf files', () => {
    expect(_isAcceptedImage(makeFile('doc.pdf', 'application/pdf'))).toBe(false);
  });

  it('rejects video/mp4 files', () => {
    expect(_isAcceptedImage(makeFile('video.mp4', 'video/mp4'))).toBe(false);
  });

  it('rejects files with no extension and no MIME type', () => {
    expect(_isAcceptedImage(makeFile('noextension', ''))).toBe(false);
  });

  it('rejects .docx extension with unknown MIME type', () => {
    expect(_isAcceptedImage(makeFile('doc.docx', 'application/octet-stream'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isHeicFile
// ---------------------------------------------------------------------------

describe('isHeicFile', () => {
  it('returns true for image/heic MIME type', () => {
    expect(isHeicFile(makeFile('photo.heic', 'image/heic'))).toBe(true);
  });

  it('returns true for image/heif MIME type', () => {
    expect(isHeicFile(makeFile('photo.heif', 'image/heif'))).toBe(true);
  });

  it('returns true for .heic extension with empty MIME type', () => {
    expect(isHeicFile(makeFile('photo.heic', ''))).toBe(true);
  });

  it('returns true for .heif extension with empty MIME type', () => {
    expect(isHeicFile(makeFile('photo.heif', ''))).toBe(true);
  });

  it('returns true for .HEIC uppercase extension', () => {
    expect(isHeicFile(makeFile('PHOTO.HEIC', ''))).toBe(true);
  });

  it('returns false for image/jpeg MIME type', () => {
    expect(isHeicFile(makeFile('photo.jpg', 'image/jpeg'))).toBe(false);
  });

  it('returns false for .jpg extension', () => {
    expect(isHeicFile(makeFile('photo.jpg', ''))).toBe(false);
  });

  it('returns false for image/png MIME type', () => {
    expect(isHeicFile(makeFile('photo.png', 'image/png'))).toBe(false);
  });
});
