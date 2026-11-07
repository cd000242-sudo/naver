/**
 * [2026-11-07 사장님] GPT Image 2.6 움짤 생성 — 가짜 응답으로만 시험한다(유료 호출 0).
 * axios.post 를 가로채 요청 본문을 읽고, 가짜 GIF/PNG/초대형 응답을 돌려준다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import { createHash } from 'crypto';

const state = vi.hoisted(() => ({
  config: { openaiImageModel: 'gpt-image-2.6-flare', openaiImageQuality: 'low' } as Record<string, unknown>,
  posted: [] as Array<{ url: string; body: any; options: any }>,
  responseBytes: Buffer.alloc(0),
  tracked: [] as any[],
  logged: [] as any[],
}));

vi.mock('axios', () => {
  const post = vi.fn(async (url: string, body: any, options: any) => {
    state.posted.push({ url, body, options });
    return { data: { data: [{ b64_json: state.responseBytes.toString('base64') }] } };
  });
  const get = vi.fn(async () => ({ data: Buffer.alloc(0) }));
  return { default: { post, get, isAxiosError: () => false }, post, get };
});
// The 20MB case would otherwise go through the worker pool; the decode itself is not under test.
vi.mock('../main/utils/base64Async.js', () => ({
  decodeBase64Async: async (b64: string) => Buffer.from(b64, 'base64'),
}));
vi.mock('../configManager.js', () => ({ loadConfig: async () => state.config }));
vi.mock('../apiUsageTracker.js', () => ({
  trackApiUsage: (...args: unknown[]) => { state.tracked.push(args); },
  estimateImageCostUSD: () => 0.1,
}));
vi.mock('../imageUsageLog.js', () => ({ logImageGeneration: (entry: unknown) => { state.logged.push(entry); } }));
vi.mock('../main/services/AutomationService.js', () => ({ AutomationService: { isCancelRequested: () => false } }));

import { generateWithOpenAIImage } from '../image/openaiImageGenerator.js';
import { runWithSquareImageTarget } from '../image/squareImageTarget.js';
import { GIF_MAX_BYTES } from '../image/animatedGifPolicy.js';

let tmpDir = '';

/** Real multi-frame GIF made by sharp (3 frames, 64x64) so the bytes are a genuine animation. */
async function makeAnimatedGif(): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  const w = 64; const h = 64; const frames = 3;
  const raw = Buffer.alloc(w * h * frames * 3);
  for (let f = 0; f < frames; f++) {
    for (let i = 0; i < w * h; i++) {
      const o = (f * w * h + i) * 3;
      raw[o] = (f * 90 + i) % 256; raw[o + 1] = (i * 7 + f) % 256; raw[o + 2] = (i * 13) % 256;
    }
  }
  return sharp(raw, { raw: { width: w, height: h * frames, channels: 3, pageHeight: h } })
    .gif({ delay: [200, 200, 200], loop: 0 }).toBuffer();
}

async function makePng(): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  const w = 256; const h = 256;
  const raw = Buffer.alloc(w * h * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 31) % 256;
  return sharp(raw, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
}

const sha = (buf: Buffer) => createHash('sha256').update(buf).digest('hex');

function run(item: Record<string, unknown>, extra: { model?: string; shopping?: boolean } = {}) {
  return generateWithOpenAIImage(
    [{ heading: '소제목 하나', prompt: 'a Korean cafe interior', imageRatio: '1:1', ...item }] as any,
    '테스트 글', undefined, false, 'test-key-not-used',
    extra.shopping === true, undefined, undefined, extra.model,
  );
}

async function filesIn(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await filesIn(full));
    else out.push(full);
  }
  return out;
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'test-animated-gif-'));
  process.env.TEST_MODE = 'true';
  process.env.GENERATED_IMAGES_DIR = tmpDir;
  state.config = { openaiImageModel: 'gpt-image-2.6-flare', openaiImageQuality: 'low' };
  state.posted.length = 0;
  state.tracked.length = 0;
  state.logged.length = 0;
  const { _setBlobStoreInstanceForTesting } = await import('../main/blobStore/singleton.js');
  _setBlobStoreInstanceForTesting({
    write: async (bytes: Uint8Array, meta: any) => ({
      blobId: 'TEST_BLOB', mimeType: meta.mimeType, width: meta.width, height: meta.height,
      byteSize: bytes.length, sha256: 'x', createdAt: 1,
    }),
  } as any);
});

