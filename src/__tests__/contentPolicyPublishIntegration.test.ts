import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  prepareContentPolicyForPublish,
  recordContentPolicyPublication,
  recordContentPolicyReservation,
} from '../contentPolicy/policyService';
import { loadPublishedPosts } from '../analytics/publishedPostTracker';
import { PublicationStateStore } from '../contentPolicy/publicationStateStore';
import { ContentPolicyAuditStore } from '../contentPolicy/auditStore';
import { RecentPostsRepository } from '../contentPolicy/recentPostsRepository';
import { makeGoodDraft, makePolicyInput, makeRecentPosts } from './contentPolicyFixtures';

const tempDirs: string[] = [];

async function tempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'policy-publish-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

function payloadWithContext() {
  const draft = makeGoodDraft();
  const input = makePolicyInput();
  return {
    naverId: 'account-a',
    title: draft.title,
    content: draft.body_markdown,
    publishMode: 'publish' as const,
    structuredContent: {
      selectedTitle: draft.title,
      introduction: draft.introduction,
      headings: draft.headings,
      bodyPlain: draft.body_markdown,
      content: draft.body_markdown,
      faq: draft.faq,
      cta: draft.cta,
    },
    contentPolicyContext: {
      input,
      recentPostsSnapshot: makeRecentPosts(),
      recentPostsResult: { ok: true as const, posts: makeRecentPosts(), source: 'renderer-storage' },
    },
  };
}

