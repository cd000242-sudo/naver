/**
 * [2026-11-07 사장님] 가격표 정리 — 공식 문서(2026-11-07) 기준.
 *
 *   OpenAI : Terra 캐시 $0.05 · Sol 캐시 $0.10 (이전 표는 2배), Astra $10/$1/$50 추가
 *   Claude : Sonnet 5.5 $2/$10 (이전 $3/$15 틀림), Haiku 5.5 $0.10/$0.50 (10만 토큰 초과 $0.50/$2.50),
 *            Opus 5.5 $4/$20 추가
 *   Gemini : 3.8 Flash·3.6 Flash $0.75/$3.75 (2026-12-31 까지) → $1.50/$7.50 (2027-01-01 부터),
 *            4 Argon $2/$10 (2026-11-30 까지) → $4/$20 (2026-12-01 부터), 3.5 Flash-Lite $0.30/$2.50
 *   날짜로 바뀌는 가격은 시험이 날짜를 직접 넘긴다 — 오늘 날짜에 기대는 시험은 달력이 넘어가면 깨진다.
 */
import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

vi.mock('../configManager', () => ({ loadConfig: vi.fn(), saveConfig: vi.fn() }));

import { estimateTextCostUSD, resolveGeminiTextPricing } from '../apiUsageTracker';

const SRC = path.resolve(__dirname, '..');
const read = (rel: string): string => fs.readFileSync(path.join(SRC, rel), 'utf-8').replace(/\r\n/g, '\n');
const day = (iso: string) => new Date(`${iso}T12:00:00Z`);
const M = 1_000_000;

describe('Gemini text prices follow the calendar', () => {
  it.each([
    ['gemini-4-argon', '2026-11-07', 2, 10],
    ['gemini-4-argon', '2026-11-30', 2, 10],
    ['gemini-4-argon', '2026-12-01', 4, 20],
    ['gemini-4-argon', '2027-03-01', 4, 20],
    ['gemini-3.8-flash', '2026-11-07', 0.75, 3.75],
    ['gemini-3.8-flash', '2026-12-31', 0.75, 3.75],
    ['gemini-3.8-flash', '2027-01-01', 1.5, 7.5],
    ['gemini-3.6-flash', '2026-11-07', 0.75, 3.75],
    ['gemini-3.6-flash', '2026-12-31', 0.75, 3.75],
    ['gemini-3.6-flash', '2027-01-01', 1.5, 7.5],
  ])('%s on %s = $%s / $%s', (model, date, input, output) => {
    expect(resolveGeminiTextPricing(model, 1000, day(date))).toEqual({ input, output });
  });

  it('Flash-Lite does not move with the calendar, and is not priced as a Flash', () => {
    for (const date of ['2026-11-07', '2027-01-01']) {
      expect(resolveGeminiTextPricing('gemini-3.5-flash-lite', 1000, day(date))).toEqual({ input: 0.30, output: 2.50 });
    }
  });

  it('retired IDs keep their historical prices', () => {
    expect(resolveGeminiTextPricing('gemini-3.1-flash-lite', 1000, day('2026-11-07'))).toEqual({ input: 0.25, output: 1.50 });
    expect(resolveGeminiTextPricing('gemini-3.5-flash', 1000, day('2026-11-07'))).toEqual({ input: 1.50, output: 9.00 });
  });

  it('without a date it uses the current date (never throws, returns a known tier)', () => {
    const now = resolveGeminiTextPricing('gemini-3.8-flash', 1000);
    expect([0.75, 1.5]).toContain(now.input);
  });
});

