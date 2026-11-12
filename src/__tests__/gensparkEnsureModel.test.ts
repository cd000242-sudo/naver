// [2026-10-11 실측] 젠스파크 모델 메뉴는 항목이 먼저 그려지고 배지가 뒤늦게 붙는다.
//   항목이 하나라도 보이면 바로 읽던 앱이 배지 없는 순간을 읽어 오판했고(6장 배치 실패), 37초 뒤 같은 모델이 그대로 성공했다.
// [2026-11-12 실측] 메뉴가 바뀌어 'No credit cost' 가 없어지고 모든 모델 옆에 크레딧 배수가 붙는다. 앱 표와 표시가 다르다고
//   GENSPARK_MODEL_CREDIT_CHANGED 로 멈추던 길을 없앴다 — 표시가 달라도 생성은 진행하고 로그 한 줄만 남긴다(사장님 결정).
//   가짜 page·가짜 시계만 사용(실제 브라우저·네트워크 없음).
import { describe, expect, it } from 'vitest';
import { submitGensparkPrompt } from '../image/genspark/gensparkSubmit';
import type { GensparkSubmitDeps } from '../image/genspark/gensparkSubmit';
import { gensparkCreditNote, gensparkReadSettledMenu } from '../image/genspark/gensparkSubmitSteps';
import { gensparkFindModelById, gensparkListModels } from '../image/genspark/gensparkModels';
import { readGensparkModelMenu } from '../image/genspark/gensparkSelectors';
import { GensparkError } from '../image/genspark/gensparkErrors';
import { createFakeClock, createFakePage, newFakeState } from './gensparkFakePage';
import type { FakeMenuItem, FakePage, FakeState } from './gensparkFakePage';

const model = gensparkFindModelById('gpt-image-2.5')!;
const req = { index: 0, prompt: '시험 프롬프트', ratio: '1:1' };
const menu = (label: string, creditFree: boolean, creditMultiplier?: string): FakeMenuItem => ({
  label, creditFree, needsInput: false, isNew: false, ...(creditMultiplier ? { creditMultiplier } : {}),
});

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
  const state: FakeState = { ...newFakeState(), selected: 'Nano Banana 2 Flash Lite', menuItems: [menu('GPT Image 2.5', false, '1×')], ...patch };
  const page = createFakePage(state);
  const logs: string[] = [];
  const entries: Array<{ label: string; creditFree: boolean }> = [];
  const deps: GensparkSubmitDeps = { ...createFakeClock(), seenJobIds: new Set(), log: (m) => logs.push(m), onModelMenuEntry: (e) => entries.push(e) };
  return { state, page, deps, logs, entries };
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

  it('배수 글자가 늦게 붙는 경우도 안정된 뒤 내용을 돌려준다', async () => {
    const { page, deps } = setup({ menuOpen: true, menuItems: [menu('GPT Image 2.5', false)] });
    const late = withLateMenu(page, 1, [menu('GPT Image 2.5', false, '1×')]);
    expect((await gensparkReadSettledMenu(late, deps))?.[0].creditMultiplier).toBe('1×');
  });

  it('메뉴가 끝내 안 열리면 시간이 지나 null', async () => {
    const { page, deps } = setup({ menuItems: [] });
    expect(await gensparkReadSettledMenu(page, deps, 1_000, 250)).toBeNull();
  });
});

