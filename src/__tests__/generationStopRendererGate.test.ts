// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { gstopCreateLedger, GstopHaltedError } from '../generationStop/stageGate';
import {
  generationStopEndRun,
  generationStopImageEngineForRun,
  generationStopImageEngines,
  generationStopResolveFailure,
  generationStopRunStage,
  type GenerationStopGateDeps,
} from '../renderer/modules/generationStopGate';

const limit = () => new Error('Codex 생성 실패 (원인 코드: rate_limited). 11월 24일 15시 20분 이후 다시 시도');
function deps(over: Partial<GenerationStopGateDeps> = {}): GenerationStopGateDeps & { saved: any[]; removed: string[] } {
  const saved: any[] = []; const removed: string[] = [];
  return {
    saved, removed,
    ask: vi.fn(async () => ({ kind: 'same' as const })),
    saveRecord: async (record, notify) => { saved.push({ record, notify }); },
    removeRecord: async (id) => { removed.push(id); },
    isHidden: () => false,
    applyEngine: vi.fn(async () => undefined),
    engines: () => [{ value: 'nano-banana-2', label: '나노바나나2' }],
    ...over,
  };
}

describe('멈춤 관문(렌더러)', () => {
  it('멈추면 기록을 먼저 저장하고, 이어 가 성공하면 그 기록을 지운다', async () => {
    const d = deps();
    let n = 0;
    const ledger = gstopCreateLedger();
    ledger.set('k', { filePath: '/a.png' });
    const out = await generationStopRunStage('image', 'codex-image', { kind: 'continuous', label: '글 A', ledger, recordId: 'r1' },
      async () => { if (++n === 1) throw limit(); return 'ok'; }, d);
    expect(out.value).toBe('ok');
    expect(d.saved).toHaveLength(1);
    expect(d.saved[0].record).toMatchObject({ id: 'r1', kind: 'continuous', stage: 'image', cause: 'limit', ledger: [{ key: 'k', image: { filePath: '/a.png' } }] });
    expect(d.saved[0].notify).toBe(false);
    expect(d.removed).toEqual(['r1']);
  });

  it('창이 숨겨져 있으면(트레이·최소화) 기록과 함께 알림을 보낸다', async () => {
    const d = deps({ isHidden: () => true });
    let n = 0;
    await generationStopRunStage('text', 'agent-codex', { kind: 'full-auto', label: 'x' }, async () => { if (++n === 1) throw limit(); return 1; }, d);
    expect(d.saved[0].notify).toBe(true);
  });

  it('다른 모델: 고른 엔진으로만 이어 가고 applyEngine 에 저장 선택을 넘긴다', async () => {
    const d = deps({ ask: vi.fn(async () => ({ kind: 'switch' as const, engine: 'nano-banana-2', persist: true })) });
    const seen: string[] = [];
    await generationStopRunStage('image', 'codex-image', { kind: 'multi', label: 'x', shopping: true }, async (e) => { seen.push(e); if (seen.length === 1) throw limit(); return 1; }, d);
    expect(seen).toEqual(['codex-image', 'nano-banana-2']);
    expect(d.applyEngine).toHaveBeenCalledWith('image', 'nano-banana-2', true, expect.objectContaining({ shopping: true }));
  });

  it('여기서 멈추기: 기록은 남기고(지우지 않고) 멈춤 오류를 던진다', async () => {
    const d = deps({ ask: vi.fn(async () => ({ kind: 'halt' as const })) });
    const err = await generationStopRunStage('image', 'codex-image', { kind: 'continuous', label: 'x', recordId: 'r2' }, async () => { throw limit(); }, d).catch((e) => e);
    expect(err).toBeInstanceOf(GstopHaltedError);
    expect(d.saved).toHaveLength(1);
    expect(d.removed).toEqual([]);
  });

  it('창을 띄울 수 없는 실행(unattended): 묻지 않고, 기록+알림, 엔진은 그대로', async () => {
    const d = deps();
    const run = vi.fn(async () => { throw limit(); });
    const err = await generationStopRunStage('image', 'codex-image', { kind: 'daily', label: 'x', unattended: true }, run, d).catch((e) => e);
    expect((err as GstopHaltedError).reason).toBe('unattended');
    expect(d.ask).not.toHaveBeenCalled();
    expect(d.applyEngine).not.toHaveBeenCalled();
    expect(d.saved[0].notify).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe('엔진 목록', () => {
  it('이미지 목록은 실패한 엔진을 뺀다', () => {
    const list = generationStopImageEngines('codex-image');
    expect(list.map((e) => e.value)).not.toContain('codex-image');
    expect(list.map((e) => e.value)).toContain('nano-banana-2');
  });

  it('이번만 고른 이미지 엔진은 건너뛰기·내 폴더 같은 값은 바꾸지 않는다', async () => {
    const d = deps({ ask: vi.fn(async () => ({ kind: 'switch' as const, engine: 'flow', persist: false })) });
    let n = 0;
    // applyEngine mock 은 상태를 바꾸지 않으므로, 실제 적용 함수 대신 기본 관문의 규칙만 확인한다.
    expect(generationStopImageEngineForRun('skip')).toBe('skip');
    expect(generationStopImageEngineForRun('codex-image')).toBe('codex-image');
    await generationStopRunStage('image', 'codex-image', { kind: 'multi', label: 'x' }, async () => { if (++n === 1) throw limit(); return 1; }, d);
  });
});

describe('인라인 관문(단일 풀오토의 재시도 루프용)', () => {
  it('같은 모델: 같은 엔진을 돌려준다', async () => {
    const d = deps();
    expect(await generationStopResolveFailure('image', 'codex-image', limit(), { kind: 'full-auto', label: 'x', noRecord: true }, d)).toBe('codex-image');
  });

  it('다른 모델: 고른 엔진을 돌려주고 적용 함수에 저장 선택을 넘긴다', async () => {
    const d = deps({ ask: vi.fn(async () => ({ kind: 'switch' as const, engine: 'flow', persist: false })) });
    expect(await generationStopResolveFailure('image', 'codex-image', limit(), { kind: 'full-auto', label: 'x', noRecord: true }, d)).toBe('flow');
    expect(d.applyEngine).toHaveBeenCalledWith('image', 'flow', false, expect.anything());
  });

  it('여기서 멈추기·창 없음: 멈춤 오류, 창 없는 실행은 묻지 않는다', async () => {
    const halt = deps({ ask: vi.fn(async () => ({ kind: 'halt' as const })) });
    await expect(generationStopResolveFailure('text', 'agent-codex', limit(), { kind: 'full-auto', label: 'x' }, halt)).rejects.toBeInstanceOf(GstopHaltedError);
    const none = deps();
    const err = await generationStopResolveFailure('text', 'agent-codex', limit(), { kind: 'full-auto', label: 'x', unattended: true }, none).catch((e) => e);
    expect((err as GstopHaltedError).reason).toBe('unattended');
    expect(none.ask).not.toHaveBeenCalled();
  });

  it('창을 띄우지 않는 오류(취소)는 원래 오류를 그대로 던진다', async () => {
    const cancel = new Error('사용자가 작업을 취소했습니다.');
    await expect(generationStopResolveFailure('image', 'x', cancel, { kind: 'full-auto', label: 'x' }, deps())).rejects.toBe(cancel);
  });
});

describe('앱 시작 때 글 엔진 복원(이번만 표식)', () => {
  const KEY = 'generationStop.textRestore.v1';

  it('표식이 있으면 원래 엔진으로 되돌리고 표식을 지운다', async () => {
    localStorage.setItem(KEY, 'agent-claude');
    const apply = vi.fn(async () => undefined);
    await generationStopEndRun({ apply });
    expect(apply).toHaveBeenCalledWith('agent-claude', expect.any(String));
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('표식이 없으면 아무것도 바꾸지 않는다', async () => {
    localStorage.removeItem(KEY);
    const apply = vi.fn(async () => undefined);
    await generationStopEndRun({ apply });
    expect(apply).not.toHaveBeenCalled();
  });

  it('복원이 실패해도 던지지 않고 표식을 남겨 다음 시작 때 다시 시도한다', async () => {
    localStorage.setItem(KEY, 'agent-claude');
    await expect(generationStopEndRun({ apply: async () => { throw new Error('저장 실패'); } })).resolves.toBeUndefined();
    expect(localStorage.getItem(KEY)).toBe('agent-claude');
    localStorage.removeItem(KEY);
  });
});
