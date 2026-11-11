// @vitest-environment happy-dom
// [2026-11-11] 묶음 3b — 이미지 탭 "참고 사진" 칸: 실제 index.html 블록으로 동작(추가·역할·빼기·최대 3장·엔진별 표시·자동 반영)을 확인한다.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bindCodexReferenceImages, refreshCodexReferenceImages, reportCodexReferenceFailure } from '../renderer/modules/codexReferenceImages';
import { clearCodexReferenceImages, getCodexReferenceState } from '../renderer/utils/codexReferenceImageList';

const html = readFileSync(resolve(__dirname, '../../public/index.html'), 'utf8');
const blockHtml = new DOMParser().parseFromString(html, 'text/html').getElementById('mgmt-codex-reference')?.outerHTML ?? '';
const SELECT = '<select id="image-source-select"><option value="codex-image" selected>c</option><option value="nano-banana-2">n</option></select>';

const makeFile = (name: string, type = 'image/png', size = 4) => {
  const file = new File([new Uint8Array(size)], name, { type });
  return file;
};
function chooseFiles(files: File[]): void {
  const input = document.getElementById('mgmt-codex-reference-file') as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: files, configurable: true });
  input.dispatchEvent(new Event('change', { bubbles: true }));
}
const items = () => Array.from(document.querySelectorAll<HTMLElement>('#mgmt-codex-reference-list [data-ref-id]'));
const roleOf = (el: HTMLElement) => el.querySelector('[aria-pressed="true"]')?.getAttribute('data-role');

let api: { downloadAndSaveImage: ReturnType<typeof vi.fn> };
let notify: ReturnType<typeof vi.fn>;
let saved = 0;

beforeEach(() => {
  saved = 0;
  document.body.innerHTML = SELECT + blockHtml;
  api = { downloadAndSaveImage: vi.fn(async (_url: string, heading: string) => ({ success: true, filePath: `C:/managed/참고_사진/${heading}-${++saved}.png` })) };
  notify = vi.fn();
  bindCodexReferenceImages(notify, { api, readAsDataUrl: async (file: File) => `data:${file.type};base64,QQ==` });
});
afterEach(() => { clearCodexReferenceImages(); delete (window as any).currentStructuredContent; document.body.innerHTML = ''; });

describe('index.html 블록', () => {
  it('블록이 있고 짧은 문구만 보인다', () => {
    expect(blockHtml).not.toBe('');
    const block = document.getElementById('mgmt-codex-reference')!;
    expect(block.textContent).toContain('참고 사진');
    expect(block.textContent).toContain('넣은 인물·제품 그대로, 소제목에 맞는 장면으로 만듭니다.');
    expect(block.querySelector('details')?.textContent).toContain('설명 보기');
    expect(block.querySelector('details')?.hasAttribute('open')).toBe(false);
  });
});

describe('엔진에 따라 보였다 숨는다', () => {
  it('codex-image 이면 보이고 다른 엔진이면 숨는다', () => {
    const block = document.getElementById('mgmt-codex-reference')!;
    const select = document.getElementById('image-source-select') as HTMLSelectElement;
    expect(block.style.display).not.toBe('none');
    select.value = 'nano-banana-2'; select.dispatchEvent(new Event('change'));
    expect(block.style.display).toBe('none');
    select.value = 'codex-image'; select.dispatchEvent(new Event('change'));
    expect(block.style.display).not.toBe('none');
  });
  it('엔진을 바꿔도 목록은 지우지 않는다(저장값 유지)', async () => {
    chooseFiles([makeFile('a.png')]);
    await vi.waitFor(() => expect(items()).toHaveLength(1));
    const select = document.getElementById('image-source-select') as HTMLSelectElement;
    select.value = 'nano-banana-2'; select.dispatchEvent(new Event('change'));
    expect(getCodexReferenceState().entries).toHaveLength(1);
  });
});

