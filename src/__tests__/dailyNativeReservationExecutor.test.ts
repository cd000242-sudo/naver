import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { injectDependencies, runFullPostCycle } from '../main/services/BlogExecutor.js';
import { AutomationService } from '../main/services/AutomationService.js';
import { attachDailyNativeReservation, assertDailyNativeReservationCommit, hasDailyNativeReservation,
  verifyDailyNativeReservation } from '../automation/dailyNativeReservation.js';

const policy = vi.hoisted(() => ({ change: {} as Record<string, unknown>, calls: [] as object[] }));
vi.mock('../main/utils/ipcHelpers.js', () => ({ sendLog: vi.fn(), sendStatus: vi.fn(), sendProgress: vi.fn() }));
vi.mock('../main/utils/logger.js', () => ({ Logger: { info: vi.fn(), debug: vi.fn(), error: vi.fn() } }));
vi.mock('../quality/generationRunResume.js', () => ({ openGenerationRun: () => undefined }));
vi.mock('../scheduledPostsManager.js', () => ({ getAllScheduledPosts: async () => [], removeScheduledPost: vi.fn(), saveScheduledPost: vi.fn() }));
vi.mock('../contentPolicy/policyService.js', () => ({
  prepareContentPolicyForPublish: async (input: object) => {
    policy.calls.push(input);
    return { payload: { ...structuredClone(input), ...policy.change }, allowed: true, articleId: 'fixture',
      manualReviewReasons: [], advisoryReasons: [], reasons: [], policyResult: {
        quality_report: { total_score: 100, unsupported_claims: [] }, similarity_report: { compared_post_count: 20 } } };
  },
  recordContentPolicyReservation: async () => ({ advisoryReasons: [] }),
  recordContentPolicyPublication: async () => ({ advisoryReasons: [] }),
}));
vi.mock('../contentQualityV3/publishHandoffStore.js', () => ({
  ContentQualityV3PublishHandoffError: class extends Error {}, contentQualityV3PublishHandoffStore: {},
  enforceContentQualityV3PublishPayload: async (_store: object, input: object) => structuredClone(input),
  hasContentQualityV3ProvenanceSignal: () => false,
}));

const scheduledFor = '2099-10-21T00:00:00.000Z', title = '검수한 실제 예약 제목';
const request = { blogId: 'myblog', categoryId: '3', title, scheduledFor };
const context = { naverId: 'native-fixture', naverPassword: 'fixture-only' };
function fixture(adapterEnabled = true) {
  const payload = { postId: 'daily-native', title, content: '실제 원고', structuredContent: { selectedTitle: title, bodyPlain: '실제 원고' },
    publishMode: 'schedule' as const, scheduleType: 'naver-server' as const, scheduleDate: '2099-10-21', scheduleTime: '09:00',
    blogId: 'myblog', categoryId: '3', categoryName: '이슈', skipImages: true };
  const adapter = { open: vi.fn(async () => undefined), read: vi.fn(async () => ({
    url: 'https://blog.naver.com/PostList.naver?blogId=myblog', blogId: 'myblog', listVisible: true,
    rows: [{ title, scheduledAt: '2099-10-21 09:00', categoryId: '3', state: 'scheduled' as const }] })) };
  attachDailyNativeReservation(payload, request, adapterEnabled ? { adapter } : {});
  const run = vi.fn(async (options: any) => {
    expect(hasDailyNativeReservation(options)).toBe(true);
    assertDailyNativeReservationCommit(options, { mode: options.publishMode, title: options.title, blogId: options.blogId,
      categoryId: options.categoryId, scheduleDate: options.scheduleDate });
    const scheduledPublication = await verifyDailyNativeReservation(options, { url: () => 'https://blog.naver.com/PostList.naver?blogId=myblog' } as any);
    return { success: true, scheduledPublication };
  });
  const create = vi.fn(() => ({ run }));
  injectDependencies({ loadConfig: async () => ({}), applyConfigToEnv: () => undefined, createAutomation: create,
    blogAccountManager: { getAllAccounts: () => [{ naverId: context.naverId, blogId: 'myblog' }] } } as any);
  return { payload, run, create, adapter };
}

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2099-10-20T23:30:00.000Z'));
  vi.stubEnv('CONTENT_QUALITY_V3_STRICT_PUBLISH_VERIFICATION', '0');
  policy.change = {}; policy.calls = []; AutomationService.getMap().clear();
  AutomationService.resetCancelFlag();
});
afterEach(() => { AutomationService.getMap().clear(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe('daily native request through the complete copied-payload pipeline', () => {
  it.each(['0', '1'])('preserves private binding and native proof across quality/policy/previous-post copies (strict=%s)', async strict => {
    vi.stubEnv('CONTENT_QUALITY_V3_STRICT_PUBLISH_VERIFICATION', strict);
    const f = fixture();
    const result = await runFullPostCycle(f.payload, context);
    expect(policy.calls[0]).not.toBe(f.payload);
    expect(result.success).toBe(true);
    expect(f.run).toHaveBeenCalledTimes(1);
    expect(result.scheduledPublication).toMatchObject({ status: 'reserved', scheduledFor, title, blogId: 'myblog', categoryId: '3', verification: 'naver-reservation-list' });
  });
  it.each([{ publishMode: 'publish' }, { categoryId: '4' }, { blogId: 'other' }, { scheduleTime: '10:00' },
    { structuredContent: { selectedTitle: '정책 단계에서 바뀐 제목', bodyPlain: '실제 원고' } }, { scheduleType: 'app-schedule' }])(
    'holds an altered final scope before browser creation: %j', async change => {
      const f = fixture(); policy.change = change;
      const result = await runFullPostCycle(f.payload, context);
      expect(result.success).toBe(false);
      expect(result.message).toContain('DAILY_NATIVE_RESERVATION_SCOPE');
      expect(f.create).not.toHaveBeenCalled(); expect(f.run).not.toHaveBeenCalled();
    });
  it('keeps an absent adapter held before browser creation despite all intermediate copies', async () => {
    const f = fixture(false);
    const result = await runFullPostCycle(f.payload, context);
    expect(result.success).toBe(false);
    expect(result.message).toContain('DAILY_NATIVE_RESERVATION_ADAPTER_REQUIRED');
    expect(f.create).not.toHaveBeenCalled();
  });
});
