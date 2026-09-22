// [2026-09-22 Critique Loop] The single hook contentGenerator calls after the draft pipeline
// returns and before the integrity verdict is attached. Flag OFF -> returns the draft
// untouched with `summary: null` (zero extra calls, zero behaviour change).
//
// Research recovery uses the same search/CLEAN/relevance pipeline as generation
// (collectKeywordMaterials + prepareSourceMaterial), loaded lazily so the crawler stack
// stays out of the static runtime closure.

import type { StructuredContent } from '../../contentGenerator';
import type { SourceDocument } from '../../content/sourceDocument';
import type { GenerationRun } from '../generationRunStore';
import type { QualityLoopSummary, QualityRoute } from './types';
import { isQualityLoopEnabled } from './flag';
import { runQualityLoop } from './orchestrator';
import type { LoopStage } from './loopContext';

export interface QualityLoopHookInput {
  readonly result: StructuredContent;
  readonly keyword: string;
  readonly contentMode: string;
  readonly topicType: string;
  readonly sourceBased: boolean;
  readonly sourceDocuments: readonly SourceDocument[];
  readonly rawCorpus: string;
  /** Blueprint / raw material the Writer saw beyond the structured documents. */
  readonly extraMaterial?: string;
  readonly relatedKeywords: readonly string[];
  readonly relatedKeywordsAreLlmExpanded: boolean;
  readonly run: GenerationRun;
  readonly config: Record<string, unknown> | null;
  readonly resolveRoute: (stage: LoopStage) => Promise<QualityRoute | null>;
}

export interface QualityLoopHookOutput {
  readonly content: StructuredContent;
  readonly summary: QualityLoopSummary | null;
}

async function searchForRecovery(query: string, contentMode: string, config: Record<string, unknown>): Promise<readonly SourceDocument[]> {
  const { collectKeywordMaterials } = await import('../../content/generationSourceBuilder.js');
  const { prepareSourceMaterial } = await import('../../content/sourcePipeline.js');
  const collected = await collectKeywordMaterials(query, config as never, { maxPerSource: 5, logger: (m) => console.log(`[QualityLoop:research] ${m}`) });
  const docs = Array.isArray(collected?.sourceDocuments) ? collected.sourceDocuments : [];
  if (docs.length === 0) return [];
  const prepared = prepareSourceMaterial(
    { rawText: String(collected.collectedText || ''), contentMode, metadata: { sourceDocuments: docs } } as never,
    query,
  );
  return prepared.documents;
}

/** Run the Critique Loop when enabled; otherwise pass the draft through unchanged. */
export async function maybeRunQualityLoop(input: QualityLoopHookInput): Promise<QualityLoopHookOutput> {
  if (!isQualityLoopEnabled(input.config as { naverQualityLoop?: unknown } | null)) {
    return { content: input.result, summary: null };
  }
  const { run } = input;
  console.log(`[QualityLoop] ON — keyword="${input.keyword}" mode=${input.contentMode} docs=${input.sourceDocuments.length}`);
  try {
    const out = await runQualityLoop({
      content: input.result,
      keyword: input.keyword,
      contentMode: input.contentMode,
      topicType: input.topicType,
      sourceDocuments: input.sourceDocuments,
      rawCorpus: input.rawCorpus,
      extraMaterial: input.extraMaterial,
      sourceBased: input.sourceBased,
      jsonComplete: run.meta.jsonComplete !== false,
      outputTruncated: run.meta.outputTruncated === true,
      relatedKeywords: input.relatedKeywords,
      relatedKeywordsAreLlmExpanded: input.relatedKeywordsAreLlmExpanded,
      baseCalls: run.meta.actualModelsUsed.length,
      resolveRoute: input.resolveRoute,
      search: input.config ? (q) => searchForRecovery(q, input.contentMode, input.config as Record<string, unknown>) : undefined,
      writeArtifact: (name, payload) => run.writeQualityArtifact(name, payload),
      log: (line) => console.log(line),
    });
    run.updateMeta({
      extra: {
        ...(run.meta.extra || {}),
        qualityLoop: {
          decision: out.summary.decision,
          fastPath: out.summary.fastPath,
          revisionCycles: out.summary.revisionCycles,
          researchRecoveries: out.summary.researchRecoveries,
          manualReviewReasons: out.summary.manualReviewReasons,
          models: out.summary.models,
          calls: { base: out.summary.cost.baseCalls, quality: out.summary.cost.qualityCalls, total: out.summary.cost.totalCalls },
          cost: { base: out.summary.cost.baseCostUsd, quality: out.summary.cost.qualityCostUsd, total: out.summary.cost.totalCostUsd },
          preservation: out.summary.preservation,
          metrics: out.summary.metrics,
        },
      },
    });
    return out;
  } catch (error) {
    // A loop failure must never lose the article: the draft passes through, the failure is recorded.
    const message = String((error as Error)?.message || error).slice(0, 300);
    console.warn(`[QualityLoop] 실패 — 초안 그대로 통과, MANUAL_REVIEW 사유 기록: ${message}`);
    run.updateMeta({ extra: { ...(run.meta.extra || {}), qualityLoop: { decision: 'MANUAL_REVIEW', error: message } } });
    return {
      content: input.result,
      summary: {
        enabled: true, decision: 'MANUAL_REVIEW', fastPath: false, revisionCycles: 0, researchRecoveries: 0,
        manualReviewReasons: [`LOOP_ERROR: ${message}`],
        terminalAdvisory: [],
        models: { criticModel: '', revisionModel: '', verificationModel: '', editorialModel: '', judgeModel: '' },
        cost: { baseCalls: run.meta.actualModelsUsed.length, qualityCalls: 0, totalCalls: run.meta.actualModelsUsed.length, baseCostUsd: null, qualityCostUsd: 0, totalCostUsd: null, qualityPromptChars: 0, qualityResponseChars: 0, calls: [] },
        preservation: { unchangedSections: 0, revisedSections: 0, flaggedSections: [], untouchedPreserved: true, lostNumbers: [], lostDates: [], lostOrganizations: [] },
        metrics: { coreFactCoverage: null, readerQuestionCoverage: null, vagueSentenceRatio: 0, redundantCoreFacts: 0, actionability: 0 },
        issues: [], judge: null,
      },
    };
  }
}
