// [2026-10-11 실측] 젠스파크 모델 메뉴는 항목이 먼저 그려지고 'No credit cost' 배지가 뒤늦게 붙는다.
//   항목이 하나라도 보이면 바로 비교하던 앱이 배지 없는 순간을 읽어 무제한 모델을 "크레딧 차감"으로 오판했고(6장 배치 실패),
//   37초 뒤 같은 모델이 그대로 성공했다. 가짜 page·가짜 시계만 사용(실제 브라우저·네트워크 없음).
import { describe, expect, it } from 'vitest';
import { submitGensparkPrompt } from '../image/genspark/gensparkSubmit';
import type { GensparkSubmitDeps } from '../image/genspark/gensparkSubmit';
import { gensparkReadSettledMenu } from '../image/genspark/gensparkSubmitSteps';
import { gensparkFindModelById } from '../image/genspark/gensparkModels';
import { readGensparkModelMenu } from '../image/genspark/gensparkSelectors';
import { GensparkError } from '../image/genspark/gensparkErrors';
import { createFakeClock, createFakePage, newFakeState } from './gensparkFakePage';
import type { FakeMenuItem, FakePage, FakeState } from './gensparkFakePage';

const model = gensparkFindModelById('gpt-image-2.5')!;
const req = { index: 0, prompt: '시험 프롬프트', ratio: '1:1' };
const menu = (label: string, creditFree: boolean): FakeMenuItem => ({ label, creditFree, needsInput: false, isNew: false });

/** 메뉴를 afterReads 번 읽은 뒤부터 items 로 바뀌는 page — 배지가 늦게 그려지는 화면 흉내. */
function withLateMenu(page: FakePage, afterReads: number, items: FakeMenuItem[]): FakePage {
  let reads = 0;
  const evaluate = page.evaluate;
  return {
    ...page,
    evaluate: (async (fn: (arg: never) => unknown, arg?: unknown) => {
      if (fn === readGensparkModelMenu && ++reads > afterReads) page.state.menuItems = items;
      return evaluate(fn as never, arg as never);
    }) as FakePage['evaluate'],
  };
}

function setup(patch: Partial<FakeState> = {}) {
  const state: FakeState = { ...newFakeState(), selected: 'Nano Banana 2 Flash Lite', menuItems: [menu('GPT Image 2.5', false)], ...patch };
  const page = createFakePage(state);
  const logs: string[] = [];
  const deps: GensparkSubmitDeps = { ...createFakeClock(), seenJobIds: new Set(), log: (m) => logs.push(m) };
  return { state, page, deps, logs };
}
async function codeOf(p: Promise<unknown>): Promise<string> {
  try { await p; } catch (e) { return e instanceof GensparkError ? e.code : `OTHER:${String(e)}`; }
  return 'NO_ERROR';
}

describe('gensparkReadSettledMenu', () => {
  it('항목이 보여도 두 번 연속 같은 내용일 때만 돌려준다(배지가 늦게 붙으면 바뀐 뒤 내용)', async () => {
    const { state, page, deps } = setup({ menuOpen: true });
    const late = withLateMenu(page, 1, [menu('GPT Image 2.5', true)]);
    expect(await gensparkReadSettledMenu(late, deps)).toEqual([menu('GPT Image 2.5', true)]);
    expect(state.menuItems[0].creditFree).toBe(true);
  });

  it('메뉴가 끝내 안 열리면 시간이 지나 null', async () => {
    const { page, deps } = setup({ menuItems: [] });
    expect(await gensparkReadSettledMenu(page, deps, 1_000, 250)).toBeNull();
  });
});

describe('gensparkEnsureModel (submitGensparkPrompt 경유)', () => {
  it('무제한 배지가 늦게 붙어도 크레딧 정책 변경으로 보지 않고 모델을 고른다', async () => {
    const { state, page, deps } = setup();
    const late = withLateMenu(page, 4, [menu('GPT Image 2.5', true)]);
    const job = await submitGensparkPrompt(late, req, model, deps);
    expect(job.jobId).toBe('job-1');
    expect(state.selected).toBe('GPT Image 2.5');
  });

  it('기다려도 크레딧 표시가 계속 다르면 GENSPARK_MODEL_CREDIT_CHANGED 로 멈추고 메뉴 내용을 기록한다', async () => {
    const { state, page, deps, logs } = setup({ menuItems: [menu('GPT Image 2.5', false), menu('GPT Image 2', true)] });
    expect(await codeOf(submitGensparkPrompt(page, req, model, deps))).toBe('GENSPARK_MODEL_CREDIT_CHANGED');
    expect(state.selected).toBe('Nano Banana 2 Flash Lite');
    expect(state.sendClicked).toBe(false);
    expect(logs.join('\n')).toContain('GPT Image 2.5, GPT Image 2(무제한)');
  });
});
