// [2026-11-11] 참고 사진 마무리 — 여러 장 지시문, 썸네일 누출 차단, 실패 사유 로그, 정책 플래그, 새 글 표식,
// 사본 삭제 경로 검증, 단축 주소 처리, 안내 문구. (화면 동작은 codexReferenceImagesCollapse.test.ts)
import { readFileSync } from 'node:fs';
import { join, parse } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { withCodexProductReference, withCodexReferenceRoles } from '../image/codex/codexImageInstruction.js';
import { generateWithCodexImage, type CodexImageRuntime } from '../image/codex/codexImageGenerator.js';
import { describeReferenceLoadFailure, resolveCodexReferenceInputs } from '../image/codex/codexUserReferences.js';
import { resolveHasReferenceImage, userReferenceRolesOf } from '../image/codex/codexUserReferencePolicy.js';
import { deleteReferenceCopy, type ReferenceCopyDeps } from '../main/ipc/referenceCopyDelete.js';
import {
  EMPTY_CODEX_REFERENCE_STATE,
  codexReferenceContentKey,
  describeCodexReferenceReflection,
  reconcileCodexReferenceOwner,
  removedCodexReferenceCopies,
  setCodexReferenceCopyRemover,
  setCodexReferenceState,
  type CodexReferenceEntry,
} from '../renderer/utils/codexReferenceImageList.js';
import { collectImageTabUrlImages } from '../renderer/utils/shoppingCollectToPool.js';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');
const entry = (id: string, extra: Partial<CodexReferenceEntry> = {}): CodexReferenceEntry => ({ id, path: `C:/m/${id}.png`, role: 'product', name: `${id}.png`, previewSrc: '', ...extra });

describe('여러 장 지시문 (#3)', () => {
  it('같은 역할 여러 장은 한 사람 / 한 제품으로 그린다', () => {
    const people = withCodexReferenceRoles('P', ['person', 'person']);
    expect(people).toContain('referenced image 1 is the real person; referenced image 2 is the real person');
    expect(people).toContain('SAME ONE person');
    const goods = withCodexReferenceRoles('P', ['product', 'product', 'product']);
    expect(goods).toContain('SAME ONE product');
    for (const text of [people, goods]) expect(text).not.toContain('same subjects');
  });
  it('인물 + 제품은 이 사람이 이 제품을 쓰는 장면으로 분명히 쓴다', () => {
    const mixed = withCodexReferenceRoles('P', ['person', 'product']);
    expect(mixed).toContain('referenced image 1 is the real person; referenced image 2 is the real product');
    expect(mixed).toContain('USING this product');
    expect(mixed).not.toContain('same subjects');
  });
  it('1장 문구는 그대로다', () => {
    expect(withCodexReferenceRoles('P', ['product'])).toBe(withCodexProductReference('P'));
    expect(withCodexReferenceRoles('P', ['person'])).toContain('PERSON REFERENCE: referenced image 1 is the real person.');
  });
});

describe('썸네일 항목에는 사용자 참고 사진을 붙이지 않는다 (#4)', () => {
  const image = { buffer: Buffer.from('png'), fileName: 'reference-01.png' } as any;
  it('썸네일 칸은 사진·역할 문구 없이, 소제목 칸은 그대로 붙여 만든다', async () => {
    const prompts: string[] = [];
    const sessions: any[] = [];
    const copyChecks: any[] = [];
    const runtime: CodexImageRuntime = {
      assertReady: async () => undefined,
      runSession: async (p, o) => { prompts.push(p[0]); sessions.push(o); return { files: ['/tmp/out.png'] } as any; },
      save: async (_file, item) => ({ heading: item.heading, filePath: `/x/${item.heading}.png`, provider: 'codex-image' } as any),
      log: () => undefined,
      isReferenceCopy: async (file, ref) => { copyChecks.push([file, ref]); return false; },
    };
    const items: any[] = [{ heading: '썸네일', prompt: 'THUMB', isThumbnail: true }, { heading: '소제목', prompt: 'BODY' }];
    await generateWithCodexImage(items, 't', 'p', undefined, undefined, { userReferences: [{ image, role: 'person' }] }, runtime);
    const thumb = prompts.findIndex((p) => p.startsWith('THUMB'));
    const body = prompts.findIndex((p) => p.startsWith('BODY'));
    expect(thumb).toBeGreaterThanOrEqual(0);
    expect(sessions[thumb].referenceImages).toBeUndefined();
    expect(prompts[thumb]).not.toContain('PERSON REFERENCE');
    expect(sessions[body].referenceImages).toHaveLength(1);
    expect(prompts[body]).toContain('PERSON REFERENCE');
    expect(copyChecks).toHaveLength(1);
  });
});

