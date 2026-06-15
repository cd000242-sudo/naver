import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const loginHtml = readFileSync(join(process.cwd(), 'public', 'login.html'), 'utf8');

function extractExpiredKeywordBlocks(source: string): string[] {
  return Array.from(source.matchAll(/const\s+expiredKeywords\s*=\s*\[([\s\S]*?)\];/g)).map(
    (match) => match[1] ?? ''
  );
}

describe('login access-denied keyword policy', () => {
  it('does not classify generic auth/server failures as license expiry', () => {
    const keywordBlocks = extractExpiredKeywordBlocks(loginHtml);

    expect(keywordBlocks.length).toBeGreaterThanOrEqual(2);

    for (const block of keywordBlocks) {
      expect(block).not.toMatch(/['"]invalid['"]/i);
      expect(block).not.toMatch(/['"]denied['"]/i);
      expect(block).not.toContain('유효하지');
      expect(block).not.toContain('라이선스가 없');
      expect(block).not.toContain('접근 거부');
      expect(block).not.toMatch(/['"]기간['"]/);
    }
  });

  it('keeps the access denied modal reserved for explicit expiry messages', () => {
    const keywordBlocks = extractExpiredKeywordBlocks(loginHtml);

    for (const block of keywordBlocks) {
      expect(block).toContain('만료');
      expect(block).toContain('종료');
      expect(block).toContain('expired');
    }
  });
});
