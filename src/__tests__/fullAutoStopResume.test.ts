import { afterEach, describe, expect, it, vi } from 'vitest';
import { gstopBuildRecord } from '../generationStop/resumeRecord';
import {
  fullAutoStopResumeBeginRun,
  fullAutoStopResumeBusy,
  fullAutoStopResumeContext,
  fullAutoStopResumeFinishRun,
  fullAutoStopResumeMarkPublished,
  fullAutoStopResumePickInputs,
  fullAutoStopResumePlan,
  fullAutoStopResumeReadInputs,
  fullAutoStopResumeStart,
} from '../renderer/modules/fullAutoStopResume';
import type { FullAutoStopResumeDeps } from '../renderer/modules/fullAutoStopResume';

const info = { stage: 'image', cause: 'limit', engine: 'codex-image', detail: 'x' } as const;
const textInfo = { stage: 'text', cause: 'login', engine: 'claude-cli', detail: 'x' } as const;

const fullForm = () => ({
  mode: 'full-auto',
  urls: ['https://news.example.com/a', 'not-a-url'],
  keywords: '겨울 난방비',
  title: '난방비 아끼는 법',
  manualTitleOverride: '내 제목',
  keywordAsTitle: true,
  keywordTitlePrefix: false,
  toneStyle: 'friendly',
  contentMode: 'seo',
  categoryName: '생활 정보',
  affiliateLink: 'https://link.coupang.com/a/xyz',
  imageSource: 'codex-image',
  generator: 'claude-cli',
  // Secrets and account data that must never reach the record.
  naverId: 'owner01',
  naverPassword: 'pw!',
  password: 'pw2',
  cookies: [{ name: 'NID_AUT', value: 'secret' }],
  apiKey: 'sk-xxx',
  geminiApiKey: 'AIza',
  accessToken: 'tok',
  publicationScope: { accountId: 'owner01' },
  publishMode: 'schedule',
  scheduleDate: '2026-11-25 09:00',
  structuredContent: { selectedTitle: 'T', headings: [{ title: 'h' }] },
});

function makeDeps(overrides: Partial<FullAutoStopResumeDeps> = {}): FullAutoStopResumeDeps & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    busy: () => false,
    accountMode: () => 'single',
    restoreInputs: (inputs) => { calls.push(`restore:${inputs.keywords}`); },
    seedArticle: (_inputs, article) => { calls.push(`seed:${(article as any)?.selectedTitle}`); },
    clickPublish: () => { calls.push('click'); return true; },
    notify: (message) => { calls.push(`notify:${message}`); },
    ...overrides,
  };
}

afterEach(async () => { await fullAutoStopResumeFinishRun(async () => undefined); });

