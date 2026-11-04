import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentCliError } from '../agentCli/types.js';
import type { GeneratedImage, ImageRequestItem } from '../image/types.js';
import {
  CODEX_IMAGE_CONCURRENCY, generateWithCodexImage, type CodexImageRuntime,
} from '../image/codex/codexImageGenerator.js';

const item = (n: number, extra: Partial<ImageRequestItem> = {}): ImageRequestItem => ({
  heading: `소제목 ${n}`, prompt: `exact english prompt ${n}`, ...extra,
});
const items = (count: number): ImageRequestItem[] => Array.from({ length: count }, (_, i) => item(i + 1, i === 0 ? { isThumbnail: true } : {}));
// The file a session returns is named after the prompt it was given, so a wrong mapping shows up as a wrong path.
const promptNumber = (prompt: string): string => /exact english prompt (\d+)/.exec(prompt)?.[1] ?? '?';
const SQUARE = '\nASPECT RATIO: square 1:1 (1024x1024). Keep the main subject and all text inside the central square. Compose for this frame; keep every subject and all text inside it.';

interface Harness {
  runtime: CodexImageRuntime;
  sessions: string[][];
  log: ReturnType<typeof vi.fn>;
  maxRunning: () => number;
  maxSaving: () => number;
}

function makeRuntime(
  handler: (prompts: string[], call: number) => Promise<string[]> = async (p) => p.map((x) => `C:/codex/${promptNumber(x)}.png`),
  delayMs = 5,
): Harness {
  const sessions: string[][] = [];
  let running = 0;
  let maxRunning = 0;
  let saving = 0;
  let maxSaving = 0;
  const log = vi.fn();
  const runtime: CodexImageRuntime = {
    assertReady: vi.fn(async () => undefined),
    runSession: vi.fn(async (prompts: string[]) => {
      const call = sessions.push(prompts) - 1;
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      try {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return { threadId: `thread-${call}`, files: await handler(prompts, call) };
      } finally {
        running -= 1;
      }
    }),
    save: vi.fn(async (filePath: string, source: ImageRequestItem): Promise<GeneratedImage> => {
      saving += 1;
      maxSaving = Math.max(maxSaving, saving);
      try {
        await new Promise((resolve) => setTimeout(resolve, 2));
        return { heading: source.heading, filePath, previewDataUrl: 'data:image/png;base64,AA', provider: 'codex-image' };
      } finally {
        saving -= 1;
      }
    }),
    log,
  };
  return { runtime, sessions, log, maxRunning: () => maxRunning, maxSaving: () => maxSaving };
}
const logText = (h: Harness): string => h.log.mock.calls.map((c) => String(c[0])).join('\n');
const run = (list: ImageRequestItem[], h: Harness, options = {}, stop?: () => boolean, onImage?: (img: GeneratedImage, i: number, total: number) => void) =>
  generateWithCodexImage(list, '글 제목', 'post-1', stop, onImage, options, h.runtime);

afterEach(() => { vi.useRealTimers(); });

describe('동시 실행 한도', () => {
  it('동시에 돌리는 세션 수는 4개(한 상수)다', () => {
    expect(CODEX_IMAGE_CONCURRENCY).toBe(4);
  });
});

