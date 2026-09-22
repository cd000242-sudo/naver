// [2026-09-22 Critique Loop] Deterministic propagation of unsupported values ($0).
// Live 20260922-201400: the Critic flagged "10월 16~22일" in intro and s6 but not in the
// conclusion, and the surviving copy blocked publication. Once a number/date token is known
// to be unsupported (flagged by the Critic AND absent from the evidence), every other section
// that repeats it gets a derived issue on the sentence carrying it — no model call needed.

import type { ArticleModel, QualityIssue } from './types';
import { extractTokens } from './preservation';
import { issueFingerprint } from './issueValidator';
import { buildAllowedValues } from './claimNormalize';

const FACT_TYPES: ReadonlySet<string> = new Set(['UNSUPPORTED_VALUE', 'FACT_ERROR']);
const SENTENCE_SPLIT_RE = /(?<=[.!?。])\s+|\n+/;

function sentenceWith(text: string, token: string): string | undefined {
  return text.split(SENTENCE_SPLIT_RE).map((s) => s.trim()).find((s) => {
    const t = extractTokens(s);
    return t.numbers.includes(token) || t.dates.includes(token);
  });
}

export function propagateUnsupportedValues(
  issues: readonly QualityIssue[],
  model: ArticleModel,
  evidenceCorpus: string,
): QualityIssue[] {
  // Canonical tokens: "10월 16∼22일" in the source licenses "10월 16~22일" in the article.
  const allowed = buildAllowedValues(evidenceCorpus);
  const seeds = issues.filter((i) => FACT_TYPES.has(i.type) && i.state === 'OPEN');
  const covered = new Set(issues.map((i) => `${i.sectionId}|${i.exactSpan.replace(/\s+/g, '')}`));
  const derived: QualityIssue[] = [];
  const seen = new Set<string>();
  for (const seed of seeds) {
    const t = extractTokens(seed.exactSpan);
    const tokens = [...t.numbers, ...t.dates].filter((tok) => tok.length >= 3 && !allowed.numbers.has(tok) && !allowed.dates.has(tok));
    for (const token of tokens) {
      for (const section of model.sections) {
        if (section.id === seed.sectionId) continue;
        const sentence = sentenceWith(section.text, token);
        if (!sentence) continue;
        const key = `${section.id}|${sentence.replace(/\s+/g, '')}`;
        if (covered.has(key) || seen.has(key)) continue;
        // Skip when an existing issue on this section already covers the sentence.
        if (issues.some((i) => i.sectionId === section.id && sentence.replace(/\s+/g, '').includes(i.exactSpan.replace(/\s+/g, '')) && i.exactSpan.length > 0)) continue;
        seen.add(key);
        derived.push({
          issueKey: issueFingerprint(section.id, seed.type, sentence),
          severity: 'MAJOR',
          type: seed.type,
          sectionId: section.id,
          exactSpan: sentence,
          operation: 'REPLACE',
          evidenceIds: seed.evidenceIds,
          problem: `자료에 없는 값 "${token}" 이(가) ${seed.sectionId} 에서 지적된 뒤 이 섹션에도 반복된다`,
          requiredChange: `${seed.requiredChange} (같은 값 "${token}" 을 이 문장에서도 자료 범위로 낮추거나 뺀다)`,
          state: 'OPEN',
          origin: 'precheck',
          round: seed.round,
          note: `propagated from ${seed.issueKey}`,
        });
      }
    }
  }
  return derived;
}
