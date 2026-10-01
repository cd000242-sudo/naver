// src/__tests__/naverImageTranscode.test.ts
// [2026-10-01 사용자 요청 "avif 파일도 인식해서 올라가게"] 실패 경로를 잠근다.
//   뉴스사 이미지가 image/avif 로 내려오면 resolveExtensionFromBytes 가 AVIF 매직
//   바이트를 몰라 폴백 '.jpg' 를 돌려줬고, AVIF 바이트가 .jpg 이름으로 저장돼
//   발행 때 네이버가 "파일 전송 오류 — 알 수 없는 파일"로 거부했다.
//   이름이 아니라 내용을 바꿔야 한다는 계약을 고정한다.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'fs';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import sharp from 'sharp';
import { sniffTranscodableFormat } from '../main/ipc/imageExtensionPolicy.js';
import {
  ensureNaverDecodableBuffer,
  ensureNaverDecodableFile,
} from '../image/naverImageTranscode.js';

const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);

function isoBmff(brand: string): Buffer {
  return Buffer.concat([
    Buffer.from([0, 0, 0, 0x20]),
    Buffer.from(`ftyp${brand}`, 'latin1'),
    Buffer.alloc(4096, 0),
  ]);
}

describe('sniffTranscodableFormat', () => {
  it('AVIF 브랜드를 avif 로 판별한다', () => {
    expect(sniffTranscodableFormat(isoBmff('avif'))).toBe('avif');
    expect(sniffTranscodableFormat(isoBmff('avis'))).toBe('avif');
  });

  it('HEIC/HEIF 계열을 heic 로 판별한다', () => {
    for (const brand of ['heic', 'heix', 'heif', 'mif1', 'msf1']) {
      expect(sniffTranscodableFormat(isoBmff(brand))).toBe('heic');
    }
  });

  it('MP4(isom) 는 변환 대상이 아니다', () => {
    expect(sniffTranscodableFormat(isoBmff('isom'))).toBeNull();
  });

  it('JPEG/PNG 는 변환 대상이 아니다 — 이미 네이버가 받는다', () => {
    expect(sniffTranscodableFormat(Buffer.concat([JPEG_MAGIC, Buffer.alloc(32)]))).toBeNull();
    expect(
      sniffTranscodableFormat(
        Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]),
      ),
    ).toBeNull();
  });

  it('16바이트 미만 버퍼에서 터지지 않는다', () => {
    expect(sniffTranscodableFormat(Buffer.alloc(4))).toBeNull();
    expect(sniffTranscodableFormat(Buffer.alloc(0))).toBeNull();
  });
});

describe('ensureNaverDecodableBuffer', () => {
  let realAvif: Buffer;
  let realJpeg: Buffer;

  beforeAll(async () => {
    const base = sharp({
      create: { width: 320, height: 240, channels: 3, background: { r: 40, g: 120, b: 200 } },
    });
    // 이 변환이 실패하면 기능 자체가 성립하지 않는다 — sharp 에 AVIF 디코더가 없는 것이므로
    // 테스트가 실패하는 게 맞다.
    realAvif = await base.clone().avif({ quality: 50 }).toBuffer();
    realJpeg = await base.clone().jpeg({ quality: 80 }).toBuffer();
  });

  it('실제 AVIF 를 JPEG 바이트로 바꾼다', async () => {
    expect(sniffTranscodableFormat(realAvif)).toBe('avif');

    const result = await ensureNaverDecodableBuffer(realAvif);

    expect(result.converted).toBe(true);
    expect(result.from).toBe('avif');
    expect(result.buffer.subarray(0, 3)).toEqual(JPEG_MAGIC);
    // 이름만 바꾸던 종전 동작(= AVIF 바이트 그대로)이 아님을 확인한다.
    expect(result.buffer.equals(realAvif)).toBe(false);
  });

  it('변환본의 해상도가 원본과 같다', async () => {
    const result = await ensureNaverDecodableBuffer(realAvif);
    const meta = await sharp(result.buffer).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.width).toBe(320);
    expect(meta.height).toBe(240);
  });

  it('JPEG 는 손대지 않는다', async () => {
    const result = await ensureNaverDecodableBuffer(realJpeg);
    expect(result.converted).toBe(false);
    expect(result.from).toBeNull();
    expect(result.buffer).toBe(realJpeg);
  });

  it('AVIF 헤더만 있고 내용이 깨진 파일은 원본을 돌려주고 던지지 않는다', async () => {
    // 여기서 던지면 기존에 올라가던 이미지까지 같이 떨어진다. 깨진 바이트 판정은
    // verifyImagePayload 의 몫이다.
    const broken = isoBmff('avif');
    const result = await ensureNaverDecodableBuffer(broken);
    expect(result.converted).toBe(false);
    expect(result.from).toBe('avif');
    expect(result.buffer).toBe(broken);
  });
});