describe('사진 추가 · 역할 · 빼기', () => {
  it('고른 파일을 앱 보관 채널(downloadAndSaveImage)로 저장하고 그 경로를 목록에 둔다 — 기본 [제품]', async () => {
    chooseFiles([makeFile('제품.png'), makeFile('인물.jpg', 'image/jpeg')]);
    await vi.waitFor(() => expect(items()).toHaveLength(2));
    expect(api.downloadAndSaveImage).toHaveBeenCalledTimes(2);
    const [url, heading, postTitle] = api.downloadAndSaveImage.mock.calls[0];
    expect(url).toBe('data:image/png;base64,QQ==');
    expect(heading).toBe('제품');
    expect(postTitle).toBe('참고 사진');
    expect(getCodexReferenceState().entries.map((e) => e.path)).toEqual([
      'C:/managed/참고_사진/제품-1.png', 'C:/managed/참고_사진/인물-2.png',
    ]);
    expect(items().map(roleOf)).toEqual(['product', 'product']);
  });
  it('[인물] 을 누르면 그 사진 역할이 바뀐다, [빼기] 는 그 사진만 뺀다', async () => {
    chooseFiles([makeFile('a.png'), makeFile('b.png')]);
    await vi.waitFor(() => expect(items()).toHaveLength(2));
    (items()[1].querySelector('[data-role="person"]') as HTMLButtonElement).click();
    expect(items().map(roleOf)).toEqual(['product', 'person']);
    expect(getCodexReferenceState().entries.map((e) => e.role)).toEqual(['product', 'person']);
    (items()[0].querySelector('[data-action="remove"]') as HTMLButtonElement).click();
    expect(items()).toHaveLength(1);
    expect(getCodexReferenceState().entries[0].role).toBe('person');
  });
  it('3장이면 [사진 추가] 가 꺼지고 "최대 3장" 이 보인다, 넘치는 파일은 받지 않고 알린다', async () => {
    chooseFiles([makeFile('1.png'), makeFile('2.png'), makeFile('3.png'), makeFile('4.png')]);
    await vi.waitFor(() => expect(items()).toHaveLength(3));
    expect(api.downloadAndSaveImage).toHaveBeenCalledTimes(3);
    expect((document.getElementById('mgmt-codex-reference-add') as HTMLButtonElement).disabled).toBe(true);
    expect(document.getElementById('mgmt-codex-reference-status')!.textContent).toContain('최대 3장');
    expect(notify.mock.calls.some(([m]) => String(m).includes('최대 3장'))).toBe(true);
  });
  it('이미지가 아닌 파일·보관 실패는 목록에 넣지 않고 한글로 알린다', async () => {
    api.downloadAndSaveImage.mockResolvedValueOnce({ success: false, message: '디스크 오류' });
    chooseFiles([makeFile('x.png'), makeFile('메모.txt', 'text/plain'), makeFile('ok.png')]);
    await vi.waitFor(() => expect(items()).toHaveLength(1));
    const messages = notify.mock.calls.map(([m]) => String(m)).join('\n');
    expect(messages).toContain('x.png');
    expect(messages).toContain('메모.txt');
    expect(notify.mock.calls.every(([, kind]) => kind === 'error')).toBe(true);
  });
});

describe('수집 대표 사진 자동 반영 · 비우기', () => {
  const rep = { isRepresentative: true, localPath: 'C:/managed/rep.jpg', filePath: 'C:/managed/rep.jpg' };
  it('목록이 비어 있고 대표 사진이 있으면 [제품] 으로 미리 보여 주고 "수집한 대표 사진" 을 표시한다', () => {
    (window as any).currentStructuredContent = { collectedImages: [rep] };
    refreshCodexReferenceImages();
    expect(items()).toHaveLength(1);
    expect(items()[0].textContent).toContain('수집한 대표 사진');
    expect(roleOf(items()[0])).toBe('product');
    expect(getCodexReferenceState().entries).toEqual([]);
  });
  it('자동으로 보인 사진도 [빼기] 가 된다', () => {
    (window as any).currentStructuredContent = { collectedImages: [rep] };
    refreshCodexReferenceImages();
    (items()[0].querySelector('[data-action="remove"]') as HTMLButtonElement).click();
    expect(items()).toHaveLength(0);
  });
  it('보관 목록을 비우면(발행 끝) 화면도 비워진다', async () => {
    chooseFiles([makeFile('a.png')]);
    await vi.waitFor(() => expect(items()).toHaveLength(1));
    clearCodexReferenceImages();
    expect(items()).toHaveLength(0);
  });
});

describe('실패 알림', () => {
  it('메인이 멈춘 한글 문구를 그대로 알리고, 같은 문구는 연달아 반복하지 않는다', () => {
    const msg = '[Codex 구독 이미지] 이미지 생성 실패: USER_REFERENCE_LOAD_FAILED: Codex 구독 이미지가 참고 사진 1번을 불러오지 못해 멈췄습니다. 참고 사진 없이 만들거나 다른 엔진으로 바꾸지 않았습니다.';
    reportCodexReferenceFailure(msg);
    reportCodexReferenceFailure(msg);
    reportCodexReferenceFailure('다른 오류');
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith('Codex 구독 이미지가 참고 사진 1번을 불러오지 못해 멈췄습니다. 참고 사진 없이 만들거나 다른 엔진으로 바꾸지 않았습니다.', 'error');
  });
});
