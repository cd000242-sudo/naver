import { createHash } from 'crypto';
import { mkdir } from 'fs/promises';
import path from 'path';
import { readLdbDownloadImage, validateDownloadReference } from './ldb-download-images.js';
import { storeLdbImage } from './ldb-image-storage.js';
import sharp from 'sharp';

/** Attribution is display metadata; it never asserts official approval or usage rights. */
function imageAttribution(image: any): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (image?.caption !== undefined) {
    if (typeof image.caption !== 'string' || image.caption.length > 200 || /[\p{Cc}]/u.test(image.caption)) throw new Error('사진 설명 형식을 확인해주세요.');
    result.caption = image.caption.trim();
  }
  if (image?.captionTouched === true) result.captionTouched = true;
  if (image?.sourceUrl !== undefined) {
    if (typeof image.sourceUrl !== 'string' || image.sourceUrl.length > 2048 || /[\p{Cc}]/u.test(image.sourceUrl)) throw new Error('이미지 출처 주소를 확인해주세요.');
    const url = new URL(image.sourceUrl);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('이미지 출처 주소를 확인해주세요.');
    result.sourceUrl = url.toString();
  }
  if (image?.isCollected === true || ['collected', 'collected-image'].includes(image?.provider)) {
    if (image?.provider && !['collected', 'collected-image', 'ldb-image-ultra'].includes(image.provider)) throw new Error('이미지 생성 방식과 수집 출처가 일치하지 않습니다.');
    if (!result.sourceUrl) throw new Error('수집 이미지의 원본 출처 주소가 필요합니다.');
    Object.assign(result, { provider: 'collected', isCollected: true, disableTextOverlay: true });
  } else if (image?.disableTextOverlay === true) result.disableTextOverlay = true;
  return result;
}

function optionalPrompt(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > 12000) throw new Error('이미지 프롬프트 형식을 확인해주세요.');
  return value.trim();
}

/** The configured root is local app state; caller titles and IDs cannot choose paths. */
function articleDirectory(directory: string, post: any): string {
  const safeTitle = String(post.title || '원고').normalize('NFKC')
    .replace(/[\p{Cc}<>:"/\\|?*]/gu, '_').replace(/^[. ]+|[. ]+$/gu, '').slice(0, 60) || '원고';
  const identity = createHash('sha256').update(String(post.id || '')).digest('hex').slice(0, 12);
  return path.resolve(directory, `${safeTitle}-${identity}`);
}

/** Accept inline rasters or verified dedicated Downloads references; never fetch caller URLs or arbitrary paths. */
export async function materializeLdbImages(posts: unknown[], directory: string, downloadsDirectory?: string): Promise<unknown[]> {
  // Bound all referenced bytes before asynchronous reads. Inline requests retain the HTTP body limit.
  let downloadBytes = 0;
  for (const raw of posts as any[]) for (const image of Array.isArray(raw?.images) ? raw.images : []) {
    if (image && Object.prototype.hasOwnProperty.call(image, 'downloadRef')) downloadBytes += validateDownloadReference(image.downloadRef).byteLength;
  }
  if (downloadBytes > 3 * 1024 * 1024) throw new Error('한 번에 저장할 이미지의 전체 크기가 너무 큽니다.');
  const prepared = await Promise.all(posts.map(async (raw: any) => {
    if (!raw || typeof raw !== 'object' || !/^ldb_[\p{L}\p{N}_.-]{1,120}$/u.test(raw.id || '')) throw new Error('원고 식별자를 확인해주세요.');
    if (!Array.isArray(raw.headings || [])) throw new Error('소제목 목록을 확인해주세요.');
    for (const heading of raw.headings || []) optionalPrompt(heading?.prompt);
    optionalPrompt(raw.structuredContent?.thumbnailPrompt);
    const targetDirectory = articleDirectory(directory, raw);
    if (!Array.isArray(raw.images || []) || (raw.images || []).length > 8) throw new Error('이미지는 최대 8개입니다.');
    const images = await Promise.all((raw.images || []).map(async (image: any) => {
      const attribution = imageAttribution(image);
      const prompt = optionalPrompt(image?.prompt);
      const fromDownload = image && Object.prototype.hasOwnProperty.call(image, 'downloadRef');
      const data = fromDownload
        ? await readLdbDownloadImage(image.downloadRef, downloadsDirectory) : image?.previewDataUrl || image?.filePath;
      if (typeof data !== 'string' || (!fromDownload && data.length > 2 * 1024 * 1024)) throw new Error('이미지 크기를 확인해주세요.');
      const match = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/u.exec(data);
      if (!match || match[2].length % 4 !== 0) throw new Error('이미지 데이터 형식이 올바르지 않습니다.');
      const bytes = Buffer.from(match[2], 'base64');
      const prefix = bytes.subarray(0, 12).toString('latin1');
      const valid = match[1] === 'png' ? prefix.startsWith('\x89PNG\r\n\x1a\n')
        : match[1] === 'jpeg' ? prefix.startsWith('\xff\xd8\xff')
          : match[1] === 'gif' ? /^GIF8[79]a/u.test(prefix)
            : prefix.startsWith('RIFF') && prefix.slice(8, 12) === 'WEBP';
      if (!valid) throw new Error('이미지 내용과 파일 형식이 일치하지 않습니다.');
      const metadata = await sharp(bytes, { limitInputPixels: 32_000_000 }).metadata().catch(() => { throw new Error('실제 이미지 파일을 읽지 못했습니다.'); });
      await sharp(bytes, { limitInputPixels: 32_000_000, failOn: 'warning' }).raw().toBuffer().catch(() => { throw new Error('이미지 픽셀을 끝까지 읽지 못했습니다.'); });
      if (!metadata.width || !metadata.height) throw new Error('실제 이미지 크기를 확인해주세요.');
      const hash = createHash('sha256').update(bytes).digest('hex');
      const filePath = path.join(targetDirectory, hash + '.' + match[1]);
      return { bytes, image: { heading: image.heading, isThumbnail: image.isThumbnail === true,
        headingIndex: image.headingIndex, ...(prompt !== undefined ? { prompt } : {}), ...attribution,
        sha256: hash, width: metadata.width, height: metadata.height, byteSize: bytes.length,
        filePath, previewDataUrl: data, savedToLocal: true } };
    }));
    return { raw, images, targetDirectory };
  }));
  const result: unknown[] = [];
  for (const { raw, images, targetDirectory } of prepared) {
    if (images.length) await mkdir(targetDirectory, { recursive: true });
    for (const { bytes, image } of images) {
      await storeLdbImage(image.filePath, bytes);
    }
    result.push({ ...raw, images: images.map(({ image }: any) => image) });
  }
  return result;
}
