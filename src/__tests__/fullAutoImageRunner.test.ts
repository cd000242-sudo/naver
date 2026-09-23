/**
 * NAVER FULL AUTO — the shared runner: final article → slots → generate → reconcile → decision
 * (spec §4, §11, §16-§19, §29; T4, T5, T17-T19, T24).
 *
 * The automation loop is stubbed with the SAME numbering function the real loop uses
 * (fullAutoItemsForScope), so slot keys match production.
 */
import { describe, expect, it } from 'vitest';
import { resolveFullAutoImagePolicy } from '../image/fullAuto/fullAutoImagePolicy';
import { FULL_AUTO_THUMBNAIL_SLOT_KEY, fullAutoItemsForScope, fullAutoSectionSlotKey } from '../image/fullAuto/fullAutoImageSlots';
import { describeFullAutoImageCost, recheckFullAutoDecisionBeforePublish, runFullAutoImages } from '../image/fullAuto/fullAutoImageRunner';

interface StubCall { provider: string; headings: any[]; title: string; options: any }

function stubAutomationLoop(state: { calls: StubCall[]; fail?: Set<string>; size?: number }) {
  return async (provider: string, headings: unknown[], title: string, options: Record<string, any>) => {
    state.calls.push({ provider, headings: headings as any[], title, options });
    const items = (headings as any[]).map((h) => ({
      heading: h.isThumbnail === true ? title : String(h.title ?? h),
      isThumbnail: h.isThumbnail === true,
    }));
    const scoped = fullAutoItemsForScope(items, options.imagePolicy.sections.scope).filter((entry) => entry.kept);
    const images: any[] = [];
    scoped.forEach((entry, index) => {
      const key = entry.number === 0 ? FULL_AUTO_THUMBNAIL_SLOT_KEY : fullAutoSectionSlotKey(entry.number);
      options.onStage?.({ kind: entry.item.isThumbnail ? 'thumbnail' : 'section', number: entry.number, index: index + 1, total: scoped.length });
      if (state.fail?.has(key)) {
        options.onSlotResult({ key, state: 'FAILED', reason: `stub ${key} failed` });
        return;
      }
      const size = state.size ?? 800;
      const image = { heading: entry.item.heading, isThumbnail: entry.item.isThumbnail, provider, width: size, height: size, filePath: `C:/tmp/${key}.png` };
      options.onSlotResult({ key, state: 'SUCCESS', image });
      images.push(image);
    });
    return images;
  };
}

function article(title: string, headings: string[], introduction = '') {
  return { selectedTitle: title, introduction, headings: headings.map((h) => ({ title: h, content: `${h} 본문` })) };
}

const EV9 = article('EV9 충전 커넥터 안 빠질 때, 3분 안에 푸는 순서', [
  '커넥터가 안 빠지는 증상', '잠금 해제 버튼 위치', '겨울철 결빙 확인', '앱으로 강제 해제', '서비스센터 가기 전 체크',
]);

