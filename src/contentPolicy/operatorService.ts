import { ContentPolicyAuditStore } from './auditStore.js';
import { loadContentPolicy } from './policyLoader.js';
import { PublicationStateStore } from './publicationStateStore.js';
import { RecentPostsRepository } from './recentPostsRepository.js';
import { resumePublicationState, type ResumeApprovalInput } from './rootCauseAnalyzer.js';
import type { AuditRecord, ExposureCheck, ExposureStatus, PublicationState } from './types.js';

export interface ContentPolicyDashboard {
  state: PublicationState;
  recentPosts: {
    status: 'AVAILABLE' | 'UNAVAILABLE' | 'CORRUPT';
    count: number;
    source?: string;
    message?: string;
  };
  summary: {
    pass: number;
    block: number;
    rewrite: number;
    exposure: Record<ExposureStatus, number>;
  };
  audits: AuditRecord[];
  policy: {
    version: number;
    minimumRecentPosts: number;
    recommendedRecentPosts: number;
    qualityPassScore: number;
    minimumCrossChecks: number;
  };
}

function exposureSummary(audits: readonly AuditRecord[]): Record<ExposureStatus, number> {
  const result: Record<ExposureStatus, number> = {
    PENDING_INDEX: 0,
    INDEXED: 0,
    MISSING_SUSPECT: 0,
    MISSING_CONFIRMED: 0,
    CHECK_ERROR: 0,
  };
  const latest = new Map<string, AuditRecord>();
  for (const audit of audits) {
    if (!latest.has(audit.article_id)) latest.set(audit.article_id, audit);
  }
  for (const audit of latest.values()) {
    if (audit.exposure_status) result[audit.exposure_status] += 1;
  }
  return result;
}

export async function getContentPolicyDashboard(
  userDataPath: string,
  auditLimit = 100,
): Promise<ContentPolicyDashboard> {
  const stateStore = new PublicationStateStore(userDataPath);
  const auditStore = new ContentPolicyAuditStore(userDataPath);
  const recentRepository = new RecentPostsRepository(userDataPath);
  const [state, audits, recent, policy] = await Promise.all([
    stateStore.load(),
    auditStore.readRecent(auditLimit),
    recentRepository.loadRecentPosts(50),
    loadContentPolicy(),
  ]);
  return {
    state,
    recentPosts: recent.ok
      ? { status: 'AVAILABLE', count: recent.posts.length, source: recent.source }
      : {
        status: recent.code === 'RECENT_POSTS_CORRUPT' ? 'CORRUPT' : 'UNAVAILABLE',
        count: 0,
        message: recent.message,
      },
    summary: {
      pass: audits.filter((audit) => audit.decision === 'PASS').length,
      block: audits.filter((audit) => audit.decision === 'BLOCK').length,
      rewrite: audits.filter((audit) => audit.decision === 'REWRITE').length,
      exposure: exposureSummary(audits),
    },
    audits: audits.map((audit) => JSON.parse(JSON.stringify(audit)) as AuditRecord),
    policy: {
      version: policy.version,
      minimumRecentPosts: policy.similarity.compare_recent_posts_min,
      recommendedRecentPosts: policy.similarity.compare_recent_posts_recommended,
      qualityPassScore: policy.quality_gate.pass_score,
      minimumCrossChecks: policy.monitoring.minimum_cross_checks,
    },
  };
}

export async function pauseContentPolicyPublishing(
  userDataPath: string,
  reason: string,
): Promise<PublicationState> {
  const normalizedReason = reason.trim().slice(0, 500);
  if (!normalizedReason) throw new Error('PAUSE_REASON_REQUIRED');
  return new PublicationStateStore(userDataPath).pauseAll(normalizedReason);
}

