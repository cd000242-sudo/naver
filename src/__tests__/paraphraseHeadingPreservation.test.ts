import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { rebuildHeadingsFromPreferredBody } from '../renderer/modules/contentGeneration';
import { extractSemiAutoHeadingsFromBody } from '../renderer/utils/semiAutoHeadingExtractor';
import { normalizeReadableBodyText } from '../renderer/utils/textFormatUtils';

/** Body exactly as the pipeline synthesizes it: `${title}\n\n${content}` joined by \n\n\n. */
function synthesizeBody(headings: ReadonlyArray<{ title: string; content: string }>): string {
  return normalizeReadableBodyText(
    headings.map((h) => `${h.title}\n\n${h.content}`).join('\n\n\n'),
  );
}

const AI_HEADINGS = [
  { title: '9월 30일 전에 갈아타야 하는 이유', content: '기존 통장을 그대로 두면 민영주택 청약은 넣지 못합니다.' },
  { title: '실적은 어디까지 인정될까요', content: '납입 횟수와 기간은 그대로 따라옵니다.' },
  { title: '전환하면 실적이 그대로 인정돼요', content: '통장 종류에 따라 인정 범위가 갈립니다.' },
  { title: '은행 창구에서 확인할 것', content: '신분증과 기존 통장을 챙기세요.' },
];

describe('페러프레이징 소제목 보존', () => {
  it('정중형 어미 소제목은 휴리스틱 추출로는 유실된다 (버그의 원인)', () => {
    const extracted = extractSemiAutoHeadingsFromBody(synthesizeBody(AI_HEADINGS));
    const titles = extracted.map((h) => h.title);

    expect(titles).not.toContain('전환하면 실적이 그대로 인정돼요');
  });

  it('AI 소제목이 본문에 그대로 있으면 추출 결과로 덮어쓰지 않는다', () => {
    const structuredContent: any = {
      bodyPlain: synthesizeBody(AI_HEADINGS),
      headings: AI_HEADINGS.map((h) => ({ ...h, prompt: h.title })),
    };

    rebuildHeadingsFromPreferredBody(structuredContent);

    expect(structuredContent.headings.map((h: any) => h.title)).toEqual(AI_HEADINGS.map((h) => h.title));
  });

  it('추출이 하나도 못 뽑아도 기존 소제목을 비우지 않는다', () => {
    const structuredContent: any = {
      // 본문과 소제목이 어긋나 추출 경로로 들어가지만, 추출 결과가 없는 형태.
      bodyPlain: '짧은 한 줄.',
      headings: [{ title: '원래 있던 소제목', content: '내용', prompt: '원래 있던 소제목' }],
    };

    rebuildHeadingsFromPreferredBody(structuredContent);

    expect(structuredContent.headings).toHaveLength(1);
    expect(structuredContent.headings[0].title).toBe('원래 있던 소제목');
  });
});

describe('이미지 관리 탭 소제목 분석 버튼', () => {
  const root = join(__dirname, '..', '..');
  const source = readFileSync(join(root, 'src', 'renderer', 'modules', 'headingImageGen.ts'), 'utf8');
  const html = readFileSync(join(root, 'public', 'index.html'), 'utf8');

  it('index.html에 없는 엘리먼트를 리스너 배선 조건으로 쓰지 않는다', () => {
    // 이 id는 index.html에 존재하지 않는다. 조건에 들어가면 리스너가 통째로 배선되지 않아
    // 버튼을 눌러도 아무 반응이 없다(사용자 보고).
    expect(html).not.toContain('heading-analysis-content');
    expect(source).not.toContain("getElementById('heading-analysis-content')");
  });

  it('분석 버튼은 실제로 존재하고 진행 모달을 띄운다', () => {
    expect(html).toContain('id="analyze-headings-btn"');
    expect(source).toContain('showAppProgressModal');
    expect(source).toContain('hideAppProgressModal');
  });
});
