// [2026-10-10] 젠스파크 전송·수거 시험 — 가짜 page 와 가짜 시계만 사용(실제 네트워크·브라우저 없음).
import { beforeEach, describe, expect, it, vi } from 'vitest';

const writeImageFile = vi.hoisted(() => vi.fn());
vi.mock('../image/imageUtils.js', () => ({ writeImageFile }));

import { submitGensparkPrompt } from '../image/genspark/gensparkSubmit';
import type { GensparkSubmitDeps } from '../image/genspark/gensparkSubmit';
import { checkGensparkJob, downloadGensparkImage } from '../image/genspark/gensparkCollect';
import { gensparkFindModelById } from '../image/genspark/gensparkModels';
import { GensparkError } from '../image/genspark/gensparkErrors';
import { createFakeClock, createFakePage, newFakeState } from './gensparkFakePage';
import type { FakeState } from './gensparkFakePage';

const model = (id: string) => gensparkFindModelById(id)!;
const req = { index: 0, prompt: '첫 줄\n둘째 줄\r\n셋째  줄', ratio: '1:1' };
const menu = (label: string, creditFree: boolean) => ({ label, creditFree, needsInput: false, isNew: false });

function setup(patch: Partial<FakeState> = {}) {
  const state = { ...newFakeState(), ...patch };
  const page = createFakePage(state);
  const clock = createFakeClock();
  const deps: GensparkSubmitDeps = { ...clock, seenJobIds: new Set(), log: () => {} };
  return { state, page, deps };
}
async function codeOf(p: Promise<unknown>): Promise<string> {
  try { await p; } catch (e) { return e instanceof GensparkError ? e.code : `OTHER:${String(e)}`; }
  return 'NO_ERROR';
}

