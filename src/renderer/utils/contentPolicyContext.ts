import type {
  ContentPolicyInput,
  RecentPostRecord,
  RecentPostsLoadResult,
  SourceMaterial,
} from '../../contentPolicy/types.js';
import { GENERATED_POSTS_KEY } from './postStorageUtils.js';

export interface RendererContentPolicySource {
  title: string;
  content: string;
  keywords?: string[] | string;
  structuredContent?: Record<string, any>;
  businessInfo?: Record<string, unknown>;
  contentMode?: string;
  targetReader?: string;
  accountId?: string;
  blogId?: string;
  cta?: string;
  templateId?: string;
}

export interface RendererContentPolicyContext {
  input: ContentPolicyInput;
  recentPostsSnapshot: RecentPostRecord[];
  recentPostsResult: RecentPostsLoadResult;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  if (typeof value === 'string') return value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean);
  return [];
}

function flattenStrings(value: unknown): string[] {
  if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
  if (Array.isArray(value)) return value.flatMap(flattenStrings);
  if (!value || typeof value !== 'object') return [];
  return Object.values(value as Record<string, unknown>).flatMap(flattenStrings);
}

function normalizeHeadings(value: unknown): Array<{ title: string; content: string }> {
  if (!Array.isArray(value)) return [];
  return value.map((heading) => {
    if (typeof heading === 'string') return { title: heading.trim(), content: '' };
    const record = heading && typeof heading === 'object' ? heading as Record<string, unknown> : {};
    return {
      title: text(record.title || record.heading),
      content: text(record.content || record.body || record.summary),
    };
  }).filter((heading) => heading.title || heading.content);
}

function inferTopicAngle(title: string, headings: readonly string[]): string {
  const source = `${title} ${headings.join(' ')}`;
  if (/보관|분류|귀중품/.test(source)) return 'storage_and_sorting';
  if (/기부|폐기/.test(source)) return 'donation_and_disposal';
  if (/비용|가격|요금/.test(source)) return 'cost_factors';
  if (/실수|주의/.test(source)) return 'common_mistakes';
  if (/기간|시간|일정/.test(source)) return 'time_and_scheduling';
  if (/사후|관리/.test(source)) return 'aftercare';
  if (/준비|체크/.test(source)) return 'preparation_checklist';
  if (/지역|이용/.test(source)) return 'local_guide';
  return 'process';
}

function inferStructureType(body: string, headings: readonly string[]): string {
  const source = `${headings.join(' ')} ${body}`;
  if (/FAQ|자주 묻|Q\.|질문/.test(source)) return 'faq_guide';
  if (/비교|장단점|차이/.test(source)) return 'comparison_matrix';
  if (/체크리스트|준비물|□|☐|✓/.test(source)) return 'decision_checklist';
  if (/실수|주의/.test(source)) return 'mistake_prevention';
  if (/1\.|2\.|첫째|둘째|단계/.test(source)) return 'step_by_step';
  return 'reader_guide';
}

function normalizeStoredPost(value: unknown, index: number): RecentPostRecord | null {
  if (!value || typeof value !== 'object') return null;
  const post = value as Record<string, any>;
  if (!post.publishedUrl && post.isPublished !== true && !post.publishedAt) return null;
  const structured = post.structuredContent && typeof post.structuredContent === 'object'
    ? post.structuredContent as Record<string, any>
    : {};
  const title = text(post.title || structured.selectedTitle || structured.title);
  const body = text(post.content || structured.bodyPlain || structured.content);
  const headingModels = normalizeHeadings(post.headings || structured.headings);
  const headings = headingModels.map((heading) => heading.title).filter(Boolean);
  const intro = text(structured.introduction)
    || body.split(/\n\s*\n/).map((part) => part.trim()).find(Boolean)
    || '';
  if (!title || !intro || !body || headings.length === 0) return null;
  return {
    article_id: text(post.id || structured._postId) || `stored-${index}`,
    title,
    intro,
    headings,
    body,
    topic_angle: text(structured.topic_angle || structured.topicAngle) || inferTopicAngle(title, headings),
    structure_type: text(structured.structure_type || structured.structureType) || inferStructureType(body, headings),
    business_facts: stringList(structured.business_facts || structured.businessFacts),
    related_questions: stringList(structured.related_questions || structured.relatedQuestions),
    published_at: text(post.publishedAt || post.createdAt) || undefined,
    exposure_status: text(structured.exposure_status || structured.exposureStatus) as RecentPostRecord['exposure_status']
      || (post.publishedUrl ? 'PENDING_INDEX' : 'CHECK_ERROR'),
    template_id: text(structured.template_id || structured.templateId) || 'legacy-generated-post',
    url: text(post.publishedUrl) || undefined,
  };
}

function loadRecentSnapshot(storage: Storage): { posts: RecentPostRecord[]; result: RecentPostsLoadResult } {
  const raw = storage.getItem(GENERATED_POSTS_KEY);
  if (raw === null) {
    return {
      posts: [],
      result: { ok: false, code: 'RECENT_POSTS_UNAVAILABLE', message: 'Generated-post storage is missing.' },
    };
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('Generated-post storage is not an array.');
    const posts = parsed.map(normalizeStoredPost)
      .filter((post): post is RecentPostRecord => Boolean(post))
      .sort((left, right) => (Date.parse(right.published_at || '') || 0) - (Date.parse(left.published_at || '') || 0))
      .slice(0, 50);
    return { posts, result: { ok: true, posts, source: GENERATED_POSTS_KEY } };
  } catch (error) {
    return {
      posts: [],
      result: { ok: false, code: 'RECENT_POSTS_CORRUPT', message: (error as Error).message },
    };
  }
}

