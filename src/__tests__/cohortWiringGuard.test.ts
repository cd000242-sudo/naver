/**
 * cohortWiringGuard.test.ts — SPEC-MOAT-2026 Phase 0.3 (wiring 만, baseline 보고는 별도 사이클)
 *
 * 보호 대상:
 *   - publishedPostTracker.trackPublishedPost가 cohortStore.recordCohortEvent 호출
 *   - 호출은 try/catch로 흡수 (cohortStore 실패가 발행 흐름 영향 X)
 *   - 옵트인은 cohortStore 내부에서 자동 게이트 (caller 추가 게이트 불필요)
 *   - hashedAccountId로 익명화 (blogId 원본 저장 X)
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const readSrc = (p: string) => fs.readFileSync(path.join(PROJECT_ROOT, p), 'utf-8');

describe('Phase 0.3: publishedPostTracker → cohortStore wiring', () => {
  it('publishedPostTracker.ts에 cohortStore import', () => {
    const src = readSrc('src/analytics/publishedPostTracker.ts');
    expect(src).toMatch(/from\s+['"]\.\.\/account\/cohortStore(\.js)?['"]/);
  });

  it('publishedPostTracker.ts에 recordCohortEvent 호출', () => {
    const src = readSrc('src/analytics/publishedPostTracker.ts');
    expect(src).toMatch(/recordCohortEvent\s*\(/);
  });

  it('hashAccountId로 익명화 (blogId 원본 노출 X)', () => {
    const src = readSrc('src/analytics/publishedPostTracker.ts');
    expect(src).toMatch(/hashAccountId\s*\(/);
  });

  it("eventType: 'publish' 사용", () => {
    const src = readSrc('src/analytics/publishedPostTracker.ts');
    expect(src).toMatch(/eventType:\s*['"]publish['"]/);
  });

  it('호출이 try/catch 흡수 (.catch 또는 try/catch 블록 내)', () => {
    const src = readSrc('src/analytics/publishedPostTracker.ts');
    const lines = src.split('\n');
    const callIdx = lines.findIndex((l) => /recordCohortEvent\s*\(/.test(l));
    expect(callIdx).toBeGreaterThanOrEqual(0);
    const callLine = lines[callIdx];
    const hasCatch = /\.catch\(/.test(callLine);
    const surround = lines.slice(Math.max(0, callIdx - 30), Math.min(lines.length, callIdx + 30)).join('\n');
    const inTryBlock = /try\s*\{[\s\S]*recordCohortEvent[\s\S]*\}\s*catch/m.test(surround);
    expect(hasCatch || inTryBlock).toBe(true);
  });
});

describe('Phase 0.3: 통합 동작 검증 (opt-in 활성)', () => {
  const MOCK_FILE = path.join(
    require('os').tmpdir(),
    `cohortWiring_${Date.now()}_${Math.floor(Math.random() * 1e9)}.json`,
  );
  const TEST_USERDATA = path.join(require('os').tmpdir(), `wiring_userdata_${Date.now()}_${Math.floor(Math.random() * 1e9)}`);

  it('opt-in 활성 + trackPublishedPost → cohortStore에 publish 이벤트 1건 기록', async () => {
    process.env.COHORT_TELEMETRY_ENABLED = 'true';
    process.env.COHORT_STORE_PATH_OVERRIDE = MOCK_FILE;
    try { if (fs.existsSync(MOCK_FILE)) fs.unlinkSync(MOCK_FILE); } catch { /* ignore */ }

    const { trackPublishedPost } = await import('../analytics/publishedPostTracker');
    const { loadCohortEvents, hashAccountId } = await import('../account/cohortStore');

    const result = trackPublishedPost(TEST_USERDATA, {
      publishedAt: new Date().toISOString(),
      keyword: 'test',
      blogId: 'test_blog_001',
      logNo: '123456',
      evaluator: { finalScore: 80, status: 'pass' } as any,
    } as any);
    expect(result.ok).toBe(true);

    // wiring이 async일 수 있으므로 짧은 대기
    await new Promise((r) => setTimeout(r, 50));

    const events = await loadCohortEvents();
    expect(events.length).toBeGreaterThanOrEqual(1);
    const lastEvent = events[events.length - 1];
    expect(lastEvent.eventType).toBe('publish');
    expect(lastEvent.hashedAccountId).toBe(hashAccountId('test_blog_001'));
    expect(lastEvent.hashedAccountId).not.toContain('test_blog_001');

    delete process.env.COHORT_TELEMETRY_ENABLED;
    delete process.env.COHORT_STORE_PATH_OVERRIDE;
    try { if (fs.existsSync(MOCK_FILE)) fs.unlinkSync(MOCK_FILE); } catch { /* ignore */ }
  });

  it('opt-in 비활성 + trackPublishedPost → cohortStore 빈 상태 유지', async () => {
    delete process.env.COHORT_TELEMETRY_ENABLED;
    process.env.COHORT_STORE_PATH_OVERRIDE = MOCK_FILE;
    try { if (fs.existsSync(MOCK_FILE)) fs.unlinkSync(MOCK_FILE); } catch { /* ignore */ }

    const { trackPublishedPost } = await import('../analytics/publishedPostTracker');
    const { loadCohortEvents } = await import('../account/cohortStore');

    const result = trackPublishedPost(TEST_USERDATA, {
      publishedAt: new Date().toISOString(),
      keyword: 'test',
      blogId: 'test_blog_002',
      logNo: '789',
      evaluator: { finalScore: 70, status: 'pass' } as any,
    } as any);
    expect(result.ok).toBe(true);

    await new Promise((r) => setTimeout(r, 50));

    const events = await loadCohortEvents();
    expect(events.length).toBe(0);

    delete process.env.COHORT_STORE_PATH_OVERRIDE;
  });
});
