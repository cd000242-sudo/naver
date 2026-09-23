/**
 * NAVER FULL AUTO — scenario tests across the real modules (network-free):
 *   §28 a car blog's five reservations in one day, T1/T2/T3/T6/T7 writing mode preserved,
 *   T8/T9 real photos, T10/T11 car intents, T12 policy clichés, T20 one place for thumbnail text.
 */
import { describe, expect, it, vi } from 'vitest';
import { buildModeBasedPrompt, type ContentSource } from '../contentGenerator';
import { resolveFullAutoImagePolicy } from '../image/fullAuto/fullAutoImagePolicy';
import { buildFullAutoDirectorRequest } from '../image/fullAuto/fullAutoImageRequest';
import { runFullAutoImages } from '../image/fullAuto/fullAutoImageRunner';
import { FULL_AUTO_THUMBNAIL_SLOT_KEY, fullAutoItemsForScope, fullAutoSectionSlotKey } from '../image/fullAuto/fullAutoImageSlots';
import { describeFullAutoQueueItem } from '../image/fullAuto/fullAutoQueueStatus';
import { fullAutoAssetLabel } from '../image/fullAuto/fullAutoImageAsset';
import { assignSectionRolesWithHistory } from '../image/director/sectionRoleAssignment';
import { inferArticleVisualKind, planSectionRoles } from '../image/director/sectionRolePlanner';
import { KIND_CONSTRAINT, toBriefVisualRole } from '../image/director/roleDirectives';
import { runThumbnailDirector, type ThumbnailDirectorDeps } from '../image/director/thumbnailDirector';
import { directorAssetKind } from '../image/director/thumbnailDirectorGate';
import type { GeneratedImage, ImageRequestItem } from '../image/types';

// ── T1 / T2 / T3 / T6 / T7: the writer keeps the chosen mode ──────────────────────────────────────
function writerSource(mode: 'seo' | 'homefeed' | 'mate'): ContentSource {
  return {
    sourceType: 'custom_text',
    rawText: '국토교통부 발표에 따르면 전기차 보조금 신청 대상과 서류가 정리되어 있다.',
    title: 'EV3 실구매가, 보조금 빼니 334만원 차이',
    metadata: { keywords: ['EV3 실구매가'] },
    contentMode: mode,
    categoryHint: 'car',
  } as ContentSource;
}

describe('writing mode is never replaced by FULL AUTO (T1/T2/T3/T6/T7)', () => {
  // Lines that only one writer carries (measured: the two prompts share many common layers).
  const HOMEFEED_ONLY = '[홈판 제목 제약]';
  const SEO_ONLY = '[MODE VOICE: SEO 검색 최적화]';

  it('HOMEFEED FULL AUTO / reservation → homefeed writer, not the SEO writer', () => {
    const prompt = buildModeBasedPrompt(writerSource('homefeed'), 'homefeed', undefined, 1600);
    expect(prompt).toContain(HOMEFEED_ONLY);
    expect(prompt).toContain('GAMMA-7');
    expect(prompt).not.toContain(SEO_ONLY);
  });

  it('SEO FULL AUTO / reservation → SEO writer (and homefeed images, see image policy tests)', () => {
    const prompt = buildModeBasedPrompt(writerSource('seo'), 'seo', undefined, 1600);
    expect(prompt).toContain(SEO_ONLY);
    expect(prompt).not.toContain(HOMEFEED_ONLY);
  });

  it('another real mode (mate) keeps its own rules', () => {
    const prompt = buildModeBasedPrompt(writerSource('mate'), 'mate', undefined, 1600);
    expect(prompt).toContain('울트라 스코어카드');
  });

  it('the image core never reads or sets the writing mode', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const dir = path.resolve(__dirname, '..', 'image', 'fullAuto');
    for (const file of fs.readdirSync(dir).filter((f: string) => f.endsWith('.ts') && f !== 'fullAutoQueueStatus.ts')) {
      const code = fs.readFileSync(path.join(dir, file), 'utf-8')
        .split(/\r?\n/)
        .filter((line: string) => !/^\s*(?:\/\/|\*|\/\*)/.test(line))
        .join('\n');
      expect(code).not.toMatch(/contentMode/);
    }
  });
});

