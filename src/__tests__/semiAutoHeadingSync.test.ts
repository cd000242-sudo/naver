// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as extractor from '../renderer/utils/semiAutoHeadingExtractor';

// Execute the actual renderer listeners with their external services injected.
// Importing renderer.ts itself starts Electron/application-wide initialization.
const renderer = readFileSync('src/renderer/renderer.ts', 'utf8');
const start = renderer.indexOf('  // ✅ [Fix] 반자동 편집 필드 변경');
const end = renderer.indexOf('  // ✅ 카테고리 선택 모달 초기화', start);
const listenerCode = ts.transpileModule(renderer.slice(start, end), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

const body = '## 신청 방법\n신청에 필요한 서류와 방문 절차를 안내합니다.\n\n## 이용 기준\n이용 가능한 날짜와 조건을 확인합니다.';

describe('manual editor heading synchronization', () => {
  let textarea: HTMLTextAreaElement;
  let analyze: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '<input id="unified-generated-title" value="생활 안내"><textarea id="unified-generated-content"></textarea><input id="unified-generated-hashtags">';
    textarea = document.getElementById('unified-generated-content') as HTMLTextAreaElement;
    (window as any).currentStructuredContent = null;
    (window as any).__semiAutoPasteRevision = 0;
    (window as any).__imageManagerHeadings = [];
    (window as any).api = {};
    analyze = vi.fn().mockResolvedValue(undefined);
    const dependencies = {
      ...extractor,
      autoAnalyzeHeadings: analyze,
      syncIntegratedPreviewFromInputs: vi.fn(),
      normalizeHashtags: (value: string) => value,
    };
    new Function(...Object.keys(dependencies), listenerCode)(...Object.values(dependencies));
  });

  afterEach(() => vi.useRealTimers());

  async function input(value: string) {
    textarea.value = value;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(500);
  }

  it('analyzes a manually entered article without a paste event', async () => {
    await input(body);
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(analyze.mock.calls[0][0].headings.map((h: any) => h.title)).toEqual(['신청 방법', '이용 기준']);
  });

  it('refreshes section text and analyzes even when loaded heading titles are unchanged', async () => {
    (window as any).currentStructuredContent = {
      headings: [{ title: '신청 방법', content: '이전 내용', prompt: 'saved prompt', imageKey: 'keep-image' }, { title: '이용 기준', content: '이전 내용' }],
    };
    await input(body);
    expect(analyze).toHaveBeenCalledTimes(1);
    expect((window as any).currentStructuredContent.headings[0]).toMatchObject({ content: '신청에 필요한 서류와 방문 절차를 안내합니다.', imageKey: 'keep-image', prompt: 'saved prompt' });
  });

  it('clears stale image cards after the entire article is deleted', async () => {
    await input(body);
    analyze.mockClear();
    await input('');
    expect((window as any).currentStructuredContent.headings).toEqual([]);
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(analyze.mock.calls[0][0].headings).toEqual([]);
  });

  it('synchronizes added, renamed and removed headings', async () => {
    await input(body);
    await input(body.replace('신청 방법', '신청 절차') + '\n\n## 준비 서류\n필수 서류를 준비합니다.');
    expect((window as any).currentStructuredContent.headings.map((h: any) => h.title)).toEqual(['신청 절차', '이용 기준', '준비 서류']);
    await input('## 준비 서류\n필수 서류를 준비합니다.');
    expect(analyze.mock.calls.at(-1)?.[0].headings.map((h: any) => h.title)).toEqual(['준비 서류']);
  });

  it('analyzes recovered sentence-style headings with their current text', async () => {
    const title = '신청 일정은 공식 안내에서 확인할 수 있습니다.';
    (window as any).currentStructuredContent = { _manualPasted: true, headings: [{ title, content: '이전 내용' }] };
    await input(`${title}\n새로운 신청 날짜를 확인합니다.`);
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(analyze.mock.calls[0][0].headings[0].content).toBe('새로운 신청 날짜를 확인합니다.');
  });

  it('preserves generated section/image slots when editing body text that has no heading lines', async () => {
    const headings = [
      { title: '신청 방법', content: '원래 신청 순서와 서류 안내입니다.', imageKey: 'first-image' },
      { title: '이용 기준', content: '이용 가능한 날짜와 조건입니다.', imageKey: 'second-image' },
    ];
    (window as any).currentStructuredContent = { _preferBodyPlain: true, headings };
    await input('수정한 신청 순서와 서류 안내입니다.\n\n이용 가능한 날짜와 조건입니다.');
    expect((window as any).currentStructuredContent.headings).toEqual(headings);
    expect(analyze).toHaveBeenCalledTimes(1);
  });

  it('analyzes pasted marker content after title and body distribution', async () => {
    textarea.dispatchEvent(new Event('paste'));
    textarea.value = `[제목]\n생활 지원 안내\n[본문]\n${body}\n[해시태그]\n#생활 #지원 #안내`;
    textarea.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(500);
    expect(textarea.value).toBe(body);
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(analyze.mock.calls[0][0].selectedTitle).toBe('생활 지원 안내');
  });
});
