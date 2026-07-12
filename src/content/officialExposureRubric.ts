import type { EvaluationInput, SubScore } from './qualityEvaluator';
import {
  auditEvidenceIntegrity,
  collectSupportedConcreteClaims,
} from './evidenceIntegrity';

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const splitParagraphs = (text: string): string[] =>
  text.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);

const splitSentences = (text: string): string[] =>
  text
    .split(/[.!?\n]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

const includesAny = (text: string, terms: readonly string[]): boolean => {
  const lower = text.toLowerCase();
  return terms.some((term) => lower.includes(term.toLowerCase()));
};

const includesTerm = (text: string, term: string): boolean =>
  text.toLowerCase().includes(term.toLowerCase());

const countKeyword = (text: string, keyword?: string): number => {
  const kw = String(keyword || '').trim();
  if (!kw) return 0;
  return text.match(new RegExp(escapeRegex(kw), 'gi'))?.length || 0;
};

const keywordDensityPct = (text: string, keyword?: string): number => {
  const kw = String(keyword || '').trim();
  if (!text || !kw) return 0;
  return (countKeyword(text, kw) * kw.length / Math.max(1, text.length)) * 100;
};

const countConcreteNumbers = (text: string): number => {
  const pattern = /\d+(?:[.,]\d+)?(?:\s*[-~]\s*\d+(?:[.,]\d+)?)?\s*(?:%|days?|weeks?|months?|years?|cases?|items?|won|krw|usd|hours?|minutes?|cm|mm|m|kg|g|ml|l|\ub144|\uc6d4|\uc77c|\uc8fc|\uac1c\uc6d4|\uac1c|\uac74|\ubd84|\uc2dc\uac04|\uc6d0|\ub9cc\uc6d0|\ucc9c\uc6d0|kg|g|cm|mm|ml|l)/gi;
  return text.match(pattern)?.length || 0;
};

const countSourceSignals = (text: string): number => {
  const terms = [
    'official',
    'source',
    'report',
    'according to',
    'data',
    'updated',
    'guideline',
    'faq',
    'manual',
    'policy',
    '\uacf5\uc2dd',
    '\uae30\uc900',
    '\uc790\ub8cc',
    '\ubcf4\ub3c4',
    '\uac00\uc774\ub4dc',
    '\uc5c5\ub370\uc774\ud2b8',
    '\uc548\ub0b4',
  ];
  return terms.reduce((count, term) => count + (text.toLowerCase().includes(term.toLowerCase()) ? 1 : 0), 0);
};

const countExperienceSignals = (text: string): number => {
  const terms = [
    'tested',
    'compared',
    'reviewed',
    'used',
    'checked',
    'case',
    'experience',
    'before and after',
    '\uc9c1\uc811',
    '\uc368\ubcf8',
    '\uc0ac\uc6a9\ud574\ubcf8',
    '\ube44\uad50',
    '\ud655\uc778',
    '\uacbd\ud5d8',
    '\uc0ac\ub840',
    '\ud6c4\uae30',
  ];
  return terms.reduce((count, term) => count + (text.toLowerCase().includes(term.toLowerCase()) ? 1 : 0), 0);
};

const countStructuredBlocks = (text: string): number => {
  let score = 0;
  if (/\|.+\|/.test(text)) score += 1;
  if (/^\s*(?:[-*]|\d+[.)])\s+/m.test(text)) score += 1;
  if (/(?:^|\n)\s*Q(?:\d+)?[.:]/i.test(text) || /FAQ/i.test(text) || text.includes('\uc790\uc8fc \ubb3b\ub294')) score += 1;
  if (includesAny(text, ['checklist', 'step', '\uccb4\ud06c\ub9ac\uc2a4\ud2b8', '\ub2e8\uacc4'])) score += 1;
  return score;
};

const countCiteableAnswerAtoms = (text: string): number => {
  const sentences = splitSentences(text);
  return sentences.filter((sentence) => {
    const len = sentence.length;
    const hasAnswerCue = includesAny(sentence, [
      'is ',
      'are ',
      'means',
      'because',
      'should',
      '\uc785\ub2c8\ub2e4',
      '\ud569\ub2c8\ub2e4',
      '\uc774\uc720',
      '\ud575\uc2ec',
      '\uacb0\ub860',
      '\uc911\uc694',
    ]);
    return len >= 35 && len <= 180 && hasAnswerCue;
  }).length;
};