// ── §28: a car blog queues five posts for one day ──────────────────────────────────────────────────
const CAR_DAY = [
  { time: '10:00', mode: 'seo', provider: 'flow', title: 'EV9 충전 커넥터 안 빠짐, 3분 안에 푸는 순서',
    headings: ['충전 커넥터가 안 빠지는 증상', '잠금 해제 버튼 위치', '겨울철 충전구 결빙', '앱으로 강제 해제하는 순서', '서비스센터 가기 전 체크'] },
  { time: '12:30', mode: 'seo', provider: 'nano-banana-2', title: 'EV3 실구매가, 보조금 빼니 334만원 차이',
    headings: ['스탠다드 vs 롱레인지 실구매가', '지역별 보조금 차이', '옵션 넣으면 달라지는 가격', '신청 순서', '계약 전 확인할 조건'] },
  { time: '15:00', mode: 'homefeed', provider: 'dropshot', title: '셀토스 하이브리드 옵션, 이것만 고르면 된다',
    headings: ['실내 디스플레이 옵션', '트림별 가격 차이', '연비 체감 포인트', '고르는 기준', '출고 대기 확인'] },
  { time: '18:00', mode: 'seo', provider: 'nano-banana-pro', title: '아이오닉5 리콜 대상 확인법',
    headings: ['리콜 대상 차량 조회', '문제 부위와 증상', '무상 수리 신청 방법', '수리 기간', '주의할 점'] },
  { time: '21:00', mode: 'homefeed', provider: 'openai-image', title: 'PV7 신차 기능 5가지, 실제로 쓸 만한 것',
    headings: ['슬라이딩 도어 편의 기능', '적재 공간 사양', '계기판 경고등 표시', '가격대', '시승 후기'] },
] as const;

function stubLoop(fail: ReadonlySet<string> = new Set()) {
  const calls: Array<{ provider: string; title: string }> = [];
  const fn = async (provider: string, headings: unknown[], title: string, options: Record<string, any>) => {
    calls.push({ provider, title });
    const items = (headings as any[]).map((h) => ({ heading: h.isThumbnail ? title : String(h.title ?? h), isThumbnail: h.isThumbnail === true }));
    return fullAutoItemsForScope(items, options.imagePolicy.sections.scope)
      .filter((entry) => entry.kept)
      .flatMap((entry) => {
        const key = entry.number === 0 ? FULL_AUTO_THUMBNAIL_SLOT_KEY : fullAutoSectionSlotKey(entry.number);
        if (fail.has(key)) {
          options.onSlotResult({ key, state: 'FAILED', reason: 'engine busy' });
          return [];
        }
        const image = { heading: entry.item.heading, isThumbnail: entry.item.isThumbnail, provider, width: 800, height: 800 };
        options.onSlotResult({ key, state: 'SUCCESS', image });
        return [image];
      });
  };
  return { fn, calls };
}

describe('§28 car blog: five reservations in one day', () => {
  it('every post is a car article with its own intent-driven H2 roles (T10 / T11)', () => {
    const plans = CAR_DAY.map((post) => {
      expect(inferArticleVisualKind('car', post.title)).toBe('auto');
      return planSectionRoles([...post.headings], { kind: 'auto' }).map((entry) => entry.role);
    });
    // Problem solving → the symptom / part, price → comparison, features → close-ups.
    expect(plans[0][0]).toBe('problem');
    expect(plans[1][0]).toBe('comparison');
    expect(plans[2][0]).toBe('closeup');
    // Feature / warning-light headings are close-ups; each role goes to one heading while others remain.
    expect([plans[4][0], plans[4][2]]).toContain('closeup');
    for (const roles of plans) {
      roles.forEach((role, i) => expect(role).not.toBe(roles[i + 1]));
    }
    // Five posts do not all look the same.
    expect(new Set(plans.map((roles) => roles.join('>'))).size).toBeGreaterThan(1);
  });

  it('each H2 brief knows the earlier H2 images and bans the generic car-on-road shot', () => {
    const post = CAR_DAY[0];
    const items = post.headings.map((heading) => ({ heading }));
    const history = assignSectionRolesWithHistory(items, { sectionPlanHeadings: [...post.headings], category: 'car', postTitle: post.title });
    const brief = toBriefVisualRole(history[2].role!, { realistic: true, kind: 'auto', previousRoles: history[2].previousRoles });
    expect(history[2].previousRoles).toHaveLength(2);
    expect(brief.constraints.join(' ')).toContain('Earlier images in this post already used');
    expect(brief.constraints.join(' ')).toContain(KIND_CONSTRAINT.auto);
    expect(KIND_CONSTRAINT.auto).toMatch(/do not default to a generic car driving on a road/);
  });

  it('writing mode preserved, homefeed images for all, one held post does not block the rest (T5 / T24)', async () => {
    const rows = [];
    for (const [index, post] of CAR_DAY.entries()) {
      const policy = resolveFullAutoImagePolicy({ headingScope: 'all' });
      const loop = stubLoop(index === 3 ? new Set(['h2-2']) : new Set());
      const result = await runFullAutoImages({
        article: { selectedTitle: post.title, headings: post.headings.map((title) => ({ title })) },
        provider: post.provider,
        policy,
      }, loop.fn);
      expect(policy.strategy).toBe('naver-homefeed');
      expect(loop.calls).toEqual([{ provider: post.provider, title: post.title }]);
      const status = result.decision.decision === 'AUTO_PUBLISH' ? 'completed' : 'image-review';
      rows.push(describeFullAutoQueueItem({
        status,
        publishMode: 'schedule',
        scheduleDate: '2026-09-25',
        scheduleTime: post.time,
        contentMode: post.mode,
        imageStrategy: policy.strategy,
        imageProgress: { done: result.readiness.summary.done, planned: result.readiness.summary.planned },
        imageReviewReasons: [...result.decision.reasons],
      }));
      // Thumbnail 800x800 + one image per H2.
      expect(result.readiness.summary.planned).toBe(6);
    }
    expect(rows.map((r) => `${r.when} ${r.contentModeLabel} ${r.imageStrategyLabel} ${r.imageStatus} ${r.finalStatus}`)).toEqual([
      '9/25 10:00 SEO 홈판 이미지 이미지 6/6 ✓ READY · 네이버 예약 등록 완료',
      '9/25 12:30 SEO 홈판 이미지 이미지 6/6 ✓ READY · 네이버 예약 등록 완료',
      '9/25 15:00 홈판 홈판 이미지 이미지 6/6 ✓ READY · 네이버 예약 등록 완료',
      '9/25 18:00 SEO 홈판 이미지 이미지 5/6 이미지 검토 필요 (발행 안 함)',
      '9/25 21:00 홈판 홈판 이미지 이미지 6/6 ✓ READY · 네이버 예약 등록 완료',
    ]);
  });
});

