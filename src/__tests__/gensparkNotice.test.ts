// [2026-11-12 실측(Orbit 3.8.771)] 젠스파크가 /ai_image 위에 안내 창('Media Studio 사용해 보기')을 띄우면 화면을 덮는
//   .mar-backdrop 이 보내기 단추를 가려 모든 이미지가 실패했다(로그인은 정상). 같은 날 전송 4초 뒤 "서버가 과부하 상태입니다.
//   나중에 다시 시도해 주세요." 가 유일한 답으로 오는 거절도 봤고, 옛 코드는 3분을 기다렸다 시간 초과로만 알렸다.
//   BLN 은 좌표 클릭이라 가려진 단추를 눌러도 오류가 없다 — 눌러야 하는 단계 앞에서 안내 창을 먼저 닫아야 한다.
//   가짜 page·가짜 시계·가짜 fetch 만 사용(실제 접속 없음).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { submitGensparkPrompt } from '../image/genspark/gensparkSubmit';
import type { GensparkSubmitDeps } from '../image/genspark/gensparkSubmit';
import { gensparkDismissNotice } from '../image/genspark/gensparkNotice';
import { checkGensparkJob, fetchGensparkProjectResult } from '../image/genspark/gensparkCollect';
import { gensparkFindModelById } from '../image/genspark/gensparkModels';
import { createFakeClock, createFakePage, newFakeState } from './gensparkFakePage';
import type { FakeState } from './gensparkFakePage';

const model = gensparkFindModelById('gpt-image-2.5')!;
const req = { index: 0, prompt: '시험 프롬프트', ratio: '1:1' };

function setup(patch: Partial<FakeState> = {}) {
  const state: FakeState = { ...newFakeState(), ...patch };
  const page = createFakePage(state);
  const logs: string[] = [];
  const clock = createFakeClock();
  const deps: GensparkSubmitDeps = { ...clock, seenJobIds: new Set(), log: (m) => logs.push(m) };
  return { state, page, deps, logs, clock };
}
const blocked = (calls: string[]): string[] => calls.filter((c) => c.startsWith('blocked:'));