describe('실패 사유 로그 (#6)', () => {
  afterEach(() => vi.restoreAllMocks());
  it('사유 분류', () => {
    expect(describeReferenceLoadFailure(new Error('ENOENT: no such file or directory'))).toBe('파일 없음');
    expect(describeReferenceLoadFailure(new Error('path is not inside allowed roots'))).toBe('경로 거부');
    expect(describeReferenceLoadFailure(new Error('Input buffer contains unsupported image format'))).toBe('형식 오류');
    expect(describeReferenceLoadFailure(null)).toBe('읽을 수 없음');
  });
  it('불러오지 못한 사진은 사유와 파일 이름만 남기고 경로는 남기지 않으며 번호 안내로 멈춘다', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(resolveCodexReferenceInputs({
      userReferenceImages: [{ path: 'C:\\secret\\folder\\사진.png', role: 'person' }],
      isShoppingConnect: false, hasItems: true, shoppingBuffer: null,
      loadUserReference: async () => { throw new Error('ENOENT: no such file'); },
    })).rejects.toThrow(/USER_REFERENCE_LOAD_FAILED/);
    const logged = warn.mock.calls.flat().join(' ');
    expect(logged).toContain('사진.png');
    expect(logged).toContain('파일 없음');
    expect(logged).not.toContain('secret');
  });
});

describe('쇼핑 글 + 사용자 사진 (#2)', () => {
  it('역할 목록은 느슨하게 읽는다(잘못된 항목은 건너뜀)', () => {
    expect(userReferenceRolesOf([{ path: 'a', role: 'person' }, { path: 'b', role: 'x' }, null])).toEqual(['person']);
    expect(userReferenceRolesOf(undefined)).toEqual([]);
    expect(userReferenceRolesOf('nope')).toEqual([]);
  });
  it('사용자 사진이 없으면 지금과 같고, 있으면 실제 첨부와 맞춘다', () => {
    const base = { isThumbnail: false };
    expect(resolveHasReferenceImage({ ...base, userRoles: [], shoppingHasReference: true })).toBe(true);
    expect(resolveHasReferenceImage({ ...base, userRoles: [], shoppingHasReference: false })).toBe(false);
    expect(resolveHasReferenceImage({ ...base, userRoles: ['person'], shoppingHasReference: true })).toBe(false);
    expect(resolveHasReferenceImage({ ...base, userRoles: ['person', 'product'], shoppingHasReference: false })).toBe(true);
    expect(resolveHasReferenceImage({ isThumbnail: true, userRoles: ['product'], shoppingHasReference: true })).toBe(false);
  });
  it('imageGenerator 가 정책 플래그와 대표 사진 읽기 실패 허용을 쓴다', () => {
    const source = read('src', 'imageGenerator.ts');
    expect(source).toContain('resolveHasReferenceImage(');
    expect(source).toMatch(/if \(userReferenceRoles\.length === 0\) throw fallbackError;/);
  });
});

describe('새 글 표식 (C)', () => {
  const own = { entries: [entry('a')], dismissedAutoPath: '', ownerKey: 'post:A' };
  it('표식은 저장된 글 번호이고 제목에는 흔들리지 않는다', () => {
    expect(codexReferenceContentKey({ _postId: 'abc', selectedTitle: '가' })).toBe('post:abc');
    expect(codexReferenceContentKey({ _postId: 'abc', selectedTitle: '고친 제목' })).toBe('post:abc');
    expect(codexReferenceContentKey({ selectedTitle: '제목만' })).toBe('');
    expect(codexReferenceContentKey(null)).toBe('');
  });
  it('같은 글·글 없음이면 그대로, 다른 글이면 비우고, 첫 글은 미리 넣은 사진을 이어받는다', () => {
    expect(reconcileCodexReferenceOwner(own, 'post:A')).toBe(own);
    expect(reconcileCodexReferenceOwner(own, '')).toBe(own);
    expect(reconcileCodexReferenceOwner(own, 'post:B')).toEqual({ entries: [], dismissedAutoPath: '', ownerKey: 'post:B' });
    const early = { entries: [entry('a')], dismissedAutoPath: '' };
    const adopted = reconcileCodexReferenceOwner(early, 'post:A');
    expect(adopted.entries).toHaveLength(1);
    expect(adopted.ownerKey).toBe('post:A');
  });
});

