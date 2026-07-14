import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('release credential safety', () => {
  it('never places the GitHub token in a git remote URL or process argument', () => {
    const source = readFileSync(resolve(__dirname, '../../scripts/upload-release.js'), 'utf8');

    expect(source).not.toContain('https://${GITHUB_TOKEN}@github.com');
    expect(source).not.toMatch(/pushUrl\s*=.*GITHUB_TOKEN/);
    expect(source).toContain("execFileSync('git', ['push', 'origin', 'main', TAG]");
  });
});
