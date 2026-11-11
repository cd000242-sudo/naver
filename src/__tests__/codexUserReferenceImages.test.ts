// Codex subscription image: the user's own reference photos (max 3, each marked person or product).
// Product x1 must stay byte-identical to the shopping path; everything else is new behaviour.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import {
  buildCodexImageInstruction, withCodexAspectRatio, withCodexProductReference, withCodexReferenceRoles,
} from '../image/codex/codexImageInstruction.js';
import { runCodexImageSession, type CodexImageSessionDeps } from '../image/codex/codexImageSession.js';
import { isCodexReferenceCopy, prepareCodexReferenceImages, type CodexReferenceImage } from '../image/codex/codexReferenceImage.js';
import { generateWithCodexImage, type CodexImageRuntime } from '../image/codex/codexImageGenerator.js';
import { parseUserReferenceImages } from '../image/codex/codexUserReferences.js';
import type { GenerateImagesOptions, GeneratedImage, ImageRequestItem } from '../image/types.js';
import type { SpawnArgs, SpawnResult } from '../agentCli/spawnHelper.js';

const PRODUCT_LINE = 'PRODUCT REFERENCE: referenced image 1 is the real product. Draw this exact product — same shape, proportions, colours, materials, logo, label text and packaging; do not redesign, recolour, mirror, re-letter or replace it. Build a new scene for this section; do not reuse the reference photo\'s background or framing.';
const PERSON_LINE = 'PERSON REFERENCE: referenced image 1 is the real person. Draw this exact same person — same face, hairstyle and body build; do not change their identity or age. Build a new scene that fits this section; do not reuse the reference photo\'s background, pose or framing.';
const SQUARE = '\nASPECT RATIO: square 1:1 (1024x1024). Keep the main subject and all text inside the central square. Compose for this frame; keep every subject and all text inside it.';
const P = (n: number): string => `C:/Temp/agentcli-codex-image-x/reference-0${n}.png`;
const png = (shade: number): Promise<Buffer> => sharp({ create: { width: 64, height: 48, channels: 3, background: { r: shade, g: 80, b: 120 } } }).png().toBuffer();

describe('withCodexReferenceRoles', () => {
  it('제품 1장 문구는 지금 쇼핑 문구와 한 글자도 다르지 않다', () => {
    expect(withCodexReferenceRoles('  scene  ', ['product'])).toBe(`scene\n${PRODUCT_LINE}`);
    expect(withCodexReferenceRoles('scene', ['product'])).toBe(withCodexProductReference('scene'));
  });
  it('인물 1장은 같은 사람(얼굴·머리 모양·체형)으로 새 장면을 그리라고 한다', () => {
    expect(withCodexReferenceRoles('scene', ['person'])).toBe(`scene\n${PERSON_LINE}`);
  });
  it('인물+제품은 번호별 역할을 적고 상황·각도·구도를 다르게 하라고 한다 (비율 줄은 맨 끝)', () => {
    const text = withCodexAspectRatio(withCodexReferenceRoles('scene', ['person', 'product']), '1:1');
    expect(text).toContain('referenced image 1 is the real person');
    expect(text).toContain('referenced image 2 is the real product');
    expect(text).toContain('situation, camera angle and composition');
    expect(text.endsWith(SQUARE)).toBe(true);
  });
  it('3장까지 되고 4장·모르는 역할·빈 목록은 거부한다', () => {
    expect(withCodexReferenceRoles('s', ['person', 'product', 'product'])).toContain('referenced image 3 is the real product');
    expect(() => withCodexReferenceRoles('s', ['person', 'person', 'person', 'person'])).toThrow(/최대 3장/);
    expect(() => withCodexReferenceRoles('s', ['animal' as never])).toThrow(/역할/);
    expect(() => withCodexReferenceRoles('s', [])).toThrow(/참고 사진/);
  });
});

