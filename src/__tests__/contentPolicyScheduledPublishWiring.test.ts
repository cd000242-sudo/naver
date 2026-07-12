import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const mainSource = fs.readFileSync(path.join(process.cwd(), 'src/main.ts'), 'utf8');

function between(start: string, end: string): string {
  const startIndex = mainSource.indexOf(start);
  const endIndex = mainSource.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return mainSource.slice(startIndex, endIndex);
}

describe('scheduled publishing content-policy wiring', () => {
  it('routes SmartScheduler through the common post cycle', () => {
    const block = between('smartScheduler.setPublishCallback', '// ✅ [v2.10.42]');
    expect(block).toContain('AutomationService.executePostCycle');
    expect(block).not.toMatch(/activeSchedulerBot\.run\s*\(/);
  });

  it('routes persisted scheduled posts through the common post cycle', () => {
    const block = between('const runOptions: RunOptions', 'const publishedPost = createPublishedScheduledPostState');
    expect(block).toContain('AutomationService.executePostCycle');
    expect(block).not.toMatch(/activeSchedulerAutomation\.run\s*\(/);
  });
});