describe('사본 삭제 대상 (D)', () => {
  afterEach(() => setCodexReferenceCopyRemover(null));
  it('목록에서 사라진 "복사본" 만 골라낸다(수집 대표 사진은 제외)', () => {
    const prev = { entries: [entry('a', { copied: true }), entry('b'), entry('c', { copied: true })], dismissedAutoPath: '' };
    const next = { entries: [entry('c', { copied: true })], dismissedAutoPath: '' };
    expect(removedCodexReferenceCopies(prev, next)).toEqual(['C:/m/a.png']);
  });
  it('목록을 바꾸면 지우개가 호출되고 역할만 바뀐 경우는 호출되지 않는다', () => {
    const remover = vi.fn();
    setCodexReferenceCopyRemover(remover);
    setCodexReferenceState({ entries: [entry('a', { copied: true })], dismissedAutoPath: '' });
    setCodexReferenceState({ entries: [entry('a', { copied: true, role: 'person' })], dismissedAutoPath: '' });
    expect(remover).not.toHaveBeenCalled();
    setCodexReferenceState(EMPTY_CODEX_REFERENCE_STATE);
    expect(remover).toHaveBeenCalledWith(['C:/m/a.png']);
  });
});

describe('메인 경로 검증 (D)', () => {
  const root = join(parse(process.cwd()).root, 'imgroot');
  const folder = join(root, '참고_사진');
  const target = join(folder, '사진-1.png');
  function setup(files: Record<string, 'file' | 'dir'>, links: Record<string, string> = {}) {
    const unlink = vi.fn(async () => undefined);
    const deps: ReferenceCopyDeps = {
      roots: [root],
      realpath: async (p) => {
        if (links[p]) return links[p];
        if (p in files || p === folder || p === root) return p;
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      },
      stat: async (p) => ({ isFile: () => files[p] === 'file' }),
      unlink,
    };
    return { deps, unlink };
  }
  it('참고 사진 폴더 안의 일반 파일만 지운다', async () => {
    const { deps, unlink } = setup({ [target]: 'file' });
    expect(await deleteReferenceCopy(target, deps)).toMatchObject({ success: true, deleted: true });
    expect(unlink).toHaveBeenCalledWith(target);
  });
  it.each([
    ['다른 폴더', join(root, '다른', 'a.png')],
    ['.. 로 빠져나감', join(folder, '..', 'x.png')],
    ['이름만 비슷한 옆 폴더', join(root, '참고_사진_복사', 'a.png')],
    ['폴더 자체', folder],
    ['상대 경로', 'a.png'],
    ['빈 값', ''],
  ])('%s 는 거부한다', async (_label, bad) => {
    const { deps, unlink } = setup({ [join(root, '다른', 'a.png')]: 'file', [join(root, 'x.png')]: 'file', [join(root, '참고_사진_복사', 'a.png')]: 'file' });
    expect(await deleteReferenceCopy(bad, deps)).toMatchObject({ success: false });
    expect(unlink).not.toHaveBeenCalled();
  });
  it('문자열이 아니거나 폴더이거나 바깥을 가리키는 링크는 거부한다', async () => {
    const outside = join(root, 'secret.png');
    const { deps, unlink } = setup({ [target]: 'file', [outside]: 'file', [join(folder, '하위')]: 'dir' }, { [target]: outside });
    expect(await deleteReferenceCopy(42, deps)).toMatchObject({ success: false });
    expect(await deleteReferenceCopy(join(folder, '하위'), deps)).toMatchObject({ success: false });
    expect(await deleteReferenceCopy(target, deps)).toMatchObject({ success: false });
    expect(unlink).not.toHaveBeenCalled();
  });
  it('이미 없는 파일은 성공(삭제 0건)으로 돌려준다', async () => {
    const { deps, unlink } = setup({});
    expect(await deleteReferenceCopy(target, deps)).toMatchObject({ success: true, deleted: false });
    expect(unlink).not.toHaveBeenCalled();
  });
  it('채널이 메인·preload·타입에 모두 있다', () => {
    expect(read('src', 'main', 'ipc', 'imageDownloadHandlers.ts')).toContain("'image:deleteReferenceCopy'");
    expect(read('src', 'preload.ts')).toContain("ipcRenderer.invoke('image:deleteReferenceCopy'");
    expect(read('src', 'renderer', 'global.d.ts')).toContain('deleteReferenceCopy');
  });
});