describe('ensureNaverDecodableFile', () => {
  let dir: string;
  let avifPath: string;
  let jpegPath: string;
  let mislabeledPath: string;
  const created: string[] = [];

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'avif-transcode-test-'));
    const base = sharp({
      create: { width: 200, height: 100, channels: 3, background: { r: 10, g: 200, b: 90 } },
    });
    const avif = await base.clone().avif({ quality: 50 }).toBuffer();

    avifPath = path.join(dir, 'news-photo.avif');
    jpegPath = path.join(dir, 'photo.jpg');
    // 구버전이 저장해 둔 파일 — 확장자는 .jpg 인데 내용은 AVIF 다.
    mislabeledPath = path.join(dir, 'mislabeled.jpg');

    await fs.writeFile(avifPath, avif);
    await fs.writeFile(jpegPath, await base.clone().jpeg({ quality: 80 }).toBuffer());
    await fs.writeFile(mislabeledPath, avif);
  });

  afterAll(async () => {
    for (const p of created) await fs.unlink(p).catch(() => undefined);
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  });

  it('.avif 파일을 임시 .jpg 로 변환해 그 경로를 돌려준다', async () => {
    const result = await ensureNaverDecodableFile(avifPath);
    created.push(result.filePath);

    expect(result.converted).toBe(true);
    expect(result.from).toBe('avif');
    expect(path.extname(result.filePath)).toBe('.jpg');
    expect(result.filePath).not.toBe(avifPath);
    expect(readFileSync(result.filePath).subarray(0, 3)).toEqual(JPEG_MAGIC);
  });

  it('확장자가 .jpg 로 거짓말하는 AVIF 파일도 내용으로 잡아낸다', async () => {
    const result = await ensureNaverDecodableFile(mislabeledPath);
    created.push(result.filePath);

    expect(result.converted).toBe(true);
    expect(readFileSync(result.filePath).subarray(0, 3)).toEqual(JPEG_MAGIC);
  });

  it('원본 파일을 지우지 않는다 — 수집 폴더는 사용자 자료다', async () => {
    await ensureNaverDecodableFile(avifPath).then((r) => created.push(r.filePath));
    await expect(fs.access(avifPath)).resolves.toBeUndefined();
  });

  it('JPEG 파일은 경로를 그대로 돌려준다 (임시 파일 생성 없음)', async () => {
    const result = await ensureNaverDecodableFile(jpegPath);
    expect(result.converted).toBe(false);
    expect(result.filePath).toBe(jpegPath);
  });

  it('없는 파일에서 던지지 않는다', async () => {
    const missing = path.join(dir, 'does-not-exist.avif');
    const result = await ensureNaverDecodableFile(missing);
    expect(result.converted).toBe(false);
    expect(result.filePath).toBe(missing);
  });
});

describe('AVIF 배선 (소스 가드)', () => {
  const imageHelpers = readFileSync('src/automation/imageHelpers.ts', 'utf8');
  const downloadHandlers = readFileSync('src/main/ipc/imageDownloadHandlers.ts', 'utf8');

  it('업로드 두 경로가 모두 변환을 거친다', () => {
    const calls = imageHelpers.match(/ensureNaverDecodableFile\(absolutePath/g) || [];
    expect(calls.length).toBe(2);
  });

  it('변환이 확장자 정상화보다 먼저 돌아야 한다 (정상화가 AVIF 를 .jpg 로 이름만 바꾸던 자리)', () => {
    const transcodeIdx = imageHelpers.indexOf('ensureNaverDecodableFile(absolutePath');
    const normalizeIdx = imageHelpers.indexOf('const NAVER_OK = ');
    expect(transcodeIdx).toBeGreaterThan(0);
    expect(normalizeIdx).toBeGreaterThan(transcodeIdx);
  });

  it('변환이 용량 가드보다 먼저 돌아야 한다 (압축이 AVIF 를 읽어야 하므로)', () => {
    const transcodeIdx = imageHelpers.indexOf('ensureNaverDecodableFile(absolutePath');
    const sizeGuardIdx = imageHelpers.indexOf('await ensureImageUnderSizeLimit(absolutePath');
    expect(sizeGuardIdx).toBeGreaterThan(transcodeIdx);
  });

  it('다운로드 저장은 변환된 버퍼를 쓴다 — 원본 버퍼를 쓰면 AVIF 가 디스크에 남는다', () => {
    expect(downloadHandlers).toContain('ensureNaverDecodableBuffer');
    expect(downloadHandlers).not.toContain('writeFile(filePath, result.buffer)');
  });

  it('변환되면 확장자를 .jpg 로 확정한다', () => {
    expect(downloadHandlers).toMatch(/decodable\.converted[\s\S]{0,120}'\.jpg'/);
  });
});

describe('입구 화이트리스트', () => {
  const cases: Array<{ file: string; needle: RegExp }> = [
    { file: 'src/renderer/modules/localFolderImageLoader.ts', needle: /SUPPORTED_EXTENSIONS[\s\S]{0,200}'\.avif'/ },
    { file: 'src/renderer/modules/localImageModals.ts', needle: /jpg\|jpeg\|png\|gif\|webp\|avif/ },
    { file: 'src/renderer/renderer.ts', needle: /jpg\|jpeg\|png\|gif\|webp\|avif/ },
    { file: 'src/renderer/modules/headingImageGen.ts', needle: /'\.avif'/ },
    { file: 'src/main/ipc/imageHandlers.ts', needle: /png\|jpg\|jpeg\|gif\|webp\|avif/ },
    { file: 'src/main/ipc/miscHandlers.ts', needle: /jpg\|jpeg\|png\|gif\|webp\|avif/ },
    { file: 'src/main/ipc/imageCollectUrlHandlers.ts', needle: /jpg\|jpeg\|png\|gif\|webp\|avif/ },
    { file: 'src/main.ts', needle: /'bmp', 'avif'/ },
  ];

  for (const { file, needle } of cases) {
    it(`${file} 가 avif 를 목록에 넣는다`, () => {
      expect(readFileSync(file, 'utf8')).toMatch(needle);
    });
  }

  it('네이버 허용 확장자 목록에는 avif 를 넣지 않는다 — 네이버는 AVIF 를 받지 않는다', () => {
    const policy = readFileSync('src/automation/naverImagePolicy.ts', 'utf8');
    const block = policy.slice(
      policy.indexOf('NAVER_SUPPORTED_IMAGE_EXTENSIONS = ['),
      policy.indexOf('] as const'),
    );
    expect(block).not.toContain('avif');
  });
});
