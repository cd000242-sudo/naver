import { validatePolicyInput } from './inputValidator.js';
import { PublicationStateStore } from './publicationStateStore.js';
import { evaluatePublicationAvailability } from './publishGuard.js';
import { RecentPostsRepository } from './recentPostsRepository.js';
import type { ContentPolicyPayloadContext } from './policyService.js';
import type {
  ContentPolicyConfig,
  ContentPolicyInput,
  RecentPostRecord,
  RecentPostsLoadResult,
} from './types.js';

export interface PrepareGenerationPolicyContextOptions {
  userDataPath: string;
  config: ContentPolicyConfig;
  context?: ContentPolicyPayloadContext;
  fallbackInput?: Partial<ContentPolicyInput>;
  env?: Readonly<Record<string, string | undefined>>;
  now?: Date;
}

export interface PreparedGenerationPolicyContext {
  allowed: boolean;
  reasons: string[];
  manualReviewRequired: boolean;
  input: ContentPolicyInput;
  recentPostsResult: RecentPostsLoadResult;
  prompt: string;
}

const EMPTY_INPUT: ContentPolicyInput = {
  primary_keyword: '',
  target_reader: '',
  business_facts: [],
};

function mergeBaseInput(
  contextInput: ContentPolicyInput | undefined,
  fallback: Partial<ContentPolicyInput> | undefined,
): ContentPolicyInput {
  const base = contextInput || EMPTY_INPUT;
  return {
    ...fallback,
    ...base,
    primary_keyword: base.primary_keyword || fallback?.primary_keyword || '',
    target_reader: base.target_reader || fallback?.target_reader || '',
    business_facts: base.business_facts.length > 0
      ? [...base.business_facts]
      : [...(fallback?.business_facts || [])],
    source_materials: base.source_materials?.length
      ? base.source_materials.map((source) => ({ ...source }))
      : fallback?.source_materials?.map((source) => ({ ...source })),
    related_questions: base.related_questions?.length
      ? [...base.related_questions]
      : [...(fallback?.related_questions || [])],
  };
}

function clonePost(post: RecentPostRecord): RecentPostRecord {
  return {
    ...post,
    headings: [...post.headings],
    business_facts: post.business_facts ? [...post.business_facts] : undefined,
    related_questions: post.related_questions ? [...post.related_questions] : undefined,
  };
}

function cloneInput(input: ContentPolicyInput, recentPosts?: readonly RecentPostRecord[]): ContentPolicyInput {
  return {
    ...input,
    secondary_keywords: input.secondary_keywords ? [...input.secondary_keywords] : undefined,
    business_facts: [...input.business_facts],
    source_materials: input.source_materials?.map((source) => ({ ...source })),
    related_questions: input.related_questions ? [...input.related_questions] : undefined,
    recent_posts: recentPosts?.map(clonePost),
    fixed_disclosures: input.fixed_disclosures ? [...input.fixed_disclosures] : undefined,
    forbidden_claims: input.forbidden_claims ? [...input.forbidden_claims] : undefined,
  };
}

function loadFailureReason(result: RecentPostsLoadResult): string {
  if (result.ok) return '';
  return result.code === 'RECENT_POSTS_CORRUPT'
    ? 'BLOCK_RECENT_POSTS_CORRUPT'
    : 'BLOCK_RECENT_POSTS_UNAVAILABLE';
}

