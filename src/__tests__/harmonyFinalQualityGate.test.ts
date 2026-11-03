import { describe, expect, it } from 'vitest';
import { finalizeStructuredContent, type ContentSource, type StructuredContent } from '../contentGenerator';
import { attachAgentHarmony } from '../content/agentHarmony/harmonyRuntime';
import type { AgentHarmonyRecord } from '../content/agentHarmony/harmonyPacketTypes';

// 2026-11-04 Release D: under a harmony session (packet present) the [FinalQualityGate] candidate swap may only land on
// a title the session itself proposed AND whose anchors verified; otherwise the session's title stays. Flag OFF: unchanged.
const LOW = '병원 기부 소식 정리 병원 기부 현황 정리'; // repeated words + summary-noun ending -> far below the 50-point floor
const OUTSIDE = '70세 배우가 1억 원을 병원에 건넨 이유는 무엇일까'; // scores 100 but the session never proposed it
const UNVERIFIED = '병원 소아병동 환자 가족의 치료비 부담은 어디서'; // proposed by the session, anchors failed
const VERIFIED = '소아 환자 치료비로 쓰이는 기부금의 행방'; // proposed by the session, anchors verified

const SOURCE: ContentSource = Object.freeze({
  sourceType: 'custom_text', rawText: '', contentMode: 'homefeed', metadata: Object.freeze({ keywords: Object.freeze([]) }),
});

function content(candidates: string[]): StructuredContent {
  const body = '입력에서 확인된 사실만 설명합니다.';
  return {
    status: 'success', generationTime: '0ms', selectedTitle: LOW, titleAlternatives: [LOW],
    titleCandidates: candidates.map(text => ({ text, score: 80, reasoning: 'x' })),
    bodyHtml: `<p>${body}</p>`, bodyPlain: body,
    headings: Array.from({ length: 3 }, () => ({ title: '확인된 내용', content: body, summary: '확인된 사실', keywords: [], imagePrompt: '' })),
    hashtags: ['#source'], images: [],
    metadata: { category: 'general', targetAge: 'all', urgency: 'evergreen', estimatedReadTime: '1분', wordCount: 4, aiDetectionRisk: 'low', legalRisk: 'safe', seoScore: 90, keywordStrategy: '', publishTimeRecommend: '' },
    quality: { aiDetectionRisk: 'low', legalRisk: 'safe', seoScore: 90, originalityScore: 90, readabilityScore: 90, warnings: [] },
  } as unknown as StructuredContent;
}

/** Only what the swap guard reads: packet candidate titles and their verification verdicts. */
function record(packet: boolean): AgentHarmonyRecord {
  const titles = [['c1', LOW, true], ['c2', UNVERIFIED, false], ['c3', VERIFIED, true]] as const;
  return {
    active: true, report: [], issues: [],
    packet: packet ? ({ version: 1, titles: { chosenId: 'c1', comparison: '', candidates: titles.map(([id, title]) => ({ id, title })) } } as never) : null,
    verification: packet ? ({ candidates: titles.map(([id, , ok]) => ({ id, ok })) } as never) : null,
  };
}

function finalTitle(candidates: string[], harmony?: AgentHarmonyRecord): string {
  const draft = content(candidates);
  if (harmony) attachAgentHarmony(draft, harmony);
  return finalizeStructuredContent(draft, SOURCE, 'legacy').selectedTitle;
}

describe('FinalQualityGate candidate swap under a harmony session', () => {
  it('flag OFF / no record: the best-scoring candidate wins exactly as before (first of equal scores)', () => {
    expect(finalTitle([LOW, OUTSIDE, UNVERIFIED, VERIFIED])).toBe(OUTSIDE);
  });

  it('a record without a packet behaves like OFF', () => {
    expect(finalTitle([LOW, OUTSIDE, UNVERIFIED, VERIFIED], record(false))).toBe(OUTSIDE);
  });

  it('packet present: only a verified packet candidate may replace the weak title', () => {
    expect(finalTitle([LOW, OUTSIDE, UNVERIFIED, VERIFIED], record(true))).toBe(VERIFIED);
  });

  it('packet present and no verified alternative: the session\'s title stays (no swap, no rewrite)', () => {
    expect(finalTitle([LOW, OUTSIDE, UNVERIFIED], record(true))).toBe(LOW);
  });

  it('packet present and a strong session title is untouched (the gate only runs below 50 points)', () => {
    const draft = content([VERIFIED, OUTSIDE]);
    (draft as { selectedTitle: string }).selectedTitle = VERIFIED;
    attachAgentHarmony(draft, record(true));
    expect(finalizeStructuredContent(draft, SOURCE, 'legacy').selectedTitle).toBe(VERIFIED);
  });
});