describe('FULL AUTO image runner', () => {
  it('T4: H2 5 → thumbnail 1 + 5 images, AUTO_PUBLISH, one generate call with the homefeed policy', async () => {
    const state = { calls: [] as StubCall[] };
    const result = await runFullAutoImages({
      article: EV9, provider: 'nano-banana-2', policy: resolveFullAutoImagePolicy(), cardPromise: '3분 안에 푸는 순서', costPerImageKrw: 97,
    }, stubAutomationLoop(state));
    expect(result.images).toHaveLength(6);
    expect(result.readiness.summary.label).toBe('6/6');
    expect(result.decision.decision).toBe('AUTO_PUBLISH');
    expect(state.calls).toHaveLength(1);
    const call = state.calls[0];
    // The thumbnail is always requested — even with no introduction (it used to depend on one).
    expect(call.headings[0]).toMatchObject({ isThumbnail: true, title: EV9.selectedTitle });
    expect(call.options).toMatchObject({ continueOnImageFailure: true });
    expect(call.options.imagePolicy.strategy).toBe('naver-homefeed');
    expect(call.options.directorContext.cardPromise).toBe('3분 안에 푸는 순서');
    expect(result.costLine).toBe('이미지 6장(썸네일 1 + 소제목 5) · 엔진 nano-banana-2 · 예상 ₩582 (1장 ₩97)');
  });

  it('T17: a failed thumbnail holds the post; the good H2 images are kept for the owner', async () => {
    const state = { calls: [] as StubCall[], fail: new Set(['thumbnail']) };
    const result = await runFullAutoImages({ article: EV9, provider: 'flow', policy: resolveFullAutoImagePolicy() }, stubAutomationLoop(state));
    expect(result.decision.decision).toBe('IMAGE_REVIEW_REQUIRED');
    expect(result.images).toHaveLength(5);
    expect(result.decision.reasons[0]).toContain('썸네일 이미지 생성 실패');
  });

  it('T18: H2 3 fails → H2 4 keeps its own slot, review names only H2 3', async () => {
    const state = { calls: [] as StubCall[], fail: new Set(['h2-3']) };
    const result = await runFullAutoImages({ article: EV9, provider: 'dropshot', policy: resolveFullAutoImagePolicy() }, stubAutomationLoop(state));
    expect(result.slots.map((s) => `${s.key}:${s.state}`)).toEqual([
      'thumbnail:SUCCESS', 'h2-1:SUCCESS', 'h2-2:SUCCESS', 'h2-3:FAILED', 'h2-4:SUCCESS', 'h2-5:SUCCESS',
    ]);
    expect(result.decision.reasons).toEqual(['소제목 3 이미지 생성 실패 — stub h2-3 failed']);
  });

  it('T19: the selected provider is the only provider asked (initial and scheduled runs)', async () => {
    for (const provider of ['flow', 'dropshot', 'openai-image', 'nano-banana-pro', 'naver']) {
      const state = { calls: [] as StubCall[] };
      await runFullAutoImages({ article: EV9, provider, policy: resolveFullAutoImagePolicy() }, stubAutomationLoop(state));
      expect(state.calls.map((c) => c.provider)).toEqual([provider]);
    }
  });

  it('ODD scope: thumbnail + H2 1, 3, 5 — the skipped ones are normal', async () => {
    const state = { calls: [] as StubCall[] };
    const result = await runFullAutoImages({ article: EV9, provider: 'nano-banana-2', policy: resolveFullAutoImagePolicy({ headingScope: 'odd' }) }, stubAutomationLoop(state));
    expect(result.images).toHaveLength(4);
    expect(result.readiness.summary).toMatchObject({ planned: 4, done: 4, skipped: 2 });
    expect(result.decision.decision).toBe('AUTO_PUBLISH');
  });

  it('text-only publishing never calls the image engine', async () => {
    const state = { calls: [] as StubCall[] };
    const result = await runFullAutoImages({ article: EV9, provider: 'nano-banana-2', policy: resolveFullAutoImagePolicy({ textOnlyPublish: true }) }, stubAutomationLoop(state));
    expect(state.calls).toHaveLength(0);
    expect(result.decision.decision).toBe('AUTO_PUBLISH');
  });

  it('a heading renamed after the images were made is caught right before publishing (§4)', async () => {
    const state = { calls: [] as StubCall[] };
    const result = await runFullAutoImages({ article: EV9, provider: 'nano-banana-2', policy: resolveFullAutoImagePolicy() }, stubAutomationLoop(state));
    expect(recheckFullAutoDecisionBeforePublish(result, EV9).decision).toBe('AUTO_PUBLISH');
    const renamed = { ...EV9, headings: EV9.headings.map((h, i) => (i === 1 ? { ...h, title: '버튼 위치 총정리' } : h)) };
    expect(recheckFullAutoDecisionBeforePublish(result, renamed).decision).toBe('IMAGE_REVIEW_REQUIRED');
  });

  it('T5 / T24: five reservations run independently — one held post does not change the other four', async () => {
    const posts = [
      { title: 'EV9 충전 커넥터 안 빠질 때', provider: 'flow', fail: new Set<string>() },
      { title: 'EV3 실구매가, 보조금 빼니 334만원 차이', provider: 'nano-banana-2', fail: new Set<string>() },
      { title: '셀토스 하이브리드 옵션, 이것만 고르면 된다', provider: 'dropshot', fail: new Set(['h2-2']) },
      { title: '아이오닉5 리콜 대상 확인법', provider: 'nano-banana-pro', fail: new Set<string>() },
      { title: 'PV7 신차 기능 5가지', provider: 'openai-image', fail: new Set<string>() },
    ];
    const results = [];
    for (const post of posts) {
      const state = { calls: [] as StubCall[], fail: post.fail };
      const headings = ['증상', '가격', '옵션', '확인 순서', '주의'].map((h) => `${post.title.slice(0, 4)} ${h}`);
      const result = await runFullAutoImages({ article: article(post.title, headings), provider: post.provider, policy: resolveFullAutoImagePolicy() }, stubAutomationLoop(state));
      expect(state.calls[0].provider).toBe(post.provider);
      expect(state.calls[0].title).toBe(post.title);
      results.push(result);
    }
    expect(results.map((r) => r.decision.decision)).toEqual(['AUTO_PUBLISH', 'AUTO_PUBLISH', 'IMAGE_REVIEW_REQUIRED', 'AUTO_PUBLISH', 'AUTO_PUBLISH']);
    // No slot state crosses posts: every other post is 6/6.
    expect(results.map((r) => r.readiness.summary.label)).toEqual(['6/6', '6/6', '5/6', '6/6', '6/6']);
  });

  it('§29 cost line: subscription engines cost 0, unknown prices are not guessed', () => {
    const slots = [
      { key: 'thumbnail', kind: 'thumbnail' as const, number: 0, heading: 't', state: 'PENDING' as const },
      { key: 'h2-1', kind: 'section' as const, number: 1, heading: 'a', state: 'PENDING' as const },
    ];
    expect(describeFullAutoImageCost(slots, 'flow', 0)).toContain('추가 비용 0원');
    expect(describeFullAutoImageCost(slots, 'leonardoai', null)).toContain('단가 미집계');
  });
});
