/**
 * [2026-11-07 사장님] 움짤이 발행 업로드 길에서 JPEG/PNG 로 납작해지지 않는지 확인한다.
 * 실제 업로드 코드가 쓰는 판정 함수에 진짜 GIF 를 넣어 보고, 납작하게 만드는 파이프라인(imageFormatPipeline)에
 * 운영 코드 호출처가 없다는 것을 잠근다 — 누가 연결하면 이 시험이 GIF 예외를 요구하며 실패한다.
 */
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ensureNaverDecodableBuffer, ensureNaverDecodableFile } from '../image/naverImageTranscode.js';
import { resolveExtensionFromBytes } from '../main/ipc/imageExtensionPolicy.js';
import { judgeImageFileHead } from '../automation/imageUploadPreflight.js';
import { inspectNaverImagePolicy, resolveNaverSupportedImageExtension } from '../automation/naverImagePolicy.js';

const SRC = path.resolve(__dirname, '..');

async function realGif(): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  const w = 48; const h = 48; const frames = 3;
  const raw = Buffer.alloc(w * h * frames * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 17) % 256;
  return sharp(raw, { raw: { width: w, height: h * frames, channels: 3, pageHeight: h } }).gif({ delay: [200, 200, 200], loop: 0 }).toBuffer();
}

function listSources(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      listSources(full, out);
    } else if (/\.(ts|tsx|mts)$/u.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe('업로드 직전 길 — GIF 는 그대로 통과한다', () => {
  it('AVIF/HEIC → JPG 변환기는 GIF 를 건드리지 않는다(버퍼·파일)', async () => {
    const gif = await realGif();
    const bufferResult = await ensureNaverDecodableBuffer(gif);
    expect(bufferResult.converted).toBe(false);
    expect(bufferResult.buffer).toBe(gif);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gif-upload-'));
    try {
      const file = path.join(dir, 'a.gif');
      fs.writeFileSync(file, gif);
      const fileResult = await ensureNaverDecodableFile(file);
      expect(fileResult.converted).toBe(false);
      expect(fileResult.filePath).toBe(file);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('확장자 정상화는 GIF 바이트에 .gif 를 준다(.jpg 로 덮지 않음)', async () => {
    expect(resolveExtensionFromBytes(await realGif(), '.jpg')).toBe('.gif');
  });

  it('업로드 전 검사는 GIF 파일을 사진으로 인정한다', async () => {
    const gif = await realGif();
    expect(judgeImageFileHead(gif.subarray(0, 32), gif.length)).toEqual({ ok: true });
  });

  it('네이버 정책: gif 는 허용 확장자, 한 장 20MB 까지', () => {
    expect(resolveNaverSupportedImageExtension('gif', 'jpg')).toBe('gif');
    expect(inspectNaverImagePolicy([{ fileName: 'a.gif', sizeBytes: 5 * 1024 * 1024 }]).filter((i) => i.severity === 'error')).toHaveLength(0);
    const tooBig = inspectNaverImagePolicy([{ fileName: 'a.gif', sizeBytes: 21 * 1024 * 1024 }]);
    expect(tooBig.some((i) => i.code === 'SINGLE_FILE_TOO_LARGE')).toBe(true);
  });
});

describe('GIF 를 JPEG 로 납작하게 만드는 길이 운영 코드에 연결돼 있지 않다', () => {
  it('imageFormatPipeline(WebP/GIF→JPEG, EXIF 재인코딩)을 가져오는 운영 파일이 없다', () => {
    const importers = listSources(SRC)
      .filter((file) => !file.endsWith(`${path.sep}image${path.sep}imageFormatPipeline.ts`))
      .filter((file) => /from\s+['"][^'"]*imageFormatPipeline(\.js)?['"]|import\(\s*['"][^'"]*imageFormatPipeline(\.js)?['"]\s*\)/u.test(fs.readFileSync(file, 'utf-8')));
    // If this fails, someone wired the pipeline into publishing: it must skip GIF first (it would keep only frame 1).
    expect(importers.map((f) => path.relative(SRC, f))).toEqual([]);
  });

  it('업로드 길의 data URL 해석은 image/gif 를 .gif 파일로 쓰고 20MB 압축기는 GIF 를 JPEG 로 바꾸는 일이 없다(저장 단계가 20MB 초과를 막는다)', () => {
    const helpers = fs.readFileSync(path.join(SRC, 'automation', 'imageHelpers.ts'), 'utf-8');
    expect(helpers).toMatch(/data:image\\\/\(\\w\+\);base64/u);
    expect(helpers).toMatch(/const NAVER_OK = \['\.jpg', '\.jpeg', '\.png', '\.gif'/u);
    const save = fs.readFileSync(path.join(SRC, 'image', 'animatedGifPolicy.ts'), 'utf-8');
    expect(save).toContain('GIF_TOO_LARGE');
  });
});
