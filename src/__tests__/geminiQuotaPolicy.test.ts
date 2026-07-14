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
  it('keeps current model availability without inventing project-specific limits', () => {
    expect(GEMINI_TEXT_FREE_TIER_LIMITS['gemini-3.5-flash']).toMatchObject({
      rpm: null,
      tpm: null,
      rpd: null,
      freeTierAvailable: true,
    });
    expect(GEMINI_TEXT_FREE_TIER_LIMITS['gemini-3.1-flash-lite']).toMatchObject({
      rpm: null,
      tpm: null,
      rpd: null,
      freeTierAvailable: true,
    });
    expect(GEMINI_TEXT_FREE_TIER_LIMITS['gemini-3.1-pro-preview']).toMatchObject({
      freeTierAvailable: false,
    });
  });

  it('renders a beginner-readable quota explanation', () => {
    const summary = formatGeminiFreeTierSummary();
    expect(summary).toContain('AI Studio');
    expect(summary).toContain('무료 티어가 없습니다');
    expect(summary).toContain('프로젝트 단위');
    expect(summary).toContain('태평양 시간 자정');
  });

  it('does not show stale free-tier counts in the main UI', () => {
    const html = read('../public/index.html');
    expect(html).not.toMatch(/무료 500\/일/);
    expect(html).not.toMatch(/무료 25\/일/);
    expect(html).not.toMatch(/Flash 1500\/일/);
    expect(html).not.toMatch(/무료 250\/일/);
    expect(html).not.toMatch(/무료 1,000\/일/);
    expect(html).not.toMatch(/무료 100\/일/);
    expect(html).toMatch(/Google AI Studio/);
  });
});