describe('풀오토 이어 가기: 입력값 화이트리스트', () => {
  it('비밀 값·계정 정보·발행 설정은 기록에 남지 않는다', () => {
    const picked = fullAutoStopResumePickInputs(fullForm()) as Record<string, unknown>;
    // "keywords" is the topic itself; any other name with key / secret words must be absent.
    for (const name of Object.keys(picked)) {
      expect(name).not.toMatch(/password|passwd|cookie|token|secret|naverid|account|scope|schedule|publishmode|apikey|key$|_key|Key[A-Z]?$/i);
    }
    expect(JSON.stringify(picked)).not.toMatch(/owner01|pw!|pw2|NID_AUT|sk-xxx|AIza|tok"/);
    expect(picked).not.toHaveProperty('structuredContent');
  });

  it('무엇을 쓸지는 담는다 (주소는 http 주소만)', () => {
    expect(fullAutoStopResumePickInputs(fullForm())).toEqual({
      urls: ['https://news.example.com/a'],
      keywords: '겨울 난방비',
      title: '난방비 아끼는 법',
      manualTitleOverride: '내 제목',
      keywordAsTitle: true,
      keywordTitlePrefix: false,
      toneStyle: 'friendly',
      contentMode: 'seo',
      categoryName: '생활 정보',
      affiliateLink: 'https://link.coupang.com/a/xyz',
      imageSource: 'codex-image',
      generator: 'claude-cli',
    });
  });

  it('입력이 아닌 값은 빈 입력값으로 다룬다', () => {
    expect(fullAutoStopResumePickInputs(null)).toMatchObject({ urls: [], keywords: '', title: '' });
  });
});

describe('풀오토 이어 가기: 기록 → 시작 인자 복원', () => {
  it('저장한 입력값을 되돌린다 (모르는 칸은 버린다)', () => {
    const inputs = fullAutoStopResumeReadInputs({ ...fullAutoStopResumePickInputs(fullForm()), password: 'x' }) as any;
    expect(inputs.keywords).toBe('겨울 난방비');
    expect(inputs.urls).toEqual(['https://news.example.com/a']);
    expect(inputs).not.toHaveProperty('password');
  });

  it('쓸 것이 하나도 없는 기록은 되돌리지 않는다', () => {
    expect(fullAutoStopResumeReadInputs({ keywords: '  ', urls: [] })).toBeNull();
    expect(fullAutoStopResumeReadInputs('broken')).toBeNull();
    expect(fullAutoStopResumeReadInputs(undefined)).toBeNull();
  });

  it('글이 있는 기록 = 이미지부터, 장부를 채운다', () => {
    const record = gstopBuildRecord({ kind: 'full-auto', info, label: 'A', id: 'full-auto-1', now: 1,
      article: { selectedTitle: 'T', headings: [{ title: 'h' }] },
      ledger: [{ key: 'S|1|h', image: { filePath: '/a.png' } }],
      resumeData: fullAutoStopResumePickInputs(fullForm()) });
    const plan = fullAutoStopResumePlan(record)!;
    expect(plan.from).toBe('images');
    expect(plan.recordId).toBe('full-auto-1');
    expect(plan.ledger).toEqual([{ key: 'S|1|h', image: { filePath: '/a.png' } }]);
  });

  it('글 단계에서 멈춘 기록 = 처음부터', () => {
    const record = gstopBuildRecord({ kind: 'full-auto', info: textInfo, label: 'A', id: 'full-auto-2', now: 1,
      resumeData: fullAutoStopResumePickInputs(fullForm()) });
    const plan = fullAutoStopResumePlan(record)!;
    expect(plan.from).toBe('start');
    expect(plan.article).toBeUndefined();
    expect(plan.ledger).toEqual([]);
  });

  it('다른 종류 기록·입력값 없는 기록은 계획을 만들지 않는다', () => {
    expect(fullAutoStopResumePlan(gstopBuildRecord({ kind: 'continuous', info, label: 'A', resumeData: { keywords: 'k' } }))).toBeNull();
    expect(fullAutoStopResumePlan(gstopBuildRecord({ kind: 'full-auto', info, label: 'A' }))).toBeNull();
    expect(fullAutoStopResumePlan(null)).toBeNull();
  });
});

describe('풀오토 이어 가기: 시작', () => {
  const recordWithArticle = () => gstopBuildRecord({ kind: 'full-auto', info, label: 'A', id: 'full-auto-9', now: 1,
    article: { selectedTitle: 'T', headings: [{ title: 'h' }] },
    ledger: [{ key: 'S|1|h', image: { filePath: '/a.png' } }],
    resumeData: fullAutoStopResumePickInputs(fullForm()) });

  it('글 있는 기록: 입력값 복원 → 글 심기 → 풀오토 단추, 곧바로 true', async () => {
    const deps = makeDeps();
    await expect(fullAutoStopResumeStart(recordWithArticle(), deps)).resolves.toBe(true);
    expect(deps.calls).toEqual(['restore:겨울 난방비', 'seed:T', 'click']);
  });

  it('글 없는 기록: 글을 심지 않고 처음부터', async () => {
    const deps = makeDeps();
    const record = gstopBuildRecord({ kind: 'full-auto', info: textInfo, label: 'A', resumeData: fullAutoStopResumePickInputs(fullForm()) });
    await expect(fullAutoStopResumeStart(record, deps)).resolves.toBe(true);
    expect(deps.calls).toEqual(['restore:겨울 난방비', 'click']);
  });

  it('풀오토가 도는 중이면 false + 이유', async () => {
    const deps = makeDeps({ busy: () => true });
    await expect(fullAutoStopResumeStart(recordWithArticle(), deps)).resolves.toBe(false);
    expect(deps.calls.some((c) => c.startsWith('notify:') && c.includes('진행 중'))).toBe(true);
    expect(deps.calls).not.toContain('click');
  });

  it('다중계정 화면이면 false + 이유 (다른 계정으로 몰래 발행하지 않는다)', async () => {
    const deps = makeDeps({ accountMode: () => 'multi' });
    await expect(fullAutoStopResumeStart(recordWithArticle(), deps)).resolves.toBe(false);
    expect(deps.calls.some((c) => c.includes('1개 계정'))).toBe(true);
    expect(deps.calls).not.toContain('click');
  });

  it('기록이 깨졌으면 false + 이유', async () => {
    const deps = makeDeps();
    await expect(fullAutoStopResumeStart({ kind: 'full-auto' }, deps)).resolves.toBe(false);
    expect(deps.calls.some((c) => c.startsWith('notify:'))).toBe(true);
  });

  it('풀오토 단추가 시작되지 않으면 false + 이유, 맡겨 둔 장부도 버린다', async () => {
    const deps = makeDeps({ clickPublish: () => false });
    await expect(fullAutoStopResumeStart(recordWithArticle(), deps)).resolves.toBe(false);
    expect(deps.calls.some((c) => c.includes('풀오토 발행 단추'))).toBe(true);
    fullAutoStopResumeBeginRun(fullForm());
    expect(fullAutoStopResumeContext('A').recordId).not.toBe('full-auto-9');
  });

  it('입력값 복원이 실패해도 false (던지지 않는다)', async () => {
    const deps = makeDeps({ restoreInputs: () => { throw new Error('dom'); } });
    await expect(fullAutoStopResumeStart(recordWithArticle(), deps)).resolves.toBe(false);
  });
});

describe('풀오토 이어 가기: 한 번의 발행 동안의 멈춤 맥락', () => {
  it('발행을 시작하지 않았으면 기록하지 않는다 (연속발행 등)', () => {
    const ctx = fullAutoStopResumeContext('A', { shopping: true });
    expect(ctx).toMatchObject({ kind: 'full-auto', noRecord: true, shopping: true });
    expect(ctx.ledger).toBeDefined();
  });

  it('글 단계와 이미지 단계가 같은 기록 id·같은 장부를 쓰고, 입력값만 담는다', () => {
    fullAutoStopResumeBeginRun(fullForm());
    const text = fullAutoStopResumeContext('겨울 난방비');
    const image = fullAutoStopResumeContext('겨울 난방비', { article: () => ({ selectedTitle: 'T' }) });
    expect(text.noRecord).toBeUndefined();
    expect(text.recordId).toBeTruthy();
    expect(image.recordId).toBe(text.recordId);
    expect(image.ledger).toBe(text.ledger);
    expect(image.article!()).toEqual({ selectedTitle: 'T' });
    expect(JSON.stringify(image.resumeData!())).not.toMatch(/owner01|pw|sk-xxx|NID_AUT/);
  });

  it('이어서 발행: 같은 입력의 발행이 기록 id 와 완성된 이미지 칸을 이어받는다', async () => {
    const record = gstopBuildRecord({ kind: 'full-auto', info, label: 'A', id: 'full-auto-7', now: 1,
      article: { selectedTitle: 'T', headings: [{ title: 'h' }] },
      ledger: [{ key: 'S|1|h', image: { filePath: '/a.png' } }],
      resumeData: fullAutoStopResumePickInputs(fullForm()) });
    await fullAutoStopResumeStart(record, makeDeps());
    fullAutoStopResumeBeginRun(fullForm());
    const ctx = fullAutoStopResumeContext('A');
    expect(ctx.recordId).toBe('full-auto-7');
    expect(ctx.ledger!.get('S|1|h')).toEqual({ filePath: '/a.png' });
  });

  it('다른 입력의 발행은 맡겨 둔 장부를 이어받지 않는다', async () => {
    const record = gstopBuildRecord({ kind: 'full-auto', info, label: 'A', id: 'full-auto-8', now: 1,
      ledger: [{ key: 'S|1|h', image: { filePath: '/a.png' } }],
      resumeData: fullAutoStopResumePickInputs(fullForm()) });
    await fullAutoStopResumeStart(record, makeDeps());
    fullAutoStopResumeBeginRun({ ...fullForm(), keywords: '전혀 다른 글', urls: [] });
    const ctx = fullAutoStopResumeContext('B');
    expect(ctx.recordId).not.toBe('full-auto-8');
    expect(ctx.ledger!.size).toBe(0);
  });

  it('정상으로 끝나면 기록을 지우고, 멈춘 채 끝나면 남긴다', async () => {
    const remove = vi.fn(async () => undefined);
    expect(fullAutoStopResumeBeginRun(fullForm())).toBe(true);
    const id = fullAutoStopResumeContext('A').recordId!;
    fullAutoStopResumeMarkPublished();
    await fullAutoStopResumeFinishRun(remove);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith(id);

    remove.mockClear();
    fullAutoStopResumeBeginRun(fullForm());
    await fullAutoStopResumeFinishRun(remove);
    expect(remove).not.toHaveBeenCalled();
    expect(fullAutoStopResumeContext('A').noRecord).toBe(true);
  });

  it('단추 경로가 시작한 발행은 executeFullAutoFlow 가 새로 만들지 않고, 소유자만 끝낸다', async () => {
    const remove = vi.fn(async () => undefined);
    expect(fullAutoStopResumeBeginRun(fullForm())).toBe(true); // handleFullAutoPublish (owner)
    const id = fullAutoStopResumeContext('A').recordId;
    expect(fullAutoStopResumeBeginRun({ ...fullForm(), title: '' })).toBe(false); // executeFullAutoFlow inside the same run
    expect(fullAutoStopResumeContext('A').recordId).toBe(id);
    fullAutoStopResumeMarkPublished(); // executeFullAutoFlow saw the publish succeed
    expect(fullAutoStopResumeBusy()).toBe(true);
    await fullAutoStopResumeFinishRun(remove); // owner's finally
    expect(remove).toHaveBeenCalledWith(id);
    expect(fullAutoStopResumeBusy()).toBe(false);
  });
});
