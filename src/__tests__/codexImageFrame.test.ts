// [2026-11-04] 사장님 "코덱스 소제목들은 왜 16:9인거니? 네이버는 1:1비율로 해야된다니까".
// Codex image_gen has no size argument and mostly ignored the appended "square 1:1" line: the last 8 files in
// ~/.codex/generated_images were 1672x941 x6, 940x1672 x1, 1254x1254 x1. The app now crops the saved file to the
// requested frame (default 1:1, centre crop) and asks the model to keep the subject and all text in the central square.
import { readFileSync } from 'fs';
import { join } from 'path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { centerCropBox, codexTargetRatio, fitCodexImageToRatio } from '../image/codex/codexImageFrame';
import { withCodexAspectRatio } from '../image/codex/codexImageInstruction';

const png = (width: number, height: number) => sharp({ create: { width, height, channels: 3, background: { r: 30, g: 120, b: 200 } } }).png().toBuffer();
const size = async (buffer: Buffer) => { const m = await sharp(buffer).metadata(); return `${m.width}x${m.height}`; };

describe('codex image frame', () => {
  it('target ratio: the item ratio when known, otherwise 1:1 (Naver)', () => {
    expect(codexTargetRatio('16:9').key).toBe('16:9');
    expect(codexTargetRatio(undefined).key).toBe('1:1');
    expect(codexTargetRatio('7:5').key).toBe('1:1');
  });

  it('centre crop box only when the frame is off by more than 2%', () => {
    expect(centerCropBox(1672, 941, 1)).toEqual({ left: 365, top: 0, width: 941, height: 941 });
    expect(centerCropBox(940, 1672, 1)).toEqual({ left: 0, top: 366, width: 940, height: 940 });
    expect(centerCropBox(1254, 1254, 1)).toBeNull();
    expect(centerCropBox(1672, 941, 16 / 9)).toBeNull();
  });

  it('a 16:9 or portrait Codex image becomes 1:1; a square one is left untouched', async () => {
    const wide = await fitCodexImageToRatio(await png(1672, 941), undefined);
    expect(wide).toMatchObject({ cropped: true, from: '1672x941', to: '941x941' });
    expect(await size(wide.buffer)).toBe('941x941');
    expect((await sharp(wide.buffer).metadata()).format).toBe('png');
    const tall = await fitCodexImageToRatio(await png(940, 1672), '1:1');
    expect(await size(tall.buffer)).toBe('940x940');
    const square = await png(1254, 1254);
    const same = await fitCodexImageToRatio(square, '1:1');
    expect(same.cropped).toBe(false);
    expect(same.buffer).toBe(square);
  });

  it('an unreadable file is passed through instead of failing the image', async () => {
    const junk = Buffer.from('not an image');
    const result = await fitCodexImageToRatio(junk, '1:1');
    expect(result).toMatchObject({ cropped: false });
    expect(result.buffer).toBe(junk);
  });

  it('the square request asks for the subject and all text inside the central square (so the centre crop keeps them)', () => {
    const prompt = withCodexAspectRatio('a district office counter', undefined);
    expect(prompt.startsWith('a district office counter\nASPECT RATIO: square 1:1 (1024x1024).')).toBe(true);
    expect(prompt).toMatch(/central square/);
  });

  it('every saved Codex image goes through the frame fit', () => {
    const src = readFileSync(join(__dirname, '..', 'image/codex/codexImageGenerator.ts'), 'utf-8');
    const save = src.slice(src.indexOf('async save('), src.indexOf('async save(') + 1200);
    expect(save).toContain('fitCodexImageToRatio(');
  });
});