describe('buildCodexImageInstruction — 참고 경로 배열', () => {
  it('경로 1개짜리 배열은 문자열 경로와 완전히 같다 (지금 지시문 불변)', () => {
    expect(buildCodexImageInstruction(['p'], [P(1)])).toBe(buildCodexImageInstruction(['p'], P(1)));
  });
  it('빈 배열은 참고 없는 지금 지시문과 같다', () => {
    expect(buildCodexImageInstruction(['p'], [])).toBe(buildCodexImageInstruction(['p']));
  });
  it('여러 장이면 referenced_image_paths 에 순서대로 넘기고 파일 이름을 모두 밝힌다', () => {
    const text = buildCodexImageInstruction(['scene'], [P(1), P(2), P(3)]);
    expect(text).toContain(`referenced_image_paths 인자에는 ["${P(1)}", "${P(2)}", "${P(3)}"]`);
    expect(text).toContain('reference-01.png, reference-02.png, reference-03.png');
    expect(text).toContain('한 번만');
    expect(text).toContain('1장만');
    expect(text.endsWith('프롬프트: "scene"')).toBe(true);
  });
  it('4장·여러 프롬프트+참고·빈 경로는 거부한다', () => {
    expect(() => buildCodexImageInstruction(['p'], [P(1), P(2), P(3), P(1)])).toThrow(/최대 3장/);
    expect(() => buildCodexImageInstruction(['a', 'b'], [P(1), P(2)])).toThrow(/참고 사진/);
    expect(() => buildCodexImageInstruction(['p'], [P(1), ''])).toThrow(/참고 사진/);
  });
});

