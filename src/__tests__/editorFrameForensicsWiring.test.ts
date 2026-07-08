/**
 * editorFrameForensicsWiring.test.ts
 *
 * [2026-07-08 라이브 사고] tail(이전글 카드) 직후 모든 프레임 읽기가 0(body/cards/dividers)
 * → EDITOR_NOT_READY 발행 실패. 기존 로그로는 "내부 iframe 네비게이션 vs DOM 소실 vs 오프레임"
 * 3가설을 구분 못 한다. 읽기 전용 포렌식(내부 frame URL/문서상태/컴포넌트 수/iframe 인벤토리)이
 * 두 사고 지점(tail 재획득 후·발행 직전 fail-open)에 배선돼 있음을 잠근다.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { formatEditorFrameForensics } from '../automation/editorFrameForensics';

describe('editor-body-not-readable 포렌식 계측', () => {
  it('naverBlogAutomation 두 사고 지점에 포렌식이 배선돼 있다', () => {
    const src = readFileSync(join(__dirname, '..', 'naverBlogAutomation.ts'), 'utf8');
    expect(src).toContain("from './automation/editorFrameForensics.js'");
    const calls = (src.match(/collectEditorFrameForensics\(/g) || []).length;
    expect(calls).toBeGreaterThanOrEqual(2); // tail 재획득 후 + pre-publish fail-open
  });

  it('포맷터가 3가설 구분에 필요한 필드를 모두 출력한다', () => {
    const line = formatEditorFrameForensics({
      frameUrl: 'https://blog.naver.com/PostWriteForm.naver',
      frameDetached: false,
      readyState: 'complete',
      docTitle: '글쓰기',
      hasComponentsWrap: true,
      seComponentCount: 0,
      bodyTextLength: 0,
      bodyPreview: '',
      iframeInventory: [{ id: 'mainFrame', name: 'mainFrame', src: '/PostWriteForm.naver' }],
      errorPageMarker: false,
    });
    expect(line).toContain('url=');       // (a) 네비게이션 판별
    expect(line).toContain('comps=');     // (b) DOM 소실 판별
    expect(line).toContain('iframes=');   // (c) 오프레임 판별
    expect(line).toContain('detached=');
  });
});
