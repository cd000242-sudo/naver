import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

function assertPostUrlLogsPersistPublishedUrl(relativePath: string, target: 'self' | 'this'): void {
  const sourcePath = path.join(process.cwd(), relativePath);
  const lines = fs.readFileSync(sourcePath, 'utf-8').split(/\r?\n/);
  const missingAssignments: string[] = [];

  lines.forEach((line, index) => {
    if (!line.includes('POST_URL:') || line.includes('POST_URL_SCHEDULED')) {
      return;
    }

    const nearbyLines = lines.slice(index, index + 4).join('\n');
    if (!nearbyLines.includes(`${target}.publishedUrl =`)) {
      missingAssignments.push(`${relativePath}:${index + 1}`);
    }
  });

  expect(missingAssignments).toEqual([]);
}

describe('published URL persistence guards', () => {
  it('stores the post URL whenever publishHelpers emits POST_URL', () => {
    assertPostUrlLogsPersistPublishedUrl('src/automation/publishHelpers.ts', 'self');
  });

  it('stores the post URL whenever naverBlogAutomation emits POST_URL', () => {
    assertPostUrlLogsPersistPublishedUrl('src/naverBlogAutomation.ts', 'this');
  });
});
