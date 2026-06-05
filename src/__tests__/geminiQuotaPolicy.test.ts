import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  GEMINI_TEXT_FREE_TIER_LIMITS,
  formatGeminiFreeTierSummary,
} from '../geminiQuotaPolicy';

const ROOT = path.resolve(__dirname, '..');

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf-8');
}

describe('Gemini free tier quota policy', () => {
  it('keeps the official free-tier text model limits in one place', () => {
    expect(GEMINI_TEXT_FREE_TIER_LIMITS['gemini-2.5-flash']).toMatchObject({
      rpm: 10,
      tpm: 250_000,
      rpd: 250,
    });
    expect(GEMINI_TEXT_FREE_TIER_LIMITS['gemini-2.5-flash-lite']).toMatchObject({
      rpm: 15,
      tpm: 250_000,
      rpd: 1_000,
    });
    expect(GEMINI_TEXT_FREE_TIER_LIMITS['gemini-2.5-pro']).toMatchObject({
      rpm: 5,
      tpm: 250_000,
      rpd: 100,
    });
  });

  it('renders a beginner-readable quota explanation', () => {
    const summary = formatGeminiFreeTierSummary();
    expect(summary).toContain('Flash: 250회/일, 10회/분');
    expect(summary).toContain('Flash-Lite: 1,000회/일, 15회/분');
    expect(summary).toContain('Pro: 100회/일, 5회/분');
    expect(summary).toContain('프로젝트 단위');
    expect(summary).toContain('태평양 시간 자정');
  });

  it('does not show stale free-tier counts in the main UI', () => {
    const html = read('../public/index.html');
    expect(html).not.toMatch(/무료 500\/일/);
    expect(html).not.toMatch(/무료 25\/일/);
    expect(html).not.toMatch(/Flash 1500\/일/);
    expect(html).toMatch(/무료 250\/일/);
    expect(html).toMatch(/무료 1,000\/일/);
    expect(html).toMatch(/무료 100\/일/);
  });
});
