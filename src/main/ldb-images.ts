import { createHash } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

/** Accept inline rasters only; never fetch caller URLs or trust caller file paths. */
export async function materializeLdbImages(posts: unknown[], directory: string): Promise<unknown[]> {
  const prepared = posts.map((raw: any) => {
    if (!Array.isArray(raw.images || []) || (raw.images || []).length > 8) throw new Error('이미지는 최대 8개입니다.');
    const images = (raw.images || []).map((image: any) => {
      const data = image?.previewDataUrl || image?.filePath;
      if (typeof data !== 'string' || data.length > 2 * 1024 * 1024) throw new Error('이미지 크기를 확인해주세요.');
      const match = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/u.exec(data);
      if (!match || match[2].length % 4 !== 0) throw new Error('이미지 데이터 형식이 올바르지 않습니다.');
      const bytes = Buffer.from(match[2], 'base64');
      const prefix = bytes.subarray(0, 12).toString('latin1');
      const valid = match[1] === 'png' ? prefix.startsWith('\x89PNG\r\n\x1a\n')
        : match[1] === 'jpeg' ? prefix.startsWith('\xff\xd8\xff')
          : match[1] === 'gif' ? /^GIF8[79]a/u.test(prefix)
            : prefix.startsWith('RIFF') && prefix.slice(8, 12) === 'WEBP';
      if (!valid) throw new Error('이미지 내용과 파일 형식이 일치하지 않습니다.');
      const hash = createHash('sha256').update(bytes).digest('hex');
      const filePath = path.join(directory, hash + '.' + match[1]);
      return { bytes, image: { heading: image.heading, isThumbnail: image.isThumbnail === true,
        headingIndex: image.headingIndex, filePath, previewDataUrl: data, savedToLocal: true } };
    });
    return { raw, images };
  });
  await mkdir(directory, { recursive: true });
  const result: unknown[] = [];
  for (const { raw, images } of prepared) {
    for (const { bytes, image } of images) {
      try { await writeFile(image.filePath, bytes, { flag: 'wx' }); }
      catch (error: any) { if (error?.code !== 'EEXIST') throw error; }
    }
    result.push({ ...raw, images: images.map(({ image }: any) => image) });
  }
  return result;
}
