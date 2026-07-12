import { ContentPolicyAuditStore } from './auditStore.js';
import { applyExposureChecks } from './exposureMonitor.js';
import { loadContentPolicy } from './policyLoader.js';
import { PublicationStateStore } from './publicationStateStore.js';
import { RecentPostsRepository } from './recentPostsRepository.js';
import { analyzeRootCause, type RootCauseAnalysis } from './rootCauseAnalyzer.js';
import type {
  AuditRecord,
  ExposureCheck,
  MonitoredPublication,
  PublicationState,
  RecentPostRecord,
} from './types.js';

export interface ExposureMonitoringTarget {
  trackerId: string;
  title: string;
  keyword: string;
  blogId: string;
  logNo: string;
  url: string;
}

export interface ProcessExposureMonitoringOptions {
  userDataPath: string;
  target: ExposureMonitoringTarget;
  checks: readonly ExposureCheck[];
  now?: Date;
  policyPath?: string;
}

export interface ProcessExposureMonitoringResult {
  publication: MonitoredPublication;
  state: PublicationState;
  rootCause?: RootCauseAnalysis;
}

function normalize(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}

function matchesTarget(post: RecentPostRecord, target: ExposureMonitoringTarget): boolean {
  if (post.article_id === target.trackerId) return true;
  if (post.url && target.url && normalize(post.url) === normalize(target.url)) return true;
  if (post.url && target.logNo && post.url.includes(target.logNo)) return true;
  return Boolean(post.title && target.title && normalize(post.title) === normalize(target.title));
}

export async function processExposureMonitoring(
  options: ProcessExposureMonitoringOptions,
): Promise<ProcessExposureMonitoringResult> {
  const now = options.now || new Date();
  const repository = new RecentPostsRepository(options.userDataPath);
  const stateStore = new PublicationStateStore(options.userDataPath);
  const auditStore = new ContentPolicyAuditStore(options.userDataPath);
  const config = await loadContentPolicy(options.policyPath ? { policyPath: options.policyPath } : {});
  const recentResult = await repository.loadRecentPosts(500);
  if (!recentResult.ok) {
    await stateStore.pauseAll(`EXPOSURE_${recentResult.code}`);
    throw new Error(recentResult.code);
  }
  const recentPost = recentResult.posts.find((post) => matchesTarget(post, options.target));
  if (!recentPost) {
    await stateStore.pauseAll('EXPOSURE_ARTICLE_METADATA_UNAVAILABLE');
    throw new Error('EXPOSURE_ARTICLE_METADATA_UNAVAILABLE');
  }

  const state = await stateStore.load();
  const historyEntry = [...state.history]
    .reverse()
    .find((entry) => entry.article_id === recentPost.article_id);
  if (!historyEntry) {
    await stateStore.pauseAll('EXPOSURE_PUBLICATION_HISTORY_UNAVAILABLE');
    throw new Error('EXPOSURE_PUBLICATION_HISTORY_UNAVAILABLE');
  }
  let audits: AuditRecord[];
  try {
    audits = await auditStore.readRecent(1000);
  } catch (error) {
    await stateStore.pauseAll('EXPOSURE_AUDIT_LOG_CORRUPT');
    throw error;
  }
  const previousAudit = audits.find((record) => record.article_id === recentPost.article_id);
  if (!previousAudit) {
    await stateStore.pauseAll('EXPOSURE_AUDIT_UNAVAILABLE');
    throw new Error('EXPOSURE_AUDIT_UNAVAILABLE');
  }

  const publication: MonitoredPublication = {
    article_id: recentPost.article_id,
    title: recentPost.title,
    blog_id: options.target.blogId,
    primary_keyword: options.target.keyword,
    template_id: recentPost.template_id || historyEntry.template_id,
    structure_type: recentPost.structure_type || historyEntry.structure_type,
    topic_angle: recentPost.topic_angle || historyEntry.topic_angle,
    published_at: recentPost.published_at || historyEntry.published_at,
    exposure_status: recentPost.exposure_status || historyEntry.exposure_status || 'PENDING_INDEX',
    exposure_checks: previousAudit.exposure_checks?.map((check) => ({ ...check })) || [],
  };
  let monitored: ReturnType<typeof applyExposureChecks>;
  let rootCause: RootCauseAnalysis | undefined;
  try {
    const savedState = await stateStore.update((currentState) => {
      monitored = applyExposureChecks(publication, options.checks, currentState, config, now);
      return monitored.state;
    });
    monitored = { ...monitored!, state: savedState };
    rootCause = monitored.publication.exposure_status === 'MISSING_CONFIRMED'
      ? analyzeRootCause(monitored.publication, now, {
        recentPosts: recentResult.posts,
        audits,
        state: monitored.state,
      })
      : undefined;
    const updated = await repository.updateExposureStatus(
      recentPost.article_id,
      monitored.publication.exposure_status,
    );
    if (!updated) throw new Error('EXPOSURE_ARTICLE_UPDATE_FAILED');
    await auditStore.append({
      ...previousAudit,
      created_at: now.toISOString(),
      exposure_status: monitored.publication.exposure_status,
      exposure_checks: monitored.publication.exposure_checks.map((check) => ({ ...check })),
      exposure_check_methods: [...new Set(monitored.publication.exposure_checks.map((check) => check.method))],
      exposure_checked_at: now.toISOString(),
      pause_reason: monitored.state.pause_reason,
      resume_approval: monitored.state.resume_approval ? { ...monitored.state.resume_approval } : undefined,
      root_cause_analysis: rootCause
        ? {
          category: rootCause.category,
          conclusive: rootCause.conclusive,
          analyzed_at: rootCause.analyzed_at,
          findings: rootCause.findings.map((finding) => ({ ...finding })),
          recommended_changes: [...rootCause.recommended_changes],
        }
        : undefined,
    });
  } catch (error) {
    await stateStore.pauseAll('EXPOSURE_MONITOR_PERSISTENCE_FAILURE');
    throw error;
  }

  return {
    publication: monitored!.publication,
    state: monitored!.state,
    rootCause,
  };
}