describe('안내 창이 보내기 단추를 가릴 때', () => {
  it("④ '나중에' 단추가 있으면 그것을 눌러 닫고, 그 뒤에 보내기를 누른다", async () => {
    const { state, page, deps, logs } = setup({ notice: { visible: true, hasLater: true } });
    const job = await submitGensparkPrompt(page, req, model, deps);
    expect(job.jobId).toBe('job-1');
    expect(state.sendClicked).toBe(true);
    const clicks = page.calls.clicks;
    expect(clicks).toContain('noticeLater');
    expect(clicks.indexOf('noticeLater')).toBeLessThan(clicks.indexOf('send'));
    expect(blocked(clicks)).toEqual([]);
    expect(logs.join('\n')).toContain('[젠스파크] 안내 창을 닫고 이어서 진행합니다.');
  });

  it('④ 닫는 단추가 없으면 Escape 로 닫고 보내기를 누른다', async () => {
    const { state, page, deps } = setup({ notice: { visible: true, hasLater: false } });
    await submitGensparkPrompt(page, req, model, deps);
    expect(page.calls.keys).toContain('Escape');
    expect(page.calls.clicks).not.toContain('noticeLater');
    expect(blocked(page.calls.clicks)).toEqual([]);
    expect(state.sendClicked).toBe(true);
  });

  it('④ 모델 메뉴·설정·입력창을 누르기 전에도 닫는다 — 가려진 채로 누른 클릭이 하나도 없다', async () => {
    const { state, page, deps } = setup({
      notice: { visible: true, hasLater: true },
      selected: 'Nano Banana 2 Flash Lite',
      menuItems: [{ label: 'GPT Image 2.5', creditFree: false, needsInput: false, isNew: false, creditMultiplier: '1×' }],
      ratios: [{ label: '1:1', selected: false }, { label: '16:9', selected: true }],
    });
    await submitGensparkPrompt(page, req, model, deps);
    expect(blocked(page.calls.clicks)).toEqual([]);
    expect(state.selected).toBe('GPT Image 2.5');
    expect(state.ratios.find((o) => o.label === '1:1')!.selected).toBe(true);
    expect(page.calls.clicks.indexOf('noticeLater')).toBe(0);
  });

  it('④ 보내기 직전에 뒤늦게 뜬 안내 창도 닫고 누른다(앞 단계가 끝난 뒤 나타남)', async () => {
    const { state, page, deps } = setup();
    // 입력창을 누르는 순간 안내 창이 뜬다 — 가려진 보내기 단추를 그냥 누르면 조용히 무시된다
    const click = page.mouse.click;
    page.mouse.click = async (x, y) => { await click(x, y); if (page.calls.clicks.at(-1) === 'composer') state.notice.visible = true; };
    const job = await submitGensparkPrompt(page, req, model, deps);
    expect(job.jobId).toBe('job-1');
    expect(state.sendClicked).toBe(true);
    expect(blocked(page.calls.clicks)).toEqual([]);
  });

  it('안내 창이 없으면 아무것도 누르지 않고 지금처럼 진행한다', async () => {
    const { state, page, deps, logs } = setup();
    await submitGensparkPrompt(page, req, model, deps);
    expect(page.calls.clicks).not.toContain('noticeLater');
    expect(logs.join('\n')).not.toContain('안내 창');
    expect(state.sendClicked).toBe(true);
  });

  it('닫지 못하면(5초 안에 계속 보임) 닫지 못했다고 알리고 던지지 않는다', async () => {
    const { state, page, deps, logs } = setup({ notice: { visible: true, hasLater: true } });
    page.mouse.click = async () => { /* 눌러도 안 닫히는 안내 창 */ };
    expect(await gensparkDismissNotice(page, deps)).toBe(false);
    expect(logs).toEqual(['[젠스파크] 안내 창을 닫지 못했습니다 — 그대로 이어서 진행합니다.']);
    expect(state.notice.visible).toBe(true);
  });

  it("'다시 표시하지 않음' 같은 계정 설정은 건드리지 않는다(소스에 체크박스 조작이 없다)", () => {
    const src = readFileSync(resolve(__dirname, '..', 'image', 'genspark', 'gensparkNotice.ts'), 'utf8');
    const code = src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    expect(code).not.toMatch(/checkbox|다시 표시하지|다시 보지/i);
  });
});

