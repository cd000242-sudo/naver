import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { isProcessNoiseRow, normalizeSummaryRows, appendSummaryTable, renderSummaryTable } from '../content/summaryTable.js';
import { buildContentJsonOutputFormat } from '../contentJsonPromptFormat.js';

/**
 * [2026-09-15 사장님 화면] 발행글 첫 화면에 이런 표가 나갔다:
 *   | 구분 | 내용 |
 *   | 기준일 | 2026-09-14 |
 *   | 검색 상태 | 검색 결과를 수집하지 못했습니다. |
 *   | 화면 표기 | Google News 주제 불일치 유사도 5% |
 *   | 연도 표기 | 2026년·2025년 귀속·2024년·2023년 |
 *
 * 크롤링이 전부 실패한 글이라 모델에게 줄 사실이 없었고, 모델은 **재료의 실패 메시지와 프롬프트 규칙**을
 * 표 칸에 옮겨 적었다. 사장님: "이렇게 나올 거면 안 나오는 게 나을 것 같은데 표를 선택할 수 있게 해 주면 안 되니"
 *
 * 세 겹으로 막는다: ① 재료에 안내문을 넣지 않는다(sourceAssembler) ② 도구 상태 행은 표에서 버린다
 * ③ 화면 체크박스로 요약표 자체를 끌 수 있다.
 */

/** 사장님 화면 그대로 */
const 사장님화면 = [
  { label: '기준일', value: '2026-09-14' },
  { label: '검색 상태', value: '검색 결과를 수집하지 못했습니다.' },
  { label: '화면 표기', value: 'Google News 주제 불일치 유사도 5%' },
  { label: '연도 표기', value: '2026년·2025년 귀속·2024년·2023년' },
];

describe('① 도구 상태를 적은 행은 표에서 버린다', () => {
  it('⭐ 사장님 화면의 표는 쓸 행이 1개만 남아 통째로 사라진다', () => {
    const rows = normalizeSummaryRows(사장님화면);
    expect(rows.map((r) => r.label)).toEqual([]);          // 기준일 하나만 남아 2행 미만 → 표 폐기
    expect(renderSummaryTable(사장님화면)).toBe('');
    expect(appendSummaryTable('도입부 문장입니다.', 사장님화면)).toBe('도입부 문장입니다.');
  });

  it('⭐ 무엇을 도구 상태로 보는가 — 낱말 목록이 아니라 모양', () => {
    expect(isProcessNoiseRow('검색 상태', '검색 결과를 수집하지 못했습니다.')).toBe(true);
    expect(isProcessNoiseRow('화면 표기', 'Google News 주제 불일치 유사도 5%')).toBe(true);
    expect(isProcessNoiseRow('연도 표기', '2026년·2025년')).toBe(true);
    expect(isProcessNoiseRow('수집 결과', '3건')).toBe(true);
    expect(isProcessNoiseRow('참고', '자료가 없습니다')).toBe(true);
  });

  it('⭐ 진짜 사실 행은 그대로 둔다 — 과잉 차단 금지', () => {
    const real = [
      { label: '기준일', value: '2026-09-14' },
      { label: '지원 금액', value: '월 20만 원' },
      { label: '신청 기간', value: '9월 1일~15일' },
      { label: '대상', value: '무주택 세대구성원' },
    ];
    expect(normalizeSummaryRows(real)).toHaveLength(4);
    expect(isProcessNoiseRow('기준일', '2026-09-14')).toBe(false);
    expect(isProcessNoiseRow('지원 금액', '월 20만 원')).toBe(false);
    // 섞여 있으면 나쁜 행만 빠지고 표는 남는다
    expect(normalizeSummaryRows([...real, 사장님화면[1]!]).map((r) => r.label))
      .toEqual(['기준일', '지원 금액', '신청 기간', '대상']);
  });
});

describe('② 재료에 안내문을 넣지 않는다 (원인)', () => {
  const assembler = readFileSync(new URL('../sourceAssembler.ts', import.meta.url), 'utf8');

  it('⭐ 크롤링이 전부 실패해도 안내문을 재료로 주지 않는다', () => {
    expect(assembler).not.toContain('검색 결과를 수집하지 못했습니다. "${keyword}"');
    expect(assembler).not.toContain('"${keyword}"에 대한 정보를 수집합니다.');
    // 재료가 없으면 없다고 한다 — 생성은 그대로 진행(success 유지)
    expect(assembler).toContain('collectedText: \'\',');
  });

  it('⭐ 소스 라벨에 내부 진단(유사도·주제 불일치)을 붙이지 않는다', () => {
    expect(assembler).not.toContain('주제 불일치 (유사도 ${Math.round(item.relevance * 100)}%)');
    expect(assembler).toContain('return `[${item.title}]\\n${item.content}`;');
  });
});

