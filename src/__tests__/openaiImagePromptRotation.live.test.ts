// src/__tests__/openaiImagePromptRotation.live.test.ts
//
// [2026-09-08 사장님] "같은 각도로 전부 비슷하게 나오잖아" — 소스 단언이 아니라
// 실제로 나가는 요청 본문을 읽어 각도가 도는지 확인한다.
// axios.post 를 가로채므로 OpenAI 호출도 과금도 없다.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const posted: any[] = [];

vi.mock('axios', () => {
  // 프롬프트를 붙잡은 뒤 401 로 즉시 중단시킨다 — 재시도 대기 없이 끝난다.
  const post = vi.fn(async (_url: string, body: any) => {
    posted.push(body);
    const err: any = new Error('Unauthorized');
    err.isAxiosError = true;
    err.response = { status: 401, data: { error: { message: 'invalid api key (test)' } } };
    throw err;
  });
  const get = vi.fn(async () => ({ data: Buffer.alloc(0) }));
  return { default: { post, get, isAxiosError: (e: any) => Boolean(e?.isAxiosError) }, post, get };
});
vi.mock('../configManager.js', () => ({
  loadConfig: async () => ({ openaiImageModel: 'gpt-image-1.5', imageStyle: 'realistic' }),
}));
vi.mock('../apiUsageTracker.js', () => ({
  trackApiUsage: async () => undefined,
  estimateImageCostUSD: () => 0,
}));
vi.mock('../imageUsageLog.js', () => ({ logImageGeneration: async () => undefined }));
vi.mock('../main/services/AutomationService.js', () => ({
  AutomationService: { isCancelRequested: () => false },
}));

import { generateWithOpenAIImage } from '../image/openaiImageGenerator.js';
import { getImageDiversityHints } from '../image/imageStyles.js';

/** 한 장을 생성 요청하고 실제로 전송된 프롬프트를 돌려준다. */
async function capturePrompt(item: Record<string, unknown>): Promise<string> {
  posted.length = 0;
  await generateWithOpenAIImage(
    [{ heading: '소제목', prompt: 'a Korean office worker checking a document', ...item }] as any,
    '테스트 글', undefined, false, 'test-key-not-used',
  ).catch(() => undefined);
  expect(posted.length).toBeGreaterThan(0);
  return String(posted[0]?.prompt || '');
}

/** 프롬프트에 실린 카메라 각도 문구. 없으면 null. */
function angleOf(prompt: string): string | null {
  for (let i = 0; i < 7; i++) {
    const angle = getImageDiversityHints(i).angle;
    if (prompt.includes(angle)) return angle;
  }
  return null;
}

describe('전송 프롬프트의 카메라 각도는 소제목 순번을 따라 돈다', () => {
  beforeEach(() => { posted.length = 0; });

  it('순번 0~5 가 서로 다른 각도 6종을 만든다', async () => {
    const angles: (string | null)[] = [];
    for (let idx = 0; idx < 6; idx++) {
      angles.push(angleOf(await capturePrompt({ diversityIndex: idx })));
    }
    expect(angles.some((a) => a === null)).toBe(false);
    expect(new Set(angles).size).toBe(6);
  });

  it('0번은 부감이다 — 사장님이 본 그 그림', async () => {
    expect(angleOf(await capturePrompt({ diversityIndex: 0 }))).toMatch(/bird-eye/);
  });

  it('순번이 없으면 전부 0번(부감)으로 무너진다 — 회귀 재현', async () => {
    const angles: (string | null)[] = [];
    for (let i = 0; i < 3; i++) angles.push(angleOf(await capturePrompt({})));
    expect(new Set(angles).size).toBe(1);
    expect(angles[0]).toMatch(/bird-eye/);
  });

  it('썸네일(0번)도 각도가 실린다 — 본문과 같은 규칙', async () => {
    const prompt = await capturePrompt({ diversityIndex: 2, isThumbnail: true });
    expect(angleOf(prompt)).not.toBeNull();
  });
});

describe('다양성 축은 6개 중 5개가 실제로 프롬프트에 실린다', () => {
  // [2026-09-08] 종전 리얼리스틱 분기는 angle+color 2축만 실었다. 로그는 조명까지
  // 찍어 도는 것처럼 보였지만 프롬프트에는 없었다(실측).
  it('각도·구도·조명·포커스·색이 모두 들어간다', async () => {
    const prompt = await capturePrompt({ diversityIndex: 1 });
    const hints = getImageDiversityHints(1);
    for (const axis of [hints.angle, hints.framing, hints.lighting, hints.focus, hints.color] as const) {
      expect(prompt).toContain(axis);
    }
  });

  it('스타일 이미지(스틱맨/2D 등)에도 각도가 실린다', async () => {
    for (const imageStyle of ['stickman', 'roundy', '2d', 'vintage']) {
      const prompt = await capturePrompt({ diversityIndex: 4, imageStyle });
      expect(angleOf(prompt), `style=${imageStyle}`).not.toBeNull();
    }
  });
});

describe('브리프와 생성기가 카메라를 두 번 말하지 않는다', () => {
  // [2026-09-08] 앞머리에 "bird-eye view" 를 박고 뒤 브리프가 "알맞은 시점을 골라라"
  // 라고 해 지시가 충돌했다(실측).
  const GENERIC = 'Choose the clearest viewpoint for the section action';

  it('생성기가 각도를 붙이면 브리프는 카메라 줄을 뺀다', async () => {
    const prompt = await capturePrompt({ diversityIndex: 2 });
    expect(angleOf(prompt)).not.toBeNull();
    expect(prompt).not.toContain(GENERIC);
  });
});

describe('최종 프롬프트가 로그에 남는다', () => {
  it('전송 직전 프롬프트 로그가 있다', async () => {
    const logs: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => { logs.push(args.map(String).join(' ')); };
    try {
      await capturePrompt({ diversityIndex: 0 });
    } finally {
      console.log = original;
    }
    expect(logs.some((line) => line.includes('최종 프롬프트'))).toBe(true);
  });
});
