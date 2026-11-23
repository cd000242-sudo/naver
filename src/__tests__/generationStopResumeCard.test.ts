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
});
