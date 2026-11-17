import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentCliError } from '../agentCli/types.js';
import type { GeneratedImage, ImageRequestItem } from '../image/types.js';
import {
  GEMINI_CLI_IMAGE_CONCURRENCY, GEMINI_CLI_IMAGE_SESSION_TIMEOUT_MS, generateWithGeminiCliImage, type GeminiCliImageRuntime,
} from '../image/geminiCli/geminiCliImageGenerator.js';

const PROVIDER = 'gemini-cli-image' as unknown as GeneratedImage['provider'];
const item = (n: number, extra: Partial<ImageRequestItem> = {}): ImageRequestItem => ({
  heading: `소제목 ${n}`, prompt: `exact english prompt ${n}`, ...extra,
});
const items = (count: number): ImageRequestItem[] => Array.from({ length: count }, (_, i) => item(i + 1, i === 0 ? { isThumbnail: true } : {}));
const promptNumber = (prompt: string): string => /exact english prompt (\d+)/.exec(prompt)?.[1] ?? '?';
const SQUARE = '\nASPECT RATIO: square 1:1 (1024x1024). Keep the main subject and all text inside the central square. Compose for this frame; keep every subject and all text inside it.';

interface Harness {
  runtime: GeminiCliImageRuntime;
  sessions: string[];
  options: Array<{ timeoutMs?: number; signal?: AbortSignal }>;
  log: ReturnType<typeof vi.fn>;
  maxRunning: () => number;
  maxSaving: () => number;
}

function makeRuntime(
  handler: (prompt: string, call: number) => Promise<string[]> = async (p) => [`C:/gemini/${promptNumber(p)}.jpg`],
  delayMs = 5,
): Harness {
  const sessions: string[] = [];
  const options: Harness['options'] = [];
  let running = 0; let maxRunning = 0; let saving = 0; let maxSaving = 0;
  const log = vi.fn();
  const runtime: GeminiCliImageRuntime = {
    assertReady: vi.fn(async () => undefined),
    runSession: vi.fn(async (prompt: string, opts) => {
      const call = sessions.push(prompt) - 1;
      options.push(opts);
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      try {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return { conversationId: `conv-${call}`, files: await handler(prompt, call) };
      } finally { running -= 1; }
    }),
    save: vi.fn(async (filePath: string, source: ImageRequestItem): Promise<GeneratedImage> => {
      saving += 1;
      maxSaving = Math.max(maxSaving, saving);
      try {
        await new Promise((resolve) => setTimeout(resolve, 2));
        return { heading: source.heading, filePath, previewDataUrl: 'data:image/jpeg;base64,AA', provider: PROVIDER };
      } finally { saving -= 1; }
    }),
    log,
  };
  return { runtime, sessions, options, log, maxRunning: () => maxRunning, maxSaving: () => maxSaving };
}
const logText = (h: Harness): string => h.log.mock.calls.map((c) => String(c[0])).join('\n');
const run = (list: ImageRequestItem[], h: Harness, options = {}, stop?: () => boolean, onImage?: (img: GeneratedImage, i: number, total: number) => void) =>
  generateWithGeminiCliImage(list, '글 제목', 'post-1', stop, onImage, options, h.runtime);
const accountError = (code: AgentCliError['code'], text: string) => new AgentCliError(code, 'gemini', text);

afterEach(() => { vi.useRealTimers(); });