describe('runCodexImageSession — referenceImages', () => {
  const homes: string[] = [];
  afterEach(async () => { await Promise.all(homes.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });
  interface Seen { cwd?: string; stdin?: string; files: Record<string, Buffer> }

  async function setup() {
    const home = await mkdtemp(join(tmpdir(), 'codex-userref-test-'));
    homes.push(home);
    const seen: Seen = { files: {} };
    const spawn = vi.fn(async (args: SpawnArgs): Promise<SpawnResult> => {
      seen.cwd = args.cwd; seen.stdin = args.stdin;
      for (const name of (await readdir(String(args.cwd))).filter((n) => n.startsWith('reference-'))) seen.files[name] = await readFile(join(String(args.cwd), name));
      await mkdir(join(home, 'generated_images', '01a1a02d-33ae-7ff2-96ad-237cbeb342e0'), { recursive: true });
      await writeFile(join(home, 'generated_images', '01a1a02d-33ae-7ff2-96ad-237cbeb342e0', 'ig_1.png'), 'png');
      return { code: 0, stdout: `${JSON.stringify({ type: 'thread.started', thread_id: '01a1a02d-33ae-7ff2-96ad-237cbeb342e0' })}\n`, stderr: '' };
    });
    const deps: CodexImageSessionDeps = { spawn, env: () => ({ CODEX_HOME: home, PATH: 'x' }), now: () => Date.now() - 60_000 };
    return { spawn, deps, seen };
  }

  it('2장이면 reference-01.png, reference-02.png 를 쓰고 지시문에 두 슬래시 경로를 순서대로 넣는다. 끝나면 폴더째 지운다', async () => {
    const { deps, seen } = await setup();
    const a = await png(10); const b = await png(200);
    await runCodexImageSession(['scene'], { referenceImages: [{ buffer: a, fileName: 'reference-01.png' }, { buffer: b, fileName: 'reference-02.png' }] }, deps);
    expect(Object.keys(seen.files).sort()).toEqual(['reference-01.png', 'reference-02.png']);
    expect(seen.files['reference-01.png'].equals(a)).toBe(true);
    expect(seen.files['reference-02.png'].equals(b)).toBe(true);
    const dir = String(seen.cwd).replace(/\\/g, '/');
    expect(seen.stdin).toBe(buildCodexImageInstruction(['scene'], [`${dir}/reference-01.png`, `${dir}/reference-02.png`]));
    expect(existsSync(String(seen.cwd))).toBe(false);
  });

  it('1장짜리 referenceImages 는 referenceImage 와 파일 이름·내용·지시문이 완전히 같다', async () => {
    const one = { buffer: await png(50), fileName: 'reference-01.png' };
    const viaList = await setup(); await runCodexImageSession(['p'], { referenceImages: [one] }, viaList.deps);
    const viaOne = await setup(); await runCodexImageSession(['p'], { referenceImage: one }, viaOne.deps);
    expect(Object.keys(viaList.seen.files)).toEqual(['reference-01.png']);
    expect(viaList.seen.files['reference-01.png'].equals(viaOne.seen.files['reference-01.png'])).toBe(true);
    const norm = (s: Seen) => String(s.stdin).split(String(s.cwd).replace(/\\/g, '/')).join('<cwd>');
    expect(norm(viaList.seen)).toBe(norm(viaOne.seen));
  });

  it('4장·이름 겹침·경로 섞인 이름·두 방식 동시 지정은 실행 전에 거부한다', async () => {
    const { deps, spawn } = await setup();
    const buffer = await png(1);
    const f = (fileName: string) => ({ buffer, fileName });
    const bad = [
      { referenceImages: [f('reference-01.png'), f('reference-02.png'), f('reference-03.png'), f('reference-04.png')] },
      { referenceImages: [f('reference-01.png'), f('reference-01.png')] },
      { referenceImages: [f('reference-01.png'), f('../x.png')] },
      { referenceImage: f('reference-01.png'), referenceImages: [f('reference-02.png')] },
    ];
    for (const options of bad) await expect(runCodexImageSession(['p'], options, deps)).rejects.toThrow(/참고 사진/);
    expect(spawn).not.toHaveBeenCalled();
  });
});

describe('prepareCodexReferenceImages / isCodexReferenceCopy', () => {
  it('각 장을 PNG·긴 변 1536·EXIF 회전·메타데이터 삭제로 정리하고 reference-0N.png 이름을 준다', async () => {
    const wide = await sharp({ create: { width: 3000, height: 1000, channels: 3, background: '#336699' } }).jpeg().toBuffer();
    const rotated = await sharp({ create: { width: 100, height: 50, channels: 3, background: '#cc3333' } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const [a, b] = await prepareCodexReferenceImages([wide, rotated]);
    expect([a.fileName, b.fileName]).toEqual(['reference-01.png', 'reference-02.png']);
    expect([a.width, a.height]).toEqual([1536, 512]);
    expect([b.width, b.height]).toEqual([50, 100]);
    for (const item of [a, b]) {
      expect(item.buffer.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect((await sharp(item.buffer).metadata()).exif).toBeUndefined();
      expect(item.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });
  it('한 장이라도 못 읽으면 사용자 참고 사진 전용 코드·번호로 멈춘다 (쇼핑 코드와 다름)', async () => {
    const ok = await png(9);
    for (const bad of [Buffer.from('not an image'), Buffer.alloc(0), null]) {
      const failure = await prepareCodexReferenceImages([ok, bad]).catch((e: Error) => e.message);
      expect(failure).toMatch(/^USER_REFERENCE_LOAD_FAILED: .*참고 사진 2번/);
      expect(failure).not.toContain('SHOPPING_REFERENCE_LOAD_FAILED');
      expect(failure).toContain('다른 엔진으로 바꾸지 않았습니다');
    }
    await expect(prepareCodexReferenceImages([ok, ok, ok, ok])).rejects.toThrow(/최대 3장/);
  });
  it('결과가 어느 참고 사진과든 바이트가 같으면 복사로 판정한다', async () => {
    const [a, b] = await prepareCodexReferenceImages([await png(20), await png(220)]);
    expect(isCodexReferenceCopy(b.buffer, [a, b])).toBe(true);
    expect(isCodexReferenceCopy(a.buffer, [a, b])).toBe(true);
    expect(isCodexReferenceCopy(await png(111), [a, b])).toBe(false);
    expect(isCodexReferenceCopy(a.buffer, a)).toBe(true); // the single-object form still works
    expect(isCodexReferenceCopy(Buffer.alloc(0), [a, b])).toBe(false);
  });
});

describe('generateWithCodexImage — userReferences', () => {
  const ref = (n: number, shade: string): CodexReferenceImage => ({ buffer: Buffer.from(`img${shade}`), fileName: `reference-0${n}.png`, sha256: shade.repeat(64).slice(0, 64), width: 8, height: 8 });
  const A = ref(1, 'a'); const B = ref(2, 'b');
  const items = (n: number): ImageRequestItem[] => Array.from({ length: n }, (_, i) => ({ heading: `소제목 ${i + 1}`, prompt: `exact english prompt ${i + 1}` }));
  function makeRuntime(isCopy: (file: string) => boolean = () => false) {
    const sessions: Array<{ prompts: string[]; options: Record<string, unknown> }> = [];
    const log = vi.fn();
    const runtime: CodexImageRuntime = {
      assertReady: vi.fn(async () => undefined),
      runSession: vi.fn(async (prompts, options) => {
        const call = sessions.push({ prompts, options: options as Record<string, unknown> }) - 1;
        return { threadId: `t${call}`, files: [`C:/codex/${/prompt (\d+)/.exec(prompts[0])?.[1]}.png`] };
      }),
      save: vi.fn(async (filePath: string, item: ImageRequestItem): Promise<GeneratedImage> => ({ heading: item.heading, filePath, previewDataUrl: 'data:image/png;base64,AA', provider: 'codex-image' })),
      log,
      isReferenceCopy: vi.fn(async (file: string) => isCopy(file)),
    };
    return { runtime, sessions, log };
  }
  const run = (h: ReturnType<typeof makeRuntime>, n: number, options: Parameters<typeof generateWithCodexImage>[5]) => generateWithCodexImage(items(n), '글', 'p', undefined, undefined, options, h.runtime);

  it('모든 세션에 같은 참고 사진 목록(번호 순서)이 붙고 프롬프트에 역할 줄이 들어간다', async () => {
    const h = makeRuntime();
    await run(h, 2, { userReferences: [{ image: A, role: 'person' }, { image: B, role: 'product' }] });
    for (const { options, prompts } of h.sessions) {
      expect(options.referenceImages).toEqual([{ buffer: A.buffer, fileName: 'reference-01.png' }, { buffer: B.buffer, fileName: 'reference-02.png' }]);
      expect('referenceImage' in options).toBe(false);
      expect(prompts[0]).toContain('referenced image 1 is the real person');
      expect(prompts[0]).toContain('referenced image 2 is the real product');
      expect(prompts[0].endsWith(SQUARE)).toBe(true);
    }
    expect(h.log.mock.calls.map((c) => String(c[0])).join('\n')).toContain('참고 사진 2장');
  });
  it('제품 1장 사용자 참고는 쇼핑 경로와 프롬프트가 바이트까지 같다', async () => {
    const h = makeRuntime();
    await run(h, 1, { userReferences: [{ image: A, role: 'product' }] });
    expect(h.sessions[0].prompts[0]).toBe(`exact english prompt 1\n${PRODUCT_LINE}${SQUARE}`);
    expect(h.sessions[0].options.referenceImages).toEqual([{ buffer: A.buffer, fileName: 'reference-01.png' }]);
  });
  it('복사 검사는 모든 참고 사진을 함께 받고, 어느 것의 복사본이든 그 칸만 실패한다', async () => {
    const h = makeRuntime((file) => file.endsWith('/2.png'));
    await expect(run(h, 3, { userReferences: [{ image: A, role: 'person' }, { image: B, role: 'product' }] })).rejects.toThrow(/2번 이미지를 받지 못함/);
    expect(h.runtime.isReferenceCopy).toHaveBeenCalledWith('C:/codex/2.png', [A, B]);
  });
  it('쇼핑 대표 사진(referenceImage)과 사용자 참고 사진을 함께 주면 세션을 시작하기 전에 거부한다', async () => {
    const h = makeRuntime();
    await expect(run(h, 1, { referenceImage: A, userReferences: [{ image: B, role: 'person' }] })).rejects.toThrow(/참고 사진/);
    expect(h.runtime.runSession).not.toHaveBeenCalled();
  });
});

describe('parseUserReferenceImages', () => {
  it('없음·null·빈 배열은 빈 목록, 올바른 값은 새 배열로 돌려주고 입력은 그대로 둔다', () => {
    expect(parseUserReferenceImages(undefined)).toEqual([]);
    expect(parseUserReferenceImages(null)).toEqual([]);
    const input = [{ path: ' C:/m/a.png ', role: 'person' }, { path: 'C:/m/b.png', role: 'product', extra: 1 }];
    const before = JSON.stringify(input);
    const out = parseUserReferenceImages(input);
    expect(out).toEqual([{ path: 'C:/m/a.png', role: 'person' }, { path: 'C:/m/b.png', role: 'product' }]);
    expect(out).not.toBe(input);
    expect(JSON.stringify(input)).toBe(before);
  });
  it('4장 이상·모르는 역할·빈 경로·URL·배열이 아닌 값은 USER_REFERENCE_INVALID 로 거부한다', () => {
    const ok = { path: 'C:/m/a.png', role: 'person' };
    for (const bad of [[ok, ok, ok, ok], [{ path: 'C:/m/a.png', role: 'animal' }], [{ path: '  ', role: 'person' }],
      [{ path: 'https://x.test/a.png', role: 'person' }], [{ path: 'data:image/png;base64,AA', role: 'product' }], 'C:/m/a.png', [null]]) {
      expect(() => parseUserReferenceImages(bad)).toThrow(/^USER_REFERENCE_INVALID/);
    }
  });
});

describe('generateImages — Codex 사용자 참고 사진 적용 조건', () => {
  afterEach(() => { vi.doUnmock('../image/codex/codexImageGenerator.js'); vi.doUnmock('../image/referenceImageLoader.js'); });
  const generatedFor = (items: Array<{ heading: string }>) => items.map((i) => ({ heading: i.heading, filePath: `C:/img/${i.heading}.png`, previewDataUrl: 'data:image/png;base64,AA', provider: 'codex-image' }));
  const options = (extra: Record<string, unknown>) => ({
    provider: 'codex-image', postTitle: '글 제목', stopCheck: () => false,
    items: [{ heading: '대표 썸네일', prompt: '썸네일', englishPrompt: 'thumbnail', isThumbnail: true }, { heading: '첫째', prompt: '첫째', englishPrompt: 'first' }, { heading: '둘째', prompt: '둘째', englishPrompt: 'second' }],
    ...extra,
  }) as unknown as GenerateImagesOptions;
  async function setup(loader?: (candidate: unknown) => Promise<unknown>) {
    vi.resetModules();
    const spy = vi.fn(async (items: Array<{ heading: string }>) => generatedFor(items));
    vi.doMock('../image/codex/codexImageGenerator.js', () => ({ generateWithCodexImage: spy }));
    const load = vi.fn(loader ?? (async () => null));
    if (loader) {
      vi.doMock('../image/referenceImageLoader.js', async (orig) => ({ ...(await orig<typeof import('../image/referenceImageLoader.js')>()), loadReferenceImageData: load }));
    }
    const { generateImages } = await import('../imageGenerator.js');
    const codexOptions = () => (spy.mock.calls[0] as unknown[])[5] as Record<string, unknown>;
    return { spy, load, generateImages, codexOptions };
  }
  const byPath = async (c: unknown) => ({ buffer: await png(String(c).includes('person') ? 30 : 190), mimeType: 'image/png', source: String(c) });
  const refs = [{ path: 'C:/managed/person.png', role: 'person' }, { path: 'C:/managed/product.png', role: 'product' }];

  it('① 쇼핑이 아닌 글: 사용자 사진 2장이 앱 관리 폴더 검사(허용 루트)를 거쳐 역할과 함께 넘어간다', async () => {
    const h = await setup(byPath);
    await h.generateImages(options({ userReferenceImages: refs }));
    const sent = h.codexOptions().userReferences as Array<{ image: CodexReferenceImage; role: string }>;
    expect(sent.map((e) => [e.role, e.image.fileName])).toEqual([['person', 'reference-01.png'], ['product', 'reference-02.png']]);
    expect('referenceImage' in h.codexOptions()).toBe(false);
    expect(h.load).toHaveBeenCalledWith('C:/managed/person.png', { allowedLocalRoots: expect.arrayContaining([expect.stringContaining('naver-blog-images')]) });
  });
  it('① 쇼핑 글이어도 사용자 사진이 있으면 그것만 쓴다 (수집 대표 사진과 섞지 않음)', async () => {
    const h = await setup(byPath);
    const collected = `data:image/png;base64,${(await png(99)).toString('base64')}`;
    await h.generateImages(options({ isShoppingConnect: true, collectedImages: [collected], userReferenceImages: [refs[0]] }));
    expect((h.codexOptions().userReferences as unknown[]).length).toBe(1);
    expect('referenceImage' in h.codexOptions()).toBe(false);
  });
  it('② 사용자 사진 없는 쇼핑 글은 지금처럼 대표 사진 1장(referenceImage)만 — ③ 쇼핑도 아니면 참조 키가 없다', async () => {
    const shop = await setup();
    const collected = `data:image/png;base64,${(await png(99)).toString('base64')}`;
    await shop.generateImages(options({ isShoppingConnect: true, collectedImages: [collected], userReferenceImages: [] }));
    expect((shop.codexOptions().referenceImage as CodexReferenceImage).fileName).toBe('reference-01.png');
    expect('userReferences' in shop.codexOptions()).toBe(false);
    const plain = await setup();
    await plain.generateImages(options({}));
    expect('referenceImage' in plain.codexOptions() || 'userReferences' in plain.codexOptions()).toBe(false);
  });
  it('앱 관리 폴더 밖 경로는 거부하고 멈춘다 (참고 없이 만들지 않음)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'userref-outside-'));
    try {
      const file = join(dir, 'me.png');
      await writeFile(file, await png(5));
      const h = await setup();
      await expect(h.generateImages(options({ userReferenceImages: [{ path: file, role: 'person' }] }))).rejects.toThrow(/\[Codex 구독 이미지\][\s\S]*USER_REFERENCE_LOAD_FAILED: .*참고 사진 1번/);
      expect(h.spy).not.toHaveBeenCalled();
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
  it('읽지 못하는 사진이 하나라도 있으면 멈춘다 — 4장·역할 오류는 입력 단계에서 거부한다', async () => {
    const broken = await setup(async () => ({ buffer: Buffer.from('not an image'), mimeType: 'image/png', source: 'C:/managed/x.png' }));
    await expect(broken.generateImages(options({ userReferenceImages: refs }))).rejects.toThrow(/USER_REFERENCE_LOAD_FAILED/);
    expect(broken.spy).not.toHaveBeenCalled();
    const h = await setup(byPath);
    await expect(h.generateImages(options({ userReferenceImages: [...refs, ...refs] }))).rejects.toThrow(/USER_REFERENCE_INVALID/);
    await expect(h.generateImages(options({ userReferenceImages: [{ path: 'C:/managed/person.png', role: 'dog' }] }))).rejects.toThrow(/USER_REFERENCE_INVALID/);
    expect(h.spy).not.toHaveBeenCalled();
  });
});