const hasFormulaicRepetition = (text: string, keyword?: string): boolean => {
  const density = keywordDensityPct(text, keyword);
  if (density > 6) return true;

  const normalized = text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  const words = normalized.split(' ').filter((word) => word.length >= 2);
  if (words.length < 20) return false;

  const phraseCounts = new Map<string, number>();
  for (let i = 0; i < words.length - 2; i += 1) {
    const phrase = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
    phraseCounts.set(phrase, (phraseCounts.get(phrase) || 0) + 1);
  }
  return [...phraseCounts.values()].some((count) => count >= 4);
};

const buildModeIntentBonus = (input: EvaluationInput, text: string): number => {
  if (input.mode === 'mate') {
    const atoms = countCiteableAnswerAtoms(text);
    const blocks = countStructuredBlocks(text);
    return clamp(atoms * 2 + blocks * 2, 0, 12);
  }

  if (input.mode === 'homefeed') {
    const intro = text.slice(0, 250);
    const hasSituation = includesAny(intro, [
      'when', 'before', 'first', 'confusing', 'check',
      '\ucc98\uc74c', '\uba3c\uc800', '\ud5f7\uac08', '\uace0\ubbfc', '\ubd88\ud3b8', '\ud655\uc778', '\ud560 \ub54c',
    ]);
    const hasValue = includesAny(intro, [
      'criterion', 'difference', 'reason', 'order', 'caution',
      '\uae30\uc900', '\ucc28\uc774', '\uc774\uc720', '\uc21c\uc11c', '\uc8fc\uc758',
    ]);
    return (hasSituation ? 6 : 0) + (hasValue ? 4 : 0);
  }

  const hasSearchIntentAnswer = includesAny(text.slice(0, 350), [
    'answer',
    'short answer',
    'the key',
    'first check',
    '\uacb0\ub860',
    '\ud575\uc2ec',
    '\uba3c\uc800',
    '\uc694\uc57d',
  ]);
  return hasSearchIntentAnswer ? 8 : 0;
};