describe('거절 문구 — 결과 대신 "서버가 과부하 상태입니다" 가 오면 기다리지 않고 실패', () => {
  const job = { index: 0, jobId: 'job-1', jobUrl: 'https://www.genspark.ai/agents?id=job-1', submittedAt: 0 };
  const onSite = { url: 'https://www.genspark.ai/ai_image' };
  const REFUSED = '서버가 과부하 상태입니다. 나중에 다시 시도해 주세요.';
  const A = 'https://www.genspark.ai/api/files/s/a';
  const sleep = async () => {};

  it('⑤ 거절 문구가 있고 이미지가 없으면 failed — 이유에 요청 제한 코드와 젠스파크가 한 말을 남긴다', async () => {
    const { page } = setup({ ...onSite, projectResult: { ok: true, images: [], failed: false, refusal: REFUSED } });
    const r = await checkGensparkJob(page, job, new Set(), { sleep });
    expect(r.status).toBe('failed');
    expect(r.reason).toContain('GENSPARK_RATE_LIMITED');
    expect(r.reason).toContain('서버가 과부하 상태입니다');
    expect(page.calls.gotos).toEqual([]);
  });

  it('⑤ 한 번 더 읽어 거절이 사라지고 이미지가 오면 실패로 보지 않는다(일시적인 글)', async () => {
    const { page, state } = setup({ ...onSite, projectResult: { ok: true, images: [], failed: false, refusal: REFUSED } });
    const evaluate = page.evaluate;
    let reads = 0;
    page.evaluate = (async (fn: (arg: never) => unknown, arg?: unknown) => {
      if (fn === fetchGensparkProjectResult && ++reads === 2) state.projectResult = { ok: true, images: [A], failed: false };
      return evaluate(fn as never, arg as never);
    }) as typeof page.evaluate;
    expect(await checkGensparkJob(page, job, new Set(), { sleep })).toEqual({ status: 'done', imageUrl: A });
    expect(reads).toBe(2);
  });

  it('⑤ 거절이 한 번 더 읽어도 그대로면 확정 실패이고 확인 사이에 쉰다(8초)', async () => {
    const waits: number[] = [];
    const { page } = setup({ ...onSite, projectResult: { ok: true, images: [], failed: false, refusal: REFUSED } });
    const r = await checkGensparkJob(page, job, new Set(), { sleep: async (ms) => { waits.push(ms); } });
    expect(r.status).toBe('failed');
    expect(waits).toEqual([8_000]);
  });

  it('거절 문구가 없으면 지금처럼 진행 중(pending)', async () => {
    const { page } = setup({ ...onSite, projectResult: { ok: true, images: [], failed: false } });
    expect(await checkGensparkJob(page, job, new Set(), { sleep })).toEqual({ status: 'pending' });
  });

  it('이미지가 이미 있으면 거절 글이 같이 있어도 이미지를 받는다', async () => {
    const { page } = setup({ ...onSite, projectResult: { ok: true, images: [A], failed: false, refusal: REFUSED } });
    expect(await checkGensparkJob(page, job, new Set(), { sleep })).toEqual({ status: 'done', imageUrl: A });
  });

  describe('fetchGensparkProjectResult — /api/project 의 마지막 도우미 글에서 읽는다', () => {
    afterEach(() => vi.unstubAllGlobals());
    const project = (messages: unknown[], gallery: unknown[] = []) => ({ data: { session_state: { assets_gallery: gallery, messages } } });
    const call = async (body: unknown) => {
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => body })));
      return fetchGensparkProjectResult('job-1');
    };

    it('거절 글(과부하·나중에 다시 시도·overloaded·try again later)은 refusal 로 돌려준다', async () => {
      for (const said of [REFUSED, '서버가 과부하 상태입니다', '잠시 후 나중에 다시 시도해 주세요', 'The server is overloaded', 'Please try again later']) {
        const r = await call(project([{ role: 'user', content: '방 사진' }, { role: 'assistant', content: said }]));
        expect(r.ok).toBe(true);
        expect(r.refusal, said).toBe(said);
      }
    });

    it('160자를 넘는 글은 잘라 돌려준다', async () => {
      const r = await call(project([{ role: 'assistant', content: `서버가 과부하 상태입니다 ${'가'.repeat(300)}` }]));
      expect(r.refusal?.length).toBe(160);
    });

    it('평범한 "시작했습니다" 답이나 이미지가 이미 있는 경우, 마지막 글이 도우미가 아닌 경우는 거절이 아니다', async () => {
      const started = { role: 'assistant', content: 'GPT Image 2.5 모델로 1:1 비율의 이미지 생성을 시작했습니다.' };
      expect((await call(project([started]))).refusal).toBeUndefined();
      const withImage = project([{ role: 'assistant', content: REFUSED }], [{ generated_asset_uri: A }]);
      const r = await call(withImage);
      expect(r.images).toEqual([A]);
      expect(r.refusal).toBeUndefined();
      expect((await call(project([{ role: 'assistant', content: REFUSED }, { role: 'user', content: '다시' }]))).refusal).toBeUndefined();
    });

    it('데이터 형식이 다르면 ok:false 그대로(화면 확인으로 넘어간다)', async () => {
      expect((await call({ data: {} })).ok).toBe(false);
    });
  });

});
