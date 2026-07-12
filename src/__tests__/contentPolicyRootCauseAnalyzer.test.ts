import { describe, expect, it } from 'vitest';
import { analyzeRootCause } from '../contentPolicy/rootCauseAnalyzer';
import type { AuditRecord, MonitoredPublication, PublicationState, RecentPostRecord } from '../contentPolicy/types';
import { makePassPolicyResult } from './contentPolicyFixtures';

describe('RootCauseAnalyzer', () => {
  it('compares a missing post with indexed posts across content and publishing signals', () => {
    const publication: MonitoredPublication = {
      article_id: 'missing-1',
      title: 'Retirement support application guide',
      template_id: 'guide-v1',
      structure_type: 'checklist',
      topic_angle: 'process',
      published_at: '2026-07-12T00:00:00.000Z',
      exposure_status: 'MISSING_CONFIRMED',
      exposure_checks: [
        { method: 'exact_title_search', outcome: 'NOT_FOUND', checked_at: '2026-07-12T01:00:00.000Z' },
        { method: 'integrated_search', outcome: 'NOT_FOUND', checked_at: '2026-07-12T01:00:01.000Z' },
      ],
    };
    const commonIntro = 'Check eligibility first and prepare the required documents before applying.';
    const recentPosts: RecentPostRecord[] = [
      {
        article_id: 'missing-1', title: publication.title, intro: commonIntro,
        headings: ['Eligibility', 'Documents', 'Application'], body: `${commonIntro} Eligibility documents application.`,
        topic_angle: 'process', structure_type: 'checklist', published_at: publication.published_at,
        exposure_status: 'MISSING_CONFIRMED', template_id: 'guide-v1',
      },
      {
        article_id: 'indexed-1', title: 'Retirement support checklist', intro: commonIntro,
        headings: ['Eligibility', 'Documents', 'Application'], body: `${commonIntro} A different indexed body.`,
        topic_angle: 'process', structure_type: 'checklist', published_at: '2026-07-11T00:00:00.000Z',
        exposure_status: 'INDEXED', template_id: 'guide-v1',
      },
    ];
    const result = makePassPolicyResult();
    const audit: AuditRecord = {
      article_id: 'missing-1', created_at: publication.published_at, primary_keyword: 'retirement support',
      primary_question: result.intent.primary_question, source_ids: [], input_hash: result.input_hash,
      selected_intent: result.intent.type, topic_angle: result.uniqueness_plan.topic_angle,
      structure_type: result.uniqueness_plan.structure_type, template_id: result.publication.template_id,
      similarity_scores: { ...result.similarity_report, risk: 'HIGH' }, quality_score: 82,
      rewrite_count: 2, decision: 'PASS', block_reasons: [], prompt_version: result.prompt_version,
      model_version: result.model_version, policy_version: result.policy_version,
    };
    const state: PublicationState = {
      status: 'ACTIVE', paused_templates: [], paused_structures: [], confirmed_missing_streak: 1,
      history: [
        { article_id: 'indexed-1', account_id: 'a', published_at: '2026-07-11T00:00:00.000Z', template_id: 'guide-v1', structure_type: 'checklist', topic_angle: 'process', exposure_status: 'INDEXED' },
        { article_id: 'missing-1', account_id: 'a', published_at: publication.published_at, template_id: 'guide-v1', structure_type: 'checklist', topic_angle: 'process', exposure_status: 'MISSING_CONFIRMED' },
      ],
    };

    const analysis = analyzeRootCause(publication, new Date('2026-07-12T02:00:00.000Z'), {
      recentPosts,
      audits: [audit],
      state,
    });

    const risks = analysis.findings.filter((finding) => finding.status === 'RISK').map((finding) => finding.signal);
    expect(risks).toContain('repeated_opening');
    expect(risks).toContain('repeated_headings');
    expect(risks).toContain('similarity');
    expect(risks).toContain('source_coverage');
    expect(analysis.recommended_changes.join(' ')).toMatch(/angle|structure/i);
  });
});
