import axios from 'axios';
import { loadConfig } from '../configManager.js';
import type { GeneratedImage, ImageRequestItem } from './types.js';
import { sanitizeImagePrompt, writeImageFile } from './imageUtils.js';
import { AutomationService } from '../main/services/AutomationService.js';
import { buildSafeEnglishProviderImagePrompt, isContextualImagePrompt } from './contextualImagePrompt.js';
import { hasUsableEnglishPrompt } from './promptSafety.js';

const PRODIA_GENERATE_URL = 'https://api.prodia.com/v1/sd/generate';
const PRODIA_JOB_URL = 'https://api.prodia.com/v1/job';

const MODEL_MAP: Record<string, string> = {
  flux: 'sd_xl_base_1.0.safetensors [31e35c80]',
  sdxl: 'sd_xl_base_1.0.safetensors [31e35c80]',
  sd15: 'v1-5-pruned-emaonly.safetensors [d7049739]',
  sd3: 'sd_xl_base_1.0.safetensors [31e35c80]',
};

function clampProdiaSize(value: number): number {
  const clamped = Math.max(512, Math.min(768, value));
  return Math.round(clamped / 64) * 64;
}

function resolveSize(ratio?: string): { width: number; height: number } {
  switch (ratio) {
    case '16:9':
      return { width: 768, height: 448 };
    case '9:16':
      return { width: 448, height: 768 };
    case '4:3':
      return { width: 768, height: 576 };
    case '3:4':
      return { width: 576, height: 768 };
    default:
      return { width: 768, height: 768 };
  }
}

function normalizeImageUrl(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : '';
}

async function resolveProdiaConfig(apiKey?: string): Promise<{ apiKey: string; model: string }> {
  const config = await loadConfig();
  const resolvedApiKey =
    apiKey?.trim()
    || (config as any).prodiaApiKey?.trim()
    || (config as any).prodiaToken?.trim()
    || process.env.PRODIA_API_KEY?.trim()
    || process.env.PRODIA_TOKEN?.trim()
    || '';
  if (!resolvedApiKey) {
    throw new Error('Prodia API 키가 없습니다. 환경설정의 Prodia Token/API Key를 입력해주세요.');
  }

  const modelKey = String((config as any).prodiaModel || process.env.PRODIA_MODEL || 'sdxl').trim();
  return {
    apiKey: resolvedApiKey,
    model: MODEL_MAP[modelKey] || modelKey || MODEL_MAP.sdxl,
  };
}

async function requestProdiaImage(
  apiKey: string,
  prompt: string,
  model: string,
  width: number,
  height: number,
): Promise<string> {
  const response = await axios.post(
    PRODIA_GENERATE_URL,
    {
      prompt,
      model,
      width: clampProdiaSize(width),
      height: clampProdiaSize(height),
      steps: 25,
      cfg_scale: 7,
      sampler: 'DPM++ 2M Karras',
    },
    {
      headers: {
        'X-Prodia-Key': apiKey,
        'Content-Type': 'application/json',
      },
      timeout: 60_000,
    },
  );

  const jobId = response.data?.job || response.data?.id;
  if (!jobId) {
    throw new Error(`Prodia 작업 ID를 받지 못했습니다: ${JSON.stringify(response.data || {})}`);
  }

  for (let attempt = 0; attempt < 45; attempt++) {
    if (AutomationService.isCancelRequested()) {
      throw new Error('사용자가 이미지 생성을 취소했습니다.');
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    const status = await axios.get(`${PRODIA_JOB_URL}/${jobId}`, {
      headers: { 'X-Prodia-Key': apiKey },
      timeout: 30_000,
    });
    const imageUrl = normalizeImageUrl(status.data?.imageUrl || status.data?.image_url || status.data?.output?.[0]);
    if (status.data?.status === 'succeeded' && imageUrl) return imageUrl;
    if (status.data?.status === 'failed') {
      throw new Error(`Prodia 작업 실패: ${JSON.stringify(status.data || {})}`);
    }
  }

  throw new Error('Prodia 이미지 생성 대기 시간이 초과되었습니다.');
}

export async function generateWithProdia(
  items: ImageRequestItem[],
  postTitle?: string,
  postId?: string,
  isFullAuto?: boolean,
  apiKey?: string,
  onImageGenerated?: (image: GeneratedImage, index: number, total: number) => void,
): Promise<GeneratedImage[]> {
  const { apiKey: resolvedApiKey, model } = await resolveProdiaConfig(apiKey);
  const results: GeneratedImage[] = [];

  for (let index = 0; index < items.length; index++) {
    if (AutomationService.isCancelRequested()) break;
    const item = items[index];
    const rawPrompt = item.englishPrompt || sanitizeImagePrompt(item.prompt || item.heading || postTitle || 'blog image');
    const promptBase = isContextualImagePrompt(rawPrompt) && hasUsableEnglishPrompt(item.sourceEnglishPrompt)
      ? buildSafeEnglishProviderImagePrompt(item.sourceEnglishPrompt, Boolean(item.referenceImageUrl || item.referenceImagePath))
      : rawPrompt;
    const prompt = `${promptBase}\n\nHigh quality blog illustration, natural composition, no text overlay unless explicitly requested.`;
    const ratio = (item as any).imageRatio || '1:1';
    const { width, height } = resolveSize(ratio);

    const imageUrl = await requestProdiaImage(resolvedApiKey, prompt, model, width, height);
    const imageResponse = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 60_000,
    });
    const saved = await writeImageFile(Buffer.from(imageResponse.data), 'png', item.heading, postTitle, postId);
    const image: GeneratedImage = {
      heading: item.heading,
      filePath: saved.filePath,
      previewDataUrl: saved.previewDataUrl,
      provider: 'prodia',
      savedToLocal: saved.savedToLocal,
      url: imageUrl,
      sourceUrl: imageUrl,
      originalIndex: (item as any).originalIndex ?? index,
      isThumbnail: item.isThumbnail,
      blobId: saved.blobId,
      mimeType: saved.mimeType,
      width: saved.width,
      height: saved.height,
      byteSize: saved.byteSize,
      sha256: saved.sha256,
      createdAt: saved.createdAt,
    };

    results.push(image);
    onImageGenerated?.(image, index, items.length);

    if (isFullAuto && index < items.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
  }

  return results;
}
