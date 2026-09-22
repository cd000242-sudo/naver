// [2026-09-22 Critique Loop] Deterministic precheck — runs before any LLM critic and costs
// nothing. Reuses the P0/P1 gates (attribution guard, run meta truncation/JSON flags) and
// adds structural checks the Critic should not have to spend tokens on: empty sections,
// broken number formats, unsupported URLs. Hard stops (truncated output, incomplete JSON,
// zero sources) cannot be fixed by an editor and go straight to MANUAL_REVIEW.

import { classifyAttributions } from '../../content/attributionGuard';
import type { ArticleModel, EvidencePack, QualityIssue } from './types';
import { issueFingerprint } from './issueValidator';

const MIN_SECTION_CHARS = 30;
const BROKEN_THOUSANDS_RE = /\d,\d{1,2}(?![\d,])/g;
const FIVE_DIGIT_YEAR_RE = /\b\d{5,}년/g;
const URL_RE = /https?:\/\/[^\s)\]]+/g;

export interface PrecheckInput {
  readonly model: ArticleModel;
  readonly evidence: EvidencePack;
  readonly sourceBased: boolean;
  readonly jsonComplete: boolean;
  readonly outputTruncated: boolean;
  readonly rawCorpus: string;
}

export interface PrecheckResult {
  readonly issues: readonly QualityIssue[];
  readonly hardStops: readonly string[];
  readonly advisories: readonly string[];
}

function issue(
  partial: Omit<QualityIssue, 'issueKey' | 'state' | 'origin' | 'round' | 'evidenceIds'> & { evidenceIds?: readonly string[] },
): QualityIssue {
  return {
    ...partial,
    evidenceIds: partial.evidenceIds ?? [],
    issueKey: issueFingerprint(partial.sectionId, partial.type, partial.exactSpan || partial.requiredChange),
    state: partial.severity === 'MINOR' ? 'ADVISORY' : 'OPEN',
    origin: 'precheck',
    round: 0,
  };
}

export function runPrecheck(input: PrecheckInput): PrecheckResult {
  const { model, evidence } = input;
  const issues: QualityIssue[] = [];
  const hardStops: string[] = [];
  const advisories: string[] = [];

  if (input.outputTruncated) hardStops.push('OUTPUT_TRUNCATED: 모델 출력이 잘렸다 — 편집으로 복구 불가');
  if (!input.jsonComplete) hardStops.push('JSON_INCOMPLETE: 구조화 출력이 불완전하다 — 편집으로 복구 불가');
  if (input.sourceBased && evidence.sourceCount === 0 && !input.rawCorpus.trim()) hardStops.push('SOURCE_ZERO: 근거 자료 0건');
  if (model.sections.filter((s) => s.kind === 'section').length === 0) hardStops.push('NO_SECTIONS: 소제목/본문 구조가 없다');

  const sourceNames = evidence.items.map((it) => it.publisher).filter(Boolean);
  const evidenceCorpus = [input.rawCorpus, ...evidence.items.map((it) => `${it.title} ${it.excerpt}`)].join('\n');
  const knownUrls = new Set((evidenceCorpus.match(URL_RE) || []).map((u) => u.replace(/[.,]+$/, '')));

  for (const section of model.sections) {
    if (section.kind === 'section' && section.text.replace(/\s+/g, '').length < MIN_SECTION_CHARS) {
      issues.push(issue({
        severity: 'MAJOR', type: 'STRUCTURE', sectionId: section.id, exactSpan: section.title, operation: 'ADD',
        insertionAnchor: section.title,
        problem: `소제목 "${section.title}" 아래 본문이 비어 있거나 ${MIN_SECTION_CHARS}자 미만`,
        requiredChange: '자료에 있는 사실로 이 소제목이 약속한 내용을 채운다. 자료에 없으면 소제목을 제거한다.',
      }));
    }
    for (const m of section.text.match(BROKEN_THOUSANDS_RE) || []) {
      issues.push(issue({
        severity: 'MAJOR', type: 'UNSUPPORTED_VALUE', sectionId: section.id, exactSpan: m, operation: 'REPLACE',
        problem: `숫자 표기가 깨졌다: "${m}"`, requiredChange: '자료의 원래 숫자 표기로 고친다.',
      }));
    }
    for (const m of section.text.match(FIVE_DIGIT_YEAR_RE) || []) {
      issues.push(issue({
        severity: 'MAJOR', type: 'UNSUPPORTED_VALUE', sectionId: section.id, exactSpan: m, operation: 'REPLACE',
        problem: `연도 표기가 깨졌다: "${m}"`, requiredChange: '자료의 연도로 고친다.',
      }));
    }
    for (const url of section.text.match(URL_RE) || []) {
      if (!knownUrls.has(url.replace(/[.,]+$/, ''))) advisories.push(`[${section.id}] 자료에 없는 URL: ${url} (발행 시 URL 은 자동 제거됨)`);
    }
    try {
      const { unsupported } = classifyAttributions(section.text, { sourceNames, corpus: evidenceCorpus });
      for (const attr of unsupported.filter((a) => a.kind === 'named')) {
        issues.push(issue({
          severity: 'MAJOR', type: 'UNSUPPORTED_VALUE', sectionId: section.id, exactSpan: attr.phrase, operation: 'REPLACE',
          problem: `자료에 없는 출처 귀속: "${attr.phrase}"`,
          requiredChange: '자료에 있는 실제 출처로 바꾸거나, 출처 귀속 문구를 뺀다. 문장의 사실 자체는 자료에 있을 때만 남긴다.',
        }));
      }
    } catch { /* attribution guard is best-effort */ }
  }

  if (evidence.keyDates.length > 0 && !/\d{1,2}월\s*\d{1,2}일|20\d{2}년/.test(model.sections.map((s) => s.text).join('\n'))) {
    advisories.push('자료에 날짜가 있는데 본문에 날짜가 하나도 없다 (Critic MISSING_INFORMATION 후보)');
  }
  return { issues, hardStops, advisories };
}
