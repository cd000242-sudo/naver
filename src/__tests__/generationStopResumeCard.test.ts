// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { gstopBuildRecord } from '../generationStop/resumeRecord';
import {
  GENERATION_STOP_CARD_ID,
  generationStopResumeCardModel,
  generationStopResumeCardRefresh,
  type GenerationStopResumeCardDeps,
} from '../renderer/modules/generationStopResumeCard';

const info = { stage: 'image', cause: 'limit', engine: 'codex-image', detail: 'x' } as const;
const continuous = gstopBuildRecord({ kind: 'continuous', info, label: '키워드 B', id: 'continuous-q2', now: 5, stoppedItemId: 'q2',
  queue: [{ id: 'q1', status: 'completed' }, { id: 'q2', status: 'processing' }, { id: 'q3', status: 'pending' }] });
const daily = gstopBuildRecord({ kind: 'daily', info, label: '계정 A', id: 'daily-1', now: 4 });

function deps(records: unknown[]): GenerationStopResumeCardDeps & { removed: string[] } {
  const removed: string[] = [];
  return {
    removed,
    list: async () => records as never,
    remove: async (id) => { removed.push(id); },
    restoreQueue: vi.fn(() => 3),
    startQueue: vi.fn(async () => undefined),
  };
}
beforeEach(() => { document.body.innerHTML = ''; });

describe('이어서 발행 카드', () => {
  it('기록이 없으면 카드를 만들지 않는다', async () => {
    await generationStopResumeCardRefresh(deps([]));
    expect(document.getElementById(GENERATION_STOP_CARD_ID)).toBeNull();
  });

  it('연속발행 기록: 요약 한 줄 + 완료·멈춤·남음 + [이어서 발행]', async () => {
    await generationStopResumeCardRefresh(deps([continuous]));
    const card = document.getElementById(GENERATION_STOP_CARD_ID)!;
    expect(card.textContent).toContain('이미지 생성이 멈췄어요 · 코덱스 한도 초과');
    expect(card.textContent).toContain('완료 1 · 멈춤 1 · 남음 1');
    expect(card.textContent).toContain('이어서 발행');
  });

  it('[이어서 발행]: 대기열을 되돌리고, 기록을 지우고, 시작한다', async () => {
    const d = deps([continuous]);
    await generationStopResumeCardRefresh(d);
    (document.querySelector('[data-gstop-resume]') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 0));
    expect(d.restoreQueue).toHaveBeenCalledWith(expect.objectContaining({ id: 'continuous-q2' }));
    expect(d.removed).toEqual(['continuous-q2']);
    expect(d.startQueue).toHaveBeenCalledTimes(1);
  });

  it('매일 자동발행 기록: 안내만 하고 이어서 발행 버튼은 없다(무인 실행은 엔진을 바꾸지 않는다)', async () => {
    await generationStopResumeCardRefresh(deps([daily]));
    const card = document.getElementById(GENERATION_STOP_CARD_ID)!;
    expect(card.textContent).toContain('매일 자동발행');
    expect(card.querySelector('[data-gstop-resume]')).toBeNull();
    expect(card.querySelector('[data-gstop-dismiss]')).not.toBeNull();
  });

  it('[지우기]는 기록만 지운다', async () => {
    const d = deps([daily]);
    await generationStopResumeCardRefresh(d);
    (document.querySelector('[data-gstop-dismiss]') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 0));
    expect(d.removed).toEqual(['daily-1']);
  });

  it('실행 중이거나 멈춤 창이 열려 있으면 카드를 띄우지 않는다(이중 실행 방지)', async () => {
    await generationStopResumeCardRefresh({ ...deps([continuous]), busy: () => true });
    expect(document.getElementById(GENERATION_STOP_CARD_ID)).toBeNull();
  });

  it('모델은 최신 기록순 목록으로 만든다', () => {
    const model = generationStopResumeCardModel([daily, continuous]);
    expect(model.map((m) => m.id)).toEqual(['continuous-q2', 'daily-1']);
    expect(model[0].canResume).toBe(true);
    expect(model[1].canResume).toBe(false);
  });
  describe('다중계정 · 단일 풀오토 기록', () => {
    const multi = gstopBuildRecord({ kind: 'multi', info, label: '계정 A', id: 'multi-m2', now: 7, stoppedItemId: 'm2',
      queue: [{ id: 'm1', status: 'completed' }, { id: 'm2', status: 'pending' }] });
    const single = gstopBuildRecord({ kind: 'full-auto', info, label: '키워드 C', id: 'full-auto-1', now: 8, resumeData: { keywords: '키워드 C' } });
    const singleNoInputs = gstopBuildRecord({ kind: 'full-auto', info, label: '키워드 D', id: 'full-auto-2', now: 9 });
    const tick = () => new Promise((r) => setTimeout(r, 0));

    it('제목과 [이어서 발행]: 대기열(다중계정)·입력값(풀오토)이 있을 때만', () => {
      const rows = generationStopResumeCardModel([multi, single, singleNoInputs]);
      expect(rows.map((row) => [row.id, row.title, row.canResume])).toEqual([
        ['full-auto-2', '풀오토 발행', false], ['full-auto-1', '풀오토 발행', true], ['multi-m2', '다중계정 발행', true],
      ]);
      expect(rows[2].progress).toBe('완료 1 · 멈춤 1 · 남음 0');
    });

    it('[이어서 발행]: 그 모듈에 기록을 넘기고, 시작된 뒤에만 기록을 지운다', async () => {
      const d = { ...deps([multi]), resumeRun: vi.fn(async () => true) };
      await generationStopResumeCardRefresh(d);
      (document.querySelector('[data-gstop-resume]') as HTMLButtonElement).click();
      await tick(); await tick();
      expect(d.resumeRun).toHaveBeenCalledWith(expect.objectContaining({ id: 'multi-m2' }));
      expect(d.restoreQueue).not.toHaveBeenCalled();
      expect(d.removed).toEqual(['multi-m2']);
      expect(document.getElementById(GENERATION_STOP_CARD_ID)).toBeNull();
    });

    it('시작하지 못하면 기록과 카드를 그대로 둔다', async () => {
      const d = { ...deps([single]), resumeRun: vi.fn(async () => false) };
      await generationStopResumeCardRefresh(d);
      const button = document.querySelector('[data-gstop-resume]') as HTMLButtonElement;
      button.click();
      await tick(); await tick();
      expect(d.removed).toEqual([]);
      expect(document.getElementById(GENERATION_STOP_CARD_ID)).not.toBeNull();
      expect(button.disabled).toBe(false);
    });

    it('이어 가자마자 또 멈춰 새 기록이 저장됐으면 그 기록은 지우지 않는다', async () => {
      const records: unknown[] = [single];
      const d = { ...deps(records), list: async () => records as never,
        resumeRun: vi.fn(async () => { records[0] = { ...single, createdAt: single.createdAt + 5000 }; return true; }) };
      await generationStopResumeCardRefresh(d);
      (document.querySelector('[data-gstop-resume]') as HTMLButtonElement).click();
      await tick(); await tick();
      expect(d.removed).toEqual([]);
    });
  });
});
