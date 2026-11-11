// [2026-11-11] Codex 참고 사진 후속 수정 3건 — (1) 이미지 탭의 모든 생성이 지나는 래퍼에서 한 번에 붙이기
// (2) 가져온 원고에 글 표식을 붙여 다른 원고로 바뀌면 목록·사본을 비우기 (3) 펼친 칸의 문구 중복 제거.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EMPTY_CODEX_REFERENCE_STATE,
  codexReferenceContentKey,
  getCodexReferenceState,
  setCodexReferenceCopyRemover,
  setCodexReferenceState,
  syncCodexReferenceOwner,
  type CodexReferenceEntry,
} from '../renderer/utils/codexReferenceImageList';
import {
  isCodexReferenceExcludedRun,
  resolveCodexReferenceForCall,
  shouldAttachCodexReference,
} from '../renderer/utils/codexReferenceCentral';
import {
  isWholeManuscriptReplacement,
  markImportedManuscript,
} from '../renderer/utils/importedManuscriptStamp';
import { issueCodexReferenceKey } from '../renderer/utils/codexReferenceImageList';
import { codexReferenceStatusText } from '../renderer/modules/codexReferenceImages';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');
const entry = (path: string, role: 'person' | 'product', copied = false): CodexReferenceEntry => ({
  id: `ref:${path}`, path, role, name: path.split('\\').pop() || path, previewSrc: '', copied,
});

beforeEach(() => {
  vi.stubGlobal('window', { currentStructuredContent: { _postId: 'p1' } });
  setCodexReferenceState({ entries: [entry('C:\\ref\\a.png', 'person')], dismissedAutoPath: '', ownerKey: 'post:p1' });
});
afterEach(() => {
  setCodexReferenceCopyRemover(null);
  setCodexReferenceState(EMPTY_CODEX_REFERENCE_STATE);
  vi.unstubAllGlobals();
});

// The same request shape the cell [🔄 생성] button (regenerateSingleImage) sends.
const regenerateRequest = (extra: Record<string, unknown> = {}) => ({
  provider: 'codex-image',
  items: [{ heading: '소제목', prompt: 'a scene' }],
  postTitle: '제목',
  isFullAuto: true,
  regenerate: true,
  postId: 'p1',
  ...extra,
});
const SENT = { userReferenceImages: [{ path: 'C:\\ref\\a.png', role: 'person' }] };

describe('버그 1 — 래퍼에서 한 번에: 실제 값', () => {
  it('칸 [🔄 생성](재생성) 요청에 codex-image 면 참고 사진이 실린다', () => {
    expect(resolveCodexReferenceForCall(regenerateRequest(), 'codex-image')).toEqual(SENT);
  });
  it('일괄(여러 소제목) · 칸별 한 장 · 썸네일이 섞인 묶음에도 실린다(썸네일 제외는 메인)', () => {
    const batch = regenerateRequest({ items: [{ heading: 'a' }, { heading: 'b', isThumbnail: false }] });
    expect(resolveCodexReferenceForCall(batch, 'codex-image')).toEqual(SENT);
    const mixed = regenerateRequest({ items: [{ heading: 'thumb', isThumbnail: true }, { heading: 'body' }] });
    expect(resolveCodexReferenceForCall(mixed, 'codex-image')).toEqual(SENT);
  });
  it('isFullAuto 만으로는 빼지 않는다 — 이미지 탭 호출도 isFullAuto:true 를 싣는다', () => {
    expect(isCodexReferenceExcludedRun({ isFullAuto: true })).toBe(false);
  });
  it('다른 엔진에는 싣지 않는다', () => {
    for (const engine of ['nano-banana-pro', 'nano-banana-2', 'openai-image', 'flow', 'dropshot', 'genspark', '']) {
      expect(resolveCodexReferenceForCall(regenerateRequest({ provider: engine }), engine)).toEqual({});
    }
  });
  it('항목이 전부 썸네일인 호출에는 싣지 않는다', () => {
    const thumbOnly = regenerateRequest({ items: [{ heading: 't', isThumbnail: true }] });
    expect(resolveCodexReferenceForCall(thumbOnly, 'codex-image')).toEqual({});
  });
  it('풀오토 · 연속발행 · 다중계정 표식이 있으면 싣지 않는다', () => {
    for (const marker of [{ longRunImageGeneration: true }, { isContinuousMode: true }, { isMultiAccount: true }]) {
      expect(isCodexReferenceExcludedRun(marker)).toBe(true);
      expect(resolveCodexReferenceForCall(regenerateRequest(marker), 'codex-image')).toEqual({});
    }
  });
  it('호출이 이미 참고 사진 항목을 담았으면(빈 목록 포함) 건드리지 않는다', () => {
    expect(shouldAttachCodexReference(regenerateRequest({ userReferenceImages: [{ path: 'x', role: 'product' }] }), 'codex-image')).toBe(false);
    expect(shouldAttachCodexReference(regenerateRequest({ userReferenceImages: [] }), 'codex-image')).toBe(false);
  });
  it('참고 사진 목록이 비어 있으면 빈 객체', () => {
    setCodexReferenceState({ ...EMPTY_CODEX_REFERENCE_STATE, ownerKey: 'post:p1' });
    expect(resolveCodexReferenceForCall(regenerateRequest(), 'codex-image')).toEqual({});
  });
});

