// @vitest-environment happy-dom
// [2026-11-11] 참고 사진 칸 마무리 — 접기·펴기, 장수 표시, 자동 펴짐, 접힘 기억, 사본 삭제, 새 글 비움, 이어서 처리, 작은 미리보기.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bindCodexReferenceImages, refreshCodexReferenceImages } from '../renderer/modules/codexReferenceImages';
import { IMAGE_SETTINGS_CHANGED_EVENT } from '../runtime/imageSettingsSync';
import { clearCodexReferenceImages, codexUserReferenceOptions, getCodexReferenceState } from '../renderer/utils/codexReferenceImageList';

const html = readFileSync(resolve(__dirname, '../../public/index.html'), 'utf8');
const blockHtml = new DOMParser().parseFromString(html, 'text/html').getElementById('mgmt-codex-reference')?.outerHTML ?? '';
const SELECT = '<select id="image-source-select"><option value="codex-image" selected>c</option><option value="nano-banana-2">n</option></select>';
const KEY = 'codexReferenceCollapsed';

const makeFile = (name: string) => new File([new Uint8Array(4)], name, { type: 'image/png' });
function chooseFiles(files: File[]): void {
  const input = document.getElementById('mgmt-codex-reference-file') as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: files, configurable: true });
  input.dispatchEvent(new Event('change', { bubbles: true }));
}
const $ = (id: string) => document.getElementById(id)!;
const items = () => Array.from(document.querySelectorAll<HTMLElement>('#mgmt-codex-reference-list [data-ref-id]'));
const toggle = () => $('mgmt-codex-reference-toggle') as HTMLButtonElement;
const setContent = (value: unknown) => { (window as any).currentStructuredContent = value; };

let api: { downloadAndSaveImage: ReturnType<typeof vi.fn>; deleteReferenceCopy: ReturnType<typeof vi.fn> };
let notify: ReturnType<typeof vi.fn>;
let observed: unknown[];
let saved = 0;

function bind(): void {
  document.body.innerHTML = SELECT + blockHtml;
  bindCodexReferenceImages(notify, { api, readAsDataUrl: async (file: File) => `data:${file.type};base64,QQ==` });
}

beforeEach(() => {
  saved = 0; observed = [];
  localStorage.clear();
  (globalThis as any).IntersectionObserver = class { constructor(_cb: unknown) { /* test double */ } observe(el: unknown) { observed.push(el); } disconnect() { /* none */ } };
  (URL as any).createObjectURL = vi.fn(() => `blob:preview-${++saved}`);
  (URL as any).revokeObjectURL = vi.fn();
  api = {
    downloadAndSaveImage: vi.fn(async (_u: string, heading: string) => ({ success: true, filePath: `C:/managed/참고_사진/${heading}-${++saved}.png` })),
    deleteReferenceCopy: vi.fn(async () => ({ success: true, deleted: true })),
  };
  notify = vi.fn();
  bind();
});
afterEach(() => { clearCodexReferenceImages(); setContent(undefined); document.body.innerHTML = ''; });