function normalizeSourceMaterials(structured: Record<string, any>): SourceMaterial[] {
  const sourceValues = Array.isArray(structured.source_materials)
    ? structured.source_materials
    : Array.isArray(structured.sourceMaterials) ? structured.sourceMaterials : [];
  return sourceValues.map((value: unknown, index: number) => {
    const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    return {
      type: ['first_party', 'official', 'reference', 'user_provided'].includes(text(record.type))
        ? text(record.type) as SourceMaterial['type']
        : 'reference',
      title: text(record.title) || `source-${index + 1}`,
      content: text(record.content || record.text),
      url: text(record.url) || undefined,
      source_id: text(record.source_id || record.id) || undefined,
    };
  }).filter((source: SourceMaterial) => source.content || source.url);
}

export function buildRendererContentPolicyContext(
  source: RendererContentPolicySource,
  storage: Storage = localStorage,
): RendererContentPolicyContext {
  const structured = source.structuredContent || {};
  const embeddedContext = structured.contentPolicyContext && typeof structured.contentPolicyContext === 'object'
    ? structured.contentPolicyContext as Record<string, any>
    : {};
  const embeddedInput = embeddedContext.input && typeof embeddedContext.input === 'object'
    ? embeddedContext.input as Record<string, any>
    : {};
  const recent = loadRecentSnapshot(storage);
  const keywords = stringList(source.keywords);
  const primaryKeyword = keywords[0]
    || text(embeddedInput.primary_keyword || embeddedInput.primaryKeyword)
    || text(structured.primary_keyword || structured.primaryKeyword)
    || source.title.trim();
  const headings = normalizeHeadings(structured.headings);
  const relatedQuestions = stringList(structured.related_questions || structured.relatedQuestions)
    .concat(stringList(embeddedInput.related_questions || embeddedInput.relatedQuestions))
    .concat(Array.isArray(structured.faq)
      ? structured.faq.map((item: any) => text(item?.question)).filter(Boolean)
      : []);
  const businessFacts = Array.from(new Set([
    ...stringList(structured.business_facts || structured.businessFacts),
    ...stringList(embeddedInput.business_facts || embeddedInput.businessFacts),
    ...flattenStrings(source.businessInfo),
  ])).filter(Boolean);
  const input: ContentPolicyInput = {
    primary_keyword: primaryKeyword,
    secondary_keywords: keywords.slice(1).length > 0
      ? keywords.slice(1)
      : stringList(embeddedInput.secondary_keywords || embeddedInput.secondaryKeywords),
    region: text(structured.region || embeddedInput.region) || undefined,
    service: text(structured.service || embeddedInput.service) || primaryKeyword,
    target_reader: source.targetReader?.trim()
      || text(embeddedInput.target_reader || embeddedInput.targetReader)
      || text(structured.target_reader || structured.targetReader)
      || (source.contentMode === 'business' ? '서비스 이용을 검토하는 독자' : '해당 정보를 찾는 네이버 사용자'),
    search_intent_hint: text(structured.search_intent_hint || structured.searchIntentHint
      || embeddedInput.search_intent_hint || embeddedInput.searchIntentHint) || undefined,
    content_goal: text(structured.content_goal || structured.contentGoal
      || embeddedInput.content_goal || embeddedInput.contentGoal) || '정확한 정보와 실행 가능한 다음 단계 제공',
    business_facts: businessFacts,
    source_materials: normalizeSourceMaterials({
      ...structured,
      source_materials: structured.source_materials || structured.sourceMaterials
        || embeddedInput.source_materials || embeddedInput.sourceMaterials,
    }),
    related_questions: Array.from(new Set(relatedQuestions)).slice(0, 10),
    recent_posts: recent.result.ok ? recent.posts : undefined,
    fixed_disclosures: stringList(structured.fixed_disclosures || structured.fixedDisclosures
      || embeddedInput.fixed_disclosures || embeddedInput.fixedDisclosures),
    forbidden_claims: stringList(structured.forbidden_claims || structured.forbiddenClaims)
      .concat(stringList(embeddedInput.forbidden_claims || embeddedInput.forbiddenClaims))
      .concat(['상위 노출 보장', '100% 해결']),
    cta: source.cta?.trim() || text(structured.cta || embeddedInput.cta) || undefined,
    template_id: source.templateId?.trim() || text(structured.template_id || structured.templateId)
      || text(embeddedInput.template_id || embeddedInput.templateId)
      || inferStructureType(source.content, headings.map((heading) => heading.title)),
    account_id: source.accountId?.trim() || text(embeddedInput.account_id) || undefined,
    blog_id: source.blogId?.trim() || text(embeddedInput.blog_id) || undefined,
  };
  return {
    input,
    recentPostsSnapshot: recent.posts,
    recentPostsResult: recent.result,
  };
}
