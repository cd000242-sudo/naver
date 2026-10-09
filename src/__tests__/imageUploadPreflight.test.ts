/**
 * [2026-10-09] 업로드 직전 파일 검사 — 사진이 아닌 파일은 재시도 없이 바로 끊고, 긴 경로는 임시 사본으로 올린다.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CHROME_SAFE_PATH_LENGTH,
  IMAGE_UPLOAD_NOT_RETRYABLE,
  describeUploadSource,
  isImageUploadNotRetryable,
  judgeImageFileHead,
  prepareImageFileForUpload,
} from '../automation/imageUploadPreflight.js';
import { summarizeImageInsertFailure } from '../automation/imageInsertFailureReason.js';

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const heads: Record<string, Buffer> = {
  jpeg: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]),
  gif: Buffer.concat([Buffer.from('GIF89a\x01\x00\x01\x00', 'latin1'), Buffer.alloc(24)]),
  webp: Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x24, 0, 0, 0]), Buffer.from('WEBPVP8 ')]),
  bmp: Buffer.concat([Buffer.from('BM'), Buffer.alloc(30)]),
  avif: Buffer.concat([Buffer.from([0, 0, 0, 0x1c]), Buffer.from('ftypavif'), Buffer.alloc(16)]),
  heic: Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic'), Buffer.alloc(16)]),
};

let workDir = '';
const created: string[] = [];
beforeAll(() => { workDir = mkdtempSync(join(tmpdir(), 'image-preflight-')); });
afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
  for (const file of created) rmSync(file, { force: true });
});

function write(name: string, data: Buffer | string): string {
  const file = join(workDir, name);
  writeFileSync(file, data);
  return file;
}

describe('prepareImageFileForUpload - rejects only files that are certainly not photos', () => {
  it('167-byte html saved as .jpg is rejected with code and file name, without the folder path', async () => {
    const file = write('wiki.jpg', '<html>' + 'x'.repeat(161));
    const error: any = await prepareImageFileForUpload(file, { displayName: 'wiki.jpg' }).catch((e) => e);
    expect(error.code).toBe(IMAGE_UPLOAD_NOT_RETRYABLE);
    expect(isImageUploadNotRetryable(error)).toBe(true);
    expect(error.message).toContain('사진 파일이 아님 (167바이트');
    expect(error.message).toContain('"<html>');
    expect(error.message).toContain('wiki.jpg');
    expect(error.message).not.toContain(workDir);
  });

  it('126-byte robot-policy sentence is rejected', async () => {
    const text = 'Please set a user-agent and respect our robot policy https://w.wiki/4wJS. See also https://phabricator.wikimedia.org/T400119.';
    const file = write('robot.jpg', text);
    const error: any = await prepareImageFileForUpload(file, { displayName: 'robot.jpg' }).catch((e) => e);
    expect(isImageUploadNotRetryable(error)).toBe(true);
    expect(error.message).toContain('Please set a user-agent');
  });

  it('0-byte file is rejected', async () => {
    const file = write('empty.png', '');
    const error: any = await prepareImageFileForUpload(file, { displayName: 'empty.png' }).catch((e) => e);
    expect(isImageUploadNotRetryable(error)).toBe(true);
    expect(error.message).toContain('0바이트');
    expect(error.message).toContain('empty.png');
  });

  it('68-byte 1x1 PNG passes (small is not a rejection reason)', async () => {
    const file = write('tiny.png', PNG_1X1);
    const result = await prepareImageFileForUpload(file, { displayName: 'tiny.png' });
    expect(result).toEqual({ filePath: file, tempCopy: false, originalLength: file.length });
  });

  it.each(Object.keys(heads))('%s head passes even when the name says .jpg', async (kind) => {
    const file = write(`${kind}-named.jpg`, kind === 'jpeg' ? Buffer.concat([heads[kind], Buffer.alloc(40)]) : heads[kind]);
    const result = await prepareImageFileForUpload(file, { displayName: 'x.jpg' });
    expect(result.tempCopy).toBe(false);
  });

  it('unreadable (missing) file passes through to the old flow', async () => {
    const missing = join(workDir, 'missing.jpg');
    const result = await prepareImageFileForUpload(missing, { displayName: 'missing.jpg' });
    expect(result.tempCopy).toBe(false);
  });
});

describe('prepareImageFileForUpload - long paths', () => {
  it('copies to a temp file with the same bytes when the path reaches the limit; the original stays', async () => {
    const file = write('long-source.png', PNG_1X1);
    const result = await prepareImageFileForUpload(file, { displayName: 'long-source.png', maxPathLength: 20 });
    created.push(result.filePath);
    expect(result.tempCopy).toBe(true);
    expect(result.filePath).not.toBe(file);
    expect(result.filePath).toContain('naver-blog-img-longpath-');
    expect(result.filePath.endsWith('.png')).toBe(true);
    expect(result.originalLength).toBe(file.length);
    expect(readFileSync(result.filePath).equals(PNG_1X1)).toBe(true);
    expect(existsSync(file)).toBe(true);
  });

  it('default limit is 250', () => {
    expect(CHROME_SAFE_PATH_LENGTH).toBe(250);
  });
});

describe('helpers', () => {
  it('isImageUploadNotRetryable looks at the code only', () => {
    expect(isImageUploadNotRetryable(new Error('Fixture upload rejected'))).toBe(false);
    expect(isImageUploadNotRetryable(new Error('파일 전송 오류'))).toBe(false);
    expect(isImageUploadNotRetryable(null)).toBe(false);
    expect(isImageUploadNotRetryable(undefined)).toBe(false);
    expect(isImageUploadNotRetryable({ code: IMAGE_UPLOAD_NOT_RETRYABLE })).toBe(true);
  });

  it('describeUploadSource keeps only a short name', () => {
    expect(describeUploadSource('data:image/png;base64,AAAA')).toBe('붙여넣은 이미지');
    expect(describeUploadSource('C:\\Users\\홍길동\\img\\a.jpg')).toBe('a.jpg');
    expect(describeUploadSource('https://x.example/p/b.png?x=1')).toBe('b.png');
    expect(describeUploadSource(`/a/${'k'.repeat(80)}.jpg`).length).toBe(40);
  });

  it('judgeImageFileHead previews printable ASCII only (24 chars)', () => {
    const verdict = judgeImageFileHead(Buffer.from('<html>\x00\x01<body>long text here more'), 167);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.reason).toContain('167바이트');
      expect(verdict.reason).not.toMatch(/[\x00-\x08]/);
    }
  });

  it('reason and file name survive summarizeImageInsertFailure', async () => {
    const file = write('survive.jpg', '<html>' + 'x'.repeat(161));
    const error: any = await prepareImageFileForUpload(file, { displayName: 'survive.jpg' }).catch((e) => e);
    const summary = summarizeImageInsertFailure(`이미지 삽입 실패: ${error.message}`);
    expect(summary).toContain('사진 파일이 아님');
    expect(summary).toContain('survive.jpg');
    expect(summary.length).toBeLessThanOrEqual(120);
  });
});

describe('source guard - insertBase64ImageAtCursor', () => {
  const source = readFileSync(new URL('../automation/imageHelpers.ts', import.meta.url), 'utf8');
  const start = source.indexOf('export async function insertBase64ImageAtCursor(');
  const end = source.indexOf('// ── insertImageViaBase64 ──', start);
  const segment = source.slice(start, end);

  it('has no Playwright-only selector syntax (always null/error under Puppeteer)', () => {
    expect(start).toBeGreaterThan(0);
    expect(segment).not.toContain(':text(');
    expect(segment).not.toContain(':has-text(');
  });

  it('never calls the Base64 clipboard fallback on the live path', () => {
    expect(segment).not.toContain('insertImageViaBase64(');
  });
});