export async function recordManualTestEvidence(
  userDataPath: string,
  input: {
    url: string;
    title: string;
    keyword: string;
    checks: readonly ExposureCheck[];
    verifiedAt?: Date;
  },
): Promise<PublicationState> {
  const url = input.url.trim();
  const title = input.title.trim();
  const keyword = input.keyword.trim();
  const match = url.match(/^https:\/\/blog\.naver\.com\/([^/?#]+)\/(\d+)(?:[/?#]|$)/i);
  if (!match || !title || !keyword) throw new Error('MANUAL_TEST_TARGET_INVALID');
  const foundMethods = new Set(input.checks
    .filter((check) => check.outcome === 'FOUND')
    .map((check) => check.method));
  const hasUrlEvidence = foundMethods.has('url_access');
  const hasSearchEvidence = foundMethods.has('exact_title_search')
    || foundMethods.has('integrated_search')
    || foundMethods.has('blog_search_tab');
  if (!hasUrlEvidence || !hasSearchEvidence || foundMethods.size < 2) {
    throw new Error('MANUAL_TEST_EXPOSURE_NOT_VERIFIED');
  }

  const store = new PublicationStateStore(userDataPath);
  const verifiedAt = input.verifiedAt || new Date();
  if (!Number.isFinite(verifiedAt.getTime())) throw new Error('MANUAL_TEST_VERIFIED_AT_INVALID');
  return store.update((state) => {
    if (state.status !== 'PAUSED') throw new Error('PUBLICATION_NOT_PAUSED');
    const pausedAt = Date.parse(state.paused_at || '');
    if (Number.isFinite(pausedAt) && verifiedAt.getTime() < pausedAt) {
      throw new Error('MANUAL_TEST_PREDATES_CURRENT_PAUSE');
    }
    const incident = state.pause_incident;
    if (incident?.blog_id && normalize(incident.blog_id) !== normalize(match[1])) {
      throw new Error('MANUAL_TEST_BLOG_MISMATCH');
    }
    if (incident?.primary_keyword && normalize(incident.primary_keyword) !== normalize(keyword)) {
      throw new Error('MANUAL_TEST_KEYWORD_MISMATCH');
    }
    if (state.pause_reason === 'TWO_CONSECUTIVE_CONFIRMED_MISSING' && !incident) {
      throw new Error('PAUSE_INCIDENT_CONTEXT_REQUIRED');
    }
    return {
      ...state,
      history: state.history.map((entry) => ({ ...entry })),
      manual_test_evidence: {
        article_id: `manual-test-${match[1]}-${match[2]}`,
        incident_article_id: incident?.article_id,
        blog_id: match[1],
        primary_keyword: keyword,
        url,
        title,
        verified_at: verifiedAt.toISOString(),
        passed: true,
        checks: input.checks.map((check) => ({ ...check })),
      },
    };
  });
}

export async function resumeContentPolicyPublishing(
  userDataPath: string,
  approval: ResumeApprovalInput,
): Promise<PublicationState> {
  const store = new PublicationStateStore(userDataPath);
  const auditStore = new ContentPolicyAuditStore(userDataPath);
  const [policy, audits] = await Promise.all([
    loadContentPolicy(),
    auditStore.readRecent(1000),
  ]);
  return store.update((currentState) => {
    const isIntegrityPause = currentState.pause_origin === 'integrity';
    const pausedAt = Date.parse(currentState.paused_at || '');
    const incidentArticleId = currentState.pause_incident?.article_id;
    const rootCauseEvidence = audits.some((audit) => {
      const analyzedAt = Date.parse(audit.root_cause_analysis?.analyzed_at || '');
      return audit.exposure_status === 'MISSING_CONFIRMED'
        && Boolean(audit.root_cause_analysis)
        && (!incidentArticleId || audit.article_id === incidentArticleId)
        && (!Number.isFinite(pausedAt) || (Number.isFinite(analyzedAt) && analyzedAt >= pausedAt));
    });
    if (!isIntegrityPause && policy.monitoring.require_root_cause_analysis && !rootCauseEvidence) {
      throw new Error('ROOT_CAUSE_EVIDENCE_REQUIRED');
    }
    return resumePublicationState(currentState, approval, policy);
  });
}

function normalize(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}
