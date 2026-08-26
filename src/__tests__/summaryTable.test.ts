import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  SUMMARY_TABLE_MAX_ROWS,
  normalizeSummaryRows,
  prependSummaryTable,
  renderSummaryTable,
} from '../content/summaryTable';

/**
 * [2026-08-26 사용자 실측] "표가 없는데?"
 *
 * 프롬프트로 "글 맨 앞에 표를 써라"고 지시했는데 두 번 연속 안 나왔다. 진단해 보니
 * 조립된 시스템 프롬프트가 40,377자였고 표 지시는 83% 지점(뒤쪽=강한 위치)에 있었다.
 * 위치 문제가 아니었다.
 *
 * 결정적 단서: 같은 프롬프트에서 해시태그는 나왔다(#김윤주권정열 조합형까지).
 * 해시태그는 JSON 스키마의 필드라 구조적으로 강제되고, 표는 본문에 마크다운으로
 * 써야 해서 흘렸다. 그래서 표도 스키마 필드로 옮기고 조립은 코드가 한다.
 */
describe('요약 표 렌더', () => {
  const rows = [
    { label: '기준일', value: '2026년 8월 26일' },
    { label: '당사자', value: '김윤주 · 권정열' },
    { label: '쟁점', value: '결혼 13년 차 부부의 투샷' },
  ];

  it('마크다운 2열 표로 만든다', () => {
    expect(renderSummaryTable(rows)).toBe(
      [
        '| 구분 | 내용 |',
        '| --- | --- |',
        '| 기준일 | 2026년 8월 26일 |',
        '| 당사자 | 김윤주 · 권정열 |',
        '| 쟁점 | 결혼 13년 차 부부의 투샷 |',
      ].join('\n'),
    );
  });

  it('도입부 앞에 붙인다 (첫 화면에서 사실이 먼저 보이게)', () => {
    const out = prependSummaryTable('결혼 13년 차 부부가 SNS에 투샷을 올렸습니다.', rows);
    expect(out.startsWith('| 구분 | 내용 |')).toBe(true);
    expect(out).toContain('결혼 13년 차 부부가 SNS에');
  });
});

describe('쓸 수 없는 표는 만들지 않는다', () => {
  it('2행 미만이면 버린다', () => {
    expect(renderSummaryTable([{ label: '기준일', value: '2026-08-26' }])).toBe('');
  });

  it('라벨이나 값이 비면 그 행을 뺀다', () => {
    const rows = [
      { label: '기준일', value: '2026-08-26' },
      { label: '', value: '값만 있음' },
      { label: '라벨만 있음', value: '' },
      { label: '당사자', value: '김윤주' },
    ];
    expect(normalizeSummaryRows(rows)).toHaveLength(2);
  });

  it('같은 라벨이 반복되면 하나만 남긴다 (정보 0 방지)', () => {
    const rows = [
      { label: '핵심', value: 'A' },
      { label: '핵심', value: 'B' },
      { label: '핵심', value: 'C' },
    ];
    // 중복 제거 후 1행 → 2행 미만이라 표 자체가 버려진다
    expect(renderSummaryTable(rows)).toBe('');
  });

  it('상한을 넘기면 앞에서부터 자른다', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ label: `축${i}`, value: `값${i}` }));
    expect(normalizeSummaryRows(many)).toHaveLength(SUMMARY_TABLE_MAX_ROWS);
  });

  it('배열이 아니면 조용히 넘어간다', () => {
    for (const bad of [undefined, null, '표', 42, {}]) {
      expect(renderSummaryTable(bad), String(bad)).toBe('');
    }
  });

  it('도입부는 표가 없어도 그대로 살아남는다', () => {
    expect(prependSummaryTable('도입부입니다.', [])).toBe('도입부입니다.');
  });
});

describe('표 깨짐 방지', () => {
  it('값에 든 파이프를 치환한다 (열이 밀리지 않게)', () => {
    const out = renderSummaryTable([
      { label: '구성', value: 'A | B | C' },
      { label: '기준일', value: '2026-08-26' },
    ]);
    expect(out).toContain('| 구성 | A / B / C |');
  });

  it('도입부에 이미 표가 있으면 겹쳐 넣지 않는다', () => {
    const intro = '| 구분 | 내용 |\n| --- | --- |\n| 기준일 | 어제 |';
    const out = prependSummaryTable(intro, [
      { label: '기준일', value: '오늘' },
      { label: '당사자', value: '누구' },
    ]);
    expect(out).toBe(intro);
  });
});

describe('배선 — 스키마와 생성 경로', () => {
  const schema = readFileSync(new URL('../contentGenerator/schema.ts', import.meta.url), 'utf8');
  const generator = readFileSync(new URL('../contentGenerator.ts', import.meta.url), 'utf8');
  const prompt = readFileSync(new URL('../prompts/shared/fact-brief-header.prompt', import.meta.url), 'utf8');

  it('JSON 스키마에 summaryTable 필드가 있다 (모델이 흘리지 못하게)', () => {
    expect(schema).toContain('"summaryTable"');
    expect(schema).toContain('"label"');
    expect(schema).toContain('"value"');
  });

  it('파싱 직후 도입부에 얹는다', () => {
    expect(generator).toMatch(/import \{ normalizeSummaryRows, prependSummaryTable \}/);
    expect(generator).toMatch(/prependSummaryTable\(parsed\.introduction, \(parsed as any\)\.summaryTable\)/);
  });

  it('프롬프트가 본문 대신 스키마 필드를 채우라고 말한다', () => {
    expect(prompt).toContain('summaryTable');
    expect(prompt).toContain('본문에 표를 직접 그리지 마라');
    expect(prompt).toContain('introduction 안에 파이프');
  });
});
