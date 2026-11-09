/**
 * [2026-11-10] A customer on a slow PC picked a place and enabled the map option, yet no map was inserted.
 * The search results were read exactly once, 250ms after Enter, so a slow result list looked like "0 candidates".
 */
import { describe, expect, it, vi } from 'vitest';
import { pollPlaceCards } from '../automation/placeHelpers';

const target = { index: 0, title: '화개정원', address: '인천 강화군 교동면' };
const other = { index: 0, title: '다른 가게', address: '서울' };
const pickTarget = (cards: Array<typeof target>) => cards.find((c) => c.title === '화개정원') ?? null;

function sequence(...steps: Array<Array<typeof target>>) {
  let i = 0;
  return vi.fn(async () => steps[Math.min(i++, steps.length - 1)]);
}
const noWait = async () => undefined;

describe('장소 검색 결과 기다리기', () => {
  it('느린 PC — 처음 몇 번 비어 있어도 결과가 뜰 때까지 기다린다', async () => {
    const read = sequence([], [], [], [target]);
    const result = await pollPlaceCards(read, pickTarget, noWait, { timeoutMs: 8000, intervalMs: 400 });
    expect(result.picked).toEqual(target);
    expect(read).toHaveBeenCalledTimes(4);
  });

  it('일치하는 카드를 찾으면 바로 끝낸다', async () => {
    const read = sequence([target]);
    const result = await pollPlaceCards(read, pickTarget, noWait, { timeoutMs: 8000, intervalMs: 400 });
    expect(result.picked).toEqual(target);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('결과가 안정됐는데 일치가 없으면 시간을 끌지 않고 포기한다 (엉뚱한 장소 금지)', async () => {
    const read = sequence([other], [other], [other]);
    const result = await pollPlaceCards(read, pickTarget, noWait, { timeoutMs: 8000, intervalMs: 400 });
    expect(result.picked).toBeNull();
    expect(result.cards).toEqual([other]);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('끝까지 비어 있으면 제한 시간에 멈춘다', async () => {
    let clock = 0;
    const read = sequence([]);
    const wait = async (ms: number) => { clock += ms; };
    const result = await pollPlaceCards(read, pickTarget, wait, { timeoutMs: 2000, intervalMs: 400, now: () => clock });
    expect(result.picked).toBeNull();
    expect(result.cards).toEqual([]);
    expect(clock).toBeGreaterThanOrEqual(2000);
    expect(clock).toBeLessThan(2800);
  });

  it('발행 코드가 결과를 한 번만 읽지 않고 기다리는 함수를 쓴다', async () => {
    const { readFileSync } = await import('fs');
    const { resolve } = await import('path');
    const source = readFileSync(resolve(__dirname, '..', 'automation', 'placeHelpers.ts'), 'utf8');
    expect(source).toContain('await pollPlaceCards(');
    expect(source).not.toMatch(/const cards = await readPlaceCards\(frame\);/);
  });
});
