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

  it('pauses all automatic publishing after two consecutive independently confirmed misses', async () => {
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
    expect(second.state.status).toBe('PAUSED');
    expect(second.state.confirmed_missing_streak).toBe(2);
  });

  it('does not treat a directly accessible URL as proof of search indexing', async () => {
    const result = applyExposureChecks(publication('search-missing'), [
      { method: 'url_access', outcome: 'FOUND', checked_at: '2026-01-03T00:00:00.000Z' },
      { method: 'blog_search_tab', outcome: 'NOT_FOUND', checked_at: '2026-01-03T00:00:01.000Z' },
      { method: 'integrated_search', outcome: 'NOT_FOUND', checked_at: '2026-01-03T00:00:02.000Z' },
    ], createInitialPublicationState(), await loadContentPolicy(), new Date('2026-01-03T00:00:03.000Z'));

    expect(result.publication.exposure_status).toBe('MISSING_CONFIRMED');
  });
});