afterEach(async () => {
  delete process.env.TEST_MODE;
  delete process.env.GENERATED_IMAGES_DIR;
  const { _setBlobStoreInstanceForTesting } = await import('../main/blobStore/singleton.js');
  _setBlobStoreInstanceForTesting(null);
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
});

describe('움짤 요청 본문', () => {
  it('움짤: output_format gif · frame_count 9 · frame_duration_ms 200, 스트리밍 없음', async () => {
    state.responseBytes = await makeAnimatedGif();
    await run({ animatedGif: true });
    const { body, url } = state.posted[0];
    expect(url).toBe('https://api.openai.com/v1/images/generations');
    expect(body).toMatchObject({ model: 'gpt-image-2.6-flare', output_format: 'gif', frame_count: 9, frame_duration_ms: 200, n: 1 });
    expect(body.stream).toBeUndefined();
    expect(body.mask).toBeUndefined();
    expect(body.background).toBeUndefined();
  });

  it('움짤 호출은 프레임을 모두 그리므로 제한 시간이 정지 이미지(120초)보다 길다', async () => {
    state.responseBytes = await makeAnimatedGif();
    await run({ animatedGif: true });
    expect(state.posted[0].options.timeout).toBeGreaterThan(120000);
  });

  it('정지 이미지 호출은 그대로 — GIF 필드 없음, 제한 시간 120초', async () => {
    state.responseBytes = await makePng();
    await run({});
    const { body, options } = state.posted[0];
    expect(body.output_format).toBeUndefined();
    expect(body.frame_count).toBeUndefined();
    expect(body.frame_duration_ms).toBeUndefined();
    expect(options.timeout).toBe(120000);
  });

  it('썸네일은 animatedGif=true 를 실어도 정지 이미지로 요청한다', async () => {
    state.responseBytes = await makePng();
    await run({ animatedGif: true, isThumbnail: true });
    expect(state.posted[0].body.output_format).toBeUndefined();
  });
});

describe('움짤 저장 — 원본 바이트 그대로 .gif', () => {
  it('받은 GIF 와 저장된 파일이 바이트까지 같고 확장자는 .gif, 미리보기는 image/gif', async () => {
    const gif = await makeAnimatedGif();
    state.responseBytes = gif;
    const [image] = await run({ animatedGif: true });
    expect(image.filePath).toMatch(/\.gif$/);
    expect(image.previewDataUrl).toMatch(/^data:image\/gif;base64,/);
    expect(image.mimeType).toBe('image/gif');
    expect(image.provider).toBe('openai-image');
    const saved = await fs.readFile(image.filePath);
    expect(sha(saved)).toBe(sha(gif));
    expect(saved.subarray(0, 6).toString('latin1')).toBe('GIF89a');
    const sharp = (await import('sharp')).default;
    expect((await sharp(saved).metadata()).pages).toBe(3);
    // The Documents mirror copy is the same GIF.
    const files = await filesIn(tmpDir);
    expect(files.length).toBeGreaterThanOrEqual(1);
    for (const f of files) expect(sha(await fs.readFile(f))).toBe(sha(gif));
  });

  it('홈판 정사각 800 목표 안에서도 자르지 않는다(프레임이 사라지지 않음)', async () => {
    const gif = await makeAnimatedGif();
    state.responseBytes = gif;
    const [image] = await runWithSquareImageTarget(800, () => run({ animatedGif: true }));
    expect(sha(await fs.readFile(image.filePath))).toBe(sha(gif));
  });

  it('정지 이미지는 종전처럼 PNG 로 저장된다', async () => {
    state.responseBytes = await makePng();
    const [image] = await run({});
    expect(image.filePath).toMatch(/\.png$/);
    expect(image.mimeType).not.toBe('image/gif');
  });
});

