/**
 * [2026-11-05] 업체 실측(after3 meat-thin): PARTIAL_RESPONSE — 제목 · 소제목 · 본문이 전부 없음.
 *
 * The model forgot to close "harmonyPacket" after "titles", so every article field (preWritingAnalysis,
 * selectedTitle, headings, introduction, …) was nested inside the packet. extractHarmonyPacket strips the
 * packet from the article first, which took the whole article with it. Article fields found inside the
 * packet must be moved back before the strip; existing top-level values are never overwritten.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractHarmonyPacket } from '../content/agentHarmony/harmonyPacketExtract';
import { safeParseJson } from '../jsonParser';

describe('article fields nested inside harmonyPacket are restored', () => {
  it('restores the real misnested response (fixture from the failed run)', () => {
    const raw = readFileSync(path.join(__dirname, 'fixtures', 'agentHarmonyMisnestedArticle1105.txt'), 'utf8');
    const parsed = safeParseJson<Record<string, any>>(raw);
    expect(parsed.selectedTitle).toBeUndefined(); // as the model sent it

    extractHarmonyPacket(parsed);

    expect(typeof parsed.selectedTitle).toBe('string');
    expect(parsed.headings.length).toBeGreaterThanOrEqual(5);
    expect(String(parsed.introduction).length).toBeGreaterThan(50);
    expect(parsed.harmonyPacket).toBeUndefined();
    expect(parsed.complementReport).toBeUndefined();
  });

  it('never overwrites a field the article already has', () => {
    const parsed: Record<string, any> = {
      selectedTitle: '바깥 제목',
      harmonyPacket: { version: 1, selectedTitle: '안쪽 제목', headings: [{ title: '안쪽 소제목', content: '본문' }] },
    };
    extractHarmonyPacket(parsed);
    expect(parsed.selectedTitle).toBe('바깥 제목');
    expect(parsed.headings).toEqual([{ title: '안쪽 소제목', content: '본문' }]);
  });

  it('leaves a well-formed response untouched (control)', () => {
    const parsed: Record<string, any> = {
      selectedTitle: '제목',
      headings: [{ title: '소제목', content: '본문' }],
      introduction: '도입',
      harmonyPacket: { version: 1, material: {}, strategy: {}, titles: [] },
    };
    extractHarmonyPacket(parsed);
    expect(Object.keys(parsed).sort()).toEqual(['headings', 'introduction', 'selectedTitle']);
  });
});
