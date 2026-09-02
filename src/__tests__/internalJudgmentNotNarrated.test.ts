import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { annotateSearchOnlyCompounds } from '../content/searchOnlyCompoundKeyword';
import { buildContentJsonOutputFormat } from '../contentJsonPromptFormat';

/**
 * [2026-09-02 실측 4편 중 3편] 모델이 내부 판정을 독자에게 서술했다.
 *
 *   비염  "상위 글에서 반복된 핵심도…", "블로그 사례에서는…", "삼성 안내에는 … 아닙니다"
 *         ← 자료 머리말이 준 예시 문구를 그대로 베꼈다. 비염 글에 삼성이 나온 이유다.
 *   침구  "2026년 9월 2일인 지금 이용 가능한 일정으로 읽으면 안 됩니다"
 *         ← dateBasis 의 todayIs 를 독자에게 말했다.
 *   비염·베란다·침구  "2025년, 2024년, 2023년의 수치를 덧붙여 단순 비교하기보다"
 *         ← dateBasis 의 연도 판정을 문장으로 옮겼다.
 *   베란다 "검색 화면의 2026태풍대비, 8월태풍대비 같은 표기는"
 *         ← 조합어 표시문을 언급 대상으로 삼았다.
 *
 * 세 갈래가 한 뿌리다. 내부 판정과 안내문은 시제와 낱말 선택으로만 드러나야지
 * 문장이 되면 안 된다. 그리고 안내문에 구체 예시를 적으면 모델은 그것을 베낀다 —
 * 하네스 실패 유형 3번을 내가 저질렀다(2540333b8 · b20f5a44e 의 머리말).
 */

const ROOT = resolve(__dirname, '..');
const read = (rel: string) => readFileSync(resolve(ROOT, ...rel.split('/')), 'utf-8').replace(/\r/g, '');

describe('자료 머리말은 베낄 예시를 주지 않는다', () => {
  const src = read('sourceAssembler.ts');
  const headerAt = src.indexOf('※ 이 묶음의 이름과 번호표');
  const header = src.slice(headerAt, headerAt + 700);

  it('출처 예시 문구가 없다 — 있으면 그대로 본문에 나온다', () => {
    for (const leaked of ['블로그 사례에서는', '삼성 안내에는', '후기에서는']) {
      expect(header, `${leaked} 가 머리말에 남아 있다`).not.toContain(leaked);
    }
  });

  it('금지 문구를 본보기처럼 적어 두지 않는다', () => {
    expect(header).not.toContain('"상위 글에서"');
  });

  it('안내문 자체가 내부 표기임을 말하고, 베끼지 말라고 한다', () => {
    expect(header).toContain('이 안내문 자체는 내부 표기다');
    expect(header).toContain('예시로 삼아 베끼지 마라');
  });
});

describe('dateBasis 는 서술하지 않는다', () => {
  it('프롬프트에 서술 금지 조항이 실린다', () => {
    const prompt = buildContentJsonOutputFormat({
      contentMode: 'seo', mode: 'seo',
      source: { rawText: '원본', title: '제목', metadata: {} } as never,
      title: '제목', rawText: '2025 행사는 오는 17일부터', primaryKeyword: '침구', subKeywords: '',
    });
    expect(prompt).toContain('dateBasis 는 너의 내부 판정이다');
    expect(prompt).toContain('오늘이 며칠인지 알려주거나');
    expect(prompt).toContain('판정은 시제로만 드러난다');
  });
});

describe('조합어 표시는 언급 대상이 되지 않는다', () => {
  it('표시문이 언급·설명 금지를 말한다', () => {
    const out = annotateSearchOnlyCompounds('9월침실정리');
    expect(out).toContain('언급하거나 설명하지 마라');
    expect(out).not.toContain('그대로 쓰지 말고 띄어 쓴 말로 푼다');
  });
});

describe('배선: 스니펫 경로에도 곁가지 몫이 걸린다', () => {
  /*
   * 전문 수집(collectTopArticleFullTexts)에만 걸었더니 홈판 글이 스니펫만으로
   * 에버랜드 정기권 · 크린토피아 세일 섹션을 만들었다. 같은 규칙을 스니펫에도 건다.
   */
  const src = read('sourceAssembler.ts');
  const snippetStart = src.indexOf('let offTopicDropped = 0;');
  // 둘째 앵커는 파일 앞쪽에도 있다 — 반드시 첫 앵커 뒤에서 찾는다 (처음엔 빈 슬라이스가 나왔다)
  const snippetFn = src.slice(snippetStart, src.indexOf('[네이버 API] ✅', snippetStart));

  it('스니펫마다 본류·곁가지를 가른다', () => {
    expect(snippetFn).toMatch(/const snippetMatch = scoreTopicMatch\(/u);
    expect(snippetFn).toMatch(/if \(isPrimaryTopicMaterial\(snippetMatch\)\)/u);
  });

  it('곁가지는 같은 비율(FULLTEXT_SECONDARY_RATIO)로 제한하고 버린 건수를 남긴다', () => {
    expect(snippetFn).toMatch(/\* FULLTEXT_SECONDARY_RATIO/u);
    expect(snippetFn).toMatch(/snippetSecondaryDropped \+= 1;/u);
    expect(src).toContain('곁가지 스니펫 ${snippetSecondaryDropped}건 버림');
  });
});