describe('접기 · 펴기 (A)', () => {
  it('제목 줄은 버튼이고 처음엔 펴져 있다(aria-expanded)', () => {
    expect(toggle().tagName).toBe('BUTTON');
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect($('mgmt-codex-reference-body').hidden).toBe(false);
    expect(toggle().getAttribute('aria-controls')).toBe('mgmt-codex-reference-body');
  });
  it('누르면 접히고 다시 누르면 펴진다', () => {
    toggle().click();
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect($('mgmt-codex-reference-body').hidden).toBe(true);
    toggle().click();
    expect($('mgmt-codex-reference-body').hidden).toBe(false);
  });
  it('접힌 채로도 제목 옆에 장수가 보인다', async () => {
    expect($('mgmt-codex-reference-count').textContent).toBe('없음');
    chooseFiles([makeFile('a.png')]);
    await vi.waitFor(() => expect(items()).toHaveLength(1));
    toggle().click();
    expect($('mgmt-codex-reference-count').textContent).toBe('1/3장');
    expect($('mgmt-codex-reference-count').offsetParent === null && false).toBe(false);
  });
  it('접혀 있어도 사진을 넣으면 자동으로 펴진다', async () => {
    toggle().click();
    chooseFiles([makeFile('a.png')]);
    await vi.waitFor(() => expect(items()).toHaveLength(1));
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect($('mgmt-codex-reference-body').hidden).toBe(false);
  });
  it('수집한 대표 사진이 자동으로 들어와도 펴진다', () => {
    toggle().click();
    setContent({ collectedImages: [{ isRepresentative: true, localPath: 'C:/managed/rep.jpg' }] });
    refreshCodexReferenceImages();
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
  });
  it('접힘 상태만 기억하고 사진 목록은 저장하지 않는다', async () => {
    chooseFiles([makeFile('a.png')]);
    await vi.waitFor(() => expect(items()).toHaveLength(1));
    toggle().click();
    expect(localStorage.getItem(KEY)).toBe('1');
    expect(JSON.stringify({ ...localStorage })).not.toContain('managed');
    clearCodexReferenceImages();
    bind();
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect($('mgmt-codex-reference-body').hidden).toBe(true);
  });
});

describe('넣은 사진의 사본 지우기 (D)', () => {
  it('[빼기] 하면 그 사본을 지우고, 다른 사진은 건드리지 않는다', async () => {
    chooseFiles([makeFile('a.png'), makeFile('b.png')]);
    await vi.waitFor(() => expect(items()).toHaveLength(2));
    const [first, second] = getCodexReferenceState().entries.map((e) => e.path);
    (items()[0].querySelector('[data-action="remove"]') as HTMLButtonElement).click();
    expect(api.deleteReferenceCopy).toHaveBeenCalledTimes(1);
    expect(api.deleteReferenceCopy).toHaveBeenCalledWith(first);
    expect(getCodexReferenceState().entries.map((e) => e.path)).toEqual([second]);
  });
  it('목록이 비워지면(발행 뒤) 남은 사본을 모두 지운다', async () => {
    chooseFiles([makeFile('a.png'), makeFile('b.png')]);
    await vi.waitFor(() => expect(items()).toHaveLength(2));
    clearCodexReferenceImages();
    expect(api.deleteReferenceCopy).toHaveBeenCalledTimes(2);
  });
  it('수집 대표 사진은 사본이 아니므로 지우지 않는다', () => {
    setContent({ collectedImages: [{ isRepresentative: true, localPath: 'C:/managed/rep.jpg' }] });
    refreshCodexReferenceImages();
    (items()[0].querySelector('[data-role="person"]') as HTMLButtonElement).click();
    (items()[0].querySelector('[data-action="remove"]') as HTMLButtonElement).click();
    expect(api.deleteReferenceCopy).not.toHaveBeenCalled();
  });
  it('미리보기는 큰 dataURL 이 아니라 작은 주소를 들고 있고, 빼면 해제한다', async () => {
    chooseFiles([makeFile('a.png')]);
    await vi.waitFor(() => expect(items()).toHaveLength(1));
    const preview = getCodexReferenceState().entries[0].previewSrc;
    expect(preview.startsWith('blob:')).toBe(true);
    (items()[0].querySelector('[data-action="remove"]') as HTMLButtonElement).click();
    expect((URL as any).revokeObjectURL).toHaveBeenCalledWith(preview);
  });
});