export function buildRecentPostsGenerationPrompt(input: ContentPolicyInput): string {
  const posts = input.recent_posts || [];
  if (posts.length === 0) return '';

  const payload = posts.map((post) => ({
    article_id: post.article_id,
    title: post.title,
    introduction: post.intro,
    headings: [...post.headings],
    body: post.body,
    topic_angle: post.topic_angle,
    structure_type: post.structure_type,
    business_facts: [...(post.business_facts || [])],
    related_questions: [...(post.related_questions || [])],
    published_at: post.published_at || null,
    exposure_status: post.exposure_status || null,
    template_id: post.template_id || null,
    url: post.url || null,
  }));

  return [
    '[CONTENT_POLICY_RECENT_POSTS_V1]',
    'The following records are the author\'s recent published posts.',
    'Use every field only to avoid repeated titles, openings, headings, sentences, topic angles, and structures.',
    'Do not copy, lightly paraphrase, or invent facts from these records.',
    `CURRENT_PRIMARY_KEYWORD=${input.primary_keyword}`,
    `CURRENT_TARGET_READER=${input.target_reader}`,
    `CURRENT_BUSINESS_FACTS=${JSON.stringify(input.business_facts)}`,
    `CURRENT_RELATED_QUESTIONS=${JSON.stringify(input.related_questions || [])}`,
    `RECENT_POST_COUNT=${payload.length}`,
    JSON.stringify(payload),
    '[/CONTENT_POLICY_RECENT_POSTS_V1]',
  ].join('\n');
}

async function resolveRecentPosts(
  repository: RecentPostsRepository,
  context: ContentPolicyPayloadContext | undefined,
  recommendedCount: number,
): Promise<RecentPostsLoadResult> {
  const snapshot = context?.recentPostsSnapshot?.length
    ? context.recentPostsSnapshot
    : context?.input.recent_posts || [];
  if (snapshot.length > 0) await repository.mergeSnapshot(snapshot);

  const stored = await repository.loadRecentPosts(recommendedCount);
  if (stored.ok && stored.posts.length > 0) return stored;
  if (context?.recentPostsResult?.ok) {
    return {
      ...context.recentPostsResult,
      posts: context.recentPostsResult.posts.slice(0, recommendedCount).map(clonePost),
    };
  }
  return stored;
}

export async function prepareGenerationPolicyContext(
  options: PrepareGenerationPolicyContextOptions,
): Promise<PreparedGenerationPolicyContext> {
  const baseInput = mergeBaseInput(options.context?.input, options.fallbackInput);
  const repository = new RecentPostsRepository(options.userDataPath);
  const stateStore = new PublicationStateStore(options.userDataPath);
  let recentPostsResult: RecentPostsLoadResult;
  const operationalReasons: string[] = [];

  try {
    const state = await stateStore.load();
    const availability = evaluatePublicationAvailability({
      state,
      accountId: baseInput.account_id || baseInput.blog_id || 'default-account',
      now: options.now || new Date(),
      config: options.config,
      env: options.env,
    });
    operationalReasons.push(...availability.reasons);
  } catch {
    operationalReasons.push('BLOCK_PUBLICATION_STATE_UNAVAILABLE');
  }

  try {
    recentPostsResult = await resolveRecentPosts(
      repository,
      options.context,
      options.config.similarity.compare_recent_posts_recommended,
    );
  } catch (error) {
    recentPostsResult = {
      ok: false,
      code: 'RECENT_POSTS_CORRUPT',
      message: `Recent-post persistence failed: ${(error as Error).message}`,
    };
  }

  if (!recentPostsResult.ok) {
    return {
      allowed: false,
      reasons: [...new Set([...operationalReasons, loadFailureReason(recentPostsResult)])],
      manualReviewRequired: true,
      input: cloneInput(baseInput),
      recentPostsResult,
      prompt: '',
    };
  }

  const recentPosts = recentPostsResult.posts.slice(
    0,
    options.config.similarity.compare_recent_posts_recommended,
  );
  const input = cloneInput(baseInput, recentPosts);
  const reasons: string[] = [...operationalReasons];
  if (recentPosts.length < options.config.similarity.compare_recent_posts_min) {
    reasons.push('BLOCK_INSUFFICIENT_RECENT_POSTS');
  }
  reasons.push(...validatePolicyInput(input, undefined, options.config).blockReasons);
  const uniqueReasons = [...new Set(reasons)];

  return {
    allowed: uniqueReasons.length === 0,
    reasons: uniqueReasons,
    manualReviewRequired: uniqueReasons.length > 0,
    input,
    recentPostsResult: {
      ...recentPostsResult,
      posts: recentPosts.map(clonePost),
    },
    prompt: uniqueReasons.length === 0 ? buildRecentPostsGenerationPrompt(input) : '',
  };
}
