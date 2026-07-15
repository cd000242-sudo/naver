import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildDropshotPrompt } from '../image/dropshotCore';
import {
  assertPublicRemoteReferenceUrl,
  buildAllowedReferenceImageRoots,
  createReferenceImageDataUrl,
  loadReferenceImageData,
} from '../image/referenceImageLoader';

const root = process.cwd();
const read = (relativePath: string): string => fs.readFileSync(path.join(root, relativePath), 'utf8');
const temporaryFiles: string[] = [];
const validPngBytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

afterEach(() => {
  temporaryFiles.splice(0).forEach(filePath => {
    try { fs.unlinkSync(filePath); } catch { /* already removed */ }
  });
});

describe('shopping provider reference enforcement', () => {
  it('stops DuctTape instead of silently falling back to text-to-image', () => {
    const source = read('src/image/openaiImageGenerator.ts');

    expect(source).toContain('SHOPPING_REFERENCE_LOAD_FAILED');
    expect(source).toContain('loadReferenceImageData(firstImage');
    expect(source).toContain('requestBody.image = createReferenceImageDataUrl(cachedReferenceImage);');
    expect(source).not.toContain('data:image/png;base64,${cachedReferenceBase64}');
    expect(source).toContain('Include a Korean person only when the section topic naturally requires a person');
    expect(source).not.toContain('showing this exact product being used by a Korean person (20-40s)');
  });

  it('keeps Nano Banana section-aware instead of forcing a person into every image', () => {
    const source = read('src/image/nanoBananaProGenerator.ts');

    expect(source).toContain('SHOPPING_REFERENCE_LOAD_FAILED');
    expect(source).toContain('Choose the scene type from the current article section');
    expect(source).toContain('Include a Korean person only when the section naturally requires one');
    expect(source).not.toContain('Korean person (20-40s) using the product, luxury Korean setting');
    expect(source).toContain('canUseReferenceFreeImageFallback(isShoppingConnect)');
    expect(source).toContain('buildReferenceSafeFallbackParts(');
    expect(source).toContain('contents: [{ parts: finalFallbackParts }]');
    expect(source).toContain('loadReferenceImageData(firstImage');
    expect(source).toContain('const loadedItemReference = !referenceImageLoaded');
    expect(source).toContain('mimeType: loadedItemReference.mimeType');
    expect(source).not.toContain('await fs.readFile(localRef)');
  });

  it('loads the persisted representative file before an expiring remote URL', async () => {
    const localPath = path.join(os.tmpdir(), `shopping-reference-${Date.now()}.png`);
    const localBytes = validPngBytes;
    fs.writeFileSync(localPath, localBytes);
    temporaryFiles.push(localPath);
    const fetchRemote = vi.fn().mockRejectedValue(new Error('remote URL must not be requested'));

    const loaded = await loadReferenceImageData({
      localPath,
      originalUrl: 'https://expired.example/product.png',
    }, { fetchRemote, allowedLocalRoots: [os.tmpdir()] });

    expect(loaded?.source).toBe(fs.realpathSync(localPath));
    expect(loaded?.buffer.equals(localBytes)).toBe(true);
    expect(fetchRemote).not.toHaveBeenCalled();
  });

  it('falls back to the remote representative only when the saved file is unavailable', async () => {
    const remoteBytes = validPngBytes;
    const fetchRemote = vi.fn().mockResolvedValue({
      data: remoteBytes,
      headers: { 'content-type': 'image/png' },
    });

    const loaded = await loadReferenceImageData({
      localPath: path.join(os.tmpdir(), 'missing-shopping-reference.png'),
      originalUrl: 'https://example.com/product.jpg',
    }, {
      fetchRemote,
      resolveHost: vi.fn().mockResolvedValue(['93.184.216.34']),
    });

    expect(loaded?.source).toBe('https://example.com/product.jpg');
    expect(loaded?.mimeType).toBe('image/png');
    expect(loaded?.buffer.equals(remoteBytes)).toBe(true);
    expect(fetchRemote).toHaveBeenCalledTimes(1);
    expect(fetchRemote).toHaveBeenCalledWith(
      'https://example.com/product.jpg',
      expect.any(Number),
      ['93.184.216.34'],
    );
  });

  it('preserves the real reference MIME type in an img2img data URL', () => {
    const dataUrl = createReferenceImageDataUrl({
      buffer: Buffer.from('jpeg-reference'),
      mimeType: 'image/jpeg',
      source: 'C:\\images\\product.jpg',
    });

    expect(dataUrl).toBe(`data:image/jpeg;base64,${Buffer.from('jpeg-reference').toString('base64')}`);
  });

  it.each([
    'http://127.0.0.1/private.png',
    'http://169.254.169.254/latest/meta-data',
    'http://[::1]/private.png',
  ])('blocks private literal reference URL %s', async (url) => {
    await expect(assertPublicRemoteReferenceUrl(url)).rejects.toThrow('UNSAFE_REFERENCE_IMAGE_URL');
  });

  it('blocks a public-looking hostname that resolves into a private network', async () => {
    await expect(assertPublicRemoteReferenceUrl(
      'https://images.example.com/product.jpg',
      vi.fn().mockResolvedValue(['10.0.0.7']),
    )).rejects.toThrow('UNSAFE_REFERENCE_IMAGE_URL');
  });

  it('blocks IPv4-mapped IPv6 addresses returned by DNS', async () => {
    await expect(assertPublicRemoteReferenceUrl(
      'https://images.example.com/product.jpg',
      vi.fn().mockResolvedValue(['::ffff:127.0.0.1']),
    )).rejects.toThrow('UNSAFE_REFERENCE_IMAGE_URL');
  });

  it('does not call the remote fetcher for a blocked internal target', async () => {
    const fetchRemote = vi.fn();

    await expect(loadReferenceImageData('http://127.0.0.1/private.png', { fetchRemote }))
      .rejects.toThrow('UNSAFE_REFERENCE_IMAGE_URL');
    expect(fetchRemote).not.toHaveBeenCalled();
  });

  it.each([
    '\\\\attacker.example\\share\\product.png',
    '//attacker.example/share/product.png',
    'file://attacker.example/share/product.png',
  ])('blocks local network reference path %s before reading it', async (source) => {
    await expect(loadReferenceImageData(source))
      .rejects.toThrow('UNSAFE_REFERENCE_IMAGE_PATH');
  });

  it('rejects a valid image outside the managed image roots', async () => {
    const outsidePath = path.join(root, 'tmp', `outside-reference-${Date.now()}.png`);
    fs.writeFileSync(outsidePath, validPngBytes);
    temporaryFiles.push(outsidePath);

    await expect(loadReferenceImageData({ localPath: outsidePath }))
      .rejects.toThrow('REFERENCE_IMAGE_PATH_NOT_ALLOWED');
  });

  it('does not trust the global operating-system temp directory by default', async () => {
    const tempPath = path.join(os.tmpdir(), `unmanaged-temp-reference-${Date.now()}.png`);
    fs.writeFileSync(tempPath, validPngBytes);
    temporaryFiles.push(tempPath);

    expect(buildAllowedReferenceImageRoots()).not.toContain(path.resolve(os.tmpdir()));
    await expect(loadReferenceImageData({ localPath: tempPath }))
      .rejects.toThrow('REFERENCE_IMAGE_PATH_NOT_ALLOWED');
  });

  it('allows an explicitly configured managed image root', async () => {
    const managedPath = path.join(root, 'tmp', `managed-reference-${Date.now()}.png`);
    fs.writeFileSync(managedPath, validPngBytes);
    temporaryFiles.push(managedPath);

    const loaded = await loadReferenceImageData(
      { localPath: managedPath },
      { allowedLocalRoots: [path.dirname(managedPath)] },
    );

    expect(loaded?.source).toBe(fs.realpathSync(managedPath));
    expect(loaded?.mimeType).toBe('image/png');
  });

  it('never treats a remote URL field as a local file path', async () => {
    const localPath = path.join(os.tmpdir(), `untrusted-url-field-${Date.now()}.png`);
    fs.writeFileSync(localPath, validPngBytes);
    temporaryFiles.push(localPath);

    await expect(loadReferenceImageData({ url: localPath }))
      .rejects.toThrow('UNSAFE_REFERENCE_IMAGE_SOURCE');
  });

  it('rejects a non-image file even inside an allowed image root', async () => {
    const bogusImagePath = path.join(os.tmpdir(), `bogus-reference-${Date.now()}.png`);
    fs.writeFileSync(bogusImagePath, 'not an image');
    temporaryFiles.push(bogusImagePath);

    await expect(loadReferenceImageData(
      { localPath: bogusImagePath },
      { allowedLocalRoots: [os.tmpdir()] },
    ))
      .rejects.toThrow('INVALID_REFERENCE_IMAGE');
  });

  it('rejects oversized percent-encoded data before decoding it', async () => {
    const oversizedPayload = '%41'.repeat(17);
    await expect(loadReferenceImageData(
      `data:image/png,${oversizedPayload}`,
      { maxBytes: 16 },
    )).rejects.toThrow('REFERENCE_IMAGE_TOO_LARGE');
  });

  it('uses the resolver ordering for collected thumbnail and subheading placement', () => {
    const source = read('src/renderer/modules/publishingHandlers.ts');

    expect(source).toContain('const directShoppingReference = resolveShoppingRepresentativeReference(collectedImgs);');
    expect(source).toContain('const directShoppingPlacement = resolveShoppingCollectedImagePlacement(collectedImgs);');
    expect(source).toContain("const directShoppingImages = formData.contentMode === 'affiliate'");
    expect(source).toContain('? directShoppingPlacement.images');
    expect(source).toContain('? directShoppingPlacement.subheadingImages');
    expect(source).toContain('await resolveUsableShoppingReferenceSource(');
    expect(source).toContain('SHOPPING_REPRESENTATIVE_THUMBNAIL_REQUIRED');
    expect(source).not.toContain('const headingImages = collectedImgs.slice(1);');
  });

  it('requires a successful reference upload for Leaders unlimited shopping generation', () => {
    const generator = read('src/image/dropshotGenerator.ts');
    const capture = read('src/image/dropshotCapture.ts');

    expect(generator).toContain('requireReferenceImage: isShoppingConnect');
    expect(generator).toContain('SHOPPING_REFERENCE_IMAGE_REQUIRED');
    expect(capture).toContain('SHOPPING_REFERENCE_UPLOAD_FAILED');
    expect(capture).toContain('if (options.requireReferenceImage && !referenceUploaded)');
  });

  it('adds readable quality and variation instructions to Dropshot prompts', () => {
    const prompt = buildDropshotPrompt('제품 설치 방법');

    expect(prompt).toContain('realistic 4K product photograph');
    expect(prompt).toContain('variation-');
    expect(prompt).toContain('distinct camera angle');
  });
});
