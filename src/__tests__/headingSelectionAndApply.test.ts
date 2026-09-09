/**
 * [2026-09-10 사장님] 반자동 편집 소제목 패널 두 가지.
 *
 *  1) "커서 줄을 소제목으로" 는 줄 전체를 먹었다. 드래그로 고른 만큼만 소제목이 되어야 한다.
 *     - 고른 부분만 "## " 줄로 떼어내고, 같은 줄의 앞뒤 글자는 본문으로 남는다(글이 사라지면 안 된다).
 *  2) 자동 감지 결과를 불러와 목록에서 고친 뒤 적용할 버튼이 없었다. 적용하면
 *     currentStructuredContent.headings 와 미리보기가 본문 표기와 같아져야 한다.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { markSelectionAsHeading, listHeadingLines } from '../renderer/utils/headingMarkup';

const src = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('markSelectionAsHeading — 드래그한 만큼만 소제목', () => {
  it('줄 가운데를 고르면 앞뒤 글자는 본문으로 남는다', () => {
    const body = '앞부분 소제목감 뒷부분';
    const next = markSelectionAsHeading(body, 4, 8);
    expect(next).toBe('앞부분\n## 소제목감\n뒷부분');
  });

  it('줄 전체를 고르면 그 줄만 소제목이 된다', () => {
    const body = '첫째 줄\n둘째 줄';
    expect(markSelectionAsHeading(body, 0, 4)).toBe('## 첫째 줄\n둘째 줄');
  });

  it('앞부분만 고르면 나머지는 아래 본문 줄로 내려간다', () => {
    expect(markSelectionAsHeading('제목감 나머지 본문', 0, 3)).toBe('## 제목감\n나머지 본문');
  });

  it('고른 양 끝의 공백은 소제목에 넣지 않는다', () => {
    expect(markSelectionAsHeading('앞 가운데 뒤', 1, 6)).toBe('앞\n## 가운데\n뒤');
  });

  it('이미 소제목인 줄에서 일부만 고르면 그 일부가 새 소제목이 되고 나머지는 본문', () => {
    const body = '## 원래 제목 전체';
    expect(markSelectionAsHeading(body, 3, 5)).toBe('## 원래\n제목 전체');
  });

  it('여러 줄에 걸쳐 드래그하면 한 줄짜리 소제목으로 합친다', () => {
    const body = '가나다\n라마바\n사아자';
    expect(markSelectionAsHeading(body, 0, 7)).toBe('## 가나다 라마바\n사아자');
  });

  it('선택이 없으면 null — 호출자가 기존 "줄 전체" 동작으로 넘어간다', () => {
    expect(markSelectionAsHeading('아무 줄', 2, 2)).toBeNull();
  });

  it('공백만 골랐으면 null', () => {
    expect(markSelectionAsHeading('앞   뒤', 2, 4)).toBeNull();
  });

  it('앞뒤 다른 줄은 건드리지 않는다', () => {
    const body = '위 줄\n대상 줄 여기까지\n아래 줄';
    const next = markSelectionAsHeading(body, 4, 6)!;
    expect(next.split('\n')[0]).toBe('위 줄');
    expect(next.split('\n').pop()).toBe('아래 줄');
    expect(listHeadingLines(next).map((h) => h.title)).toEqual(['대상']);
  });
});

describe('소제목 패널 배선 핀', () => {
  const panel = () => src('../renderer/modules/headingControlPanel.ts');

  it('드래그 선택을 먼저 보고, 없을 때만 줄 전체로 간다', () => {
    const code = panel();
    expect(code).toMatch(/markSelectionAsHeading\(/);
    expect(code).toMatch(/selectionEnd/);
  });

  it('적용 버튼이 headings 를 본문 표기로 다시 세우고 미리보기를 갱신한다', () => {
    const code = panel();
    expect(code).toMatch(/heading-apply-to-preview/);
    expect(code).toMatch(/extractSemiAutoDocumentFromBody/);
    expect(code).toMatch(/updateUnifiedImagePreview/);
    expect(code).toMatch(/syncIntegratedPreviewFromInputs/);
  });

  it('적용 뒤에도 사용자 잠금은 유지된다 — 휴리스틱이 되돌리면 안 된다', () => {
    expect(panel()).toMatch(/headingsLockedByUser\s*=\s*true/);
  });

  it('index.html 에 적용 버튼이 있다', () => {
    expect(src('../../public/index.html')).toMatch(/id="heading-apply-to-preview"/);
  });
});

describe('발행 배선 — 사용자가 지정한 소제목이 발행까지 살아남는다', () => {
  const body = [
    '오늘은 거제도에 다녀왔습니다.',
    '',
    '## 내가 정한 소제목',
    '',
    '옛 소제목 하나',
    '내용 가나다',
    '옛 소제목 둘',
    '내용 라마바',
  ].join('\n');
  const staleHeadings = [
    { title: '옛 소제목 하나', content: '내용 가나다' },
    { title: '옛 소제목 둘', content: '내용 라마바' },
  ];

  it('잠금이 없으면 기존 동작 그대로 — 근거가 더 많은 옛 소제목으로 복구된다', async () => {
    const { resolveSemiAutoPublishStructure } = await import('../renderer/utils/semiAutoHeadingExtractor');
    const structure = resolveSemiAutoPublishStructure(body, staleHeadings, { bodyIsAuthoritative: true });
    expect(structure.headings.map((h) => h.title)).toEqual(['옛 소제목 하나', '옛 소제목 둘']);
  });

  it('사용자가 지정했으면 본문 표기가 이긴다 — 복구 사다리가 되돌리지 못한다', async () => {
    const { resolveSemiAutoPublishStructure } = await import('../renderer/utils/semiAutoHeadingExtractor');
    const structure = resolveSemiAutoPublishStructure(body, staleHeadings, {
      bodyIsAuthoritative: true,
      bodyMarkupIsAuthoritative: true,
    });
    expect(structure.headings.map((h) => h.title)).toEqual(['내가 정한 소제목']);
    expect(structure.orderLocked).toBe(true);
  });

  it('발행 핸들러가 잠금을 구조 해석기로 넘긴다', () => {
    const code = src('../renderer/modules/publishingHandlers.ts');
    expect(code).toMatch(/bodyMarkupIsAuthoritative:\s*structuredContent\.headingsLockedByUser === true/);
  });
});