// ── T12: policy / tax / subsidy / insurance / IT stay information graphics, no clichés ──────────────
describe('T12 policy and money posts', () => {
  it.each([
    '부부 공동명의 종부세 특례, 18억 vs 12억 기준',
    '근로장려금 신청기간과 대상',
    '실손보험 청구 서류 순서',
    '노트북 AI 기능 비교',
  ])('%s → info kind with the cliché ban', (title) => {
    expect(inferArticleVisualKind('', title)).toBe('info');
    const ban = KIND_CONSTRAINT.info;
    for (const word of ['coin piles', 'cash stacks', "judge's gavel", 'umbrella', 'neon circuit']) expect(ban).toContain(word);
  });

  it.each([
    ['아기 트림 시키는 방법', 'info'],
    ['트림이 자주 나오는 이유와 증상', 'info'],
    ['아이폰 충전구 청소 방법', 'info'],
    ['OO 분유 리콜 대상 확인 방법', 'info'],
    ['하이브리드 근무 장단점', 'info'],
    ['자전거 타이어 교체 방법', 'info'],
    ['전기자전거 주행거리 비교', 'info'],
    ['애니 2기 PV2 공개', 'info'],
    ['CAR-T 세포치료 비용', 'info'],
    ['하이브리드 매트리스 리뷰', 'product'],
  ])('a non-car title with a car-ish word stays non-car: %s → %s', (title, kind) => {
    expect(inferArticleVisualKind('', title)).toBe(kind);
  });

  it('a neutral car heading gets neither a split image nor a damage scene by default', () => {
    const roles = planSectionRoles(['디자인 첫인상', '주행 느낌 솔직 후기', '실내 공간'], { kind: 'auto' }).map((e) => e.role);
    expect(roles).not.toContain('comparison');
    expect(roles).not.toContain('problem');
  });

  it('non-car headings keep the roles they had before the car cues existed', () => {
    const roles = (headings: string[]) => planSectionRoles(headings, { kind: 'info' }).map((e) => e.role);
    expect(roles(['문제 해결 방법'])).toEqual(['procedure']);
    expect(roles(['보조금 대상'])).toEqual(['criteria']);
    expect(inferArticleVisualKind('', '드라마 속 가방 리뷰')).toBe('product');
  });
});

// ── T8 / T9 / T20: real photos and one place for the thumbnail text ─────────────────────────────────
const base: GeneratedImage = { heading: 't', filePath: 'C:/img/base.png', previewDataUrl: 'data:x', provider: 'nano-banana-2' };