describe('단축 주소 (#1)', () => {
  const NOTICE = '쇼핑몰 상품 주소가 아닌 것 같아 일반 수집으로 진행합니다';
  const crawlOk = async () => ({ success: true, images: ['https://a/1.jpg'], title: '글' });
  const make = (collect: () => Promise<any>) => ({ collectImagesFromShopping: vi.fn(collect), crawlImagesFromUrl: vi.fn(crawlOk) });
  const run = (api: any, url: string) => collectImageTabUrlImages(api, url, { title: '', content: null });

  it('naver.me 가 블로그로 풀리면 알리고 일반 수집으로 진행한다', async () => {
    const api = make(async () => ({ success: false, images: [], resolvedUrl: 'https://blog.naver.com/abc/1' }));
    const result = await run(api, 'https://naver.me/abc');
    expect(result).toMatchObject({ ok: true, kind: 'crawl', imageUrls: ['https://a/1.jpg'] });
    expect((result as any).notice).toContain(NOTICE);
    expect(api.crawlImagesFromUrl).toHaveBeenCalledTimes(1);
  });
  it.each([
    ['쇼핑몰로 풀렸는데 차단', 'https://naver.me/x', { success: false, isErrorPage: true, requiresCoupangApi: true, resolvedUrl: 'https://www.coupang.com/vp/products/1' }],
    ['쇼핑몰로 풀렸는데 0장', 'https://bit.ly/x', { success: false, images: [], resolvedUrl: 'https://smartstore.naver.com/a/products/1' }],
    ['풀린 주소 없는 실패(한도·예외)', 'https://naver.me/x', { success: false, message: '한도 초과' }],
    ['스마트스토어(단축 아님)', 'https://smartstore.naver.com/a/products/1', { success: false, images: [], resolvedUrl: 'https://smartstore.naver.com/a/products/1' }],
    ['brandconnect(쇼핑몰이 분명)', 'https://brandconnect.naver.com/x', { success: false, images: [], resolvedUrl: 'https://brandconnect.naver.com/x' }],
    ['link.coupang.com(쇼핑몰이 분명)', 'https://link.coupang.com/a/b', { success: false, images: [] }],
  ])('%s — 일반 수집으로 넘기지 않고 쇼핑 실패를 그대로 알린다', async (_label, url, response) => {
    const api = make(async () => response);
    const result = await run(api, url);
    expect(result).toMatchObject({ ok: false, kind: 'shopping' });
    expect(api.crawlImagesFromUrl).not.toHaveBeenCalled();
  });
});

describe('참고 사진 반영 안내 (#5)', () => {
  const rep = [{ isRepresentative: true, localPath: 'C:/m/a.jpg', filePath: 'C:/m/a.jpg' }];
  const base = { poolSynced: true, engine: 'codex-image', collected: rep, userEntryCount: 0 };
  it('칸에 실제로 나타날 때만 "넣었습니다"', () => {
    expect(describeCodexReferenceReflection(base)).toContain('참고 사진 칸에 대표 사진을 넣었습니다');
    const bad = [
      describeCodexReferenceReflection({ ...base, poolSynced: false }),
      describeCodexReferenceReflection({ ...base, engine: 'nano-banana-2' }),
      describeCodexReferenceReflection({ ...base, collected: [{ isRepresentative: true, url: 'https://x/a.jpg', filePath: 'https://x/a.jpg' }] }),
      describeCodexReferenceReflection({ ...base, userEntryCount: 2 }),
    ];
    bad.forEach((text) => expect(text).not.toContain('넣었습니다'));
    expect(bad[0]).toContain('만들어 둔 글이 없어');
    expect(bad[1]).toContain('Codex');
    expect(bad[2]).toContain('쓰지 못합니다');
    expect(bad[3]).toContain('직접 넣은 사진');
  });
});
