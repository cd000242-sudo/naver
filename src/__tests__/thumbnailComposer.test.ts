import fs from 'fs';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  THUMBNAIL_SIZE,
  composeSquare800,
  composeTightCrop800,
  composeHookCard800,
  splitHookLines,
} from '../image/director/thumbnailComposer';

let tmpDir: string;
let wideInput: string;
let nearSquareInput: string;
let tallInput: string;

async function createSyntheticImage(
  filePath: string,
  width: number,
  height: number,
  color: { r: number; g: number; b: number },
): Promise<void> {
  await sharp({ create: { width, height, channels: 3, background: color } }).png().toFile(filePath);
}

describe('thumbnailComposer', () => {
  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'thumbnail-composer-test-'));
    wideInput = path.join(tmpDir, 'wide.png');
    nearSquareInput = path.join(tmpDir, 'near-square.png');
    tallInput = path.join(tmpDir, 'tall.png');

    await createSyntheticImage(wideInput, 1600, 600, { r: 200, g: 100, b: 100 });
    await createSyntheticImage(nearSquareInput, 1000, 900, { r: 100, g: 200, b: 100 });
    await createSyntheticImage(tallInput, 600, 1600, { r: 100, g: 100, b: 200 });
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('composeSquare800', () => {
    it('extends a wide (1600x600) image to 800x800', async () => {
      const outputPath = path.join(tmpDir, 'wide-square.png');
      const result = await composeSquare800(wideInput, outputPath);

      expect(result.width).toBe(THUMBNAIL_SIZE);
      expect(result.height).toBe(THUMBNAIL_SIZE);
      expect(result.method).toBe('extend');
      expect(result.filePath).toBe(outputPath);
      expect(fs.existsSync(outputPath)).toBe(true);
    });

    it('covers a near-square (1000x900) image to 800x800', async () => {
      const outputPath = path.join(tmpDir, 'near-square-square.png');
      const result = await composeSquare800(nearSquareInput, outputPath);

      expect(result.width).toBe(THUMBNAIL_SIZE);
      expect(result.height).toBe(THUMBNAIL_SIZE);
      expect(result.method).toBe('cover');
    });

    it('extends a tall (600x1600) image to 800x800', async () => {
      const outputPath = path.join(tmpDir, 'tall-square.png');
      const result = await composeSquare800(tallInput, outputPath);

      expect(result.width).toBe(THUMBNAIL_SIZE);
      expect(result.height).toBe(THUMBNAIL_SIZE);
      expect(result.method).toBe('extend');
    });
  });

  describe('composeTightCrop800', () => {
    it('produces an 800x800 tight crop with the default zoom', async () => {
      const outputPath = path.join(tmpDir, 'tight-default.png');
      const result = await composeTightCrop800(nearSquareInput, outputPath);

      expect(result.width).toBe(THUMBNAIL_SIZE);
      expect(result.height).toBe(THUMBNAIL_SIZE);
      expect(result.method).toBe('tight');
    });

    it('clamps an out-of-range zoom instead of throwing', async () => {
      const outputPath = path.join(tmpDir, 'tight-clamped-high.png');
      await expect(composeTightCrop800(nearSquareInput, outputPath, 5)).resolves.toMatchObject({
        width: THUMBNAIL_SIZE,
        height: THUMBNAIL_SIZE,
        method: 'tight',
      });

      const outputPathLow = path.join(tmpDir, 'tight-clamped-low.png');
      await expect(composeTightCrop800(nearSquareInput, outputPathLow, 0.1)).resolves.toMatchObject({
        width: THUMBNAIL_SIZE,
        height: THUMBNAIL_SIZE,
        method: 'tight',
      });
    });
  });

  describe('composeHookCard800', () => {
    it('produces an 800x800 image whose pixel data differs from composeSquare800 of the same input', async () => {
      const squareOutput = path.join(tmpDir, 'hook-compare-square.png');
      const hookOutput = path.join(tmpDir, 'hook-compare-hook.png');

      await composeSquare800(nearSquareInput, squareOutput);
      const result = await composeHookCard800(nearSquareInput, hookOutput, { main: '주말 여행 꿀팁' });

      expect(result.width).toBe(THUMBNAIL_SIZE);
      expect(result.height).toBe(THUMBNAIL_SIZE);
      expect(result.method).toBe('hook');

      const squareBytes = fs.readFileSync(squareOutput);
      const hookBytes = fs.readFileSync(hookOutput);
      expect(hookBytes.equals(squareBytes)).toBe(false);
    });

    it('does not throw for text containing XML-sensitive characters', async () => {
      const outputPath = path.join(tmpDir, 'hook-xml.png');
      await expect(
        composeHookCard800(nearSquareInput, outputPath, {
          main: `<Tom & Jerry> "quotes" 'here' and more text to force wrapping`,
          sub: `A & B < C > D "quoted" 'sub'`,
        }),
      ).resolves.toMatchObject({ width: THUMBNAIL_SIZE, height: THUMBNAIL_SIZE, method: 'hook' });
    });

    it('rejects an empty (whitespace-only) main text', async () => {
      const outputPath = path.join(tmpDir, 'hook-empty.png');
      await expect(composeHookCard800(nearSquareInput, outputPath, { main: '   ' })).rejects.toThrow();
    });

    it('writes a JPEG file when the output path ends in .jpg', async () => {
      const outputPath = path.join(tmpDir, 'hook.jpg');
      await composeHookCard800(nearSquareInput, outputPath, { main: '짧은 제목' });

      const metadata = await sharp(fs.readFileSync(outputPath)).metadata();
      expect(metadata.format).toBe('jpeg');
    });

    it('creates a new nested output directory automatically', async () => {
      const outputPath = path.join(tmpDir, 'nested', 'deeper', 'hook.png');
      const result = await composeHookCard800(nearSquareInput, outputPath, { main: '중첩 폴더 테스트' });

      expect(fs.existsSync(outputPath)).toBe(true);
      expect(result.filePath).toBe(outputPath);
      expect(result.width).toBe(THUMBNAIL_SIZE);
      expect(result.height).toBe(THUMBNAIL_SIZE);
    });
  });

  describe('splitHookLines', () => {
    it('returns a single line for short text', () => {
      expect(splitHookLines('짧은 문장', 20)).toEqual(['짧은 문장']);
    });

    it('splits long text with spaces into two balanced lines at a word boundary', () => {
      const text = 'the quick brown fox jumps over the lazy dog today';
      const lines = splitHookLines(text, 15);

      expect(lines.length).toBe(2);
      const [first, second] = lines;
      expect(first.length > 0 && second.length > 0).toBe(true);
      // Splitting consumes exactly the one space character used as the boundary.
      expect(first.length + second.length).toBe(text.length - 1);
      expect(first.endsWith(' ')).toBe(false);
      expect(second.startsWith(' ')).toBe(false);
      // No word should be torn apart — every fragment of each line must
      // reassemble into full words found in the original text.
      for (const word of [...first.split(' '), ...second.split(' ')]) {
        expect(text.split(' ')).toContain(word);
      }
      // Roughly balanced: neither half dominates the split.
      expect(Math.abs(first.length - second.length)).toBeLessThan(text.length / 2);
    });

    it('splits a long unbroken string at the midpoint', () => {
      const text = 'a'.repeat(40);
      const lines = splitHookLines(text, 15);

      expect(lines).toEqual(['a'.repeat(20), 'a'.repeat(20)]);
      expect(lines[0].length + lines[1].length).toBe(text.length);
    });
  });
});
