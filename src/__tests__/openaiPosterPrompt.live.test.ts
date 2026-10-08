// [2026-10-08 사장님] GPT 이미지(덕트테이프)로 실제 나가는 요청 본문을 읽는다 — 썸네일 포스터·소제목 글자·AI 티 지시.
// axios.post 를 가로채므로 OpenAI 호출도 과금도 없다 (openaiImagePromptRotation.live.test 와 같은 방식).
import { describe, it, expect, vi, beforeEach } from 'vitest';

const posted: any[] = [];

vi.mock('axios', () => {
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
vi.mock('../apiUsageTracker.js', () => ({ trackApiUsage: async () => undefined, estimateImageCostUSD: () => 0 }));
vi.mock('../imageUsageLog.js', () => ({ logImageGeneration: async () => undefined }));
vi.mock('../main/services/AutomationService.js', () => ({ AutomationService: { isCancelRequested: () => false } }));

import { generateWithOpenAIImage } from '../image/openaiImageGenerator.js';
import { getImageDiversityHints } from '../image/imageStyles.js';

const TITLE = '청년미래적금 2차, 2,255만원 받는 3조건 총정리';

async function capturePrompt(item: Record<string, unknown>): Promise<string> {
  posted.length = 0;
  await generateWithOpenAIImage(
    [{ heading: '소제목', prompt: 'a Korean office worker holding a bankbook', ...item }] as any,
    TITLE, undefined, false, 'test-key-not-used',
  ).catch(() => undefined);
  expect(posted.length).toBeGreaterThan(0);
  return String(posted[0]?.prompt || '');
}

function hasRotation(prompt: string): boolean {
  for (let i = 0; i < 7; i++) if (prompt.includes(getImageDiversityHints(i).angle)) return true;
  return false;
}

describe('GPT 이미지 — 썸네일 포스터와 소제목 글자', () => {
  beforeEach(() => { posted.length = 0; });

  it('디렉터 포스터 커버: 제목 전체를 포스터로, 무작위 각도 없이 자연광 사진 지시', async () => {
    const prompt = await capturePrompt({ heading: TITLE, isThumbnail: true, allowText: true, thumbnailText: TITLE, coverStyle: 'poster' });
    expect(prompt).toContain('Cover text, drawn once and nothing else: a small label line "청년미래적금 2차" above the headline "2,255만원 받는 3조건 총정리"');
    // Stated once: the generator points at the brief's TEXT POLICY instead of repeating the block.
    expect(prompt.split('Cover text, drawn once').length - 1).toBe(1);
    expect(prompt).toContain('Draw exactly the Korean text named in the TEXT POLICY below, once');
    expect(prompt).not.toContain('short hook');
    expect(prompt).toContain('PHOTO LOOK: a real camera photograph');
    expect(hasRotation(prompt)).toBe(false);
  });

  it('표시 없는 썸네일(이미지 생성 스튜디오 등)은 예전 짧은 문구 지시와 각도 그대로', async () => {
    const prompt = await capturePrompt({ heading: '카페', isThumbnail: true, allowText: true, thumbnailText: '아늑한 카페' });
    expect(prompt).toContain('it is a short hook, not the article title');
    expect(prompt).not.toContain('PHOTO LOOK');
    expect(hasRotation(prompt)).toBe(true);
  });

  it('소제목 글자가 켜진 소제목 이미지(headingText)는 소제목 문장을 그대로, 한 번만', async () => {
    const prompt = await capturePrompt({ heading: '신청 자격 3가지 확인', isThumbnail: false, allowText: true, headingText: '신청 자격 3가지 확인' });
    expect(prompt).toContain('Write this exact Korean section title in the image: "신청 자격 3가지 확인"');
    expect(prompt.split('Write this exact Korean section title').length - 1).toBe(1);
    expect(prompt).not.toContain('ZERO text');
  });

  it('표시 없이 글자가 허용된 소제목 이미지는 예전 문구 그대로', async () => {
    const prompt = await capturePrompt({ heading: '신청 자격 3가지 확인', isThumbnail: false, allowText: true });
    expect(prompt).toContain('Render this exact Korean text as a bold, large, clearly legible headline');
    expect(prompt).not.toContain('Write this exact Korean section title');
  });

  it('글자가 꺼진 소제목 이미지는 글자 없이', async () => {
    const prompt = await capturePrompt({ heading: '신청 자격 3가지 확인', isThumbnail: false, allowText: false });
    expect(prompt).toContain('ZERO text');
    expect(prompt).not.toContain('Write this exact Korean section title');
  });
});