export function evaluateOfficialExposure(input: EvaluationInput): SubScore {
  const body = input.body || '';
  const title = input.title || '';
  const headings = input.headings || [];
  const text = `${title}\n\n${body}`.trim();
  const paragraphs = splitParagraphs(body);
  const sentences = splitSentences(body);
  const primaryKeyword = input.primaryKeyword || '';
  const groundingText = input.groundingText || input.rawText || '';
  const evidenceAudit = auditEvidenceIntegrity({
    title,
    body,
    groundingText,
    firstPartyEvidenceAvailable: input.firstPartyEvidenceAvailable === true,
  });

  const issues: string[] = [];
  const suggestions: string[] = [];
  const details: Record<string, number> = {};

  const firstBlock = body.slice(0, 350);
  const hasPrimaryInTitleOrIntro = primaryKeyword
    ? includesTerm(title, primaryKeyword) || includesTerm(firstBlock, primaryKeyword)
    : true;
  const directAnswerCue = includesAny(firstBlock, [
    'answer',
    'short answer',
    'the key',
    'first answer',
    'first thing',
    'safe next action',
    'safest next action',
    'criterion',
    'criteria',
    'means',
    '\uacb0\ub860',
    '\ud575\uc2ec',
    '\uba3c\uc800',
    '\uc815\ub9ac\ud558\uba74',
    '\uc774\uc720',
  ]);
  details.intentAnswerFit = clamp((hasPrimaryInTitleOrIntro ? 7 : 0) + (directAnswerCue ? 9 : 0), 0, 16);
  if (details.intentAnswerFit < 10) {
    issues.push('intent answer is not clear in the first screen');
    suggestions.push('Start with a direct answer, then explain conditions, exceptions, and next action.');
  }

  const concreteNumberCount = countConcreteNumbers(text);
  const unsupportedConcreteCount = evidenceAudit.issues
    .filter((issue) => issue.code === 'UNSUPPORTED_CONCRETE_CLAIM')
    .reduce((sum, issue) => sum + issue.examples.length, 0);
  const supportedConcreteCount = collectSupportedConcreteClaims(text, groundingText).length;
  const sourceSignalCount = countSourceSignals(text);
  const experienceSignalCount = input.firstPartyEvidenceAvailable === true
    ? countExperienceSignals(text)
    : 0;
  details.concreteNumberCount = concreteNumberCount;
  details.supportedConcreteNumberCount = supportedConcreteCount;
  details.unsupportedConcreteNumberCount = unsupportedConcreteCount;
  details.sourceSignalCount = sourceSignalCount;
  details.experienceSignalCount = experienceSignalCount;
  const earlyStructuredBlocks = countStructuredBlocks(text);
  const decisionEvidenceBonus = input.mode === 'mate' ? earlyStructuredBlocks * 2 : 0;
  details.evidenceExperience = clamp(
    (groundingText.trim().length >= 50 ? 8 : 5)
      + supportedConcreteCount * 2
      + Math.min(4, sourceSignalCount)
      + experienceSignalCount * 2
      + decisionEvidenceBonus
      - unsupportedConcreteCount * 5,
    0,
    20,
  );
  if (details.evidenceExperience < 8) {
    issues.push('evidence and experience density is weak');
    suggestions.push('Add verifiable dates, figures, conditions, official/source context, or real usage/comparison evidence.');
  }

  const hasException = includesAny(text, [
    'except',
    'exception',
    'limit',
    'caution',
    'misunderstanding',
    '\uc608\uc678',
    '\ud55c\uacc4',
    '\uc8fc\uc758',
    '\uc624\ud574',
    '\ub2e4\ub978',
  ]);
  const hasComparison = includesAny(text, ['compare', 'versus', 'vs', 'difference', '\ube44\uad50', '\ucc28\uc774']);
  const repeated = hasFormulaicRepetition(text, primaryKeyword);
  details.originalAngle = clamp((hasException ? 6 : 0) + (hasComparison ? 5 : 0) + (!repeated ? 3 : 0), 0, 14);
  if (repeated) {
    issues.push('keyword repetition or repeated phrase pattern detected');
    suggestions.push('Reduce repeated keywords and replace them with conditions, examples, and reader-specific distinctions.');
  }

  const avgSentenceLength = sentences.length
    ? sentences.reduce((sum, sentence) => sum + sentence.length, 0) / sentences.length
    : 0;
  const headingFit = headings.length >= 3 && headings.length <= 7;
  const paragraphFit = paragraphs.length >= 3;
  const sentenceFit = avgSentenceLength >= 20 && avgSentenceLength <= 120;
  details.readableStructure = (headingFit ? 5 : 0) + (paragraphFit ? 5 : 0) + (sentenceFit ? 4 : 0);
  if (details.readableStructure < 9) {
    issues.push('readability structure is thin or too rigid');
    suggestions.push('Use 3-7 meaningful sections, short mobile paragraphs, and one clear point per section.');
  }

  const hasFreshness = /\b20\d{2}\b|\d{4}[.-]\d{1,2}|updated|latest|current|\ucd5c\uc2e0|\uae30\uc900|\uc5c5\ub370\uc774\ud2b8/.test(text);
  const freshnessSupported = !hasFreshness || /\b20\d{2}\b|\d{4}[.-]\d{1,2}|updated|latest|current|\ucd5c\uc2e0|\uae30\uc900|\uc5c5\ub370\uc774\ud2b8/.test(groundingText);
  details.freshness = freshnessSupported ? 10 : 2;

  const structuredBlocks = countStructuredBlocks(text);
  const citeableAnswerAtoms = countCiteableAnswerAtoms(text);
  details.structuredBlocks = structuredBlocks;
  details.citeableAnswerAtoms = citeableAnswerAtoms;
  details.citeableAnswerAtomsScore = clamp(citeableAnswerAtoms * 2 + structuredBlocks * 2, 0, 12);

  const unsafePromise = includesAny(text, [
    'guaranteed',
    'always',
    'never fail',
    '100%',
    '\ubb34\uc870\uac74',
    '\ubc18\ub4dc\uc2dc',
    '\ubcf4\uc7a5',
  ]);
  details.trustSafety = clamp(
    14
      - (unsafePromise ? 6 : 0)
      - (repeated ? 5 : 0)
      - (evidenceAudit.hardFail ? 10 : 0)
      + (sourceSignalCount > 0 ? 2 : 0),
    0,
    14,
  );
  if (unsafePromise) {
    issues.push('absolute promise expression detected');
  }
  if (evidenceAudit.hardFail) {
    issues.push(...evidenceAudit.issues.map((issue) => issue.message));
    suggestions.push('Remove unsupported firsthand claims and concrete figures; use source-backed conditions and verification steps.');
  }

  const modeBonus = buildModeIntentBonus(input, text);
  details.modeSpecificFit = modeBonus;

  const total =
    details.intentAnswerFit +
    details.evidenceExperience +
    details.originalAngle +
    details.readableStructure +
    details.freshness +
    details.citeableAnswerAtomsScore +
    details.trustSafety +
    details.modeSpecificFit;

  return {
    score: Math.round(clamp(total, 0, 100)),
    details,
    issues,
    suggestions,
  };
}
