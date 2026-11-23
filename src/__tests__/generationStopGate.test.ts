import { describe, expect, it, vi } from 'vitest';
import { gstopCreateLedger, gstopRunStage, gstopSlotKey, GstopHaltedError } from '../generationStop/stageGate.js';
import type { GstopDecision, GstopInfo } from '../generationStop/stopClassifier.js';

const limit = () => new Error('Codex 생성 실패 (원인 코드: rate_limited).');

describe('멈춤 → 선택 → 이어 가기', () => {
  it('성공하면 창을 띄우지 않는다', async () => {
    const ask = vi.fn();
    const out = await gstopRunStage({ stage: 'image', engine: 'codex-image', run: async () => 'ok', ask });
    expect(out).toEqual({ value: 'ok', engine: 'codex-image' });
    expect(ask).not.toHaveBeenCalled();
  });

  it('창을 띄우지 않는 오류(취소)는 그대로 던진다', async () => {
    const ask = vi.fn();
    const cancel = new Error('사용자가 작업을 취소했습니다.');
    await expect(gstopRunStage({ stage: 'text', engine: 'agent-codex', run: async () => { throw cancel; }, ask })).rejects.toBe(cancel);
    expect(ask).not.toHaveBeenCalled();
  });

  it('[같은 모델로 이어서]: 같은 엔진으로 다시 돌린다', async () => {
    const seen: string[] = [];
    const run = vi.fn(async (engine: string) => { seen.push(engine); if (seen.length === 1) throw limit(); return 'done'; });
    const ask = vi.fn(async (): Promise<GstopDecision> => ({ kind: 'same' }));
    const out = await gstopRunStage({ stage: 'image', engine: 'codex-image', run, ask });
    expect(seen).toEqual(['codex-image', 'codex-image']);
    expect(out.value).toBe('done');
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it('[다른 모델로 바꿔서 이어서]: 고른 엔진으로만 다시 돌리고 저장 선택을 알린다', async () => {
    const seen: string[] = [];
    const onSwitch = vi.fn();
    const out = await gstopRunStage({
      stage: 'image', engine: 'codex-image',
      run: async (engine) => { seen.push(engine); if (seen.length === 1) throw limit(); return 'done'; },
      ask: async () => ({ kind: 'switch', engine: 'nano-banana-2', persist: false }),
      onSwitch,
    });
    expect(seen).toEqual(['codex-image', 'nano-banana-2']);
    expect(out.engine).toBe('nano-banana-2');
    expect(onSwitch).toHaveBeenCalledWith('nano-banana-2', false);
  });

  it('[여기서 멈추기]: 진행분은 그대로 두고 멈춤 오류를 던진다', async () => {
    const onStop = vi.fn();
    const promise = gstopRunStage({ stage: 'image', engine: 'codex-image', run: async () => { throw limit(); }, ask: async () => ({ kind: 'halt' }), onStop });
    await expect(promise).rejects.toBeInstanceOf(GstopHaltedError);
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('창을 띄울 수 없는 실행(ask 없음): 상태를 저장하고 멈춘다. 엔진은 바꾸지 않는다', async () => {
    const onStop = vi.fn();
    const run = vi.fn(async () => { throw limit(); });
    const err = await gstopRunStage({ stage: 'image', engine: 'codex-image', run, onStop }).catch((e) => e);
    expect(err).toBeInstanceOf(GstopHaltedError);
    expect((err as GstopHaltedError).reason).toBe('unattended');
    expect(run).toHaveBeenCalledTimes(1);
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('이어 가다 또 멈추면 다시 묻는다(몰래 반복하지 않는다)', async () => {
    let n = 0;
    const ask = vi.fn(async (): Promise<GstopDecision> => ({ kind: 'same' }));
    await gstopRunStage({ stage: 'text', engine: 'agent-codex', run: async () => { if (++n < 3) throw limit(); return 1; }, ask });
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it('onStop 에는 멈춤 정보가 간다', async () => {
    const infos: GstopInfo[] = [];
    await gstopRunStage({ stage: 'image', engine: 'codex-image', run: async () => { throw limit(); }, ask: async () => ({ kind: 'halt' }), onStop: (i) => { infos.push(i); } }).catch(() => undefined);
    expect(infos[0]).toMatchObject({ stage: 'image', cause: 'limit', engine: 'codex-image' });
  });
});

describe('진행분 보존: 이미지 장부', () => {
  it('성공한 칸은 장부에 남고, 다음 시도가 이어 받는다', async () => {
    const ledger = gstopCreateLedger();
    const items = [{ heading: 'A', originalIndex: 0, isThumbnail: true }, { heading: 'B', originalIndex: 1 }, { heading: 'C', originalIndex: 2 }];
    const made: string[] = [];
    const attempt = async (engine: string) => {
      for (const item of items) {
        const key = gstopSlotKey(item);
        if (ledger.get(key)) continue;
        if (engine === 'codex-image' && item.heading === 'C') throw limit();
        made.push(`${engine}:${item.heading}`);
        ledger.set(key, { heading: item.heading, filePath: `/x/${item.heading}.png` });
      }
      return ledger.values();
    };
    const out = await gstopRunStage({ stage: 'image', engine: 'codex-image', run: attempt, ask: async () => ({ kind: 'switch', engine: 'nano-banana-2', persist: false }) });
    expect(made).toEqual(['codex-image:A', 'codex-image:B', 'nano-banana-2:C']);
    expect(out.value).toHaveLength(3);
  });

  it('이어 가던 시도가 실패해도 장부는 줄지 않는다(직전 성공본 유지)', async () => {
    const ledger = gstopCreateLedger();
    ledger.set('k1', { filePath: '/a.png' });
    await gstopRunStage({ stage: 'image', engine: 'x', run: async () => { throw limit(); }, ask: async () => ({ kind: 'halt' }) }).catch(() => undefined);
    expect(ledger.size).toBe(1);
    expect(ledger.get('k1')).toEqual({ filePath: '/a.png' });
  });

  it('장부는 저장된 목록에서 복원된다', () => {
    const ledger = gstopCreateLedger([{ key: 'k', image: { filePath: '/z.png' } }]);
    expect(ledger.get('k')).toEqual({ filePath: '/z.png' });
    expect(ledger.entries()).toEqual([{ key: 'k', image: { filePath: '/z.png' } }]);
  });
});