describe('gensparkEnsureModel (submitGensparkPrompt 경유) — 크레딧 표시가 달라도 멈추지 않는다', () => {
  it('① 메뉴가 배수만 보여 줘도(무제한 아님) 모델을 고르고 전송한다 — 앱 표가 무제한이라 해도', async () => {
    const { state, page, deps } = setup();
    const job = await submitGensparkPrompt(page, req, { ...model, creditFree: true }, deps);
    expect(job.jobId).toBe('job-1');
    expect(state.selected).toBe('GPT Image 2.5');
    expect(state.sendClicked).toBe(true);
  });

  it('① 앱 표가 크레딧 차감인데 메뉴가 No credit cost 라고 해도 멈추지 않는다', async () => {
    const { state, page, deps } = setup({ menuItems: [menu('GPT Image 2.5', true)] });
    await submitGensparkPrompt(page, req, { ...model, creditFree: false }, deps);
    expect(state.selected).toBe('GPT Image 2.5');
    expect(state.sendClicked).toBe(true);
  });

  it('① 앱 표의 실제 항목(15개 전부)으로도 메뉴 표시와 상관없이 던지지 않는다', async () => {
    for (const m of gensparkListModels()) {
      const s = setup({ menuItems: [menu(m.menuLabel, !m.creditFree, '1×')] });
      expect(await codeOf(submitGensparkPrompt(s.page, req, m, s.deps)), m.id).toBe('NO_ERROR');
    }
  });

  it('무제한 배지가 늦게 붙어도 모델을 고른다(기다렸다가 안정된 내용을 본다)', async () => {
    const { state, page, deps } = setup();
    const late = withLateMenu(page, 4, [menu('GPT Image 2.5', true)]);
    const job = await submitGensparkPrompt(late, req, model, deps);
    expect(job.jobId).toBe('job-1');
    expect(state.selected).toBe('GPT Image 2.5');
  });

  it('GENSPARK_MODEL_CREDIT_CHANGED 로 멈추는 길이 없다 — 어떤 표시 조합에서도', async () => {
    for (const free of [true, false]) {
      for (const menuFree of [true, false]) {
        const { page, deps } = setup({ menuItems: [menu('GPT Image 2.5', menuFree, menuFree ? undefined : '1×'), menu('GPT Image 2', !menuFree)] });
        expect(await codeOf(submitGensparkPrompt(page, req, { ...model, creditFree: free }, deps))).toBe('NO_ERROR');
      }
    }
  });

  it('메뉴에 모델 이름이 없으면 여전히 GENSPARK_MODEL_NOT_FOUND (다른 모델로 몰래 바꾸지 않음)', async () => {
    const { state, page, deps } = setup({ menuItems: [menu('GPT Image 2', false, '1×')] });
    expect(await codeOf(submitGensparkPrompt(page, req, model, deps))).toBe('GENSPARK_MODEL_NOT_FOUND');
    expect(state.selected).toBe('Nano Banana 2 Flash Lite');
    expect(state.sendClicked).toBe(false);
  });

  it('메뉴에서 읽은 크레딧 표시를 로그 한 줄로 알린다(배수가 있으면 포함)', async () => {
    const { page, deps, logs } = setup();
    await submitGensparkPrompt(page, req, model, deps);
    const notes = logs.filter((l) => l.includes('크레딧'));
    expect(notes).toEqual(['[젠스파크] "GPT Image 2.5" 는 크레딧 배수 1× 로 표시됩니다 — 요금제에 따라 크레딧이 차감됩니다.']);
  });

  it('배수를 못 읽으면 그 부분만 생략한다 / No credit cost 는 그대로 무제한으로 알린다', () => {
    expect(gensparkCreditNote(menu('GPT Image 2.5', false)))
      .toBe('[젠스파크] "GPT Image 2.5" 는 요금제에 따라 크레딧이 차감됩니다.');
    expect(gensparkCreditNote(menu('GPT Image 2.5', true)))
      .toBe('[젠스파크] "GPT Image 2.5" 는 메뉴에 \'No credit cost\'(무제한)로 표시됩니다.');
  });

  it('고른 모델의 메뉴 항목을 바깥(재시도 규칙)에 알린다 / 이미 선택돼 메뉴를 안 열면 알릴 것이 없다', async () => {
    const opened = setup({ menuItems: [menu('GPT Image 2.5', true)] });
    await submitGensparkPrompt(opened.page, req, model, opened.deps);
    expect(opened.entries).toEqual([expect.objectContaining({ label: 'GPT Image 2.5', creditFree: true })]);
    const already = setup({ selected: 'GPT Image 2.5' });
    await submitGensparkPrompt(already.page, req, model, already.deps);
    expect(already.entries).toEqual([]);
    expect(already.page.calls.clicks).not.toContain('modelButton');
  });
});
