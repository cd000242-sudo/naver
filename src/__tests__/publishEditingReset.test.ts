import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';

type Field = { value: string; readOnly?: boolean };
let fields: Map<string, Field>;
let redraw: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fields = new Map([
    ['unified-generated-content', { value: '## 이전 소제목\n이전 본문' }],
    ['unified-extra-request', { value: '이번 글 추가 요청' }],
    ['custom-prompt-input', { value: '저장된 모드별 프롬프트' }],
    ['unified-publish-mode', { value: 'draft' }],
  ]);
  redraw = vi.fn(() => {
    expect(fields.get('unified-generated-content')?.value).toBe('');
    expect((window as any).currentStructuredContent).toBeNull();
  });
  vi.stubGlobal('document', {
    getElementById: (id: string) => fields.get(id) ?? null,
    querySelectorAll: () => [],
  });
  vi.stubGlobal('window', {
    currentStructuredContent: { headingsLockedByUser: true, headings: [{ title: '이전 소제목' }] },
    renderHeadingList: redraw,
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('발행 완료 후 글별 편집값 초기화', () => {
  it('공용 완료 경로가 본문과 추가 요청사항을 비우고 소제목 목록을 갱신한다', async () => {
    const { resetAfterPublish } = await import('../renderer/utils/fullAutoUtils.js');
    resetAfterPublish();
    expect(fields.get('unified-extra-request')?.value).toBe('');
    expect(fields.get('unified-generated-content')?.value).toBe('');
    expect((window as any).currentStructuredContent).toBeNull();
    expect(redraw).toHaveBeenCalledOnce();
    expect(fields.get('custom-prompt-input')?.value).toBe('저장된 모드별 프롬프트');
    expect(fields.get('unified-publish-mode')?.value).toBe('draft');
  });

  it('전체 필드 초기화도 동일하게 요청사항과 소제목 패널을 초기화한다', async () => {
    const utils = await import('../renderer/utils/fullAutoUtils.js');
    const source = readFileSync(resolve(__dirname, '../renderer/renderer.ts'), 'utf8');
    const start = source.indexOf('function resetAllFields(): void {');
    const end = source.indexOf('function syncIntegratedPreviewFromInputs()', start);
    const js = ts.transpileModule(source.slice(start, end), {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const run = new Function('resetPostEditingControls', 'resetRiskIndicators', 'ImageManager', 'resetPhotoModeForNextPost', 'appendLog',
      `let currentPostId = 'old-post'; ${js}; resetAllFields();`);
    run((utils as any).resetPostEditingControls, vi.fn(), { clear: vi.fn() }, vi.fn(), vi.fn());
    expect(fields.get('unified-extra-request')?.value).toBe('');
    expect(redraw).toHaveBeenCalledOnce();
  });

  it('목록 렌더링에 실패해도 나머지 발행 상태는 초기화한다', async () => {
    redraw.mockImplementation(() => { throw new Error('panel unavailable'); });
    (window as any).generatedImages = [{ filePath: 'old-image.png' }];
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { resetAfterPublish } = await import('../renderer/utils/fullAutoUtils.js');
    expect(() => resetAfterPublish()).not.toThrow();
    expect((window as any).generatedImages).toEqual([]);
    expect(fields.get('unified-extra-request')?.value).toBe('');
    expect(warning).toHaveBeenCalled();
    warning.mockRestore();
  });

  it('발행 실패 시 재시도에 필요한 편집 내용과 추가 요청사항을 유지한다', async () => {
    const { resetPublishing } = await import('../renderer/utils/fullAutoUtils.js');
    resetPublishing();
    expect(fields.get('unified-extra-request')?.value).toBe('이번 글 추가 요청');
    expect(fields.get('unified-generated-content')?.value).toContain('이전 소제목');
    expect(redraw).not.toHaveBeenCalled();
  });

  it('패널이 없는 화면에서도 완료 초기화가 가능하다', async () => {
    fields.clear();
    delete (window as any).renderHeadingList;
    const { resetAfterPublish } = await import('../renderer/utils/fullAutoUtils.js');
    expect(() => resetAfterPublish()).not.toThrow();
  });
});
