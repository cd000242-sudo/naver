import type { GeneratedImage, ImageRequestItem } from './types.js';
import { sanitizeImagePrompt, writeImageFile } from './imageUtils.js';

const PRODIA_INFERENCE_URL = 'https://inference.prodia.com/v2/job';

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function buildProdiaPrompt(item: ImageRequestItem, isThumbnail: boolean, postTitle?: string): string {
  const baseSubject = item.englishPrompt || sanitizeImagePrompt(item.prompt || item.heading);

  if (isThumbnail && postTitle) {
    // ✅ 썸네일: 텍스트 포함 블로그 대표 이미지 (고품질 화보 스타일)
    return `Generate a premium, high-impact blog thumbnail for the title: "${String(postTitle).trim()}".
Topic: ${baseSubject}.
Aesthetic: Professional magazine quality, high contrast, vibrant colors.

DESIGN REQUIREMENTS:
- SINGLE COHESIVE IMAGE (NO collage, NO split-screen).
- Landscape 16:9 composition.
- Place the main subject prominently.
- Eye-catching blog thumbnail style, photorealistic.`;
  }

  const allowText = !!(item as any).allowText;
  if (allowText) {
    return `Create a photorealistic Korean e-commerce product infographic.
MAIN SUBJECT: "${baseSubject}"
CONTEXT: "${item.heading}"

REQUIRMENTS:
- Clean white or neutral background.
- Add simple callouts and Korean text (not gibberish).
- Professional commercial photography style.`;
  }

  // ✅ 소제목용: 실사 위주의 고해상도 이미지 (NEVER TEXT)
  return `Generate a photorealistic professional image for a blog section titled "${item.heading}".
Subject Detail: "${baseSubject}".

ABSOLUTE REQUIREMENTS:
- NEVER TEXT. No letters, words, numbers, symbols, signs, labels, banners, watermarks.
- Cinematic lighting, ultra-detailed, 8k quality.
- High-end commercial photography, sharp focus.`;
}

export async function generateWithProdia(
  items: ImageRequestItem[],
  postTitle?: string,
  postId?: string,
  isFullAuto: boolean = false,
  prodiaToken?: string,
): Promise<GeneratedImage[]> {
  const token = String(prodiaToken || process.env.PRODIA_TOKEN || '').trim();
  if (!token) {
    throw new Error(
      'Prodia API 토큰이 설정되지 않았습니다.\n\n' +
      '환경 설정 → Prodia API Token을 입력해주세요.\n' +
      '발급: https://app.prodia.com/api',
    );
  }

  const results: GeneratedImage[] = [];

  const axios = (await import('axios')).default;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const isThumbnail = (item as any).isThumbnail !== undefined ? !!(item as any).isThumbnail : i === 0;
    const prompt = buildProdiaPrompt(item, isThumbnail, postTitle);

    const job = {
      // ✅ SD3.5 모델 사용 (더 사실적인 이미지 생성)
      type: 'inference.sd3.5.txt2img.v1',
      config: {
        prompt,
        width: 1024,
        height: 768,
        steps: 30,
        cfg_scale: 7.0,
      },
    };

    const maxRetries = 5;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await axios.post(PRODIA_INFERENCE_URL, job, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'image/png',
            'Content-Type': 'application/json',
          },
          responseType: 'arraybuffer',
          timeout: 120000,
          validateStatus: () => true,
        });

        if (response.status === 429) {
          const retryAfterRaw = String(response.headers?.['retry-after'] || '').trim();
          const retryAfterSec = Number.parseInt(retryAfterRaw, 10);
          const waitMs = Number.isFinite(retryAfterSec) && retryAfterSec > 0 ? retryAfterSec * 1000 : Math.min(3000, 400 * attempt);
          await sleep(waitMs);
          continue;
        }

        if (response.status === 401 || response.status === 403) {
          throw new Error(`Prodia 인증 실패(${response.status}). 토큰이 올바른지 확인해주세요.`);
        }

        if (response.status !== 200) {
          const body = (() => {
            try {
              return Buffer.from(response.data || []).toString('utf-8');
            } catch {
              return '';
            }
          })();
          throw new Error(`Prodia 요청 실패(${response.status}). ${String(body || '').slice(0, 200)}`);
        }

        const buffer = Buffer.from(response.data);
        if (!buffer || buffer.length < 1000) {
          throw new Error('Prodia 응답 이미지가 너무 작습니다.');
        }

        const saved = await writeImageFile(buffer, 'png', item.heading, postTitle, postId);
        const finalFilePath = saved.savedToLocal || saved.filePath;

        results.push({
          heading: item.heading,
          filePath: finalFilePath,
          previewDataUrl: saved.previewDataUrl,
          provider: 'prodia',
          savedToLocal: saved.savedToLocal,
        });
        break;
      } catch (e) {
        const msg = (e as Error).message;
        if (attempt >= maxRetries) {
          throw new Error(`Prodia 이미지 생성 실패: ${msg}`);
        }
        await sleep(Math.min(2500, 350 * attempt));
      }
    }
  }

  return results;
}
