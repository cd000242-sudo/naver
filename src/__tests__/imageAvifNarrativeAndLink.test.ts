// src/__tests__/imageAvifNarrativeAndLink.test.ts
// [2026-10-01] v2.11.308 에서 "별건" 으로 남겨 둔 세 가지를 마감한 계약.
//   A. 사진 모드(이미지로 글쓰기)가 AVIF 를 거부했다 — vision provider 가 못 받는 포맷인데
//      변환 경로가 HEIC 전용(heic-convert)이었다.
//   B. localFolder:resizeImage 가 .avif 입력을 AVIF 로 재인코딩했다(libaom, 수십 초).
//   C. image.link 가 발행까지 못 갔다 — 화이트리스트 2홉 탈락 + 동기화가 배열을 덮어씀.

import { beforeAll, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import { ensureNaverDecodableBuffer } from '../image/naverImageTranscode.js';

const readSrc = (rel: string): string => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');

type NarrativeUpload = typeof import('../renderer/modules/imageNarrativeUpload');
let _isAcceptedImage: NarrativeUpload['_isAcceptedImage'];
let isHeicFile: NarrativeUpload['isHeicFile'];
let needsVisionFormatConversion: NarrativeUpload['needsVisionFormatConversion'];

function makeFile(name: string, type: string): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type });
}

beforeAll(async () => {
  (globalThis as any).window = (globalThis as any).window || {};
  const mod = await import('../renderer/modules/imageNarrativeUpload.js');
  _isAcceptedImage = mod._isAcceptedImage;
  isHeicFile = mod.isHeicFile;
  needsVisionFormatConversion = mod.needsVisionFormatConversion;
});