describe('content policy publish integration', () => {
  it('evaluates, audits, and authorizes a complete PASS payload before browser work', async () => {
    const payload = payloadWithContext();
    const result = await prepareContentPolicyForPublish(payload, {
      userDataPath: await tempDir(),
      env: { MIN_PUBLISH_INTERVAL_MINUTES: '0', DAILY_PUBLISH_CAP: '10' },
      now: new Date('2026-02-01T12:00:00.000Z'),
    });

    expect(result.allowed).toBe(true);
    expect(result.policyResult.decision).toBe('PASS');
    expect(result.payload.structuredContent.contentPolicy.decision).toBe('PASS');
    expect(payload.structuredContent.contentPolicy).toBeUndefined();
  });

  it('publishes the repaired body and heading model after removing unsupported claims', async () => {
    const payload = payloadWithContext();
    const unsupported = '국내생산 윈드포스 기술을 적용한 이 시트커버는 45,800원에 판매되고 있습니다.';
    payload.content = `${payload.content}\n\n${unsupported}`;
    payload.structuredContent.bodyPlain = payload.content;
    payload.structuredContent.content = payload.content;
    payload.structuredContent.headings = payload.structuredContent.headings.map((heading: any, index: number) => index === 0
      ? { ...heading, content: `${heading.content} ${unsupported}` }
      : { ...heading });

    const result = await prepareContentPolicyForPublish(payload, {
      userDataPath: await tempDir(),
      env: { MIN_PUBLISH_INTERVAL_MINUTES: '0', DAILY_PUBLISH_CAP: '10' },
      now: new Date('2026-02-01T12:00:00.000Z'),
    });

    expect(result.allowed).toBe(true);
    expect(result.policyResult.rewrite_count).toBe(1);
    expect(result.payload.content).not.toContain('45,800원');
    expect(result.payload.structuredContent.bodyPlain).not.toContain('45,800원');
    expect(result.payload.structuredContent.headings[0].content).not.toContain('45,800원');
    expect(payload.content).toContain('45,800원');
  });

  it('rebases stale generation keywords to the final pasted article in semi-auto mode', async () => {
    const payload = payloadWithContext();
    payload._semiAutoMode = true;
    payload.keywords = ['2026 꼼수장학금 신청 방법'];
    payload.contentPolicyContext.input.primary_keyword = '2026 꼼수장학금 신청 방법';

    const result = await prepareContentPolicyForPublish(payload, {
      userDataPath: await tempDir(),
      env: { MIN_PUBLISH_INTERVAL_MINUTES: '0', DAILY_PUBLISH_CAP: '10' },
      now: new Date('2026-02-01T12:00:00.000Z'),
    });

    expect(result.allowed).toBe(true);
    expect(result.policyResult.decision).toBe('PASS');
    expect(result.policyResult.block_reasons).not.toContain('BLOCK_KEYWORD_BODY_MISMATCH');
    expect(result.payload.contentPolicyContext?.input.primary_keyword).toBe('부산 유품 정리 준비 순서와 귀중품 보관 기준');
    expect(result.payload.contentPolicyContext?.input.input_origin).toBe('semi_auto_manual');
    expect(result.payload.contentPolicyContext?.input.business_facts).toContain(
      '작업 전 가족이 귀중품을 먼저 확인한다.',
    );
    expect(result.payload.contentPolicyContext?.input.business_facts).not.toContain(payload.title);
  });

  it('removes a forbidden sentence and continues with an advisory after semi-auto context rebasing', async () => {
    const payload = payloadWithContext();
    const unsupported = '이 서비스는 누구에게나 100% 해결을 보장합니다.';
    payload._semiAutoMode = true;
    payload.keywords = ['2026 꼼수장학금 신청 방법'];
    payload.contentPolicyContext.input.primary_keyword = '2026 꼼수장학금 신청 방법';
    payload.content = `${payload.content}\n\n${unsupported}`;
    payload.structuredContent.bodyPlain = payload.content;
    payload.structuredContent.content = payload.content;

    const result = await prepareContentPolicyForPublish(payload, {
      userDataPath: await tempDir(),
      env: { MIN_PUBLISH_INTERVAL_MINUTES: '0', DAILY_PUBLISH_CAP: '10' },
      now: new Date('2026-02-01T12:00:00.000Z'),
    });

    expect(result.allowed).toBe(true);
    expect(result.advisoryReasons).toContain('BLOCK_FORBIDDEN_CLAIM');
    expect(result.payload.content).not.toContain('100% 해결을 보장');
    expect(result.payload.structuredContent.bodyPlain).not.toContain('100% 해결을 보장');
  });

  it.each([
    ['full_auto', 'publish', false],
    ['continuous', 'publish', false],
    ['multi_account', 'publish', false],
    ['legacy_form', 'publish', false],
    ['app_scheduler', 'publish', false],
    ['full_auto', 'draft', false],
    ['full_auto', 'schedule', false],
    ['semi_auto', 'publish', true],
  ] as const)(
    'reconciles stale policy context for %s / %s without bypassing the final draft guard',
    async (publishFlow, publishMode, semiAutoMode) => {
      const payload = payloadWithContext();
      payload.publishMode = publishMode;
      if (publishMode === 'schedule') {
        (payload as any).scheduleDate = '2026-02-02';
        (payload as any).scheduleTime = '09:30';
      }
      payload._publishFlow = publishFlow;
      payload._semiAutoMode = semiAutoMode;
      payload.keywords = ['과거에 생성한 전혀 다른 키워드'];
      payload.contentPolicyContext.input.primary_keyword = '과거에 생성한 전혀 다른 키워드';

      const result = await prepareContentPolicyForPublish(payload, {
        userDataPath: await tempDir(),
        env: { MIN_PUBLISH_INTERVAL_MINUTES: '0', DAILY_PUBLISH_CAP: '10' },
        now: new Date('2026-02-01T12:00:00.000Z'),
      });

      expect(result.allowed).toBe(true);
      expect(result.policyResult.block_reasons).not.toContain('BLOCK_KEYWORD_BODY_MISMATCH');
      expect(result.payload.contentPolicyContext?.input.primary_keyword).toBe(payload.title);
    },
  );

  it.each([
    ['full_auto', false],
    ['continuous', false],
    ['multi_account', false],
    ['legacy_form', false],
    ['app_scheduler', false],
    ['smart_scheduler', false],
    ['semi_auto', true],
  ] as const)(
    'does not hard-block a score-only quality miss in the %s flow',
    async (publishFlow, semiAutoMode) => {
      const payload = payloadWithContext();
      payload._publishFlow = publishFlow;
      payload._semiAutoMode = semiAutoMode;
      payload.structuredContent = {
        ...payload.structuredContent,
        summary: '',
        headings: [],
        faq: [],
        cta: '',
      };

      const result = await prepareContentPolicyForPublish(payload, {
        userDataPath: await tempDir(),
        env: { MIN_PUBLISH_INTERVAL_MINUTES: '0', DAILY_PUBLISH_CAP: '10' },
        now: new Date('2026-02-01T12:00:00.000Z'),
      });

      expect(result.policyResult.quality_report.total_score).toBeLessThan(85);
      expect(result.policyResult.quality_report.fatal_errors).toEqual([]);
      expect(result.policyResult.block_reasons).not.toContain('BLOCK_QUALITY_SCORE');
      expect(result.policyResult.decision).toBe('PASS');
      expect(result.allowed).toBe(true);
    },
  );

  it.each([
    ['full_auto', false],
    ['continuous', false],
    ['multi_account', false],
    ['legacy_form', false],
    ['app_scheduler', false],
    ['semi_auto', true],
  ] as const)('warns but continues for a genuinely unrelated final title and body in %s', async (publishFlow, semiAutoMode) => {
    const payload = payloadWithContext();
    payload._publishFlow = publishFlow;
    payload._semiAutoMode = semiAutoMode;
    payload.title = '제주도 렌터카 보험 비교와 예약 방법';
    payload.structuredContent.selectedTitle = payload.title;

    const result = await prepareContentPolicyForPublish(payload, {
      userDataPath: await tempDir(),
      env: { MIN_PUBLISH_INTERVAL_MINUTES: '0', DAILY_PUBLISH_CAP: '10' },
      now: new Date('2026-02-01T12:00:00.000Z'),
    });

    expect(result.allowed).toBe(true);
    expect(result.advisoryReasons).toContain('BLOCK_KEYWORD_BODY_MISMATCH');
  });

  it('recovers an old scheduled or legacy payload without embedded policy context', async () => {
    const userDataPath = await tempDir();
    await new RecentPostsRepository(userDataPath).mergeSnapshot(makeRecentPosts());
    const payload = payloadWithContext();
    delete (payload as any).contentPolicyContext;
    (payload as any)._publishFlow = 'app_scheduler';

    const result = await prepareContentPolicyForPublish(payload, {
      userDataPath,
      env: { MIN_PUBLISH_INTERVAL_MINUTES: '0', DAILY_PUBLISH_CAP: '10' },
      now: new Date('2026-02-01T12:00:00.000Z'),
    });

    expect(result.allowed).toBe(true);
    expect(result.payload.contentPolicyContext?.input.input_origin).toBe('final_draft_payload');
    expect(result.payload.contentPolicyContext?.input.primary_keyword).toBe(payload.title);
  });

  it('derives a neutral target reader when old payload metadata is blank', async () => {
    const payload = payloadWithContext();
    payload.contentPolicyContext.input.target_reader = '';

    const result = await prepareContentPolicyForPublish(payload, {
      userDataPath: await tempDir(),
      env: { MIN_PUBLISH_INTERVAL_MINUTES: '0', DAILY_PUBLISH_CAP: '10' },
      now: new Date('2026-02-01T12:00:00.000Z'),
    });

    expect(result.allowed).toBe(true);
    expect(result.reasons).not.toContain('BLOCK_MISSING_TARGET_READER');
    expect(result.payload.contentPolicyContext?.input.target_reader).toBe('이 주제의 정보를 찾는 독자');
  });

  it('preserves only final-body evidence when affiliate or business keywords are stale', async () => {
    const payload = payloadWithContext();
    payload.contentMode = 'affiliate';
    payload._publishFlow = 'full_auto';
    payload.contentPolicyContext.input.business_facts_applicable = true;
    payload.contentPolicyContext.input.primary_keyword = '과거에 생성한 전혀 다른 상품 키워드';
    payload.contentPolicyContext.input.business_facts = [
      '작업 전 가족이 귀중품을 먼저 확인한다.',
      '현재 원고와 무관한 오래된 상품은 99,000원이다.',
    ];

    const result = await prepareContentPolicyForPublish(payload, {
      userDataPath: await tempDir(),
      env: { MIN_PUBLISH_INTERVAL_MINUTES: '0', DAILY_PUBLISH_CAP: '10' },
      now: new Date('2026-02-01T12:00:00.000Z'),
    });

    expect(result.allowed).toBe(true);
    expect(result.payload.contentPolicyContext?.input.business_facts).toContain(
      '작업 전 가족이 귀중품을 먼저 확인한다.',
    );
    expect(result.payload.contentPolicyContext?.input.business_facts).not.toContain(
      '현재 원고와 무관한 오래된 상품은 99,000원이다.',
    );
  });

  it('still warns but continues for an unrelated title and body in semi-auto mode', async () => {
    const payload = payloadWithContext();
    payload._semiAutoMode = true;
    payload.title = '제주도 렌터카 보험 비교와 예약 방법';
    payload.structuredContent.selectedTitle = payload.title;
    payload.keywords = ['과거 생성 키워드'];
    payload.contentPolicyContext.input.primary_keyword = '과거 생성 키워드';

    const result = await prepareContentPolicyForPublish(payload, {
      userDataPath: await tempDir(),
      env: { MIN_PUBLISH_INTERVAL_MINUTES: '0', DAILY_PUBLISH_CAP: '10' },
      now: new Date('2026-02-01T12:00:00.000Z'),
    });

    expect(result.allowed).toBe(true);
    expect(result.advisoryReasons).toContain('BLOCK_KEYWORD_BODY_MISMATCH');
  });

  it('warns and continues when recent-post comparison data is unavailable', async () => {
    const payload = payloadWithContext();
    payload.contentPolicyContext.input.recent_posts = undefined;
    payload.contentPolicyContext.recentPostsSnapshot = [];
    payload.contentPolicyContext.recentPostsResult = {
      ok: false as const,
      code: 'RECENT_POSTS_UNAVAILABLE' as const,
      message: 'renderer storage missing',
    };
    const result = await prepareContentPolicyForPublish(payload, {
      userDataPath: await tempDir(),
      env: { MIN_PUBLISH_INTERVAL_MINUTES: '0' },
    });

    expect(result.allowed).toBe(true);
    expect(result.advisoryReasons).toContain('BLOCK_RECENT_POSTS_UNAVAILABLE');
    expect(result.policyResult.publication.manual_review_required).toBe(false);
  });

  it('wires the guard before browser creation in the common BlogExecutor flow', async () => {
    const source = await fs.readFile(path.resolve(process.cwd(), 'src/main/services/BlogExecutor.ts'), 'utf8');
    const guard = source.indexOf('prepareContentPolicyForPublish');
    const browser = source.indexOf('getOrCreateBrowserSession(account)');

    expect(guard).toBeGreaterThan(-1);
    expect(browser).toBeGreaterThan(guard);
    expect(source).toContain('CONTENT_POLICY_BLOCKED');
  });

  it('forwards the semi-auto mode marker to the main-process policy boundary', async () => {
    const source = await fs.readFile(path.resolve(process.cwd(), 'src/renderer/modules/fullAutoFlow.ts'), 'utf8');
    expect(source).toContain('_semiAutoMode: formData._semiAutoMode === true');
  });

  it('wires every renderer and main-process publish entry to the shared policy contract', async () => {
    const legacyForm = await fs.readFile(path.resolve(process.cwd(), 'src/renderer/modules/formAndAutomation.ts'), 'utf8');
    const fullAuto = await fs.readFile(path.resolve(process.cwd(), 'src/renderer/modules/fullAutoFlow.ts'), 'utf8');
    const main = await fs.readFile(path.resolve(process.cwd(), 'src/main.ts'), 'utf8');

    expect(legacyForm).toContain('buildRendererContentPolicyContext');
    expect(legacyForm).toContain("_publishFlow: 'legacy_form'");
    expect(fullAuto).toContain("? 'semi_auto'");
    expect(fullAuto).toContain("? 'continuous'");
    expect(fullAuto).toContain(": 'full_auto'");
    expect(main).toContain("_publishFlow: 'multi_account'");
    expect(main).toContain("_publishFlow: 'app_scheduler'");
    expect(main).toContain("_publishFlow: 'smart_scheduler'");
  });

  it('generates a complete SmartScheduler draft before entering the publish boundary', async () => {
    const main = await fs.readFile(path.resolve(process.cwd(), 'src/main.ts'), 'utf8');
    const callbackStart = main.indexOf('smartScheduler.setPublishCallback');
    const generation = main.indexOf('prepareSmartScheduledContent', callbackStart);
    const publishing = main.indexOf('AutomationService.executePostCycle', callbackStart);

    expect(generation).toBeGreaterThan(callbackStart);
    expect(publishing).toBeGreaterThan(generation);
    expect(main.slice(callbackStart, generation)).toContain('withAbortableDeadline');
    expect(main.slice(callbackStart, publishing)).not.toContain('content: post.keyword || post.title');
  });

  it('runs the generated-draft policy guard before images are handed to full auto', async () => {
    const source = await fs.readFile(path.resolve(process.cwd(), 'src/main.ts'), 'utf8');
    const generation = source.indexOf('generateStructuredContentWithProductPolicy(source');
    const postGenerationGuard = source.indexOf('guardGeneratedContent');
    const imageHandoff = source.indexOf('if (source.images && source.images.length > 0)', postGenerationGuard);

    expect(generation).toBeGreaterThan(-1);
    expect(postGenerationGuard).toBeGreaterThan(generation);
    expect(imageHandoff).toBeGreaterThan(postGenerationGuard);
  });

  it('always registers successful policy publications for exposure polling without duplicates', async () => {
    const userDataPath = await tempDir();
    const payload = payloadWithContext();
    const prepared = await prepareContentPolicyForPublish(payload, {
      userDataPath,
      env: { MIN_PUBLISH_INTERVAL_MINUTES: '0', DAILY_PUBLISH_CAP: '10' },
      now: new Date('2026-02-01T12:00:00.000Z'),
    });
    const publication = {
      userDataPath,
      articleId: prepared.articleId,
      accountId: 'account-a',
      payload: prepared.payload,
      policyResult: prepared.policyResult,
      publishedUrl: 'https://blog.naver.com/account-a/123456',
      publishedAt: new Date('2026-02-01T12:01:00.000Z'),
    };

    await recordContentPolicyPublication(publication);
    await recordContentPolicyPublication(publication);

    const tracked = loadPublishedPosts(userDataPath);
    expect(tracked).toHaveLength(1);
    expect(tracked[0].keyword).toBe(payload.contentPolicyContext.input.primary_keyword);
    expect(tracked[0].logNo).toBe('123456');
  });

  it('records the core publication ledger even when the exposure URL is unavailable', async () => {
    const userDataPath = await tempDir();
    const prepared = await prepareContentPolicyForPublish(payloadWithContext(), {
      userDataPath,
      env: { MIN_PUBLISH_INTERVAL_MINUTES: '0', DAILY_PUBLISH_CAP: '10' },
      now: new Date('2026-02-01T12:00:00.000Z'),
    });

    await expect(recordContentPolicyPublication({
      userDataPath,
      articleId: prepared.articleId,
      accountId: 'account-a',
      payload: prepared.payload,
      policyResult: prepared.policyResult,
      publishedUrl: '',
      publishedAt: new Date('2026-02-01T12:01:00.000Z'),
    })).resolves.toEqual({
      advisoryReasons: ['POLICY_EXPOSURE_TARGET_INVALID'],
    });

    const recent = await new RecentPostsRepository(userDataPath).loadRecentPosts(500);
    expect(recent.ok && recent.posts.some((post) => post.article_id === prepared.articleId)).toBe(true);
    const state = await new PublicationStateStore(userDataPath).load();
    expect(state.history).toHaveLength(1);
    expect(state.last_advisory_reason).toContain('POLICY_EXPOSURE_TARGET_INVALID');
    expect(loadPublishedPosts(userDataPath)).toHaveLength(0);
  });

  it('keeps a failed exposure-tracker write advisory after the core ledger is recorded', async () => {
    const userDataPath = await tempDir();
    const prepared = await prepareContentPolicyForPublish(payloadWithContext(), {
      userDataPath,
      env: { MIN_PUBLISH_INTERVAL_MINUTES: '0', DAILY_PUBLISH_CAP: '10' },
      now: new Date('2026-02-01T12:00:00.000Z'),
    });
    await fs.mkdir(path.join(userDataPath, 'published-posts.json'));

    const result = await recordContentPolicyPublication({
      userDataPath,
      articleId: prepared.articleId,
      accountId: 'account-a',
      payload: prepared.payload,
      policyResult: prepared.policyResult,
      publishedUrl: 'https://blog.naver.com/account-a/223000099',
      publishedAt: new Date('2026-02-01T12:01:00.000Z'),
    });

    expect(result.advisoryReasons).toContain('POLICY_EXPOSURE_QUEUE_WRITE_FAILED');
    const state = await new PublicationStateStore(userDataPath).load();
    expect(state.history).toHaveLength(1);
    expect(state.last_advisory_reason).toContain('POLICY_EXPOSURE_QUEUE_WRITE_FAILED');
  });

  it('audits the final PublishGuard BLOCK instead of a stale pipeline PASS', async () => {
    const userDataPath = await tempDir();
    await new PublicationStateStore(userDataPath).pauseAll('operator pause');
    const result = await prepareContentPolicyForPublish(payloadWithContext(), {
      userDataPath,
      env: { MIN_PUBLISH_INTERVAL_MINUTES: '0', DAILY_PUBLISH_CAP: '10' },
      now: new Date('2026-02-01T12:00:00.000Z'),
    });
    const audits = await new ContentPolicyAuditStore(userDataPath).readRecent(10);

    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain('BLOCK_PUBLISH_PAUSED');
    expect(audits[0].decision).toBe('BLOCK');
    expect(audits[0].block_reasons).toContain('BLOCK_PUBLISH_PAUSED');
  });

  it('recovers a legacy automatic pause and publishes with an advisory', async () => {
    const userDataPath = await tempDir();
    await new PublicationStateStore(userDataPath).save({
      status: 'PAUSED',
      pause_reason: 'EXPOSURE_MONITOR_FAILURE',
      paused_at: '2026-02-01T11:00:00.000Z',
      paused_templates: [],
      paused_structures: [],
      confirmed_missing_streak: 0,
      history: [],
    });

    const result = await prepareContentPolicyForPublish(payloadWithContext(), {
      userDataPath,
      env: { MIN_PUBLISH_INTERVAL_MINUTES: '0', DAILY_PUBLISH_CAP: '10' },
      now: new Date('2026-02-01T12:00:00.000Z'),
    });

    expect(result.allowed).toBe(true);
    expect(result.reasons).toEqual([]);
    expect(result.advisoryReasons).toContain('ADVISORY_BACKGROUND_POLICY:EXPOSURE_MONITOR_FAILURE');
  });

  it('keeps core post-publish ledger failures as integrity pauses', async () => {
    const source = await fs.readFile(path.resolve(process.cwd(), 'src/main/services/BlogExecutor.ts'), 'utf8');
    const reasonIndex = source.indexOf('POLICY_POST_PUBLISH_RECORD_FAILED:');
    const nextBlock = source.slice(reasonIndex, reasonIndex + 1200);

    expect(reasonIndex).toBeGreaterThan(-1);
    expect(nextBlock).toContain("pauseAll(reason, 'integrity')");
  });

  it('skips cadence for drafts but evaluates schedules at their target time', async () => {
    const now = new Date('2026-02-01T12:00:00.000Z');
    const env = { MIN_PUBLISH_INTERVAL_MINUTES: '60', DAILY_PUBLISH_CAP: '1' };

    const immediateDir = await tempDir();
    await new PublicationStateStore(immediateDir).recordPublication({
      article_id: 'recent-immediate',
      account_id: 'account-a',
      published_at: new Date(now.getTime() - 5 * 60_000).toISOString(),
      template_id: 'other-template',
      structure_type: 'other-structure',
      topic_angle: 'other-angle',
      exposure_status: 'INDEXED',
    });
    const immediate = await prepareContentPolicyForPublish(payloadWithContext(), {
      userDataPath: immediateDir,
      env,
      now,
    });

    const draftDir = await tempDir();
    await new PublicationStateStore(draftDir).recordPublication({
        article_id: 'recent-draft',
        account_id: 'account-a',
        published_at: new Date(now.getTime() - 5 * 60_000).toISOString(),
        template_id: 'other-template',
        structure_type: 'other-structure',
        topic_angle: 'other-angle',
        exposure_status: 'INDEXED',
    });
    const draftPayload = payloadWithContext();
    draftPayload.publishMode = 'draft';
    const draft = await prepareContentPolicyForPublish(draftPayload, { userDataPath: draftDir, env, now });

    const scheduleDir = await tempDir();
    await new PublicationStateStore(scheduleDir).recordPublication({
      article_id: 'recent-schedule',
      account_id: 'account-a',
      published_at: new Date(2026, 1, 1, 12, 5).toISOString(),
      template_id: 'other-template',
      structure_type: 'other-structure',
      topic_angle: 'other-angle',
      exposure_status: 'INDEXED',
    });
    const schedulePayload = payloadWithContext() as any;
    schedulePayload.publishMode = 'schedule';
    schedulePayload.scheduleDate = '2026-02-01';
    schedulePayload.scheduleTime = '12:30';
    const schedule = await prepareContentPolicyForPublish(schedulePayload, {
      userDataPath: scheduleDir,
      env,
      now,
    });

    expect(immediate.allowed).toBe(false);
    expect(immediate.reasons).toContain('BLOCK_MIN_PUBLISH_INTERVAL');
    expect(immediate.reasons).toContain('BLOCK_DAILY_PUBLISH_CAP');
    expect(draft.allowed).toBe(true);
    expect(schedule.allowed).toBe(false);
    expect(schedule.reasons).toContain('BLOCK_MIN_PUBLISH_INTERVAL');
    expect(schedule.reasons).toContain('BLOCK_DAILY_PUBLISH_CAP');
  });

  it('still blocks a scheduled publish when its target date is invalid', async () => {
    const payload = payloadWithContext() as any;
    payload.publishMode = 'schedule';
    payload.scheduleDate = '';
    payload.scheduleTime = '';

    const result = await prepareContentPolicyForPublish(payload, {
      userDataPath: await tempDir(),
      env: { MIN_PUBLISH_INTERVAL_MINUTES: '60', DAILY_PUBLISH_CAP: '1' },
      now: new Date('2026-02-01T12:00:00.000Z'),
    });

    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain('BLOCK_INVALID_SCHEDULE_DATE');
    expect(result.advisoryReasons).not.toContain('BLOCK_INVALID_SCHEDULE_DATE');
  });

  it('records a reservation and lets the same article replace its own slot later', async () => {
    const userDataPath = await tempDir();
    const payload = payloadWithContext() as any;
    payload.postId = 'scheduled-post-1';
    payload.publishMode = 'schedule';
    payload.scheduleDate = '2026-02-02';
    payload.scheduleTime = '09:30';
    const prepared = await prepareContentPolicyForPublish(payload, {
      userDataPath,
      env: { MIN_PUBLISH_INTERVAL_MINUTES: '60', DAILY_PUBLISH_CAP: '1' },
      now: new Date('2026-02-01T12:00:00.000Z'),
    });

    expect(prepared.allowed).toBe(true);
    await recordContentPolicyReservation({
      userDataPath,
      articleId: prepared.articleId,
      accountId: 'account-a',
      payload: prepared.payload,
      policyResult: prepared.policyResult,
      scheduledAt: new Date(2026, 1, 2, 9, 30),
    });
    expect(loadPublishedPosts(userDataPath)).toHaveLength(0);

    const repeated = await prepareContentPolicyForPublish(payload, {
      userDataPath,
      env: { MIN_PUBLISH_INTERVAL_MINUTES: '60', DAILY_PUBLISH_CAP: '1' },
      now: new Date('2026-02-02T09:29:00.000Z'),
    });
    expect(repeated.allowed).toBe(true);
  });

  it('does not let an already published local post id bypass cadence on republish', async () => {
    const userDataPath = await tempDir();
    const payload = payloadWithContext() as any;
    payload.postId = 'already-published-local-id';
    const first = await prepareContentPolicyForPublish(payload, {
      userDataPath,
      env: { MIN_PUBLISH_INTERVAL_MINUTES: '60', DAILY_PUBLISH_CAP: '10' },
      now: new Date('2026-02-01T12:00:00.000Z'),
    });
    expect(first.allowed).toBe(true);

    await recordContentPolicyPublication({
      userDataPath,
      articleId: first.articleId,
      accountId: 'account-a',
      payload: first.payload,
      policyResult: first.policyResult,
      publishedUrl: 'https://blog.naver.com/account-a/223000002',
      publishedAt: new Date('2026-02-01T12:01:00.000Z'),
    });

    const repeated = await prepareContentPolicyForPublish(payload, {
      userDataPath,
      env: { MIN_PUBLISH_INTERVAL_MINUTES: '60', DAILY_PUBLISH_CAP: '10' },
      now: new Date('2026-02-01T12:02:00.000Z'),
    });

    expect(repeated.allowed).toBe(false);
    expect(repeated.reasons).toContain('BLOCK_MIN_PUBLISH_INTERVAL');
    expect(repeated.advisoryReasons).toContain('BLOCK_EXCESSIVE_SIMILARITY');
  });

  it('warns but publishes when only the consecutive template/structure heuristic matches', async () => {
    const userDataPath = await tempDir();
    const firstPayload = payloadWithContext() as any;
    firstPayload.postId = 'first-pattern-post';
    const first = await prepareContentPolicyForPublish(firstPayload, {
      userDataPath,
      env: { MIN_PUBLISH_INTERVAL_MINUTES: '0', DAILY_PUBLISH_CAP: '10' },
      now: new Date('2026-02-01T12:00:00.000Z'),
    });
    expect(first.allowed).toBe(true);

    await recordContentPolicyPublication({
      userDataPath,
      articleId: first.articleId,
      accountId: 'account-a',
      payload: first.payload,
      policyResult: first.policyResult,
      publishedUrl: 'https://blog.naver.com/account-a/223000003',
      publishedAt: new Date('2026-02-01T12:01:00.000Z'),
    });

    const nextPayload = payloadWithContext() as any;
    nextPayload.postId = 'next-pattern-post';
    const next = await prepareContentPolicyForPublish(nextPayload, {
      userDataPath,
      env: { MIN_PUBLISH_INTERVAL_MINUTES: '0', DAILY_PUBLISH_CAP: '10' },
      now: new Date('2026-02-01T12:02:00.000Z'),
    });
    const audits = await new ContentPolicyAuditStore(userDataPath).readRecent(10);

    expect(next.allowed).toBe(true);
    expect(next.reasons).toEqual([]);
    expect(next.advisoryReasons).toContain('BLOCK_CONSECUTIVE_PATTERN');
    expect(audits[0].decision).toBe('PASS');
  });

  it('records query-style Naver post URLs without pausing the publication ledger', async () => {
    const userDataPath = await tempDir();
    const prepared = await prepareContentPolicyForPublish(payloadWithContext(), {
      userDataPath,
      env: { MIN_PUBLISH_INTERVAL_MINUTES: '0', DAILY_PUBLISH_CAP: '10' },
    });

    await expect(recordContentPolicyPublication({
      userDataPath,
      articleId: prepared.articleId,
      accountId: 'account-a',
      payload: prepared.payload,
      policyResult: prepared.policyResult,
      publishedUrl: 'https://blog.naver.com/PostView.naver?blogId=account-a&logNo=223000001',
    })).resolves.toEqual({ advisoryReasons: [] });

    expect(loadPublishedPosts(userDataPath)[0]).toMatchObject({
      blogId: 'account-a',
      logNo: '223000001',
    });
  });
});