describe('2.6 이 아니면 안내 후 멈춘다 — 조용히 바꾸지 않음', () => {
  it.each(['gpt-image-2.5-sunburst', 'gpt-image-2.5-flare'])('%s 선택 + 움짤 요청 → 오류, API 호출 0회', async (model) => {
    state.config = { openaiImageModel: model };
    state.responseBytes = await makeAnimatedGif();
    await expect(run({ animatedGif: true })).rejects.toThrow('움짤은 GPT 이미지 2.6 에서만 됩니다.');
    expect(state.posted).toHaveLength(0);
    expect(await filesIn(tmpDir)).toHaveLength(0);
  });

  it('호출자가 모델을 2.5 로 강제해도 마찬가지', async () => {
    state.responseBytes = await makeAnimatedGif();
    await expect(run({ animatedGif: true }, { model: 'gpt-image-2.5-flare' })).rejects.toThrow('2.6');
    expect(state.posted).toHaveLength(0);
  });

  it('dall-e-3 강제도 막는다', async () => {
    await expect(run({ animatedGif: true }, { model: 'dall-e-3' })).rejects.toThrow('2.6');
    expect(state.posted).toHaveLength(0);
  });

  it('2.5 선택이어도 움짤 요청이 없으면 평소처럼 생성된다', async () => {
    state.config = { openaiImageModel: 'gpt-image-2.5-flare' };
    state.responseBytes = await makePng();
    const images = await run({});
    expect(images).toHaveLength(1);
    expect(state.posted).toHaveLength(1);
  });

  it('쇼핑 글(대표 사진 참조)은 움짤을 만들지 않고 호출 전에 멈춘다', async () => {
    state.responseBytes = await makeAnimatedGif();
    await expect(run({ animatedGif: true }, { shopping: true })).rejects.toThrow('쇼핑');
    expect(state.posted).toHaveLength(0);
  });
});

describe('잘못된 응답 — 재시도 없이 한 번에 멈추고 저장하지 않는다', () => {
  it('GIF 를 요청했는데 PNG 가 오면 GIF_NOT_RETURNED, 호출 1회, 저장 0', async () => {
    state.responseBytes = await makePng();
    await expect(run({ animatedGif: true })).rejects.toThrow(/GIF_NOT_RETURNED/);
    expect(state.posted).toHaveLength(1);
    expect(await filesIn(tmpDir)).toHaveLength(0);
  });

  it('20MB 를 넘는 GIF 는 GIF_TOO_LARGE, 호출 1회, JPEG 로 바꿔 저장하지 않는다', async () => {
    const big = Buffer.alloc(GIF_MAX_BYTES + 1024, 0x22);
    big.write('GIF89a', 0, 'latin1');
    big.writeUInt16LE(64, 6); big.writeUInt16LE(64, 8);
    state.responseBytes = big;
    await expect(run({ animatedGif: true })).rejects.toThrow(/GIF_TOO_LARGE/);
    expect(state.posted).toHaveLength(1);
    expect(await filesIn(tmpDir)).toHaveLength(0);
  }, 60000);
});

describe('비용 기록 — 장당 공식가 미공개라 프레임 수 × 정지 단가로 추정', () => {
  it('움짤은 프레임 9장분으로 기록한다', async () => {
    state.responseBytes = await makeAnimatedGif();
    await run({ animatedGif: true });
    expect(state.tracked).toHaveLength(1);
    expect(state.tracked[0][0]).toBe('openai-image');
    expect(state.tracked[0][1]).toMatchObject({ images: 9, model: 'gpt-image-2.6-flare-low' });
    expect(state.logged[0]).toMatchObject({ images: 9, model: 'gpt-image-2.6-flare' });
  });

  it('정지 이미지는 1장분 그대로', async () => {
    state.responseBytes = await makePng();
    await run({});
    expect(state.tracked[0][1]).toMatchObject({ images: 1 });
  });
});