describe('A. 사진 모드 AVIF 업로드', () => {
  it('AVIF 를 업로드 가능한 이미지로 받는다 (MIME / 확장자 양쪽)', () => {
    expect(_isAcceptedImage(makeFile('photo.avif', 'image/avif'))).toBe(true);
    expect(_isAcceptedImage(makeFile('photo.avif', ''))).toBe(true);
    expect(_isAcceptedImage(makeFile('PHOTO.AVIF', ''))).toBe(true);
  });

  it('AVIF 와 HEIC/HEIF 를 변환 대상으로 판정한다', () => {
    for (const [name, type] of [['a.avif', 'image/avif'], ['a.heic', 'image/heic'], ['a.heif', 'image/heif']]) {
      expect(needsVisionFormatConversion(makeFile(name, type))).toBe(true);
    }
    expect(needsVisionFormatConversion(makeFile('a.avif', ''))).toBe(true);
  });

  it('이미 vision 이 받는 포맷은 변환하지 않는다', () => {
    for (const [name, type] of [['a.jpg', 'image/jpeg'], ['a.png', 'image/png'], ['a.webp', 'image/webp']]) {
      expect(needsVisionFormatConversion(makeFile(name, type))).toBe(false);
    }
  });

  it('isHeicFile 은 HEIC 판별로 남는다 — AVIF 를 HEIC 라고 하지 않는다', () => {
    // 기존 테스트(imageNarrativeUploadValidation)가 이 함수를 계약으로 잠가 뒀다.
    expect(isHeicFile(makeFile('a.avif', 'image/avif'))).toBe(false);
    expect(isHeicFile(makeFile('a.heic', 'image/heic'))).toBe(true);
  });

  it('변환 IPC 가 sharp 를 1순위로 쓴다 — heic-convert 는 AVIF 를 못 읽는다', () => {
    const src = readSrc('main/ipc/imageNarrativeSupportHandlers.ts');
    const sharpIdx = src.indexOf('ensureNaverDecodableBuffer');
    const heicIdx = src.indexOf("require('heic-convert')");
    expect(sharpIdx).toBeGreaterThan(0);
    expect(heicIdx).toBeGreaterThan(sharpIdx); // sharp 먼저, heic-convert 는 폴백
  });

  it('변환본 파일명에서 .heif/.avif 확장자도 .jpg 로 바뀐다', () => {
    const src = readSrc('renderer/modules/imageNarrativeUpload.ts');
    // 종전 /\.heic?$/i 는 ".hei"+optional"c" 라서 .heif / .avif 가 남았다.
    expect(src).toContain('replace(/\\.(heic|heif|avif)$/i');
    expect(src).not.toContain('replace(/\\.heic?$/i');
  });

  it('EXIF 는 변환 전 원본에서 읽는다 — JPEG 재인코딩은 메타데이터를 버린다', () => {
    const src = readSrc('renderer/modules/imageNarrativeUpload.ts');
    expect(src).toContain('const exifSource = wasConverted && originalBase64 ? originalBase64 : base64');
  });

  it('실제 AVIF 버퍼가 JPEG 로 변환된다 (사진 모드가 쓰는 같은 변환기)', async () => {
    const avif = await sharp({
      create: { width: 64, height: 48, channels: 3, background: { r: 1, g: 2, b: 3 } },
    }).avif({ quality: 40 }).toBuffer();

    const result = await ensureNaverDecodableBuffer(avif);
    expect(result.converted).toBe(true);
    expect(result.buffer.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
  });
});

describe('B. localFolder:resizeImage 가 AVIF 를 JPG 로 낸다', () => {
  const src = readSrc('main.ts');
  const handler = src.slice(
    src.indexOf("ipcMain.handle('localFolder:resizeImage'"),
    src.indexOf("ipcMain.handle('localFolder:resizeImage'") + 1800,
  );

  it('내용으로 변환 대상을 판정한다', () => {
    expect(handler).toContain('sniffTranscodableFormat');
  });

  it('변환 대상이면 출력 확장자를 .jpg 로 고정한다 — sharp 는 확장자로 포맷을 정한다', () => {
    expect(handler).toContain("const outputExt = transcodable ? '.jpg'");
    expect(handler).toContain('jpeg({ quality: 92, mozjpeg: true })');
  });

  it('변환 대상이 아니면 종전처럼 원본 확장자를 유지한다', () => {
    expect(handler).toContain('path.extname(filePath)');
  });
});

describe('C. image.link 가 발행까지 간다', () => {
  it('발행 페이로드 화이트리스트에 link 가 있다', () => {
    const src = readSrc('renderer/modules/formAndAutomation.ts');
    const block = src.slice(
      src.indexOf('payload.generatedImages = imagesForPublish'),
      src.indexOf('.filter((img: any) => Boolean(img?.heading)'),
    );
    expect(block).toContain('link: img.link');
  });

  it('BlogExecutor 의 4개 분기가 모두 link 를 싣는다', () => {
    const src = readSrc('main/services/BlogExecutor.ts');
    const pushes = (src.match(/processedImages\.push\(\{/g) || []).length;
    const links = (src.match(/link: \(image as any\)\.link/g) || []).length;
    expect(pushes).toBe(4);
    expect(links).toBe(pushes); // base64 / URL / 로컬복사 / 복사실패 폴백
  });

  it('ProcessedImage 타입에 link 가 있다', () => {
    const src = readSrc('main/services/BlogExecutor.ts');
    const iface = src.slice(src.indexOf('interface ProcessedImage {'), src.indexOf('// 전역 의존성 저장소'));
    expect(iface).toContain('link?: string');
  });

  it('링크 일괄 적용이 ImageManager 에도 쓴다 — 동기화가 배열을 덮어쓴다', () => {
    const tab = readSrc('renderer/modules/imageManagementTab.ts');
    expect(tab).toContain('setAllImageLinks');
    const core = readSrc('renderer/modules/imageManagerCore.ts');
    expect(core).toContain('setAllImageLinks(linkUrl: string): number');
  });

  it('imageHelpers 의 소비 지점은 그대로다 (이미 읽고 있었다)', () => {
    const src = readSrc('automation/imageHelpers.ts');
    expect(src).toContain("const perImageLink = typeof (image as any).link === 'string'");
    expect(src).toContain('const effectiveLinkUrl = perImageLink || linkUrl');
  });
});
