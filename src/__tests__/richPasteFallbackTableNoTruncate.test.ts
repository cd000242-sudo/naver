/**
 * richPasteFallbackTableNoTruncate.test.ts
 *
 * [2026-09-30 owner screenshot] The fallback "확인 포인트" table (built when prose says
 * "아래 표" but no markdown table exists) cut every cell at 59 chars and appended "...":
 *   "토트넘 매칭 라이트 요구는 복귀 가능성을 완전히 닫지 않았다는 뜻이지, 복귀 결정은 아닙니다. 실제로 작동..."
 * Owner: "줄바꿈으로 깔끔하게 정리해주면되자나 ...으로 짜르거나 흐리지말고".
 * Cells already wrap (word-break:keep-all / overflow-wrap:break-word), so the full
 * sentence goes in and the layout handles the line breaks.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildMobileRichHtml } from '../automation/richTextPaste';

const LONG_ONE = '토트넘 매칭 라이트 요구는 복귀 가능성을 완전히 닫지 않았다는 뜻이지, 복귀 결정은 아닙니다. 실제로 작동하려면 조건이 더 필요합니다.';
const LONG_TWO = '케인 뮌헨 재계약 탈출 조항 요구는 잔류와 결별 중 하나를 고른 행동이 아니라, 장기 계약 속에 미래의 선택지를 남겨 두는 방식입니다.';

describe('대체 표 셀은 자르지 않는다', () => {
  it('62자를 넘는 문단도 셀에 통째로 들어가고 "..." 꼬리가 붙지 않는다', () => {
    const body = [
      '아래 표를 보면 지금 상황을 한 번에 확인할 수 있어요.',
      '',
      LONG_ONE,
      '',
      '케인의 발언은 협상이 가까워졌다는 데까지이고, 최종 조건은 새 계약이 나와야 알 수 있습니다.',
      '',
      LONG_TWO,
    ].join('\n');
    const { html } = buildMobileRichHtml(body, { highlight: false });
    const cells = [...html.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);

    expect(LONG_ONE.length).toBeGreaterThan(62);
    expect(cells.length).toBeGreaterThanOrEqual(3);
    expect(cells).toContain(LONG_ONE);
    expect(cells).toContain(LONG_TWO);
    cells.forEach((cell) => {
      expect(cell.endsWith('...')).toBe(false);
      expect(cell.endsWith('…')).toBe(false);
    });
  });

  it('source: 대체 표 셀에 글자 수 절단 코드가 없다', () => {
    const src = readFileSync(resolve(__dirname, '../automation/richTextPaste.ts'), 'utf-8');
    const start = src.indexOf('function trimFallbackTableCell(');
    expect(start).toBeGreaterThan(0);
    const fn = src.slice(start, src.indexOf('\n}', start));
    expect(fn).not.toMatch(/slice\(0,\s*\d+\)|substring\(0,\s*\d+\)|\.\.\.'|…/u);
  });
});
