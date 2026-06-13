// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  collectEditorTitleDiagnostics,
  readEditorTitleText,
  setTitleByDomEvent,
} from '../automation/editorTitleHelpers.js';

const makeFrame = (frameUrl = 'https://blog.naver.com/PostWriteForm.naver') => ({
  url: () => frameUrl,
  evaluate: vi.fn(async (fn: Function, arg?: unknown) => fn(arg)),
});

describe('editorTitleHelpers', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('reads the current title through Naver editor title selectors', async () => {
    document.body.innerHTML = `
      <div class="se-section-documentTitle">
        <div class="se-title-text">  테스트 제목  </div>
      </div>
    `;

    const title = await readEditorTitleText(makeFrame() as any);

    expect(title).toBe('테스트 제목');
  });

  it('sets title text through DOM input events when keyboard typing does not stick', async () => {
    const target = document.createElement('div');
    target.setAttribute('contenteditable', 'true');
    document.body.appendChild(target);

    const events: string[] = [];
    target.addEventListener('beforeinput', () => events.push('beforeinput'));
    target.addEventListener('input', () => events.push('input'));
    target.addEventListener('change', () => events.push('change'));

    const elementHandle = {
      evaluate: vi.fn(async (fn: Function, value: string) => fn(target, value)),
    };

    const result = await setTitleByDomEvent(elementHandle as any, '제목 fallback');

    expect(result).toBe('제목 fallback');
    expect(target.textContent).toBe('제목 fallback');
    expect(events).toEqual(['beforeinput', 'input', 'change']);
  });

  it('collects diagnostics with page url, title, frame url, and selector counts', async () => {
    document.body.innerHTML = `
      <div class="se-section-documentTitle"></div>
      <div data-name="documentTitle"></div>
      <div class="se-main-container"></div>
    `;

    const page = {
      url: () => 'https://blog.naver.com/GoBlogWrite.naver',
      title: vi.fn().mockResolvedValue('블로그 글쓰기'),
    };

    const diagnostics = await collectEditorTitleDiagnostics(makeFrame('https://blog.naver.com/PostWriteForm.naver') as any, page as any);

    expect(diagnostics).toContain('pageUrl=https://blog.naver.com/GoBlogWrite.naver');
    expect(diagnostics).toContain('pageTitle=블로그 글쓰기');
    expect(diagnostics).toContain('frameUrl=https://blog.naver.com/PostWriteForm.naver');
    expect(diagnostics).toContain('.se-section-documentTitle=1');
    expect(diagnostics).toContain('[data-name="documentTitle"]=1');
    expect(diagnostics).toContain('.se-main-container=1');
  });
});