describe('generateWithCodexImage — 한 세션에 한 장, 한도 안에서 동시에', () => {
  it('앱이 만든 프롬프트를 장마다 한 세션씩 그대로 넘기고(비율 줄만 덧붙임) 결과를 항목 순서에 맞춘다', async () => {
    const h = makeRuntime();
    const seen: Array<[string, number, number]> = [];
    const images = await run(items(3), h, {}, undefined, (img, i, total) => seen.push([img.heading, i, total]));
    // 2026-11-04: the square line also asks for the central square (the saved file is centre-cropped — codexImageFrame.test.ts).
    expect(h.sessions.map((s) => s.length)).toEqual([1, 1, 1]);
    expect(h.sessions.flat().sort()).toEqual([1, 2, 3].map((n) => `exact english prompt ${n}${SQUARE}`));
    expect(images.map((i) => i.heading)).toEqual(['소제목 1', '소제목 2', '소제목 3']);
    expect(images.map((i) => i.filePath)).toEqual(['C:/codex/1.png', 'C:/codex/2.png', 'C:/codex/3.png']);
    expect(images.every((i) => i.provider === 'codex-image')).toBe(true);
    expect([...seen].sort((a, b) => a[1] - b[1])).toEqual([['소제목 1', 0, 3], ['소제목 2', 1, 3], ['소제목 3', 2, 3]]);
    expect(logText(h)).toContain('🎨 Codex 구독 이미지 3장 생성 중 (gpt-6-luna)');
  });

  it('10장이어도 동시에 4개를 넘기지 않고, 4개까지는 실제로 겹쳐 돈다', async () => {
    const h = makeRuntime(undefined, 15);
    const images = await run(items(10), h);
    expect(h.sessions).toHaveLength(10);
    expect(h.maxRunning()).toBe(4);
    expect(images.map((i) => i.heading)).toEqual(items(10).map((i) => i.heading));
  });

  it('3장이면 3개만 동시에 돌린다 (장 수보다 많이 띄우지 않는다)', async () => {
    const h = makeRuntime(undefined, 15);
    await run(items(3), h);
    expect(h.maxRunning()).toBe(3);
  });

  it('끝나는 순서가 뒤섞여도 각 세션의 파일은 그 세션의 항목에만 붙고 결과는 항목 순서다', async () => {
    // Item 1 is the slowest, item 4 the fastest: completion order is the reverse of item order.
    const delays = new Map([['1', 40], ['2', 30], ['3', 20], ['4', 5]]);
    const h = makeRuntime(async (prompts) => {
      const n = promptNumber(prompts[0]);
      await new Promise((resolve) => setTimeout(resolve, delays.get(n) ?? 1));
      return [`C:/codex/${n}.png`];
    }, 1);
    const finished: string[] = [];
    const images = await run(items(4), h, {}, undefined, (img) => finished.push(img.heading));
    expect(finished).toEqual(['소제목 4', '소제목 3', '소제목 2', '소제목 1']);
    expect(images.map((i) => [i.heading, i.filePath])).toEqual([
      ['소제목 1', 'C:/codex/1.png'], ['소제목 2', 'C:/codex/2.png'],
      ['소제목 3', 'C:/codex/3.png'], ['소제목 4', 'C:/codex/4.png'],
    ]);
  });

  it('저장 단계는 항목의 그 이미지와 글 제목·글 ID 로 부른다 (비율에 맞춰 자르는 단계는 그대로)', async () => {
    const h = makeRuntime();
    const list = [item(1), item(2, { imageRatio: '16:9' } as Partial<ImageRequestItem>)];
    await run(list, h);
    const saveCalls = (h.runtime.save as ReturnType<typeof vi.fn>).mock.calls;
    expect(saveCalls).toHaveLength(2);
    expect(saveCalls.map((c) => [c[0], c[1], c[2], c[3]]).sort((a, b) => String(a[0]).localeCompare(String(b[0])))).toEqual([
      ['C:/codex/1.png', list[0], '글 제목', 'post-1'],
      ['C:/codex/2.png', list[1], '글 제목', 'post-1'],
    ]);
  });

  it('저장은 한 번에 하나씩 한다 (로컬 파일 이름이 소제목+밀리초라 동시에 쓰면 겹칠 수 있다)', async () => {
    const h = makeRuntime(undefined, 5);
    await run(items(8), h);
    expect(h.maxSaving()).toBe(1);
  });

  it('항목의 비율(썸네일·소제목 설정)을 프롬프트 끝 한 줄로 넘긴다 — 이미지 도구에 크기 인자가 없다', async () => {
    const h = makeRuntime();
    const ratioItems = [
      item(1, { isThumbnail: true, imageRatio: '1:1' } as Partial<ImageRequestItem>),
      item(2, { imageRatio: '16:9' } as Partial<ImageRequestItem>),
      item(3, { imageRatio: 'weird' } as Partial<ImageRequestItem>),
    ];
    await run(ratioItems, h);
    const byNumber = (n: number) => h.sessions.flat().find((p) => promptNumber(p) === String(n)) as string;
    expect(byNumber(1)).toMatch(/^exact english prompt 1\nASPECT RATIO: square 1:1 \(1024x1024\)\./);
    expect(byNumber(2)).toMatch(/^exact english prompt 2\nASPECT RATIO: wide landscape 16:9\./);
    expect(byNumber(3)).toContain('ASPECT RATIO: square 1:1 (1024x1024).');
  });

  it('썸네일은 엔진이 한글 문구를 직접 그리므로 앱 오버레이를 끈다', async () => {
    const images = await run(items(2), makeRuntime());
    expect(images[0].isThumbnail).toBe(true);
    expect(images[0].disableTextOverlay).toBe(true);
    expect(images[1].disableTextOverlay).toBeUndefined();
  });

  it('originalIndex 를 이미지에 실어 보낸다', async () => {
    const list = [item(1, { originalIndex: 7 } as Partial<ImageRequestItem>), item(2)];
    const images = await run(list, makeRuntime());
    expect(images[0]).toMatchObject({ originalIndex: 7 });
    expect(images[1].originalIndex).toBeUndefined();
  });
});