describe('submitGensparkPrompt', () => {
  it('모델이 이미 맞으면 메뉴를 열지 않고 작업 ID 를 돌려준다', async () => {
    const { page, deps } = setup();
    const job = await submitGensparkPrompt(page, req, model('gpt-image-2.5'), deps);
    expect(job).toMatchObject({ index: 0, jobId: 'job-1', jobUrl: 'https://www.genspark.ai/agents?id=job-1' });
    expect(page.calls.gotos[0]).toBe('https://www.genspark.ai/ai_image');
    expect(page.calls.clicks).not.toContain('modelButton');
    expect(page.calls.bringToFront).toBe(1);
    expect(deps.seenJobIds.has('job-1')).toBe(true);
  });

  it('모델이 다르면 마우스로 메뉴를 열고 menuLabel 정확 일치 항목을 누른다', async () => {
    const { state, page, deps } = setup({ selected: 'GPT Image 2.5', menuItems: [menu('GPT Image 2.5', true), menu('GPT Image 2', true)] });
    await submitGensparkPrompt(page, req, model('gpt-image-2'), deps);
    expect(page.calls.clicks.slice(0, 2)).toEqual(['modelButton', 'model:GPT Image 2']);
    expect(state.selected).toBe('GPT Image 2');
  });

  it('목록에 모델이 없으면 GENSPARK_MODEL_NOT_FOUND (다른 모델로 넘기지 않음)', async () => {
    const { state, page, deps } = setup({ menuItems: [menu('GPT Image 2.5', true)] });
    expect(await codeOf(submitGensparkPrompt(page, req, model('gpt-image-2'), deps))).toBe('GENSPARK_MODEL_NOT_FOUND');
    expect(state.selected).toBe('GPT Image 2.5');
    expect(state.sendClicked).toBe(false);
  });

  it('모델 버튼을 못 찾아도 GENSPARK_MODEL_NOT_FOUND', async () => {
    const { page, deps } = setup({ menuItems: [], missingTargets: ['modelButton'] });
    expect(await codeOf(submitGensparkPrompt(page, req, model('gpt-image-2'), deps))).toBe('GENSPARK_MODEL_NOT_FOUND');
  });

  it('크레딧 표시가 앱 표와 다르면 GENSPARK_MODEL_CREDIT_CHANGED 로 멈춘다', async () => {
    const { state, page, deps } = setup({ menuItems: [menu('Nano Banana Pro', true)] });
    expect(await codeOf(submitGensparkPrompt(page, req, model('nano-banana-pro'), deps))).toBe('GENSPARK_MODEL_CREDIT_CHANGED');
    expect(state.selected).toBe('GPT Image 2.5');
  });

  it('줄바꿈을 공백으로 바꿔 insertText 로 넣는다 (Enter 전송 위험 없음)', async () => {
    const { state, page, deps } = setup();
    await submitGensparkPrompt(page, req, model('gpt-image-2.5'), deps);
    expect(page.calls.inserts).toEqual(['첫 줄 둘째 줄 셋째 줄']);
    expect(page.calls.keys).not.toContain('Enter');
    expect(state.composerValue).toBe('첫 줄 둘째 줄 셋째 줄');
  });

  it('입력값이 다르면 지우고 한 번 더 입력한다', async () => {
    const { state, page, deps } = setup({ corruptInserts: 1 });
    await submitGensparkPrompt(page, req, model('gpt-image-2.5'), deps);
    expect(page.calls.inserts).toHaveLength(2);
    expect(state.composerValue).toBe('첫 줄 둘째 줄 셋째 줄');
  });

  it('두 번 다 다르면 GENSPARK_COMPOSER_NOT_FOUND 이고 전송하지 않는다', async () => {
    const { state, page, deps } = setup({ corruptInserts: 5 });
    expect(await codeOf(submitGensparkPrompt(page, req, model('gpt-image-2.5'), deps))).toBe('GENSPARK_COMPOSER_NOT_FOUND');
    expect(state.sendClicked).toBe(false);
  });

  it('종횡비를 바꾸고 생성 횟수가 1 이 아니면 1 을 누른다', async () => {
    const { state, page, deps } = setup({
      counts: [{ label: '1', selected: false }, { label: '2', selected: true }, { label: '4', selected: false }],
    });
    await submitGensparkPrompt(page, { ...req, ratio: '16:9' }, model('gpt-image-2.5'), deps);
    expect(page.calls.clicks).toContain('opt:16:9');
    expect(page.calls.clicks).toContain('opt:1');
    expect(state.ratios.find((o) => o.label === '16:9')!.selected).toBe(true);
    expect(state.counts.find((o) => o.label === '1')!.selected).toBe(true);
  });

  it('메뉴에 없는 종횡비는 GENSPARK_SETTINGS_NOT_FOUND', async () => {
    const { page, deps } = setup();
    expect(await codeOf(submitGensparkPrompt(page, { ...req, ratio: '3:2' }, model('gpt-image-2.5'), deps))).toBe('GENSPARK_SETTINGS_NOT_FOUND');
  });

  it('작업 주소가 시간 안에 안 생기면 GENSPARK_SUBMIT_FAILED', async () => {
    const { page, deps } = setup({ jobUrlAfterPolls: -1 });
    expect(await codeOf(submitGensparkPrompt(page, req, model('gpt-image-2.5'), { ...deps, jobUrlWaitMs: 2_000 }))).toBe('GENSPARK_SUBMIT_FAILED');
  });

  it('이미 본 작업 ID 면 거부한다', async () => {
    const { page, deps } = setup();
    deps.seenJobIds.add('job-1');
    expect(await codeOf(submitGensparkPrompt(page, req, model('gpt-image-2.5'), deps))).toBe('GENSPARK_SUBMIT_FAILED');
  });

  it('로그인 필요·보안 확인 신호면 배치 중단 오류', async () => {
    const login = setup({ signals: { hasComposer: false, loginRequired: true, challenge: false, rateLimited: false, failed: false } });
    expect(await codeOf(submitGensparkPrompt(login.page, req, model('gpt-image-2.5'), login.deps))).toBe('GENSPARK_LOGIN_REQUIRED');
    const ch = setup({ signals: { hasComposer: true, loginRequired: false, challenge: true, rateLimited: false, failed: false } });
    expect(await codeOf(submitGensparkPrompt(ch.page, req, model('gpt-image-2.5'), ch.deps))).toBe('GENSPARK_CHALLENGE');
  });
});

