// [2026-09-17] AI 활용 마크 — DOM 속성(data-img-ai) 대신 인메모리 장부가 1차 근거.
// 라이브(나나 글): AI 생성 6장 전부 "ai=없음, provider=없음 → 마크 스킵". ImageManager 는
// provider=openai-image 를 알고 있었다. 태깅은 됐지만 마크 시점의 DOM 에는 남아 있지 않았다.
import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  imageProvenanceLedgerSize,
  readImageProvenance,
  recordImageProvenance,
  resetImageProvenanceLedger,
} from '../automation/imageProvenance';

const ROOT = path.resolve(__dirname, '..', '..');
const readSrc = (rel: string): string => fs.readFileSync(path.join(ROOT, 'src', rel), 'utf-8');

describe('image provenance ledger', () => {
  it('records the same 1/0 verdict as the DOM tag, keyed by document position', () => {
    const host: Record<string, unknown> = {};
    recordImageProvenance(host, 0, { provider: 'openai-image' });
    recordImageProvenance(host, 1, { source: 'issue-endgame', isCollected: true, provider: 'openai-image' });
    recordImageProvenance(host, 2, undefined);
    expect(readImageProvenance(host, 0)).toEqual({ ai: '1', provider: 'openai-image' });
    expect(readImageProvenance(host, 1)?.ai).toBe('0'); // 수집 이미지는 provider 가 AI 스러워도 0
    expect(readImageProvenance(host, 2)?.ai).toBe('0');
    expect(readImageProvenance(host, 3)).toBeUndefined();
    expect(imageProvenanceLedgerSize(host)).toBe(3);
  });

  it('later writers overwrite the same position (refinement, not duplication)', () => {
    const host: Record<string, unknown> = {};
    recordImageProvenance(host, 4, undefined);
    recordImageProvenance(host, 4, { provider: 'dropshot' });
    expect(readImageProvenance(host, 4)?.ai).toBe('1');
    expect(imageProvenanceLedgerSize(host)).toBe(1);
  });

  it('ignores impossible positions and null hosts, and resets per run', () => {
    const host: Record<string, unknown> = {};
    recordImageProvenance(host, -1, { provider: 'prodia' });
    recordImageProvenance(host, 1.5, { provider: 'prodia' });
    expect(imageProvenanceLedgerSize(host)).toBe(0);
    expect(() => recordImageProvenance(null, 0, { provider: 'prodia' })).not.toThrow();
    recordImageProvenance(host, 0, { provider: 'prodia' });
    resetImageProvenanceLedger(host);
    expect(imageProvenanceLedgerSize(host)).toBe(0);
  });
});

describe('wiring — source regression', () => {
  it('every data-img-ai writer also records to the ledger', () => {
    const helpers = readSrc('automation/imageHelpers.ts');
    const writers = helpers.split("setAttribute('data-img-ai'").length - 1;
    const records = helpers.split('recordImageProvenance(self,').length - 1;
    expect(writers).toBe(3);
    // 3 writers + base64 fallback path
    expect(records).toBe(4);
  });

  it('publish loop reads the ledger first and resets it at run start', () => {
    const automation = readSrc('naverBlogAutomation.ts');
    const start = automation.indexOf('// Step 4: AI 활용 마크 일괄 활성화');
    const end = automation.indexOf('} catch (aiMarkError)', start);
    const loop = automation.slice(start, end);
    expect(loop).toMatch(/readImageProvenance\(this, i\)/);
    expect(loop).toMatch(/ledger\?\.ai === '1'/);
    expect(automation).toMatch(/this\._runStartMs = Date\.now\(\);\r?\n\s*resetImageProvenanceLedger\(this\);/);
  });
});