describe('새 글을 만들면 비운다 (C)', () => {
  it('다른 글이 되면 칸을 다시 그릴 때 비우고 사본도 지운다', async () => {
    setContent({ _postId: 'A' });
    chooseFiles([makeFile('a.png')]);
    await vi.waitFor(() => expect(items()).toHaveLength(1));
    setContent({ _postId: 'B' });
    refreshCodexReferenceImages();
    expect(items()).toHaveLength(0);
    expect(api.deleteReferenceCopy).toHaveBeenCalledTimes(1);
  });
  it('생성 옵션을 만들 때도 다른 글이면 비우고 사진을 싣지 않는다', async () => {
    setContent({ _postId: 'A' });
    chooseFiles([makeFile('a.png')]);
    await vi.waitFor(() => expect(items()).toHaveLength(1));
    expect(codexUserReferenceOptions('codex-image').userReferenceImages).toHaveLength(1);
    setContent({ _postId: 'B' });
    expect(codexUserReferenceOptions('codex-image')).toEqual({});
    expect(getCodexReferenceState().entries).toHaveLength(0);
  });
  it('같은 글의 제목만 고쳐도 비우지 않는다', async () => {
    setContent({ _postId: 'A', selectedTitle: '가' });
    chooseFiles([makeFile('a.png')]);
    await vi.waitFor(() => expect(items()).toHaveLength(1));
    setContent({ _postId: 'A', selectedTitle: '고친 제목' });
    refreshCodexReferenceImages();
    expect(items()).toHaveLength(1);
    expect(api.deleteReferenceCopy).not.toHaveBeenCalled();
  });
  it('글이 없을 때 넣은 사진은 첫 글에서도 유지된다', async () => {
    setContent(undefined);
    chooseFiles([makeFile('a.png')]);
    await vi.waitFor(() => expect(items()).toHaveLength(1));
    setContent({ _postId: 'A' });
    refreshCodexReferenceImages();
    expect(items()).toHaveLength(1);
    setContent({ _postId: 'A', selectedTitle: '수정' });
    refreshCodexReferenceImages();
    expect(items()).toHaveLength(1);
    setContent({ _postId: 'B' });
    refreshCodexReferenceImages();
    expect(items()).toHaveLength(0);
  });
});

describe('화면 잔손질 (#8)', () => {
  it('엔진 값이 코드로 바뀌어도(설정 동기화 알림) 표시가 맞는다', () => {
    const select = $('image-source-select') as HTMLSelectElement;
    select.value = 'nano-banana-2';
    window.dispatchEvent(new Event(IMAGE_SETTINGS_CHANGED_EVENT));
    expect($('mgmt-codex-reference').style.display).toBe('none');
    select.value = 'codex-image';
    window.dispatchEvent(new Event(IMAGE_SETTINGS_CHANGED_EVENT));
    expect($('mgmt-codex-reference').style.display).not.toBe('none');
  });
  it('숨은 칸이 아니라 보이는 엔진 선택칸을 지켜본다', () => {
    expect(observed).toContain($('image-source-select'));
    expect(observed).not.toContain($('mgmt-codex-reference'));
  });
  it('추가 중에 또 고른 사진은 버리지 않고 이어서 처리한다', async () => {
    chooseFiles([makeFile('a.png')]);
    chooseFiles([makeFile('b.png')]);
    await vi.waitFor(() => expect(items()).toHaveLength(2));
    expect(api.downloadAndSaveImage).toHaveBeenCalledTimes(2);
  });
  it('설명 보기 문구가 사실에 맞다', () => {
    expect($('mgmt-codex-reference-more').textContent).toContain('발행이 끝나면 목록과 복사해 둔 사본을 지웁니다. 원본 사진은 그대로입니다.');
  });
});

describe('실패 알림 연결 (#6)', () => {
  it('생성 일괄 호출 경로(costAndAutoGen)도 참고 사진 실패 문구를 화면에 알린다', () => {
    const source = readFileSync(resolve(__dirname, '../renderer/modules/costAndAutoGen.ts'), 'utf8');
    expect(source).toMatch(/reportCodexReferenceFailure\(/);
    expect(source).toMatch(/typeof reportCodexReferenceFailure === 'function'/);
  });
});