describe('checkGensparkJob', () => {
  const job = { index: 0, jobId: 'job-1', jobUrl: 'https://www.genspark.ai/agents?id=job-1', submittedAt: 0 };
  const sleep = async () => {};
  const A = 'https://www.genspark.ai/api/files/s/a';
  const B = 'https://www.genspark.ai/api/files/s/b';

  it('새 이미지 주소가 있으면 done (작업 주소를 연다)', async () => {
    const { page } = setup({ jobImages: [A] });
    expect(await checkGensparkJob(page, job, new Set(), { sleep })).toEqual({ status: 'done', imageUrl: A });
    expect(page.calls.gotos).toEqual([job.jobUrl]);
  });

  it('이미 받은 주소는 제외하고 다음 새 주소를 고른다', async () => {
    const { page } = setup({ jobImages: [A, B] });
    expect(await checkGensparkJob(page, job, new Set([A]), { sleep })).toEqual({ status: 'done', imageUrl: B });
  });

  it('받은 주소만 보이면 중복 실패', async () => {
    const { page } = setup({ jobImages: [A] });
    const r = await checkGensparkJob(page, job, new Set([A]), { sleep });
    expect(r.status).toBe('failed');
    expect(r.reason).toContain('GENSPARK_DUPLICATE_IMAGE');
  });

  it('이미지도 신호도 없으면 pending, 실패 문구면 failed', async () => {
    expect((await checkGensparkJob(setup().page, job, new Set(), { sleep })).status).toBe('pending');
    const f = setup({ signals: { hasComposer: false, loginRequired: false, challenge: false, rateLimited: false, failed: true } });
    expect((await checkGensparkJob(f.page, job, new Set(), { sleep })).status).toBe('failed');
  });

  it('로그인 풀림은 배치 중단 오류로 던진다', async () => {
    const l = setup({ signals: { hasComposer: false, loginRequired: true, challenge: false, rateLimited: false, failed: false } });
    expect(await codeOf(checkGensparkJob(l.page, job, new Set(), { sleep }))).toBe('GENSPARK_LOGIN_REQUIRED');
  });
});

describe('downloadGensparkImage', () => {
  const meta = { heading: '소제목', modelLabel: 'GPT Image 2.5', originalIndex: 2 };
  const big = Buffer.alloc(2048, 7).toString('base64');
  const fetched = (over: object = {}) => ({ ok: true, status: 200, type: 'image/jpeg', size: 2048, b64: big, ...over });

  beforeEach(() => {
    writeImageFile.mockReset();
    writeImageFile.mockResolvedValue({ filePath: '/tmp/a.jpg', previewDataUrl: 'data:x', savedToLocal: '/save/a.jpg', width: 800, height: 800, byteSize: 2048, sha256: 'h', mimeType: 'image/jpeg' });
  });

  it('image/* 이고 1KB 초과면 저장하고 출처를 "젠스파크 · 모델" 로 적는다', async () => {
    const { page } = setup({ fetchResult: fetched() });
    const img = await downloadGensparkImage(page, 'https://www.genspark.ai/api/files/s/a', meta);
    expect(writeImageFile).toHaveBeenCalledTimes(1);
    expect(writeImageFile.mock.calls[0][1]).toBe('jpg');
    expect(writeImageFile.mock.calls[0][2]).toBe('소제목');
    expect(img).toMatchObject({ provider: 'genspark', filePath: '/save/a.jpg', sourceUrl: '젠스파크 · GPT Image 2.5', originalIndex: 2, fallbackUsed: false });
  });

  it('image 가 아니거나 1KB 이하이거나 HTTP 오류면 GENSPARK_DOWNLOAD_FAILED 이고 저장하지 않는다', async () => {
    for (const over of [{ type: 'text/html' }, { b64: Buffer.alloc(1024, 1).toString('base64') }, { ok: false, status: 403 }]) {
      const { page } = setup({ fetchResult: fetched(over) });
      expect(await codeOf(downloadGensparkImage(page, 'u', meta))).toBe('GENSPARK_DOWNLOAD_FAILED');
    }
    expect(writeImageFile).not.toHaveBeenCalled();
  });

  it('저장 함수가 실패해도 GENSPARK_DOWNLOAD_FAILED', async () => {
    writeImageFile.mockRejectedValue(new Error('디스크'));
    const { page } = setup({ fetchResult: fetched() });
    expect(await codeOf(downloadGensparkImage(page, 'u', meta))).toBe('GENSPARK_DOWNLOAD_FAILED');
  });
});
