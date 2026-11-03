import { describe, expect, it, vi } from 'vitest';
import { AgentCliError } from '../agentCli/types.js';
import type { GeneratedImage, ImageRequestItem } from '../image/types.js';
import {
  generateWithCodexImage, splitIntoSessions, type CodexImageRuntime,
} from '../image/codex/codexImageGenerator.js';

const item = (n: number, extra: Partial<ImageRequestItem> = {}): ImageRequestItem => ({
  heading: `소제목 ${n}`, prompt: `exact english prompt ${n}`, ...extra,
});
const items = (count: number): ImageRequestItem[] => Array.from({ length: count }, (_, i) => item(i + 1, i === 0 ? { isThumbnail: true } : {}));

function makeRuntime(handler: (prompts: string[], call: number) => Promise<string[]>) {
  const sessions: string[][] = [];
  let running = 0;
  let maxRunning = 0;
  const log = vi.fn();
  const runtime: CodexImageRuntime = {
    assertReady: vi.fn(async () => undefined),
    runSession: vi.fn(async (prompts: string[]) => {
      const call = sessions.push(prompts) - 1;
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      try {
        await new Promise(resolve => setTimeout(resolve, 5));
        return { threadId: `thread-${call}`, files: await handler(prompts, call) };
      } finally {
        running -= 1;
      }
    }),
    save: vi.fn(async (filePath: string, source: ImageRequestItem): Promise<GeneratedImage> => ({
      heading: source.heading, filePath, previewDataUrl: 'data:image/png;base64,AA', provider: 'codex-image',
    })),
    log,
  };
  return { runtime, sessions, log, maxRunning: () => maxRunning };
}
const filesFor = (prompts: string[], call: number) => prompts.map((_, i) => `C:/codex/${call}-${i}.png`);

describe('세션 나누기', () => {
  it('4장까지는 한 세션, 4장을 넘으면 연속된 두 세션으로 나눈다', () => {
    expect(splitIntoSessions(1)).toEqual([[0]]);
    expect(splitIntoSessions(4)).toEqual([[0, 1, 2, 3]]);
    expect(splitIntoSessions(5)).toEqual([[0, 1, 2], [3, 4]]);
    expect(splitIntoSessions(8)).toEqual([[0, 1, 2, 3], [4, 5, 6, 7]]);
    expect(splitIntoSessions(0)).toEqual([]);
  });
});