describe('OpenAI text cost', () => {
  it.each([
    ['gpt-6-astra', 10 + 50],
    ['gpt-6.1-sol', 2 + 10],
    ['gpt-6.1-terra', 1 + 5],
    ['gpt-6-luna', 0.10 + 0.50],
    ['gpt-6-sol', 2 + 10],
  ])('%s costs %s for 1M in + 1M out', (model, expected) => {
    expect(estimateTextCostUSD('openai', { model, inputTokens: M, outputTokens: M })).toBeCloseTo(expected, 6);
  });

  it('the table carries the corrected cache prices', () => {
    const tracker = read('apiUsageTracker.ts');
    expect(tracker).toMatch(/'gpt-6\.1-terra':\s*\{\s*input:\s*1\.00,\s*cachedInput:\s*0\.05,\s*output:\s*5\.00/);
    expect(tracker).toMatch(/'gpt-6\.1-sol':\s*\{\s*input:\s*2\.00,\s*cachedInput:\s*0\.10,\s*output:\s*10\.00/);
    expect(tracker).toMatch(/'gpt-6-astra':\s*\{\s*input:\s*10\.00,\s*cachedInput:\s*1\.00,\s*output:\s*50\.00/);
    expect(tracker).toMatch(/'gpt-6-luna':\s*\{\s*input:\s*0\.10,\s*cachedInput:\s*0\.01,\s*output:\s*0\.50/);
  });
});

describe('Claude text cost', () => {
  it.each([
    ['claude-opus-5-5', 4 + 20],
    ['claude-sonnet-5-5', 2 + 10],
    ['claude-fable-5-1', 10 + 50],
  ])('%s costs %s for 1M in + 1M out', (model, expected) => {
    expect(estimateTextCostUSD('claude', { model, inputTokens: M, outputTokens: M })).toBeCloseTo(expected, 6);
  });

  it('Haiku 5.5: 1M input tokens is far above 100K, so the long price applies to the whole call', () => {
    expect(estimateTextCostUSD('claude', { model: 'claude-haiku-5-5', inputTokens: M, outputTokens: M })).toBeCloseTo(0.50 + 2.50, 6);
  });

  it('Haiku 5.5: up to 100K input tokens is the short price, above it the long price', () => {
    const cost = (inputTokens: number, extra: object = {}) =>
      estimateTextCostUSD('claude', { model: 'claude-haiku-5-5', inputTokens, outputTokens: 10_000, ...extra });
    expect(cost(100_000)).toBeCloseTo(0.1 * 0.10 + 0.01 * 0.50, 9);
    expect(cost(100_001)).toBeCloseTo(0.100001 * 0.50 + 0.01 * 2.50, 9);
    // The whole prompt counts, cached tokens included.
    expect(cost(60_000, { cacheReadTokens: 50_000 })).toBeCloseTo(0.06 * 0.50 + 0.05 * 0.50 * 0.10 + 0.01 * 2.50, 9);
  });

  it('cache multipliers apply to the corrected input price', () => {
    const cost = estimateTextCostUSD('claude', { model: 'claude-sonnet-5-5', cacheCreationTokens: M, cacheReadTokens: M });
    expect(cost).toBeCloseTo(2 * 1.25 + 2 * 0.10, 6);
  });

  it('retired and historical models are not repriced', () => {
    expect(estimateTextCostUSD('claude', { model: 'claude-sonnet-4-5', inputTokens: M, outputTokens: M })).toBeCloseTo(18, 6);
    expect(estimateTextCostUSD('claude', { model: 'claude-haiku-4-5', inputTokens: M, outputTokens: M })).toBeCloseTo(6, 6);
    expect(estimateTextCostUSD('claude', { model: 'claude-fable-5', inputTokens: M, outputTokens: M })).toBeCloseTo(60, 6);
  });
});

describe('Gemini through the cost path', () => {
  it('uses the dated price', () => {
    expect(estimateTextCostUSD('gemini', { model: 'gemini-4-argon', inputTokens: M, outputTokens: M }, day('2026-11-07'))).toBeCloseTo(12, 6);
    expect(estimateTextCostUSD('gemini', { model: 'gemini-4-argon', inputTokens: M, outputTokens: M }, day('2026-12-01'))).toBeCloseTo(24, 6);
    expect(estimateTextCostUSD('gemini', { model: 'gemini-3.8-flash', inputTokens: M, outputTokens: M }, day('2026-11-07'))).toBeCloseTo(4.5, 6);
  });
});

describe('screen price text matches the table', () => {
  const html = read('../public/index.html');

  it('the sub-work dropdown shows current prices', () => {
    expect(html).toMatch(/<option value="gemini-flash">Gemini 3\.8 Flash \([^)]*\$0\.75[^)]*\$3\.75[^)]*\)<\/option>/);
    expect(html).toMatch(/<option value="haiku">Claude Haiku 5\.5 \([^)]*\$0\.10[^)]*\$0\.50[^)]*\)<\/option>/);
    expect(html).not.toMatch(/Gemini 3\.8 Flash \(선불, 입력 \$1\.50\/출력 \$7\.50\)/);
    expect(html).not.toMatch(/Claude Haiku 5\.5 \(\$1\/1M\)/);
  });

  // The screen cards and the cost table must say the same numbers (there is no separate renderer copy of the table).
  const cardOf = (value: string): string => {
    const at = html.search(new RegExp(`name="primaryGeminiTextModel"\\s+value="${value}"`));
    expect(at, value).toBeGreaterThan(0);
    return html.slice(at, html.indexOf('</label>', at));
  };
  const usd = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(2));

  it.each(['gemini-3.8-flash', 'gemini-3.6-flash'])('%s card = the price table on both sides of 2027-01-01', (model) => {
    const now = resolveGeminiTextPricing(model, 1000, day('2026-11-07'));
    const later = resolveGeminiTextPricing(model, 1000, day('2027-01-01'));
    const card = cardOf(model);
    expect(card).toContain(`입력 $${usd(now.input)} · 출력 $${usd(now.output)}`);
    expect(card).toContain(`2027-01-01부터 $${usd(later.input)} · $${usd(later.output)}`);
  });

  it('gemini-4-argon card = the price table on both sides of 2026-12-01', () => {
    const now = resolveGeminiTextPricing('gemini-4-argon', 1000, day('2026-11-30'));
    const later = resolveGeminiTextPricing('gemini-4-argon', 1000, day('2026-12-01'));
    const card = cardOf('gemini-4-argon');
    expect(card).toContain(`입력 $${usd(now.input)} · 출력 $${usd(now.output)}`);
    expect(card).toContain(`12/1부터 입력 $${usd(later.input)} · 출력 $${usd(later.output)}`);
  });

  it.each([
    ['openai-gpt6-astra', 'gpt-6-astra', 'openai'],
    ['openai-gpt4o', 'gpt-6.1-sol', 'openai'],
    ['claude-opus', 'claude-opus-5-5', 'claude'],
    ['claude-fable', 'claude-fable-5-1', 'claude'],
  ] as const)('%s card shows the %s table price', (selector, model, provider) => {
    const one = estimateTextCostUSD(provider, { model, inputTokens: M, outputTokens: 0 });
    const out = estimateTextCostUSD(provider, { model, inputTokens: 0, outputTokens: M });
    expect(cardOf(selector)).toContain(`입력 $${usd(one)} · 출력 $${usd(out)} / 1M 토큰`);
  });

  it('the Gemini 3.8 Flash card shows the temporary price and the date it changes', () => {
    const at = html.indexOf('value="gemini-3.8-flash"\n');
    const card = html.slice(at, at + 2600);
    expect(card).toContain('$0.75');
    expect(card).toContain('$3.75');
    expect(card).toContain('2027-01-01');
  });

  it('the Argon card shows both prices and the switch date', () => {
    const at = html.search(/name="primaryGeminiTextModel"\s+value="gemini-4-argon"/);
    expect(at).toBeGreaterThan(0);
    const card = html.slice(at, at + 2600);
    expect(card).toContain('$2');
    expect(card).toContain('$10');
    expect(card).toContain('$4');
    expect(card).toContain('$20');
    expect(card).toContain('12/1');
  });

  it('the per-article cost table is recomputed from the new prices (12K in + 6K out, 1,400 KRW/$)', () => {
    // Sonnet 5.5 $2/$10 -> 118 won; cached 87 won.  The old 176 / 131 must be gone.
    expect(html).toMatch(/Claude Sonnet 5\.5<\/td>\s*<td[^>]*>없음<\/td>\s*<td[^>]*>₩118<\/td>\s*<td[^>]*>₩87<\/td>/);
    expect(html).not.toContain('₩176 · 절약 ₩131');
    // Haiku 5.5 $0.10/$0.50 -> 6 won; cached 4 won.
    expect(html).toMatch(/Claude Haiku 5\.5 <span[^>]*>\[★현재 기본값\]<\/span><\/td>\s*<td[^>]*>없음<\/td>\s*<td[^>]*>₩6<\/td>\s*<td[^>]*>₩4<\/td>/);
    // New rows.
    // (rows are indented, so the gap between the name cell and the price cell is ~200 characters)
    expect(html).toMatch(/Claude Opus 5\.5<\/td>[\s\S]{0,400}₩235[\s\S]{0,200}₩175/);
    expect(html).toMatch(/GPT-6 Astra<\/td>[\s\S]{0,400}₩588[\s\S]{0,200}₩437/);
    expect(html).toMatch(/Gemini 4 Argon<\/td>[\s\S]{0,600}₩118[\s\S]{0,300}₩87/);
    // Terra / Sol cached prices are halved.
    expect(html).toMatch(/GPT-6\.1 Terra<\/td>\s*<td[^>]*>없음<\/td>\s*<td[^>]*>₩59<\/td>\s*<td[^>]*>₩43<\/td>/);
    expect(html).toMatch(/GPT-6\.1 Sol<\/td>\s*<td[^>]*>없음<\/td>\s*<td[^>]*>₩118<\/td>\s*<td[^>]*>₩86<\/td>/);
  });
});
