import { describe, expect, it } from 'vitest';
import { loadContentPolicy } from '../contentPolicy/policyLoader';
import { applyExposureChecks, createInitialPublicationState } from '../contentPolicy/exposureMonitor';
import type { MonitoredPublication } from '../contentPolicy/types';

function publication(id: string): MonitoredPublication {
  return {
    article_id: id,
    title: `노출 확인 글 ${id}`,
    template_id: 'template-a',
    structure_type: 'checklist',
    topic_angle: 'process',
    published_at: '2026-01-01T00:00:00.000Z',
    exposure_status: 'PENDING_INDEX',
    exposure_checks: [],
  };
}

describe('ExposureMonitor', () => {
  it('does not confirm missing when one tool misses but title and blog search find the post', async () => {
    const result = applyExposureChecks(publication('one'), [
      { method: 'third_party', outcome: 'NOT_FOUND', checked_at: '2026-01-03T00:00:00.000Z' },
      { method: 'exact_title_search', outcome: 'FOUND', checked_at: '2026-01-03T00:00:01.000Z' },
      { method: 'blog_search_tab', outcome: 'FOUND', checked_at: '2026-01-03T00:00:02.000Z' },
    ], createInitialPublicationState(), await loadContentPolicy(), new Date('2026-01-03T00:00:03.000Z'));

    expect(result.publication.exposure_status).toBe('INDEXED');
    expect(result.state.status).toBe('ACTIVE');
    expect(result.state.confirmed_missing_streak).toBe(0);
  });

  it('records an advisory after two consecutive independently confirmed misses', async () => {
    const config = await loadContentPolicy();
    const first = applyExposureChecks(publication('one'), [
      { method: 'url_access', outcome: 'NOT_FOUND', checked_at: '2026-01-03T00:00:00.000Z' },
      { method: 'exact_title_search', outcome: 'NOT_FOUND', checked_at: '2026-01-03T00:00:01.000Z' },
    ], createInitialPublicationState(), config, new Date('2026-01-03T00:00:02.000Z'));
    const second = applyExposureChecks(publication('two'), [
      { method: 'url_access', outcome: 'NOT_FOUND', checked_at: '2026-01-04T00:00:00.000Z' },
      { method: 'blog_search_tab', outcome: 'NOT_FOUND', checked_at: '2026-01-04T00:00:01.000Z' },
    ], first.state, config, new Date('2026-01-04T00:00:02.000Z'));

    expect(first.publication.exposure_status).toBe('MISSING_CONFIRMED');
    expect(first.state.paused_templates).toContain('template-a');
    expect(second.publication.exposure_status).toBe('MISSING_CONFIRMED');
    expect(second.state.status).toBe('ACTIVE');
    expect(second.state.confirmed_missing_streak).toBe(2);
    expect(second.state.last_advisory_reason).toBe('TWO_CONSECUTIVE_CONFIRMED_MISSING');
  });

  it('never clears an explicit operator pause while recording an exposure advisory', async () => {
    const config = await loadContentPolicy();
    const state = {
      ...createInitialPublicationState(),
      status: 'PAUSED' as const,
      pause_reason: 'operator pause',
      paused_at: '2026-01-03T00:00:00.000Z',
      confirmed_missing_streak: 1,
    };
    const result = applyExposureChecks(publication('operator-paused'), [
      { method: 'url_access', outcome: 'NOT_FOUND', checked_at: '2026-01-04T00:00:00.000Z' },
      { method: 'blog_search_tab', outcome: 'NOT_FOUND', checked_at: '2026-01-04T00:00:01.000Z' },
    ], state, config, new Date('2026-01-04T00:00:02.000Z'));

    expect(result.state.status).toBe('PAUSED');
    expect(result.state.pause_reason).toBe('operator pause');
    expect(result.state.last_advisory_reason).toBe('TWO_CONSECUTIVE_CONFIRMED_MISSING');
  });

  it('does not treat a directly accessible URL as proof of search indexing', async () => {
    const result = applyExposureChecks(publication('search-missing'), [
      { method: 'url_access', outcome: 'FOUND', checked_at: '2026-01-03T00:00:00.000Z' },
      { method: 'blog_search_tab', outcome: 'NOT_FOUND', checked_at: '2026-01-03T00:00:01.000Z' },
      { method: 'integrated_search', outcome: 'NOT_FOUND', checked_at: '2026-01-03T00:00:02.000Z' },
    ], createInitialPublicationState(), await loadContentPolicy(), new Date('2026-01-03T00:00:03.000Z'));

    expect(result.publication.exposure_status).toBe('MISSING_CONFIRMED');
  });

  it('clears an old exposure advisory after independent search checks find the post', async () => {
    const state = {
      ...createInitialPublicationState(),
      last_advisory_reason: 'EXPOSURE_MONITOR_FAILURE',
      last_advisory_at: '2026-01-02T00:00:00.000Z',
    };
    const result = applyExposureChecks(publication('recovered'), [
      { method: 'exact_title_search', outcome: 'FOUND', checked_at: '2026-01-03T00:00:00.000Z' },
      { method: 'blog_search_tab', outcome: 'FOUND', checked_at: '2026-01-03T00:00:01.000Z' },
    ], state, await loadContentPolicy(), new Date('2026-01-03T00:00:02.000Z'));

    expect(result.publication.exposure_status).toBe('INDEXED');
    expect(result.state.last_advisory_reason).toBeUndefined();
    expect(result.state.last_advisory_at).toBeUndefined();
  });

  it('does not clear a confirmed-missing incident when an unrelated post is indexed', async () => {
    const state = {
      ...createInitialPublicationState(),
      last_advisory_reason: 'TWO_CONSECUTIVE_CONFIRMED_MISSING',
      last_advisory_at: '2026-01-02T00:00:00.000Z',
      pause_incident: {
        article_id: 'missing-article',
        template_id: 'template-a',
        structure_type: 'checklist',
        detected_at: '2026-01-02T00:00:00.000Z',
      },
    };
    const result = applyExposureChecks(publication('healthy-other-article'), [
      { method: 'exact_title_search', outcome: 'FOUND', checked_at: '2026-01-03T00:00:00.000Z' },
      { method: 'blog_search_tab', outcome: 'FOUND', checked_at: '2026-01-03T00:00:01.000Z' },
    ], state, await loadContentPolicy(), new Date('2026-01-03T00:00:02.000Z'));

    expect(result.publication.exposure_status).toBe('INDEXED');
    expect(result.state.last_advisory_reason).toBe('TWO_CONSECUTIVE_CONFIRMED_MISSING');
    expect(result.state.pause_incident?.article_id).toBe('missing-article');
  });
});