describe('generateWithCodexImage', () => {
  it('앱이 만든 프롬프트를 그대로 한 세션에 넘기고 결과를 항목 순서에 맞춘다', async () => {
    const { runtime, sessions, log } = makeRuntime(async (p, c) => filesFor(p, c));
    const seen: Array<[string, number, number]> = [];
    const images = await generateWithCodexImage(items(3), '글 제목', 'post-1', undefined, (img, i, total) => seen.push([img.heading, i, total]), {}, runtime);
    // The app's prompt goes first, unchanged; only the frame line is appended (no ratio on the item = square).
    // 2026-11-04: the square line also asks for the central square (the saved file is centre-cropped — codexImageFrame.test.ts).
    const square = '\nASPECT RATIO: square 1:1 (1024x1024). Keep the main subject and all text inside the central square. Compose for this frame; keep every subject and all text inside it.';
    expect(sessions).toEqual([[1, 2, 3].map((n) => `exact english prompt ${n}${square}`)]);
    expect(images.map(i => i.heading)).toEqual(['소제목 1', '소제목 2', '소제목 3']);
    expect(images.map(i => i.filePath)).toEqual(['C:/codex/0-0.png', 'C:/codex/0-1.png', 'C:/codex/0-2.png']);
    expect(images.every(i => i.provider === 'codex-image')).toBe(true);
    expect(seen).toEqual([['소제목 1', 0, 3], ['소제목 2', 1, 3], ['소제목 3', 2, 3]]);
    expect(log.mock.calls.map(c => String(c[0])).join('\n')).toContain('🎨 Codex 구독 이미지 3장 생성 중 (gpt-6-luna)');
  });

  it('항목의 비율(썸네일·소제목 설정)을 프롬프트 끝 한 줄로 넘긴다 — 이미지 도구에 크기 인자가 없다', async () => {
    const { runtime, sessions } = makeRuntime(async (p, c) => filesFor(p, c));
    const ratioItems = [
      item(1, { isThumbnail: true, imageRatio: '1:1' } as Partial<ImageRequestItem>),
      item(2, { imageRatio: '16:9' } as Partial<ImageRequestItem>),
      item(3, { imageRatio: 'weird' } as Partial<ImageRequestItem>),
    ];
    await generateWithCodexImage(ratioItems, '글 제목', undefined, undefined, undefined, {}, runtime);
    const [first, second, third] = sessions[0];
    expect(first).toMatch(/^exact english prompt 1\nASPECT RATIO: square 1:1 \(1024x1024\)\./);
    expect(second).toMatch(/^exact english prompt 2\nASPECT RATIO: wide landscape 16:9\./);
    expect(third).toContain('ASPECT RATIO: square 1:1 (1024x1024).');
  });

  it('썸네일은 엔진이 한글 문구를 직접 그리므로 앱 오버레이를 끈다', async () => {
    const { runtime } = makeRuntime(async (p, c) => filesFor(p, c));
    const images = await generateWithCodexImage(items(2), '글 제목', undefined, undefined, undefined, {}, runtime);
    expect(images[0].isThumbnail).toBe(true);
    expect(images[0].disableTextOverlay).toBe(true);
    expect(images[1].disableTextOverlay).toBeUndefined();
  });

  it('6장은 3+3 두 세션을 동시에 돌리고 그 이상 동시에 돌리지 않는다', async () => {
    const harness = makeRuntime(async (p, c) => filesFor(p, c));
    const images = await generateWithCodexImage(items(6), '글 제목', undefined, undefined, undefined, {}, harness.runtime);
    expect(harness.sessions.map(s => s.length)).toEqual([3, 3]);
    expect(harness.maxRunning()).toBe(2);
    expect(images.map(i => i.heading)).toEqual(items(6).map(i => i.heading));
    expect(images[3].filePath).toBe('C:/codex/1-0.png');
  });

  it('장 수가 모자라면 그 칸을 명시 실패로 두고 "N번 이미지를 받지 못함"을 기록하며 다른 엔진으로 채우지 않는다', async () => {
    const harness = makeRuntime(async (p, c) => filesFor(p, c).slice(0, 2));
    await expect(generateWithCodexImage(items(3), '글 제목', undefined, undefined, undefined, {}, harness.runtime))
      .rejects.toThrow(/3번 이미지를 받지 못함/);
    expect(harness.log.mock.calls.map(c => String(c[0])).join('\n')).toContain('3번 이미지를 받지 못함');
    expect(harness.runtime.runSession).toHaveBeenCalledTimes(1); // no retry, no other engine
  });

  it('부분 결과 허용(allowPartial)이면 받은 칸만 돌려주고 못 받은 칸은 로그에 남긴다', async () => {
    const harness = makeRuntime(async (p, c) => filesFor(p, c).slice(0, 2));
    const images = await generateWithCodexImage(items(3), '글 제목', undefined, undefined, undefined, { allowPartial: true }, harness.runtime);
    expect(images.map(i => i.heading)).toEqual(['소제목 1', '소제목 2']);
    expect(harness.log.mock.calls.map(c => String(c[0])).join('\n')).toContain('3번 이미지를 받지 못함');
  });

  it('0장이면 allowPartial 이어도 실패한다', async () => {
    const harness = makeRuntime(async () => []);
    await expect(generateWithCodexImage(items(2), '글 제목', undefined, undefined, undefined, { allowPartial: true }, harness.runtime))
      .rejects.toThrow(/1번 이미지를 받지 못함/);
  });

  it('한 세션이 한도 초과로 실패하면 그 세션 칸만 실패하고 다른 세션 결과는 살린다', async () => {
    const harness = makeRuntime(async (p, c) => {
      if (c === 1) throw new AgentCliError('rate_limited', 'codex', 'Codex 구독 한도 소진 — 11월 4일 15시 42분 이후 다시 시도');
      return filesFor(p, c);
    });
    const images = await generateWithCodexImage(items(6), '글 제목', undefined, undefined, undefined, { allowPartial: true }, harness.runtime);
    expect(images.map(i => i.heading)).toEqual(['소제목 1', '소제목 2', '소제목 3']);
    await expect(generateWithCodexImage(items(6), '글 제목', undefined, undefined, undefined, {}, makeRuntime(async (p, c) => {
      if (c === 1) throw new AgentCliError('rate_limited', 'codex', 'Codex 구독 한도 소진 — 11월 4일 15시 42분 이후 다시 시도');
      return filesFor(p, c);
    }).runtime)).rejects.toThrow(/11월 4일 15시 42분[\s\S]*4번 이미지를 받지 못함|4번 이미지를 받지 못함[\s\S]*11월 4일 15시 42분/);
  });

  it('준비 확인에 실패하면 세션을 시작하지 않는다', async () => {
    const harness = makeRuntime(async (p, c) => filesFor(p, c));
    (harness.runtime.assertReady as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new AgentCliError('not_installed', 'codex', 'Codex 구독 이미지는 Codex 연결이 필요합니다 — 설정에서 [연결하기]'),
    );
    await expect(generateWithCodexImage(items(2), '글 제목', undefined, undefined, undefined, {}, harness.runtime)).rejects.toThrow('[연결하기]');
    expect(harness.runtime.runSession).not.toHaveBeenCalled();
  });

  it('시작 전에 중지 요청이 있으면 아무것도 하지 않고 빈 목록을 돌려준다', async () => {
    const harness = makeRuntime(async (p, c) => filesFor(p, c));
    const images = await generateWithCodexImage(items(2), '글 제목', undefined, () => true, undefined, {}, harness.runtime);
    expect(images).toEqual([]);
    expect(harness.runtime.runSession).not.toHaveBeenCalled();
  });

  it('실행 중 중지 요청이 오면 취소 신호를 보내 세션을 멈춘다', async () => {
    let stop = false;
    const runtime: CodexImageRuntime = {
      assertReady: async () => undefined,
      runSession: (_prompts, options) => new Promise((_resolve, reject) => {
        options.signal?.addEventListener('abort', () => reject(new AgentCliError('aborted', 'codex', '작업이 취소되었습니다.')));
        setTimeout(() => { stop = true; }, 10);
      }),
      save: async () => { throw new Error('not reached'); },
      log: () => undefined,
    };
    const images = await generateWithCodexImage(items(2), '글 제목', undefined, () => stop, undefined, { pollMs: 5 }, runtime);
    expect(images).toEqual([]);
  });

  it('항목이 없으면 세션을 시작하지 않고 빈 목록을 돌려준다', async () => {
    const harness = makeRuntime(async (p, c) => filesFor(p, c));
    expect(await generateWithCodexImage([], '글 제목', undefined, undefined, undefined, {}, harness.runtime)).toEqual([]);
    expect(harness.runtime.assertReady).not.toHaveBeenCalled();
  });
});
