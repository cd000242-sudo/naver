import { describe, expect, it } from 'vitest';
import { normalizeBarePipeTables } from '../automation/barePipeTable.js';
import { buildMobileRichHtml, pickRichArticleThemes } from '../automation/richTextPaste.js';

// Live run 2026-11-26 (owner, a post written in Claude and pasted): the table arrived as
//   "구분 | iX4 50 xDrive | iX3 50 xDrive" / blank line / "차체 | 쿠페형 … | …" — no outer pipes, no |---| row.
// The paste builder logged "표 0개" and each row was published as a "a · b · c" sentence ("표가 벗겨져서 발행").
const BARE = [
  '국가별로 발표된 가격은 아래와 같습니다.',
  '',
  '국가 | 트림 | 가격',
  '',
  '미국 | 50 xDrive | 6만 달러대',
  '',
  '독일 | 50 xDrive | 7만 유로대',
  '',
  '표 아래 문단입니다.',
].join('\n');

describe('normalizeBarePipeTables', () => {
  it('turns bare pipe rows (blank lines between them) into one markdown table', () => {
    const out = normalizeBarePipeTables(BARE);
    expect(out).toContain('| 국가 | 트림 | 가격 |\n| --- | --- | --- |\n| 미국 | 50 xDrive | 6만 달러대 |\n| 독일 | 50 xDrive | 7만 유로대 |');
    expect(out.startsWith('국가별로 발표된 가격은 아래와 같습니다.\n\n| 국가')).toBe(true);
    expect(out.endsWith('\n\n표 아래 문단입니다.')).toBe(true);
  });

  it('accepts rows on consecutive lines and drops a bare divider row', () => {
    const out = normalizeBarePipeTables('구분 | A | B\n--- | --- | ---\n차체 | 쿠페형 | SUV\n길이 | 4.7m | 4.8m');
    expect(out).toBe('| 구분 | A | B |\n| --- | --- | --- |\n| 차체 | 쿠페형 | SUV |\n| 길이 | 4.7m | 4.8m |');
  });

  it('a two-column table needs three rows; three columns need two', () => {
    expect(normalizeBarePipeTables('항목 | 값\n무게 | 1kg\n길이 | 2m')).toContain('| --- | --- |');
    expect(normalizeBarePipeTables('항목 | 값\n무게 | 1kg')).toBe('항목 | 값\n무게 | 1kg');
    expect(normalizeBarePipeTables('가 | 나 | 다\n1 | 2 | 3')).toContain('| --- | --- | --- |');
  });

  it('leaves prose, real markdown tables and uneven rows alone', () => {
    const prose = '가격 | 성능 | 디자인 세 가지를 차례로 봅니다.';
    expect(normalizeBarePipeTables(prose)).toBe(prose);
    const real = '| 구분 | 내용 |\n| --- | --- |\n| 가 | 나 |';
    expect(normalizeBarePipeTables(real)).toBe(real);
    const uneven = '가 | 나 | 다\n1 | 2\n3 | 4 | 5 | 6';
    expect(normalizeBarePipeTables(uneven)).toBe(uneven);
    expect(normalizeBarePipeTables('')).toBe('');
  });

  it('a different column count starts a new table instead of merging', () => {
    const out = normalizeBarePipeTables('가 | 나 | 다\n1 | 2 | 3\n\n항목 | 값\n무게 | 1kg\n길이 | 2m');
    expect(out).toContain('| 가 | 나 | 다 |\n| --- | --- | --- |\n| 1 | 2 | 3 |');
    expect(out).toContain('| 항목 | 값 |\n| --- | --- |\n| 무게 | 1kg |\n| 길이 | 2m |');
  });
});

describe('paste builder', () => {
  it('publishes the pasted bare table as a table, not as sentences', () => {
    const themes = pickRichArticleThemes(() => 0);
    const result = buildMobileRichHtml(BARE, { ...themes });
    expect(result.tableCount).toBe(1);
    expect(result.html).toContain('<table');
    expect(result.html).toContain('6만 달러대');
    expect(result.plainText).not.toContain('국가 · 트림 · 가격');
  });
});