describe('③ 화면 체크박스로 요약표를 끈다', () => {
  const base = {
    contentMode: 'seo' as const,
    mode: 'seo' as const,
    title: '양육비 선지급 신청 요건',
    rawText: '',
    primaryKeyword: '양육비 선지급',
    subKeywords: '',
  };

  it('⭐ 기본은 넣는다 — 기존 동작이 바뀌면 안 된다', () => {
    expect(buildContentJsonOutputFormat({ ...base, source: {} })).toContain('"summaryTable"');
    expect(buildContentJsonOutputFormat({ ...base, source: { includeSummaryTable: true } })).toContain('"summaryTable"');
  });

  it('⭐ 끄면 스키마에서 빠진다 — 표는 문장 지시가 아니라 스키마가 강제하기 때문', () => {
    expect(buildContentJsonOutputFormat({ ...base, source: { includeSummaryTable: false } })).not.toContain('"summaryTable"');
  });

  it('홈피드는 원래 없다 (기존 규칙 유지)', () => {
    expect(buildContentJsonOutputFormat({ ...base, mode: 'homefeed', contentMode: 'homefeed', source: {} })).not.toContain('"summaryTable"');
  });
});

describe('④ 배선 — 한 곳도 빠지면 조용히 무시된다', () => {
  const renderer = readFileSync(new URL('../renderer/modules/contentGeneration.ts', import.meta.url), 'utf8');
  const generator = readFileSync(new URL('../contentGenerator.ts', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../../public/index.html', import.meta.url), 'utf8');

  const fullAuto = readFileSync(new URL('../renderer/modules/fullAutoFlow.ts', import.meta.url), 'utf8');
  const multiAccount = readFileSync(new URL('../renderer/modules/multiAccountManager.ts', import.meta.url), 'utf8');

  it('⭐ 체크박스 → 생성 경로 payload → main → ContentSource', () => {
    expect(html).toContain('id="unified-summary-table"');
    expect(html).toContain('checked');                                   // 기본 ON
    expect(renderer).toContain('export function readSummaryTableOptionFromUi()');
    // 읽는 곳은 한 함수로 모은다 — 경로가 여럿이라 각자 읽으면 한 곳이 빠져도 모른다
    expect(renderer.match(/includeSummaryTable: readSummaryTableOptionFromUi\(\)/g)).toHaveLength(2);
    expect(main).toContain("(payload.assembly as any).includeSummaryTable === false");
    expect(main).toContain('source.includeSummaryTable = false');
    expect(generator).toContain('includeSummaryTable?: boolean;');
  });

  it('⭐ 연속발행·다계정도 같은 체크박스를 따른다 — 한 곳이 빠지면 거기만 표가 계속 나온다', () => {
    expect(fullAuto).toContain("import { fillSemiAutoFields, readSummaryTableOptionFromUi } from './contentGeneration.js';");
    expect(fullAuto).toContain('includeSummaryTable: readSummaryTableOptionFromUi(),');
    expect(multiAccount).toContain("import { readSummaryTableOptionFromUi } from './contentGeneration.js';");
    expect(multiAccount).toContain('contentPayload.assembly.includeSummaryTable = readSummaryTableOptionFromUi();');
  });

  it('⭐ 끄면 조립도 막고, 프롬프트의 요약 표 지시도 취소한다', () => {
    expect(generator).toContain('const summaryTableOn = source.includeSummaryTable !== false;');
    expect(generator).toContain('[표 설정 — 위 규칙보다 우선]');
    expect(generator).toContain('도입부에 마크다운 표');
  });

  /**
   * [2026-09-16] 표를 도입부 뒤로 옮기면서 프롬프트의 규칙 제목이 바뀌었다.
   * 취소문은 그 제목을 **따옴표로 그대로 인용**해 "이 규칙은 적용하지 않는다"고 말한다.
   * 제목만 바뀌고 취소문이 안 따라오면 모델이 짚을 대상을 못 찾아 체크박스가 조용히 무력화된다.
   */
  it('⭐ 취소문이 인용하는 규칙 이름이 프롬프트에 실제로 있다', () => {
    const prompt = readFileSync(new URL('../prompts/shared/fact-brief-header.prompt', import.meta.url), 'utf8');
    const quoted = generator.match(/앞의 \[BRIEF-HEAD\] 중 "([^"]+)" 규칙은 적용하지 않는다/);
    expect(quoted, '취소문을 찾지 못했다').not.toBeNull();
    expect(prompt).toContain(quoted![1]!);
  });

  it('체크박스가 없어도 켠 것으로 본다 (구버전 화면 보호)', () => {
    const fn = renderer.slice(renderer.indexOf('export function readSummaryTableOptionFromUi()'));
    expect(fn.slice(0, 260)).toContain('el ? el.checked === true : true');
  });
});