describe('버그 1 — 배선(소스 단언)', () => {
  const cost = read('src/renderer/modules/costAndAutoGen.ts');
  it('costAndAutoGen 은 엔진 확정 뒤, 메인으로 넘기기 전에 한 번 붙인다', () => {
    expect(cost).toContain("from '../utils/codexReferenceCentral.js'");
    const resolved = cost.indexOf("provider = String(options?.provider || provider || '').trim();");
    const attached = cost.indexOf('resolveCodexReferenceForCall(options, provider)');
    const sent = cost.indexOf('return invokeGenerateImagesWithPolicy(options);');
    expect(resolved).toBeGreaterThan(-1);
    expect(attached).toBeGreaterThan(resolved);
    expect(sent).toBeGreaterThan(attached);
    expect(cost.split('window.api.generateImages(options)').length - 1).toBe(1);
  });
  it('칸 [🔄 생성] 경로는 래퍼를 지난다(직접 호출하지 않는다)', () => {
    const heading = read('src/renderer/modules/headingImageGen.ts');
    const start = heading.indexOf('async function regenerateSingleImage(');
    const body = heading.slice(start, heading.indexOf('\nasync function', start + 10));
    expect(body).toContain('await generateImagesWithCostSafety({');
    expect(body).not.toMatch(/api\.generateImages\(/);
  });
  it('풀오토 · 다중계정의 모든 호출은 longRunImageGeneration 표식을 달고 있다', () => {
    for (const [file, expected] of [['fullAutoFlow', 6], ['multiAccountManager', 3]] as const) {
      const source = read(`src/renderer/modules/${file}.ts`);
      const starts = [...source.matchAll(/generateImagesWithCostSafety\(\{/g)].map((m) => m.index ?? 0);
      expect(starts.length).toBe(expected);
      starts.forEach((at, i) => {
        const end = Math.min(starts[i + 1] ?? Infinity, at + 2500);
        expect(source.slice(at, end)).toContain('longRunImageGeneration: true');
      });
    }
  });
  it('이미지 탭 파일은 자동 발행 표식을 달지 않는다', () => {
    for (const file of ['headingImageGen', 'imageDisplayGrid', 'imageManagerCore']) {
      expect(read(`src/renderer/modules/${file}.ts`)).not.toMatch(/longRunImageGeneration|isMultiAccount:\s*true/);
    }
    expect(read('src/renderer/renderer.ts')).not.toMatch(/longRunImageGeneration|isMultiAccount:\s*true/);
  });
});

describe('버그 2 — 가져온 원고의 글 표식', () => {
  it('발급한 식별이 글 키가 되고, 없으면 저장 글 번호·생성 시각 규칙을 따른다 (_importedAt 필드는 읽지 않는다)', () => {
    const issued: Record<string, unknown> = { _postId: 'p' };
    const key = issueCodexReferenceKey(issued);
    expect(key).not.toBe('');
    expect(codexReferenceContentKey(issued)).toBe(key); // wins over the saved id
    expect(codexReferenceContentKey({ _importedAt: 5, _postId: 'p' })).toBe('post:p'); // a leftover field is never trusted
    expect(codexReferenceContentKey({ _importedAt: '7', generatedAt: 'g' })).toBe('at:g');
    expect(codexReferenceContentKey({ selectedTitle: '표식 없음' })).toBe('');
    expect(codexReferenceContentKey('text')).toBe('');
  });
  it('식별은 발급할 때마다 달라지고 글 객체에는 아무것도 쓰지 않는다', () => {
    const a: Record<string, unknown> = { title: 'a' };
    const b: Record<string, unknown> = { title: 'b' };
    expect(issueCodexReferenceKey(a)).not.toBe(issueCodexReferenceKey(b));
    const first = codexReferenceContentKey(a);
    expect(issueCodexReferenceKey(a)).not.toBe(first);
    expect(Object.keys(a)).toEqual(['title']);
    expect(JSON.stringify(a)).toBe('{"title":"a"}');
    expect(issueCodexReferenceKey(null)).toBe('');
    expect(issueCodexReferenceKey(5)).toBe('');
  });
  it('본문 전체를 선택해 붙여넣을 때만 다른 원고로 본다', () => {
    expect(isWholeManuscriptReplacement({ value: '앞 글 본문', selectionStart: 0, selectionEnd: 6 })).toBe(true);
    expect(isWholeManuscriptReplacement({ value: '앞 글 본문', selectionStart: 6, selectionEnd: 6 })).toBe(false); // caret at the end = append
    expect(isWholeManuscriptReplacement({ value: '앞 글 본문', selectionStart: 0, selectionEnd: 0 })).toBe(false);
    expect(isWholeManuscriptReplacement({ value: '앞 글 본문', selectionStart: 2, selectionEnd: 4 })).toBe(false);
    expect(isWholeManuscriptReplacement({ value: '', selectionStart: 0, selectionEnd: 0 })).toBe(false); // title first, body later
    expect(isWholeManuscriptReplacement({ value: '  \n', selectionStart: 0, selectionEnd: 3 })).toBe(false);
    expect(isWholeManuscriptReplacement({ value: 'abc', selectionStart: null, selectionEnd: null })).toBe(false);
  });
  it('다른 원고를 가져오면 식별이 새로 발급되어 목록이 비고 사본 지우개가 불린다', () => {
    const removed: string[][] = [];
    setCodexReferenceCopyRemover((paths) => removed.push(paths));
    const content: Record<string, unknown> = { title: '앞 글' };
    (window as any).currentStructuredContent = content;
    const before = issueCodexReferenceKey(content);
    setCodexReferenceState({ entries: [entry('C:\\app\\copy.png', 'product', true)], dismissedAutoPath: '', ownerKey: before });
    markImportedManuscript(content);
    expect(codexReferenceContentKey(content)).not.toBe(before);
    expect((window as any).currentStructuredContent).toBe(content); // same object: other code holds it
    expect(Object.keys(content)).toEqual(['title']); // nothing is written onto the manuscript
    expect(getCodexReferenceState().entries).toEqual([]);
    expect(removed).toEqual([['C:\\app\\copy.png']]);
  });
  it('같은 원고를 고쳐 쓰는 동안은 식별이 그대로라 사진이 남는다', () => {
    const content: Record<string, unknown> = { title: '앞 글', bodyPlain: '본문' };
    (window as any).currentStructuredContent = content;
    const key = issueCodexReferenceKey(content);
    setCodexReferenceState({ entries: [entry('C:\\app\\copy.png', 'product', true)], dismissedAutoPath: '', ownerKey: key });
    content.title = '고친 제목';
    content.bodyPlain = '고친 본문';
    syncCodexReferenceOwner();
    expect(getCodexReferenceState().entries.map((e) => e.path)).toEqual(['C:\\app\\copy.png']);
  });
  it('글이 아직 없을 때(null)는 아무 일도 하지 않는다', () => {
    expect(() => markImportedManuscript(null)).not.toThrow();
    expect(getCodexReferenceState().entries.length).toBe(1);
  });
  it('renderer.ts: 새 원고 객체를 만들 때 표식을 붙이고, 전체 선택 붙여넣기 때 새로 붙인다', () => {
    const source = read('src/renderer/renderer.ts');
    expect(source).toContain("from './utils/importedManuscriptStamp.js'");
    const ensure = source.slice(source.indexOf('function _ensureSemiAutoStructuredContent()'));
    const created = ensure.slice(0, 1800);
    expect(created.indexOf('markImportedManuscript(sc)')).toBeGreaterThan(created.indexOf('(window as any).currentStructuredContent = sc;'));
    expect(created.indexOf('(window as any).currentStructuredContent = sc;')).toBeGreaterThan(-1);
    const pasteHook = source.search(/isWholeManuscriptReplacement\(semiAutoContent\)/);
    const mainPaste = source.indexOf("semiAutoContent.addEventListener('paste', () => {\n      const pasteRevision".replace(/\n/g, source.includes('\r\n') ? '\r\n' : '\n'));
    expect(pasteHook).toBeGreaterThan(-1);
    expect(mainPaste).toBeGreaterThan(pasteHook);
    expect(source.slice(pasteHook, pasteHook + 400)).toContain('markImportedManuscript(');
  });
});

describe('사소 — 펼친 칸 문구 중복', () => {
  it('아래 줄은 "없음"을 되풀이하지 않고, 사진이 있으면 장수를 되풀이하지 않는다', () => {
    const none = codexReferenceStatusText(0, 0);
    expect(none).not.toBe('');
    expect(none).not.toContain('없음');
    expect(none).toContain('사진 추가');
    expect(codexReferenceStatusText(1, 1)).toBe('');
    expect(codexReferenceStatusText(0, 1)).toBe(''); // auto-reflected representative photo
    expect(codexReferenceStatusText(2, 2)).toBe('');
    expect(codexReferenceStatusText(3, 3)).toContain('최대 3장');
  });
  it('접힌 줄(제목 줄)의 표시는 그대로다', () => {
    const panel = read('src/renderer/modules/codexReferenceImages.ts');
    expect(panel).toContain("shown.length === 0 ? '없음' : `${shown.length}/${CODEX_REFERENCE_MAX}장`");
  });
});

describe('범위 · 파일 크기 · 번들 등록', () => {
  const copyStatic = read('scripts/copy-static.mjs');
  const at = (name: string) => {
    expect(copyStatic.split(`'${name}'`).length - 1).toBe(1);
    return copyStatic.indexOf(`'${name}'`);
  };
  it('새 파일은 한 번만 실리고 순서가 맞다', () => {
    expect(at('codexReferenceImageList.js')).toBeLessThan(at('codexReferenceCentral.js'));
    expect(at('codexReferenceImageList.js')).toBeLessThan(at('importedManuscriptStamp.js'));
    expect(at('codexReferenceCentral.js')).toBeLessThan(at('costAndAutoGen.js'));
    expect(at('importedManuscriptStamp.js')).toBeLessThan(at('costAndAutoGen.js'));
  });
  it('새 파일 · 고친 목록 파일은 300줄 이하, 번들 스코프 함수를 window 로 조회하지 않는다', () => {
    for (const file of ['src/renderer/utils/codexReferenceCentral.ts', 'src/renderer/utils/importedManuscriptStamp.ts', 'src/renderer/utils/codexReferenceImageList.ts']) {
      const source = read(file);
      expect(source.split('\n').length).toBeLessThanOrEqual(300);
      expect(source).not.toMatch(/\(window as any\)\??\.(codexUserReferenceOptions|resolveCodexReferenceForCall|markImportedManuscript)/);
    }
  });
  it('src/main.ts · contentGeneration.ts · analytics · 지문 핀 파일은 이 수정의 이름을 모른다', () => {
    for (const file of ['src/main.ts', 'src/renderer/modules/contentGeneration.ts', 'src/contentQualityV3/candidateRuntimeFingerprint.ts', 'src/contentQualityV3/candidateRuntimeFingerprintPin.ts']) {
      expect(read(file)).not.toMatch(/importedManuscript|_importedAt|resolveCodexReferenceForCall|codexReferenceCentral/);
    }
  });
});