describe('로그 — 장마다 한 줄과 요약 한 줄', () => {
  it('끝난 장마다 초를 적고, 마지막에 "N장 동시 M개 · 총 S초" 를 남긴다', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-04T10:00:00Z'));
    const h = makeRuntime(async (prompts) => {
      vi.setSystemTime(Date.now() + 37_000);
      return prompts.map((p) => `C:/codex/${promptNumber(p)}.png`);
    });
    await run([item(1)], h);
    const text = logText(h);
    expect(text).toMatch(/Codex 구독 이미지 1\/1.*소제목 1.*37초/);
    expect(text).toContain('Codex 구독 이미지: 1장 동시 1개 · 총 37초');
  });

  it('8장은 "8장 동시 4개" 로 요약하고 장마다 한 줄씩 남긴다', async () => {
    const h = makeRuntime();
    await run(items(8), h);
    const lines = h.log.mock.calls.map((c) => String(c[0]));
    expect(lines.filter((l) => /^✅ Codex 구독 이미지 \d+\/8/.test(l))).toHaveLength(8);
    expect(lines.filter((l) => /^Codex 구독 이미지: 8장 동시 4개 · 총 \d+초$/.test(l))).toHaveLength(1);
  });
});

describe('실패 처리 — 다른 엔진으로 채우지 않는다', () => {
  it('파일이 안 온 칸은 명시 실패로 두고 "N번 이미지를 받지 못함"을 기록한다', async () => {
    const h = makeRuntime(async (p) => (promptNumber(p[0]) === '3' ? [] : [`C:/codex/${promptNumber(p[0])}.png`]));
    await expect(run(items(3), h)).rejects.toThrow(/3번 이미지를 받지 못함/);
    expect(logText(h)).toContain('3번 이미지를 받지 못함');
    expect(h.runtime.runSession).toHaveBeenCalledTimes(3); // no retry, no other engine
  });

  it('부분 결과 허용(allowPartial)이면 받은 칸만 돌려주고 못 받은 칸은 로그에 남긴다', async () => {
    const h = makeRuntime(async (p) => (promptNumber(p[0]) === '3' ? [] : [`C:/codex/${promptNumber(p[0])}.png`]));
    const images = await run(items(3), h, { allowPartial: true });
    expect(images.map((i) => i.heading)).toEqual(['소제목 1', '소제목 2']);
    expect(logText(h)).toContain('3번 이미지를 받지 못함');
  });

  it('0장이면 allowPartial 이어도 실패한다', async () => {
    const h = makeRuntime(async () => []);
    await expect(run(items(2), h, { allowPartial: true })).rejects.toThrow(/1번 이미지를 받지 못함/);
  });

  it('한 세션이 두 장 이상 만들어 와도 그 세션의 첫 장만 쓰고 알린다', async () => {
    const h = makeRuntime(async (p) => [`C:/codex/${promptNumber(p[0])}.png`, `C:/codex/${promptNumber(p[0])}-extra.png`]);
    const images = await run(items(2), h);
    expect(images.map((i) => i.filePath)).toEqual(['C:/codex/1.png', 'C:/codex/2.png']);
    expect(logText(h)).toContain('2장이 만들어져 첫 장만 씁니다');
  });

  it('저장에 실패한 칸만 실패로 두고 이유를 남긴다', async () => {
    const h = makeRuntime();
    (h.runtime.save as ReturnType<typeof vi.fn>).mockImplementation(async (filePath: string, source: ImageRequestItem) => {
      if (source.heading === '소제목 2') throw new Error('디스크 가득 참');
      return { heading: source.heading, filePath, previewDataUrl: 'data:image/png;base64,AA', provider: 'codex-image' };
    });
    const images = await run(items(3), h, { allowPartial: true });
    expect(images.map((i) => i.heading)).toEqual(['소제목 1', '소제목 3']);
    expect(logText(h)).toMatch(/2번 이미지를 받지 못함 \(디스크 가득 참\)/);
  });

  it('한도·연결·구독 오류가 나면 새 세션을 더 띄우지 않고, 남은 칸은 그 이유로 실패한다', async () => {
    const limit = '11월 4일 15시 42분 이후 다시 시도';
    // Call 0 fails at once; 1..3 are already running and finish normally; items 5..8 must never start.
    const h = makeRuntime(async (p, call) => {
      if (call === 0) throw new AgentCliError('rate_limited', 'codex', `Codex 구독 한도 소진 — ${limit}`);
      return [`C:/codex/${promptNumber(p[0])}.png`];
    }, 10);
    await expect(run(items(8), h)).rejects.toThrow(new RegExp(`${limit}[\\s\\S]*5번 이미지를 받지 못함[\\s\\S]*8번 이미지를 받지 못함`));
    expect(h.runtime.runSession).toHaveBeenCalledTimes(4);
    const log = logText(h);
    expect(log).toMatch(/5번 이미지를 받지 못함 \(Codex 구독 한도 소진/);
    expect(log).toMatch(/8번 이미지를 받지 못함 \(Codex 구독 한도 소진/);
  });

  it('한도에 걸리기 전에 받은 이미지는 allowPartial 에서 그대로 돌려준다 (항목 순서)', async () => {
    const h = makeRuntime(async (p, call) => {
      if (call === 0) throw new AgentCliError('rate_limited', 'codex', 'Codex 구독 한도 소진');
      return [`C:/codex/${promptNumber(p[0])}.png`];
    }, 10);
    const images = await run(items(8), h, { allowPartial: true });
    expect(images.map((i) => i.heading)).toEqual(['소제목 2', '소제목 3', '소제목 4']);
    expect(h.runtime.runSession).toHaveBeenCalledTimes(4);
  });

  it.each(['not_logged_in', 'not_installed', 'subscription_inactive'] as const)('%s 도 새 세션을 멈춘다', async (code) => {
    const h = makeRuntime(async (_p, call) => {
      if (call === 0) throw new AgentCliError(code, 'codex', `Codex 연결 문제 (${code})`);
      return ['C:/codex/x.png'];
    }, 10);
    await expect(run(items(6), h)).rejects.toThrow(new RegExp(`${code}[\\s\\S]*5번 이미지를 받지 못함`));
    expect(h.runtime.runSession).toHaveBeenCalledTimes(4);
  });

  it('한 장만 시간 초과로 실패하면 다음 장은 계속 시작한다 (계정 전체 문제가 아니다)', async () => {
    const h = makeRuntime(async (p, call) => {
      if (call === 0) throw new AgentCliError('timeout', 'codex', 'Codex 응답 시간 초과');
      return [`C:/codex/${promptNumber(p[0])}.png`];
    }, 10);
    const images = await run(items(6), h, { allowPartial: true });
    expect(h.runtime.runSession).toHaveBeenCalledTimes(6);
    expect(images).toHaveLength(5);
  });

  it('준비 확인에 실패하면 세션을 시작하지 않는다', async () => {
    const h = makeRuntime();
    (h.runtime.assertReady as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new AgentCliError('not_installed', 'codex', 'Codex 구독 이미지는 Codex 연결이 필요합니다 — 설정에서 [연결하기]'),
    );
    await expect(run(items(2), h)).rejects.toThrow('[연결하기]');
    expect(h.runtime.runSession).not.toHaveBeenCalled();
  });
});

describe('중지', () => {
  it('시작 전에 중지 요청이 있으면 아무것도 하지 않고 빈 목록을 돌려준다', async () => {
    const h = makeRuntime();
    expect(await run(items(2), h, {}, () => true)).toEqual([]);
    expect(h.runtime.runSession).not.toHaveBeenCalled();
  });

  it('실행 중 중지 요청이 오면 돌고 있는 세션 전부에 취소 신호를 보내고 새 세션은 띄우지 않는다', async () => {
    let stop = false;
    const signals: AbortSignal[] = [];
    const runtime: CodexImageRuntime = {
      assertReady: async () => undefined,
      runSession: (_prompts, options) => new Promise((_resolve, reject) => {
        signals.push(options.signal as AbortSignal);
        options.signal?.addEventListener('abort', () => reject(new AgentCliError('aborted', 'codex', '작업이 취소되었습니다.')));
        setTimeout(() => { stop = true; }, 10);
      }),
      save: async () => { throw new Error('not reached'); },
      log: () => undefined,
    };
    const images = await generateWithCodexImage(items(9), '글 제목', undefined, () => stop, undefined, { pollMs: 5 }, runtime);
    expect(images).toEqual([]);
    expect(signals).toHaveLength(4); // never more than the limit, nothing launched after the stop
    expect(signals.every((s) => s.aborted)).toBe(true);
  });

  it('중지 전에 끝난 이미지는 돌려주고, 돌던 세션은 취소된다', async () => {
    let stop = false;
    const log = vi.fn();
    const runtime: CodexImageRuntime = {
      assertReady: async () => undefined,
      runSession: (prompts, options) => new Promise((resolve, reject) => {
        if (promptNumber(prompts[0]) === '1') { resolve({ threadId: 'thread-1', files: ['C:/codex/1.png'] }); return; }
        options.signal?.addEventListener('abort', () => reject(new AgentCliError('aborted', 'codex', '작업이 취소되었습니다.')));
      }),
      save: async (filePath, source) => ({ heading: source.heading, filePath, previewDataUrl: 'data:image/png;base64,AA', provider: 'codex-image' }),
      log,
    };
    const images = await generateWithCodexImage(items(2), '글 제목', undefined, () => stop, (img) => { if (img.heading === '소제목 1') stop = true; }, { pollMs: 5 }, runtime);
    expect(images.map((i) => i.heading)).toEqual(['소제목 1']);
    expect(log.mock.calls.map((c) => String(c[0])).join('\n')).toContain('중지 요청');
  });

  it('항목이 없으면 세션을 시작하지 않고 빈 목록을 돌려준다', async () => {
    const h = makeRuntime();
    expect(await run([], h)).toEqual([]);
    expect(h.runtime.assertReady).not.toHaveBeenCalled();
  });
});
