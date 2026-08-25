import { describe, expect, it } from 'vitest';

import { buildMobileRichHtml } from '../automation/richTextPaste';

/**
 * [2026-08-25 사용자 실측] 쇼핑커넥트 글에서 표의 마지막 행이 표 밖으로 새어
 * 본문 평문으로 발행됐다.
 *
 *   "주의 요소 — 해체·세척 가이드 미흡, 짧은 전원 케이블, 아래 방향 각도 조절 불가
 *    종합하면 오아 메가에어라이트 써큘레이터는 샌드크림..."
 *
 * 원인: LLM 이 마지막 행과 뒤따르는 문장을 한 줄에 붙여 썼다.
 *   "| 주의 요소 | ... 불가 | 종합하면 오아 메가에어라이트..."
 * 표 행 판정은 줄이 '|' 로 끝나야 행으로 보므로 이 줄은 행이 아니게 되고, 표 블록에
 * 못 들어간 채 normalizeOrphanPipeLine 이 "주의 요소 — ..." 문장으로 눌렀다.
 * 결과적으로 표에서 한 행이 통째로 사라진다.
 */
const HEADER = '| 구분 | 내용 및 판단 기준 |';
const DIVIDER = '| --- | --- |';

function rowCount(html: string): number {
  return (html.match(/<tr>/g) || []).length;
}

function tableInnerHtml(html: string): string {
  const start = html.indexOf('<table');
  const end = html.indexOf('</table>');
  return start >= 0 && end > start ? html.slice(start, end) : '';
}

describe('표 행 + 뒤 문장이 한 줄에 붙고, 그 앞이 빈 줄로 끊긴 경우', () => {
  /*
   * 빈 줄이 결정적이다. 붙어 있기만 하면 블록 안에 남아 표로 들어가지만, 빈 줄로
   * 끊기면 별도 블록이 되고 isMarkdownTableBlock 이 (구분선이 없어) 거짓이 되어
   * 고아 처리로 넘어간다. 이어붙이기 로직은 '|' 로 끝나는 줄만 행으로 보므로
   * 뒤에 문장이 붙은 이 줄을 집어오지 못했다.
   *
   * 원본 코드 실측: tr=4(한 행 누락) + 고아 문장 발생. 수정 후 tr=5 / 고아 없음.
   */
  const body = [
    '아래 표로 정리했습니다.',
    '',
    HEADER,
    DIVIDER,
    '| 모터 및 소음 | BLDC 모터 탑재, 1~2단 극저소음 |',
    '| 부가 기능 | 수면등 겸용 무드등, 자석 리모컨 보관 |',
    '',
    '| 주의 요소 | 해체·세척 가이드 미흡, 짧은 전원 케이블 | 종합하면 무난한 선택입니다.',
  ].join('\n');

  const result = buildMobileRichHtml(body, { highlight: false });

  it('마지막 행이 표 안에 들어간다', () => {
    expect(tableInnerHtml(result.html)).toContain('주의 요소');
  });

  it('행 수가 맞는다 (헤더 1 + 본문 3)', () => {
    expect(rowCount(result.html)).toBe(4);
  });

  it('고아 문장("라벨 — 내용")으로 새지 않는다 (회귀 잠금)', () => {
    expect(result.plainText).not.toMatch(/주의 요소\s*—/);
  });

  it('뒤에 붙어 있던 문장은 버리지 않고 본문으로 남긴다', () => {
    expect(result.plainText).toContain('종합하면 무난한 선택입니다');
  });

  it('발행물에 파이프 문자가 남지 않는다', () => {
    expect(result.plainText).not.toContain('|');
  });
});

describe('정상 표는 그대로 (회귀)', () => {
  const body = [HEADER, DIVIDER, '| 모터 | BLDC |', '| 풍량 | 8단계 |'].join('\n');
  const result = buildMobileRichHtml(body, { highlight: false });

  it('정상 행을 첫 파이프에서 가르지 않는다', () => {
    // 작성 중 실측: 백트래킹 때문에 "| 구분 | 내용 |"이 "| 구분 |" + "내용 |"으로
    // 갈려 표가 통째로 망가졌다. 이 테스트가 그걸 잡는다.
    const inner = tableInnerHtml(result.html);
    expect(inner).toContain('내용 및 판단 기준');
    expect(inner).toContain('BLDC');
    expect(rowCount(result.html)).toBe(3);
  });

  it('표가 하나로 유지된다', () => {
    expect(result.tableCount).toBe(1);
  });
});

describe('가르지 말아야 할 경우', () => {
  it('뒤에 파이프가 또 있으면 가르지 않는다 (3열 표)', () => {
    const body = ['| A | B | C |', '| --- | --- | --- |', '| 1 | 2 | 3 |'].join('\n');
    const result = buildMobileRichHtml(body, { highlight: false });
    expect(result.tableCount).toBe(1);
    expect(rowCount(result.html)).toBe(2);
    expect(tableInnerHtml(result.html)).toContain('3');
  });

  it('꼬리가 한 글자면 가르지 않는다 (오탐 방지)', () => {
    const body = [HEADER, DIVIDER, '| 모터 | BLDC | x'].join('\n');
    const result = buildMobileRichHtml(body, { highlight: false });
    expect(result.plainText).not.toContain('|');
  });

  it('파이프가 없는 평범한 문단은 건드리지 않는다', () => {
    const result = buildMobileRichHtml('그냥 문장입니다. 표가 아닙니다.', { highlight: false });
    expect(result.tableCount).toBe(0);
    expect(result.plainText).toContain('그냥 문장입니다');
  });
});
