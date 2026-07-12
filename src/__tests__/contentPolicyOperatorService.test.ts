import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  getContentPolicyDashboard,
  pauseContentPolicyPublishing,
  recordManualTestEvidence,
  resumeContentPolicyPublishing,
} from '../contentPolicy/operatorService';
import { ContentPolicyAuditStore } from '../contentPolicy/auditStore';
import { PublicationStateStore } from '../contentPolicy/publicationStateStore';
import { makePassPolicyResult } from './contentPolicyFixtures';

const tempDirs: string[] = [];

async function tempDir(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'policy-operator-'));
  tempDirs.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe('content policy operator service', () => {
  it('provides a dashboard and requires both resume confirmations', async () => {
    const userDataPath = await tempDir();
    const initial = await getContentPolicyDashboard(userDataPath);
    expect(initial.state.status).toBe('ACTIVE');
    expect(initial.recentPosts.status).toBe('UNAVAILABLE');

    const paused = await pauseContentPolicyPublishing(userDataPath, 'operator maintenance');
    expect(paused.status).toBe('PAUSED');
    const incidentState = await new PublicationStateStore(userDataPath).update((state) => ({
      ...state,
      pause_incident: {
        article_id: 'missing-article',
        blog_id: 'manual-test',
        primary_keyword: 'manual keyword',
        template_id: 'reader-guide-v1',
        structure_type: 'question-led',
        detected_at: state.paused_at!,
      },
    }));
    const afterPause = new Date(Date.parse(incidentState.paused_at!) + 1_000);

    await expect(resumeContentPolicyPublishing(userDataPath, {
      approvedBy: 'operator',
      rootCauseReviewed: true,
      manualTestVerified: false,
    })).rejects.toThrow(/ROOT_CAUSE_EVIDENCE_REQUIRED|MANUAL_TEST_REQUIRED/);

    await expect(resumeContentPolicyPublishing(userDataPath, {
      approvedBy: 'operator',
      rootCauseReviewed: true,
      manualTestVerified: true,
    })).rejects.toThrow(/ROOT_CAUSE_EVIDENCE_REQUIRED|MANUAL_TEST_EVIDENCE_REQUIRED/);

    const result = makePassPolicyResult();
    await new ContentPolicyAuditStore(userDataPath).append({
      article_id: 'missing-article', created_at: '2026-07-12T00:00:00.000Z',
      input_hash: result.input_hash, selected_intent: result.intent.type,
      topic_angle: result.uniqueness_plan.topic_angle, structure_type: result.uniqueness_plan.structure_type,
      template_id: result.publication.template_id, similarity_scores: result.similarity_report,
      quality_score: result.quality_report.total_score, rewrite_count: result.rewrite_count,
      decision: result.decision, block_reasons: [], prompt_version: result.prompt_version,
      model_version: result.model_version, policy_version: result.policy_version,
      exposure_status: 'MISSING_CONFIRMED',
      primary_keyword: 'manual keyword', blog_id: 'manual-test',
      root_cause_analysis: {
        category: 'CONFIRMED_DISCOVERY_FAILURE', conclusive: true,
        analyzed_at: afterPause.toISOString(),
      },
    });

    await expect(recordManualTestEvidence(userDataPath, {
      url: 'https://blog.naver.com/unrelated-blog/98765',
      title: 'Unrelated post',
      keyword: 'manual keyword',
      verifiedAt: afterPause,
      checks: [
        { method: 'url_access', outcome: 'FOUND', checked_at: afterPause.toISOString() },
        { method: 'exact_title_search', outcome: 'FOUND', checked_at: afterPause.toISOString() },
      ],
    })).rejects.toThrow(/MANUAL_TEST_BLOG_MISMATCH/);

    await recordManualTestEvidence(userDataPath, {
      url: 'https://blog.naver.com/manual-test/98765',
      title: 'Manual verification post',
      keyword: 'manual keyword',
      verifiedAt: afterPause,
      checks: [
        { method: 'url_access', outcome: 'FOUND', checked_at: '2026-07-12T01:00:00.000Z' },
        { method: 'exact_title_search', outcome: 'FOUND', checked_at: '2026-07-12T01:00:01.000Z' },
      ],
    });

    const resumed = await resumeContentPolicyPublishing(userDataPath, {
      approvedBy: 'operator',
      rootCauseReviewed: true,
      manualTestVerified: true,
    });
    expect(resumed.status).toBe('ACTIVE');
    expect(resumed.resume_approval?.approved_by).toBe('operator');
    expect(resumed.resume_approval?.manual_test_article_id).toContain('98765');
  });

  it('does not accept root-cause analysis from before the current pause', async () => {
    const userDataPath = await tempDir();
    const result = makePassPolicyResult();
    await new ContentPolicyAuditStore(userDataPath).append({
      article_id: 'old-miss', created_at: '2026-01-01T00:00:00.000Z',
      input_hash: result.input_hash, selected_intent: result.intent.type,
      topic_angle: result.uniqueness_plan.topic_angle, structure_type: result.uniqueness_plan.structure_type,
      template_id: result.publication.template_id, similarity_scores: result.similarity_report,
      quality_score: result.quality_report.total_score, rewrite_count: result.rewrite_count,
      decision: result.decision, block_reasons: [], prompt_version: result.prompt_version,
      model_version: result.model_version, policy_version: result.policy_version,
      exposure_status: 'MISSING_CONFIRMED',
      root_cause_analysis: {
        category: 'CONFIRMED_DISCOVERY_FAILURE', conclusive: true,
        analyzed_at: '2026-01-01T00:01:00.000Z',
      },
    });
    const paused = await pauseContentPolicyPublishing(userDataPath, 'new incident');
    await new PublicationStateStore(userDataPath).update((state) => ({
      ...state,
      manual_test_evidence: {
        article_id: 'manual-test-blog-2', blog_id: 'blog', primary_keyword: 'keyword',
        url: 'https://blog.naver.com/blog/2', title: 'test',
        verified_at: new Date(Date.parse(paused.paused_at!) + 1_000).toISOString(),
        passed: true,
        checks: [
          { method: 'url_access', outcome: 'FOUND', checked_at: new Date().toISOString() },
          { method: 'exact_title_search', outcome: 'FOUND', checked_at: new Date().toISOString() },
        ],
      },
    }));

    await expect(resumeContentPolicyPublishing(userDataPath, {
      approvedBy: 'operator', rootCauseReviewed: true, manualTestVerified: true,
    })).rejects.toThrow(/ROOT_CAUSE_EVIDENCE_REQUIRED/);
  });
});
