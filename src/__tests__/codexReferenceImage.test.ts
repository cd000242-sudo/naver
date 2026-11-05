// Cleaning of the representative product photo before it is handed to a Codex session (real sharp, no mocks).
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import {
  CODEX_REFERENCE_FILE_NAME,
  CODEX_REFERENCE_LOAD_FAILED_MESSAGE,
  isCodexReferenceCopy,
  prepareCodexReferenceImage,
} from '../image/codex/codexReferenceImage.js';

const solid = (width: number, height: number) => ({ create: { width, height, channels: 3 as const, background: { r: 200, g: 40, b: 40 } } });

describe('prepareCodexReferenceImage', () => {
  it('PNG 로 바꾸고 긴 변을 1536 이하로 줄이며 메타데이터(EXIF)를 지운다', async () => {
    // 3000x2000 stored landscape with EXIF orientation 6 (rotate 90deg) -> displays as 2000x3000 portrait.
    const source = await sharp(solid(3000, 2000)).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    expect((await sharp(source).metadata()).orientation).toBe(6);

    const ref = await prepareCodexReferenceImage(source);
    const meta = await sharp(ref.buffer).metadata();

    expect(meta.format).toBe('png');
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
    // EXIF rotation applied first: the portrait shape survives (1024x1536), not 1536x1024.
    expect(meta.width).toBe(1024);
    expect(meta.height).toBe(1536);
    expect(ref.width).toBe(1024);
    expect(ref.height).toBe(1536);
    expect(ref.fileName).toBe('reference-01.png');
    expect(CODEX_REFERENCE_FILE_NAME).toBe('reference-01.png');
  });

  it('작은 사진은 키우지 않는다', async () => {
    const ref = await prepareCodexReferenceImage(await sharp(solid(400, 300)).png().toBuffer());
    expect([ref.width, ref.height]).toEqual([400, 300]);
  });

  it('sha256 은 세션 폴더에 쓰일 정리된 PNG 바이트의 해시다', async () => {
    const ref = await prepareCodexReferenceImage(await sharp(solid(640, 480)).jpeg().toBuffer());
    expect(ref.sha256).toBe(createHash('sha256').update(ref.buffer).digest('hex'));
    expect(ref.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each([
    ['없음', undefined],
    ['빈 버퍼', Buffer.alloc(0)],
    ['이미지가 아닌 바이트', Buffer.from('this is not an image at all')],
  ])('불러오지 못했으면 정해진 문구로 멈춘다: %s', async (_label, input) => {
    await expect(prepareCodexReferenceImage(input as Buffer | undefined)).rejects.toThrow(CODEX_REFERENCE_LOAD_FAILED_MESSAGE);
    expect(CODEX_REFERENCE_LOAD_FAILED_MESSAGE).toBe(
      'SHOPPING_REFERENCE_LOAD_FAILED: Codex 구독 이미지가 대표 상품 사진을 불러오지 못해 멈췄습니다. 참고 사진 없이 만들거나 다른 엔진으로 바꾸지 않았습니다.',
    );
  });
});

describe('isCodexReferenceCopy', () => {
  it('참고 사진과 바이트가 같은 결과만 복사본으로 본다', async () => {
    const ref = await prepareCodexReferenceImage(await sharp(solid(320, 240)).png().toBuffer());
    expect(isCodexReferenceCopy(Buffer.from(ref.buffer), ref)).toBe(true);
    const other = await sharp(solid(321, 240)).png().toBuffer();
    expect(isCodexReferenceCopy(other, ref)).toBe(false);
    expect(isCodexReferenceCopy(Buffer.alloc(0), ref)).toBe(false);
  });
});