describe('Gemini 구독 이미지 - 한 세션에 한 장, 동시 2개', () => {
  it('동시 실행 한도 2(실측 전이라 보수적으로)와 세션 제한 시간 240초', () => {
    expect(GEMINI_CLI_IMAGE_CONCURRENCY).toBe(2);
    expect(GEMINI_CLI_IMAGE_SESSION_TIMEOUT_MS).toBe(240_000);
  });

  it('장마다 한 세션씩, 앱이 만든 프롬프트에 비율 줄만 덧붙여 넘기고 결과를 항목 순서에 맞춘다', async () => {
    const h = makeRuntime();
    const seen: Array<[string, number, number]> = [];
    const images = await run(items(3), h, {}, undefined, (img, i, total) => seen.push([img.heading, i, total]));
    expect([...h.sessions].sort()).toEqual([1, 2, 3].map((n) => `exact english prompt ${n}${SQUARE}`));
    expect(images.map((i) => i.heading)).toEqual(['소제목 1', '소제목 2', '소제목 3']);
    expect(images.map((i) => i.filePath)).toEqual(['C:/gemini/1.jpg', 'C:/gemini/2.jpg', 'C:/gemini/3.jpg']);
    expect(images.every((i) => String(i.provider) === 'gemini-cli-image')).toBe(true);
    expect([...seen].sort((a, b) => a[1] - b[1])).toEqual([['소제목 1', 0, 3], ['소제목 2', 1, 3], ['소제목 3', 2, 3]]);
    expect(logText(h)).toContain('🎨 Gemini 구독 이미지 3장 생성 중 (gemini-3.8-flash-low)');
  });

  it('세션마다 제한 시간 240초와 취소 신호를 받는다', async () => {
    const h = makeRuntime();
    await run(items(2), h);
    expect(h.options).toHaveLength(2);
    for (const opts of h.options) {
      expect(opts.timeoutMs).toBe(240_000);
      expect(opts.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it('6장이어도 동시에 2개를 넘기지 않고, 2개까지는 실제로 겹쳐 돈다', async () => {
    const h = makeRuntime(undefined, 15);
    const images = await run(items(6), h);
    expect(h.sessions).toHaveLength(6);
    expect(h.maxRunning()).toBe(2);
    expect(images.map((i) => i.heading)).toEqual(items(6).map((i) => i.heading));
  });

  it('1장이면 1개만 돌린다', async () => {
    const h = makeRuntime(undefined, 10);
    await run(items(1), h);
    expect(h.maxRunning()).toBe(1);
  });

  it('끝나는 순서가 뒤섞여도 각 세션의 파일은 그 항목에만 붙고 결과는 항목 순서다', async () => {
    const delays = new Map([['1', 40], ['2', 5]]);
    const h = makeRuntime(async (prompt) => {
      const n = promptNumber(prompt);
      await new Promise((resolve) => setTimeout(resolve, delays.get(n) ?? 1));
      return [`C:/gemini/${n}.jpg`];
    }, 1);
    const finished: string[] = [];
    const images = await run(items(2), h, {}, undefined, (img) => finished.push(img.heading));
    expect(finished).toEqual(['소제목 2', '소제목 1']);
    expect(images.map((i) => [i.heading, i.filePath])).toEqual([['소제목 1', 'C:/gemini/1.jpg'], ['소제목 2', 'C:/gemini/2.jpg']]);
  });

  it('저장은 한 번에 하나씩 하고, 항목·글 제목·글 ID 로 부른다', async () => {
    const h = makeRuntime(undefined, 5);
    const list = items(6);
    await run(list, h);
    expect(h.maxSaving()).toBe(1);
    const calls = (h.runtime.save as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(6);
    expect(calls.every((c) => c[2] === '글 제목' && c[3] === 'post-1')).toBe(true);
  });

  it('항목의 비율을 프롬프트 끝 한 줄로 넘긴다 (3:4 · 16:9 · 모르는 값은 1:1)', async () => {
    const h = makeRuntime();
    await run([
      item(1, { imageRatio: '3:4' } as Partial<ImageRequestItem>),
      item(2, { imageRatio: '16:9' } as Partial<ImageRequestItem>),
      item(3, { imageRatio: 'weird' } as Partial<ImageRequestItem>),
    ], h);
    const byNumber = (n: number) => h.sessions.find((p) => promptNumber(p) === String(n)) as string;
    expect(byNumber(1)).toMatch(/^exact english prompt 1\nASPECT RATIO: portrait 3:4\./);
    expect(byNumber(2)).toMatch(/^exact english prompt 2\nASPECT RATIO: wide landscape 16:9\./);
    expect(byNumber(3)).toContain('ASPECT RATIO: square 1:1 (1024x1024).');
  });

  it('썸네일은 엔진이 한글 문구를 직접 그리므로 앱 오버레이를 끄고, originalIndex 를 실어 보낸다', async () => {
    const images = await run([item(1, { isThumbnail: true, originalIndex: 7 } as Partial<ImageRequestItem>), item(2)], makeRuntime());
    expect(images[0]).toMatchObject({ isThumbnail: true, disableTextOverlay: true, originalIndex: 7 });
    expect(images[1].disableTextOverlay).toBeUndefined();
    expect(images[1].originalIndex).toBeUndefined();
  });

  it('끝난 장마다 초를 적고, 마지막에 "N장 동시 M개 · 총 S초" 를 남긴다', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-17T10:00:00Z'));
    const h = makeRuntime(async (prompt) => {
      vi.setSystemTime(Date.now() + 56_000);
      return [`C:/gemini/${promptNumber(prompt)}.jpg`];
    });
    await run([item(1)], h);
    expect(logText(h)).toMatch(/Gemini 구독 이미지 1\/1.*소제목 1.*56초/);
    expect(logText(h)).toContain('Gemini 구독 이미지: 1장 동시 1개 · 총 56초');
  });
});

describe('실패 처리 - 다른 엔진으로 채우지 않는다', () => {
  const none = async (p: string) => (promptNumber(p) === '3' ? [] : [`C:/gemini/${promptNumber(p)}.jpg`]);

  it('파일이 안 온 칸은 "N번 이미지를 받지 못함" 으로 명시 실패하고 다시 보내지 않는다', async () => {
    const h = makeRuntime(none);
    await expect(run(items(3), h)).rejects.toThrow(/3번 이미지를 받지 못함/);
    expect(logText(h)).toContain('3번 이미지를 받지 못함');
    expect(logText(h)).toContain('다른 엔진으로 채우지 않았습니다');
    expect(h.runtime.runSession).toHaveBeenCalledTimes(3);
  });

  it('allowPartial 이면 받은 칸만 돌려주고, 0장이면 allowPartial 이어도 실패한다', async () => {
    expect((await run(items(3), makeRuntime(none), { allowPartial: true })).map((i) => i.heading)).toEqual(['소제목 1', '소제목 2']);
    await expect(run(items(2), makeRuntime(async () => []), { allowPartial: true })).rejects.toThrow(/1번 이미지를 받지 못함/);
  });

  it('한 세션이 두 장 이상 가져오면(도구가 스스로 다듬음) 세션이 맨 앞에 둔 최종본만 쓰고 알린다', async () => {
    const h = makeRuntime(async (p) => [`C:/gemini/${promptNumber(p)}.jpg`, `C:/gemini/${promptNumber(p)}-copy.png`]);
    const images = await run(items(2), h);
    expect(images.map((i) => i.filePath)).toEqual(['C:/gemini/1.jpg', 'C:/gemini/2.jpg']);
    expect(logText(h)).toContain('2번 그려 다듬었습니다 — 최종본을 씁니다');
  });

  it('저장에 실패한 칸만 실패로 두고 이유를 남긴다', async () => {
    const h = makeRuntime();
    (h.runtime.save as ReturnType<typeof vi.fn>).mockImplementation(async (filePath: string, source: ImageRequestItem) => {
      if (source.heading === '소제목 2') throw new Error('디스크 가득 참');
      return { heading: source.heading, filePath, previewDataUrl: 'data:image/jpeg;base64,AA', provider: PROVIDER };
    });
    const images = await run(items(3), h, { allowPartial: true });
    expect(images.map((i) => i.heading)).toEqual(['소제목 1', '소제목 3']);
    expect(logText(h)).toMatch(/2번 이미지를 받지 못함 \(디스크 가득 참\)/);
  });

  it.each(['rate_limited', 'not_logged_in', 'not_installed', 'subscription_inactive', 'provider_disabled', 'update_required', 'model_unavailable'] as const)(
    '계정 수준 오류(%s)가 나면 새 세션을 더 띄우지 않고, 남은 칸은 그 이유로 실패한다', async (code) => {
      // Call 0 fails at once; call 1 is already running and finishes; items 3..5 must never start.
      const h = makeRuntime(async (p, call) => {
        if (call === 0) throw accountError(code, `Gemini 연결 문제 (${code})`);
        return [`C:/gemini/${promptNumber(p)}.jpg`];
      }, 10);
      await expect(run(items(5), h)).rejects.toThrow(new RegExp(`${code}[\\s\\S]*3번 이미지를 받지 못함[\\s\\S]*5번 이미지를 받지 못함`));
      expect(h.runtime.runSession).toHaveBeenCalledTimes(2);
      expect(logText(h)).toMatch(new RegExp(`5번 이미지를 받지 못함 \\(Gemini 연결 문제 \\(${code}\\)`));
    },
  );

  it('한도에 걸리기 전에 받은 이미지는 allowPartial 에서 항목 순서로 돌려준다', async () => {
    const h = makeRuntime(async (p, call) => {
      if (call === 0) throw accountError('rate_limited', 'Gemini 구독 한도 소진');
      return [`C:/gemini/${promptNumber(p)}.jpg`];
    }, 10);
    expect((await run(items(5), h, { allowPartial: true })).map((i) => i.heading)).toEqual(['소제목 2']);
  });

  it('한 장만 시간 초과로 실패하면 다음 장은 계속 시작한다 (계정 전체 문제가 아니다)', async () => {
    const h = makeRuntime(async (p, call) => {
      if (call === 0) throw accountError('timeout', 'Gemini 응답 시간 초과');
      return [`C:/gemini/${promptNumber(p)}.jpg`];
    }, 10);
    const images = await run(items(4), h, { allowPartial: true });
    expect(h.runtime.runSession).toHaveBeenCalledTimes(4);
    expect(images).toHaveLength(3);
  });

  it('준비 확인에 실패하면 세션을 시작하지 않는다', async () => {
    const h = makeRuntime();
    (h.runtime.assertReady as ReturnType<typeof vi.fn>).mockRejectedValueOnce(accountError('not_installed', '[연결하기]'));
    await expect(run(items(2), h)).rejects.toThrow('[연결하기]');
    expect(h.runtime.runSession).not.toHaveBeenCalled();
  });
});

describe('중지', () => {
  it('시작 전에 중지 요청이 있거나 항목이 없으면 아무것도 하지 않고 빈 목록을 돌려준다', async () => {
    const h = makeRuntime();
    expect(await run(items(2), h, {}, () => true)).toEqual([]);
    expect(await run([], h)).toEqual([]);
    expect(h.runtime.assertReady).not.toHaveBeenCalled();
    expect(h.runtime.runSession).not.toHaveBeenCalled();
  });

  it('실행 중 중지 요청이 오면 돌고 있는 세션 전부에 취소 신호를 보내고 새 세션은 띄우지 않는다', async () => {
    let stop = false;
    const signals: AbortSignal[] = [];
    const runtime: GeminiCliImageRuntime = {
      assertReady: async () => undefined,
      runSession: (_prompt, options) => new Promise((_resolve, reject) => {
        signals.push(options.signal as AbortSignal);
        options.signal?.addEventListener('abort', () => reject(new AgentCliError('aborted', 'gemini', '작업이 취소되었습니다.')));
        setTimeout(() => { stop = true; }, 10);
      }),
      save: async () => { throw new Error('not reached'); },
      log: () => undefined,
    };
    const images = await generateWithGeminiCliImage(items(6), '글 제목', undefined, () => stop, undefined, { pollMs: 5 }, runtime);
    expect(images).toEqual([]);
    expect(signals).toHaveLength(2);
    expect(signals.every((s) => s.aborted)).toBe(true);
  });

  it('중지 전에 끝난 이미지는 돌려주고, 돌던 세션은 취소되며 중지 로그를 남긴다', async () => {
    let stop = false;
    const log = vi.fn();
    const runtime: GeminiCliImageRuntime = {
      assertReady: async () => undefined,
      runSession: (prompt, options) => new Promise((resolve, reject) => {
        if (promptNumber(prompt) === '1') { resolve({ conversationId: 'conv-1', files: ['C:/gemini/1.jpg'] }); return; }
        options.signal?.addEventListener('abort', () => reject(new AgentCliError('aborted', 'gemini', '작업이 취소되었습니다.')));
      }),
      save: async (filePath, source) => ({ heading: source.heading, filePath, previewDataUrl: 'data:image/jpeg;base64,AA', provider: PROVIDER }),
      log,
    };
    const images = await generateWithGeminiCliImage(items(2), '글 제목', undefined, () => stop, (img) => { if (img.heading === '소제목 1') stop = true; }, { pollMs: 5 }, runtime);
    expect(images.map((i) => i.heading)).toEqual(['소제목 1']);
    expect(log.mock.calls.map((c) => String(c[0])).join('\n')).toContain('중지 요청');
  });
});
