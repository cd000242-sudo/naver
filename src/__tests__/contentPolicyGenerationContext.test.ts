import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { prepareGenerationPolicyContext } from '../contentPolicy/generationContext';
import { loadContentPolicy } from '../contentPolicy/policyLoader';
import { PublicationStateStore } from '../contentPolicy/publicationStateStore';
import { makePolicyInput, makeRecentPosts } from './contentPolicyFixtures';

const tempDirs: string[] = [];

async function tempDir(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'content-policy-generation-'));
  tempDirs.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe('generation policy context', () => {
  it('injects every required recent-post field before draft generation', async () => {
    const userDataPath = await tempDir();
    const recentPosts = makeRecentPosts(20).map((post, index) => ({
      ...post,
      url: `https://blog.naver.com/example/${index}`,
    }));
    const config = await loadContentPolicy();

    const result = await prepareGenerationPolicyContext({
      userDataPath,
      config,
      context: {
        input: makePolicyInput({ recent_posts: recentPosts }),
        recentPostsSnapshot: recentPosts,
        recentPostsResult: { ok: true, posts: recentPosts, source: 'renderer-test' },
      },
    });

    expect(result.allowed).toBe(true);
    expect(result.input.recent_posts).toHaveLength(20);
    expect(result.prompt).toContain('recent-0');
    expect(result.prompt).toContain(recentPosts[0].title);
    expect(result.prompt).toContain(recentPosts[0].intro);
    expect(result.prompt).toContain(recentPosts[0].headings[0]);
    expect(result.prompt).toContain(recentPosts[0].body);
    expect(result.prompt).toContain(recentPosts[0].topic_angle);
    expect(result.prompt).toContain(recentPosts[0].structure_type);
    expect(result.prompt).toContain(recentPosts[0].business_facts![0]);
    expect(result.prompt).toContain(recentPosts[0].related_questions![0]);
    expect(result.prompt).toContain(recentPosts[0].published_at!);
    expect(result.prompt).toContain(recentPosts[0].exposure_status!);
  });

  it('continues generation but requires publish review when fewer than the minimum posts are available', async () => {
    const userDataPath = await tempDir();
    const recentPosts = makeRecentPosts(19);
    const config = await loadContentPolicy();

    const result = await prepareGenerationPolicyContext({
      userDataPath,
      config,
      context: {
        input: makePolicyInput({ recent_posts: recentPosts }),
        recentPostsSnapshot: recentPosts,
        recentPostsResult: { ok: true, posts: recentPosts, source: 'renderer-test' },
      },
    });

    expect(result.allowed).toBe(true);
    expect(result.reasons).toContain('BLOCK_INSUFFICIENT_RECENT_POSTS');
    expect(result.manualReviewRequired).toBe(true);
    expect(result.prompt).toContain(recentPosts[0].title);
  });

  it('does not require business facts for a generic informational article', async () => {
    const userDataPath = await tempDir();
    const recentPosts = makeRecentPosts(20);
    const result = await prepareGenerationPolicyContext({
      userDataPath,
      config: await loadContentPolicy(),
      context: {
        input: makePolicyInput({
          input_origin: 'generated',
          business_facts_applicable: false,
          business_facts: [],
          recent_posts: recentPosts,
        }),
        recentPostsSnapshot: recentPosts,
      },
    });

    expect(result.allowed).toBe(true);
    expect(result.reasons).not.toContain('BLOCK_MISSING_FACTS');
  });

  it('keeps missing business facts as a warning so generation can continue', async () => {
    const userDataPath = await tempDir();
    const recentPosts = makeRecentPosts(20);
    const result = await prepareGenerationPolicyContext({
      userDataPath,
      config: await loadContentPolicy(),
      context: {
        input: makePolicyInput({
          input_origin: 'generated',
          business_facts_applicable: true,
          business_facts: [],
          recent_posts: recentPosts,
        }),
        recentPostsSnapshot: recentPosts,
      },
    });

    expect(result.allowed).toBe(true);
    expect(result.reasons).toContain('BLOCK_MISSING_FACTS');
    expect(result.prompt).toContain('recent-0');
  });

  it('keeps missing reader context as a warning instead of blocking generation', async () => {
    const userDataPath = await tempDir();
    const recentPosts = makeRecentPosts(20);
    const result = await prepareGenerationPolicyContext({
      userDataPath,
      config: await loadContentPolicy(),
      context: {
        input: makePolicyInput({
          target_reader: '',
          recent_posts: recentPosts,
        }),
        recentPostsSnapshot: recentPosts,
      },
    });

    expect(result.allowed).toBe(true);
    expect(result.reasons).toContain('BLOCK_MISSING_TARGET_READER');
    expect(result.prompt).toContain('recent-0');
  });

  it('allows draft generation but keeps publish review required when all history is unavailable', async () => {
    const userDataPath = await tempDir();
    const config = await loadContentPolicy();

    const result = await prepareGenerationPolicyContext({
      userDataPath,
      config,
      context: {
        input: makePolicyInput({ recent_posts: undefined }),
        recentPostsResult: {
          ok: false,
          code: 'RECENT_POSTS_UNAVAILABLE',
          message: 'renderer history missing',
        },
      },
    });

    expect(result.allowed).toBe(true);
    expect(result.reasons).toContain('BLOCK_RECENT_POSTS_UNAVAILABLE');
    expect(result.manualReviewRequired).toBe(true);
    expect(result.prompt).toBe('');
  });

  it('blocks before generation APIs when automatic publishing is paused', async () => {
    const userDataPath = await tempDir();
    const recentPosts = makeRecentPosts(20);
    await new PublicationStateStore(userDataPath).pauseAll('operator pause');

    const result = await prepareGenerationPolicyContext({
      userDataPath,
      config: await loadContentPolicy(),
      context: {
        input: makePolicyInput({ recent_posts: recentPosts }),
        recentPostsSnapshot: recentPosts,
      },
      env: { MIN_PUBLISH_INTERVAL_MINUTES: '0', DAILY_PUBLISH_CAP: '10' },
    });

    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain('BLOCK_PUBLISH_PAUSED');
    expect(result.prompt).toBe('');
  });

  it('recovers a legacy automatic exposure pause as an advisory and keeps generation available', async () => {
    const userDataPath = await tempDir();
    const recentPosts = makeRecentPosts(20);
    const stateStore = new PublicationStateStore(userDataPath);
    await stateStore.save({
      status: 'PAUSED',
      pause_reason: 'EXPOSURE_MONITOR_FAILURE',
      paused_at: '2026-07-18T09:00:00.000Z',
      paused_templates: [],
      paused_structures: [],
      confirmed_missing_streak: 0,
      history: [],
    });

    const result = await prepareGenerationPolicyContext({
      userDataPath,
      config: await loadContentPolicy(),
      context: {
        input: makePolicyInput({ recent_posts: recentPosts }),
        recentPostsSnapshot: recentPosts,
      },
      env: { MIN_PUBLISH_INTERVAL_MINUTES: '0', DAILY_PUBLISH_CAP: '10' },
    });

    expect(result.allowed).toBe(true);
    expect(result.reasons).toContain('ADVISORY_BACKGROUND_POLICY:EXPOSURE_MONITOR_FAILURE');
    expect(result.prompt).toContain(recentPosts[0].title);
  });

  // [v2.11.136] 계약 변경: 손상된 발행 원장은 예전엔 영구 차단(크레딧 낭비 방지
  // 명분)이었으나, 파일을 격리+재생성하는 자기치유(quota식)를 도입해 근본 원인이
  // 사라졌다 — 재생성된 원장에 발행이 정상 기록되므로 차단할 이유가 없다. 잃는 것은
  // 손상 시점의 cadence/일일캡 이력뿐(영구 잠금보다 작은 트레이드오프, A-3 리포트).
  it('self-heals a corrupt publication ledger and allows generation to proceed', async () => {
    const userDataPath = await tempDir();
    const recentPosts = makeRecentPosts(20);
    const stateStore = new PublicationStateStore(userDataPath);
    await fs.writeFile(stateStore.filePath, '{broken', 'utf8');

    const result = await prepareGenerationPolicyContext({
      userDataPath,
      config: await loadContentPolicy(),
      context: {
        input: makePolicyInput({ recent_posts: recentPosts }),
        recentPostsSnapshot: recentPosts,
      },
    });

    expect(result.allowed).toBe(true);
    expect(result.reasons).not.toContain('BLOCK_PUBLICATION_STATE_UNAVAILABLE');

    // 원장은 유효 JSON으로 재생성되고 관측 마커가 남는다(영구 고착 없음).
    const rebuilt = await stateStore.load();
    expect(rebuilt.status).toBe('ACTIVE');
    expect(rebuilt.last_advisory_reason).toBe('STATE_REBUILT_FROM_CORRUPT');
  });

  it('places the multi-account operational gate before content and image generation', async () => {
    const source = await fs.readFile(path.resolve(process.cwd(), 'src/main.ts'), 'utf8');
    const handlerStart = source.indexOf("ipcMain.handle('multiAccount:publish'");
    const gate = source.indexOf('evaluatePublicationAvailability({', handlerStart);
    const contentGeneration = source.indexOf('generateStructuredContentWithProductPolicy(source as any', handlerStart);
    const imageGeneration = source.indexOf('generateImages({', handlerStart);

    expect(handlerStart).toBeGreaterThan(-1);
    expect(gate).toBeGreaterThan(handlerStart);
    expect(contentGeneration).toBeGreaterThan(gate);
    expect(imageGeneration).toBeGreaterThan(gate);
  });
});
