// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { GENERATION_STOP_MODAL_ID, generationStopModalAsk, generationStopModalSameNote } from '../renderer/modules/generationStopModal';

const info = { stage: 'image', cause: 'limit', engine: 'codex-image', detail: 'x', resetAt: new Date(2026, 10, 24, 15, 20).getTime() } as const;
const engines = [{ value: 'nano-banana-2', label: '나노바나나2' }, { value: 'flow', label: 'Flow' }];
const buttons = () => Array.from(document.querySelectorAll<HTMLButtonElement>(`#${GENERATION_STOP_MODAL_ID} button`));
const byText = (text: string) => buttons().find((b) => b.textContent?.includes(text))!;

beforeEach(() => { document.body.innerHTML = ''; });

describe('멈춤 창', () => {
  it('한 줄 사유와 네 가지 선택을 보여 준다(자동 닫힘 없음)', () => {
    void generationStopModalAsk({ info, engines });
    const root = document.getElementById(GENERATION_STOP_MODAL_ID)!;
    expect(root.textContent).toContain('이미지 생성이 멈췄어요 · 코덱스 한도 초과 · 초기화 오후 3:20');
    expect(byText('같은 모델로 이어서')).toBeTruthy();
    expect(byText('다른 모델로 바꿔서 이어서')).toBeTruthy();
    expect(byText('여기서 멈추기')).toBeTruthy();
  });

  it('[같은 모델로 이어서] → same', async () => {
    const answer = generationStopModalAsk({ info, engines });
    byText('같은 모델로 이어서').click();
    expect(await answer).toEqual({ kind: 'same' });
    expect(document.getElementById(GENERATION_STOP_MODAL_ID)).toBeNull();
  });

  it('[여기서 멈추기] → halt', async () => {
    const answer = generationStopModalAsk({ info, engines });
    byText('여기서 멈추기').click();
    expect(await answer).toEqual({ kind: 'halt' });
  });

  it('다른 모델: 목록에서 고른 엔진, "설정에도 저장" 기본은 꺼짐(이번만)', async () => {
    const answer = generationStopModalAsk({ info, engines });
    byText('다른 모델로 바꿔서 이어서').click();
    const persist = document.querySelector<HTMLInputElement>('[data-gstop-persist]')!;
    expect(persist.checked).toBe(false);
    document.querySelector<HTMLInputElement>('input[value="flow"]')!.checked = true;
    byText('이 엔진으로 이어서').click();
    expect(await answer).toEqual({ kind: 'switch', engine: 'flow', persist: false });
  });

  it('저장 체크를 켜면 persist true', async () => {
    const answer = generationStopModalAsk({ info, engines });
    byText('다른 모델로 바꿔서 이어서').click();
    document.querySelector<HTMLInputElement>('[data-gstop-persist]')!.checked = true;
    byText('이 엔진으로 이어서').click();
    expect(await answer).toEqual({ kind: 'switch', engine: 'nano-banana-2', persist: true });
  });

  it('고를 엔진이 없으면 [다른 모델] 버튼을 만들지 않는다', () => {
    void generationStopModalAsk({ info, engines: [] });
    expect(buttons().some((b) => b.textContent?.includes('다른 모델'))).toBe(false);
  });

  it('한도 안내: 초기화 시각 전이면 시각을, 지났으면 지금 이어 갈 수 있다고 말한다', () => {
    const before = new Date(2026, 10, 24, 12, 0).getTime();
    expect(generationStopModalSameNote(info, before)).toContain('오후 3:20');
    expect(generationStopModalSameNote(info, info.resetAt + 1)).toContain('지금 이어 갈 수');
    expect(generationStopModalSameNote({ cause: 'login' }, before)).toBe('');
  });
});
