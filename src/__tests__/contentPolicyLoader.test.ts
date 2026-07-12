import path from 'path';
import { describe, expect, it } from 'vitest';
import { loadContentPolicy } from '../contentPolicy/policyLoader';

describe('content policy YAML loader', () => {
  it('loads and validates the repository default policy', async () => {
    const policyPath = path.resolve(process.cwd(), 'config', 'content_policy.yaml');
    const policy = await loadContentPolicy({ policyPath });

    expect(policy.version).toBe(1);
    expect(policy.similarity.compare_recent_posts_min).toBe(20);
    expect(policy.quality_gate.pass_score).toBe(85);
    expect(policy.monitoring.minimum_cross_checks).toBe(2);
  });
});