function deps(overrides: Partial<ThumbnailDirectorDeps> = {}): ThumbnailDirectorDeps {
  const compose = (method: string) => vi.fn(async (_input: string, output: string) => ({ filePath: output, width: 800, height: 800, method }));
  return {
    generateBase: vi.fn(async () => base),
    composeSquare: compose('square'),
    composeTight: compose('tight'),
    composeHook: compose('hook'),
    composePair: vi.fn(async (_l: string, _r: string, output: string) => ({ filePath: output, width: 800, height: 800, method: 'pair' })),
    toJudgeImage: vi.fn(async () => ({ base64: 'b64' })),
    judge: vi.fn(async () => ({ pickIndex: 0, source: 'judge' as const, reason: 'ok', scores: [] })),
    isLocalFile: () => true,
    log: () => undefined,
    ...overrides,
  };
}

describe('T8 / T9 / T20 thumbnail', () => {
  const policy = resolveFullAutoImagePolicy();
  const item = { heading: '박서함 안소희', isThumbnail: true, prompt: 'p' } as ImageRequestItem;

  it('T8: two real photos of the two people → REAL_PAIR, no AI call, badge "실제사진 2장 합성"', async () => {
    const request = buildFullAutoDirectorRequest(policy, {
      realImages: [{ filePath: 'C:/u/a.jpg', provider: 'user' }, { filePath: 'C:/u/b.jpg', provider: 'user' }],
    });
    expect(request.realImages).toHaveLength(2);
    const d = deps();
    const result = await runThumbnailDirector({
      title: '박서함 안소희 양말 화제', cardPromise: '', item, textMode: request.textMode, qualityMode: 'standard',
      kind: 'issue', allowBakedText: request.allowBakedText, engineDrawsText: false,
      realImages: request.realImages.map((r) => r.filePath), realWorkDir: 'C:/w',
    }, d);
    expect(d.generateBase).not.toHaveBeenCalled();
    expect(String(result!.winner.kind)).toMatch(/^real-pair/);
    expect(directorAssetKind(result!.winner)).toBe('real-pair');
    expect(fullAutoAssetLabel({ assetKind: 'real-pair' })).toBe('실제사진 2장 합성');
  });

  it('pair composing can be switched off (REAL_SINGLE), and real-first can be switched off entirely', () => {
    const photos = [{ filePath: 'C:/u/a.jpg' }, { filePath: 'C:/u/b.jpg' }];
    expect(buildFullAutoDirectorRequest({ ...policy, realPair: false }, { realImages: photos }).realImages).toHaveLength(1);
    expect(buildFullAutoDirectorRequest({ ...policy, realAssetFirst: false }, { realImages: photos }).realImages).toHaveLength(0);
  });

  it('T9: no real photo of a real person → the AI cover is told not to draw a lookalike', async () => {
    const d = deps();
    await runThumbnailDirector({
      title: '박서함 안소희 양말 화제', cardPromise: '', item, textMode: 'auto', qualityMode: 'standard',
      kind: 'issue', allowBakedText: true, engineDrawsText: false, realImages: [], realWorkDir: 'C:/w',
    }, d);
    const cover = (d.generateBase as any).mock.calls[0][0];
    expect(String(cover.coverDirection.join(' '))).toContain('lookalike');
    expect(KIND_CONSTRAINT.issue).toContain('do not depict them or any lookalike');
  });

  it('T20: the text comes from exactly one place — the engine for Korean-drawing engines, else one app card', async () => {
    const request = buildFullAutoDirectorRequest(policy, {});
    expect(request).toMatchObject({ textMode: 'auto', allowBakedText: true });
    // Engine draws Korean → no app card composed on top.
    const engine = deps();
    const drawn = await runThumbnailDirector({
      title: 'EV3 실구매가 334만원 차이', cardPromise: '', item: { heading: '썸네일', isThumbnail: true, prompt: 'p' } as ImageRequestItem,
      textMode: 'auto', qualityMode: 'standard', kind: 'auto', allowBakedText: true, engineDrawsText: true, realImages: [], realWorkDir: 'C:/w',
    }, engine);
    expect(drawn!.engineDrewText).toBe(true);
    expect(engine.composeHook).not.toHaveBeenCalled();
    // Engine without Korean → one baked card, and the gate adds no overlay on a baked card.
    const app = deps();
    const card = await runThumbnailDirector({
      title: 'EV3 실구매가 334만원 차이', cardPromise: '', item: { heading: '썸네일', isThumbnail: true, prompt: 'p' } as ImageRequestItem,
      textMode: 'auto', qualityMode: 'standard', kind: 'auto', allowBakedText: true, engineDrawsText: false, realImages: [], realWorkDir: 'C:/w',
    }, app);
    expect(card!.winner.bakedText).toBe(true);
    expect(app.composeHook).toHaveBeenCalledTimes(1);
  });
});
