import { describe, expect, it, vi } from 'vitest';
import { gstopCreateLedger, gstopSlotKey } from '../generationStop/stageGate.js';
import { gstopFillShoppingSlots } from '../generationStop/shoppingSlots.js';
import { gsPrefetchMatchImages } from '../image/fullAuto/gensparkBodyPrefetch.js';

const items = [1, 2, 3, 4].map((n) => ({ heading: `H${n}`, originalIndex: n, isThumbnail: false }));
const img = (heading: string, id = heading) => ({ heading, filePath: `/img/${id}.png` });
const accept = (image: any, accepted: any[]) => !accepted.some((a) => a.filePath === image.filePath);
const base = { items, accept, match: gsPrefetchMatchImages, isEngineLevelError: (e: unknown) => /rate_limited/.test(String(e)) };

describe('쇼핑 묶음: 빠진 칸만 같은 엔진으로 한 장씩', () => {
  it('묶음이 3/4장만 오면 빠진 한 칸만 한 장씩 다시 만든다', async () => {
    const ledger = gstopCreateLedger();
    const batch = vi.fn(async () => [img('H1'), img('H2'), img('H3')]);
    const single = vi.fn(async (item: any) => img(item.heading));
    const out = await gstopFillShoppingSlots({ ...base, ledger, batch, single });
    expect(batch).toHaveBeenCalledTimes(1);
    expect(single).toHaveBeenCalledTimes(1);
    expect(single.mock.calls[0][0].heading).toBe('H4');
    expect(out.missing).toEqual([]);
    expect(out.images.map((i: any) => i.heading)).toEqual(['H1', 'H2', 'H3', 'H4']);
  });

  it('한 장씩도 실패하면 missing 으로 돌려주고, 만든 칸은 장부에 남는다', async () => {
    const ledger = gstopCreateLedger();
    const out = await gstopFillShoppingSlots({ ...base, ledger, batch: async () => [img('H1')], single: async () => null, slotAttempts: 2 });
    expect(out.missing.map((m: any) => m.heading)).toEqual(['H2', 'H3', 'H4']);
    expect(ledger.get(gstopSlotKey(items[0]))).toBeTruthy();
    expect(ledger.size).toBe(1);
  });

  it('중복 결과(같은 파일)는 받지 않고 그 칸을 다시 만든다', async () => {
    const ledger = gstopCreateLedger();
    const single = vi.fn(async (item: any) => img(item.heading));
    const out = await gstopFillShoppingSlots({ ...base, ledger, batch: async () => [img('H1', 'same'), img('H2', 'same'), img('H3'), img('H4')], single });
    expect(single).toHaveBeenCalledTimes(1);
    expect(out.missing).toEqual([]);
  });

  it('한도·로그인 같은 엔진 단위 오류는 다시 던진다(창으로 넘기기 위해)', async () => {
    const ledger = gstopCreateLedger();
    const error = new Error('원인 코드: rate_limited');
    await expect(gstopFillShoppingSlots({ ...base, ledger, batch: async () => { throw error; }, single: async () => null })).rejects.toBe(error);
    const single = vi.fn(async () => { throw error; });
    await expect(gstopFillShoppingSlots({ ...base, ledger: gstopCreateLedger(), batch: async () => [img('H1')], single })).rejects.toBe(error);
    expect(single).toHaveBeenCalledTimes(1); // 같은 한도에 두 번 부르지 않는다
  });

  it('엔진 단위가 아닌 묶음 오류는 삼키고 한 장씩으로 넘어간다', async () => {
    const ledger = gstopCreateLedger();
    const single = vi.fn(async (item: any) => img(item.heading));
    const out = await gstopFillShoppingSlots({ ...base, ledger, batch: async () => { throw new Error('시간 초과'); }, single });
    expect(single).toHaveBeenCalledTimes(4);
    expect(out.missing).toEqual([]);
  });

  it('이어 가기: 장부에 있는 칸은 건드리지 않고, 묶음 호출 없이 빠진 칸만 만든다', async () => {
    const ledger = gstopCreateLedger();
    for (const item of items.slice(0, 3)) ledger.set(gstopSlotKey(item), img(item.heading));
    const batch = vi.fn(async () => []);
    const single = vi.fn(async (item: any) => img(item.heading));
    const out = await gstopFillShoppingSlots({ ...base, ledger, batch, single });
    expect(batch).not.toHaveBeenCalled();
    expect(single).toHaveBeenCalledTimes(1);
    expect(out.images).toHaveLength(4);
  });

  it('중지 요청이 오면 더 만들지 않는다', async () => {
    const single = vi.fn(async (item: any) => img(item.heading));
    await gstopFillShoppingSlots({ ...base, ledger: gstopCreateLedger(), batch: async () => [], single, stopCheck: () => true });
    expect(single).not.toHaveBeenCalled();
  });
});
