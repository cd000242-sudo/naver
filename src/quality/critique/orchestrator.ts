// [2026-09-22 Critique Loop] Orchestrator: precheck -> Critic 1 -> (research recovery) ->
// targeted revision -> verification (<= 2 cycles) -> editorial critic -> minimal fix ->
// Final Judge. Fast path when nothing blocks. Flag-gated by the caller (contentGenerator).
//
// Call budget: clean article 3 (critic, editorial, judge); one revision 5; two revisions <= 7.

import type { StructuredContent } from '../../contentGenerator';
import type { SourceDocument } from '../../content/sourceDocument';
import type { QualityIssue, QualityLoopSummary } from './types';
import { buildArticleModel, applySectionEdits } from './sectionModel';
import { buildEvidencePack, evidenceCorpus } from './evidence';
import { runPrecheck } from './precheck';
import { addIssues, applyVerification, blockingIssues, createLedger, listIssues, markAdvisory, markPending, type IssueLedger } from './issueLedger';
import { runCritic, runEditorialCritic, isUnparseable } from './critic';
import { describeSearchIntent } from './criticPrompt';
import { runBatchEditor, mergeRevisions } from './batchEditor';
import { runVerification } from './verification';
import { runFinalJudge } from './finalJudge';
import { runResearchRecovery, type ResearchSearchFn } from './researchRecovery';
import { buildPreservationReport, preservationViolations, removedFactTokens, reintroducedTokens } from './preservation';
import { computeQualityMetrics } from './metrics';
import { classifyHashtags } from './hashtagProvenance';
import { propagateUnsupportedValues } from './issuePropagation';
import { scanHighRiskClaims, mergeSeedsWithCritic, introducedUnsupportedValues } from './claimScanner';
import { splitByLayer } from './issueTaxonomy';
import { finalizeCostLedger } from './costLedger';
import { createLoopState, routeFor, todayLabel, type ArtifactWriter, type RouteResolver } from './loopContext';

export const MAX_REVISION_CYCLES = 2;

export interface QualityLoopInput {
  readonly content: StructuredContent;
  readonly keyword: string;
  readonly contentMode: string;
  readonly topicType: string;
  readonly sourceDocuments: readonly SourceDocument[];
  readonly rawCorpus: string;
  /** Blueprint / raw material the Writer saw beyond the documents (corpus for deterministic checks). */
  readonly extraMaterial?: string;
  readonly sourceBased: boolean;
  readonly jsonComplete: boolean;
  readonly outputTruncated: boolean;
  readonly relatedKeywords: readonly string[];
  readonly relatedKeywordsAreLlmExpanded: boolean;
  readonly baseCalls: number;
  readonly resolveRoute: RouteResolver;
  readonly search?: ResearchSearchFn;
  readonly writeArtifact?: ArtifactWriter;
  readonly log?: (line: string) => void;
  readonly now?: Date;
}

export interface QualityLoopOutput {
  readonly content: StructuredContent;
  readonly summary: QualityLoopSummary;
}

export async function runQualityLoop(input: QualityLoopInput): Promise<QualityLoopOutput> {
  const state = createLoopState(input.baseCalls, input.log, input.writeArtifact);
  const today = todayLabel(input.now);
  const searchIntent = describeSearchIntent(input.keyword, input.topicType, input.contentMode);
  const ctx = { today, keyword: input.keyword, searchIntent, contentMode: input.contentMode, topicType: input.topicType };
  const editorCtx = { today, keyword: input.keyword, title: String(input.content.selectedTitle || ''), searchIntent };
  const manual: string[] = [];
  let content = input.content;
  let model = buildArticleModel(content);
  const model0 = model;
  let documents = [...input.sourceDocuments];
  // The reviewers see the same material as the Writer: full cleaned bodies + blueprint/raw material.
  const evidenceOptions = { extraMaterial: [input.rawCorpus, input.extraMaterial || ''].filter((t) => t.trim()).join(' ') };
  let evidence = buildEvidencePack(documents, input.keyword, input.rawCorpus, evidenceOptions);
  let ledger: IssueLedger = createLedger();
  let cycles = 0;
  let recoveries = 0;
  let fastPath = false;
  /** Non-integrity issues left OPEN after the budget — advisory when the Judge (shown them) still passes. */
  let terminalAdvisory: string[] = [];

  const finish = (judge: QualityLoopSummary['judge'], skipped = false): QualityLoopOutput => {
    const issues = listIssues(ledger);
    const flagged = issues.filter((i) => i.origin !== 'precheck' || i.state !== 'ADVISORY');
    const preservation = buildPreservationReport(model0, model, flagged, evidenceCorpus(evidence));
    const decision = skipped ? 'SKIPPED' : manual.length > 0 || judge?.decision === 'BLOCK' ? 'MANUAL_REVIEW' : 'QUALITY_CONVERGED';
    const summary: QualityLoopSummary = {
      enabled: true, decision, fastPath, revisionCycles: cycles, researchRecoveries: recoveries,
      manualReviewReasons: [...manual, ...(judge?.decision === 'BLOCK' ? judge.blockingIssues.map((b) => `JUDGE_BLOCK[${b.sectionId}/${b.type}] ${b.reason}`) : [])],
      terminalAdvisory: decision === 'QUALITY_CONVERGED' ? terminalAdvisory : [],
      models: { ...state.models }, cost: finalizeCostLedger(state.cost, state.subscription), preservation,
      metrics: computeQualityMetrics(model, evidence), issues, judge,
    };
    state.writeArtifact('Q-ledger.json', { summary, issues });
    state.log(`[QualityLoop] ${decision} fastPath=${fastPath} cycles=${cycles} calls=${summary.cost.qualityCalls} models=${JSON.stringify(summary.models)}`);
    return { content, summary };
  };

  // 1. Deterministic precheck ($0).
  const precheck = runPrecheck({ model, evidence, sourceBased: input.sourceBased, jsonComplete: input.jsonComplete, outputTruncated: input.outputTruncated, rawCorpus: input.rawCorpus });
  state.writeArtifact('Q0-precheck.json', precheck);
  if (precheck.hardStops.length > 0) { manual.push(...precheck.hardStops); return finish(null); }
  ledger = addIssues(ledger, precheck.issues);
  // 1b. High-risk claim scanner ($0): numbers / dates / attributed quotes / entity lists the full
  //     corpus does not carry become issue SEEDS (never deletions). Merged with Critic 1 by claim.
  const seeds = scanHighRiskClaims(model, evidenceCorpus(evidence));
  state.writeArtifact('Q0b-claims.json', seeds);

  // 2. Critic 1 (facts / intent / title promise / missing information).
  const criticRoute = await routeFor(state, input.resolveRoute, 'critic');
  if (!criticRoute) {
    manual.push('NO_ROUTE: 선택 엔진 라우트 없음 — 루프 생략');
    return finish(null, true);
  }
  state.round = 1;
  let critic = await runCritic(criticRoute, ctx, model, evidence, 1);
  if (isUnparseable(critic.result)) critic = await runCritic(criticRoute, ctx, model, evidence, 1);
  if (isUnparseable(critic.result)) { manual.push('CRITIC_UNPARSEABLE: Critic 응답 2회 해석 실패'); }
  state.writeArtifact('Q1-critic.json', { prompt: critic.prompt, ...critic.result });

  // 3. Research recovery (max 1) — search before any editing, never invent.
  if (critic.result.status === 'NEEDS_MORE_RESEARCH' && critic.result.researchQueries.length > 0) {
    if (input.search && recoveries === 0) {
      recoveries += 1;
      const recovery = await runResearchRecovery(input.search, documents, critic.result.researchQueries, input.keyword);
      state.writeArtifact('Q1b-research.json', { queries: recovery.queries, added: recovery.addedDocuments, failures: recovery.failures });
      if (recovery.addedDocuments > 0) {
        documents = [...recovery.documents];
        evidence = buildEvidencePack(recovery.documents, input.keyword, input.rawCorpus, evidenceOptions);
        critic = await runCritic(criticRoute, ctx, model, evidence, 1);
        state.writeArtifact('Q1c-critic-after-research.json', { prompt: critic.prompt, ...critic.result });
      }
    }
    if (critic.result.status === 'NEEDS_MORE_RESEARCH') manual.push(`NEEDS_MORE_RESEARCH: ${critic.result.researchQueries.join(' | ') || '추가 자료 없음'}`);
  }
  // Merge scanner seeds with Critic 1 by claim (same section, same unsupported values): the Critic's
  // issue wins (it carries evidenceIds and a requiredChange); a seed the Critic did not see stays.
  const merged = mergeSeedsWithCritic(seeds, critic.result.issues, evidenceCorpus(evidence));
  state.writeArtifact('Q1-merge.json', { seeds: seeds.length, critic: critic.result.issues.length, seedsKept: merged.keptSeeds.length, seedsCoveredByCritic: merged.coveredSeeds.length });
  // Deterministic: a value proved unsupported is unsupported everywhere it repeats — first cycle.
  const firstCycle = [...critic.result.issues, ...merged.keptSeeds];
  const propagated = propagateUnsupportedValues(firstCycle, model, evidenceCorpus(evidence));
  if (propagated.length > 0) state.writeArtifact('Q1d-propagated.json', propagated);
  ledger = addIssues(ledger, [...firstCycle, ...propagated, ...critic.result.dropped]);

  // 4. Targeted revision + verification, at most MAX_REVISION_CYCLES.
  fastPath = blockingIssues(ledger).length === 0;
  while (!fastPath && cycles < MAX_REVISION_CYCLES && blockingIssues(ledger).length > 0) {
    cycles += 1;
    state.round = cycles;
    const open = blockingIssues(ledger);
    const editorRoute = await routeFor(state, input.resolveRoute, 'revision');
    if (!editorRoute) { manual.push('NO_ROUTE: 편집 라우트 없음'); break; }
    const edited = await runBatchEditor(editorRoute, editorCtx, model, open, evidence);
    const merged = mergeRevisions(edited.results);
    state.writeArtifact(`Q2-revision-r${cycles}.json`, { targeted: edited.results.map((r) => r.targetedSectionIds), changed: Object.keys(merged.sections), patchedIssueKeys: merged.patchedIssueKeys, rejected: merged.rejected, prompts: edited.prompts, raw: edited.results.map((r) => r.rawText) });
    const changedIds = Object.keys(merged.sections);
    if (changedIds.length === 0) { manual.push(`REVISION_NOOP: 편집자가 ${open.length}건을 고치지 못함 (round ${cycles})`); break; }

    const candidate = applySectionEdits(content, model, merged.sections);
    const candidateModel = buildArticleModel(candidate);
    const report = buildPreservationReport(model, candidateModel, open, evidenceCorpus(evidence));
    const violations = preservationViolations(report);
    const restored = reintroducedTokens(removedFactTokens(listIssues(ledger), model), candidateModel);
    if (restored.length > 0) violations.push(`제거된 미지원 값 재유입: ${restored.slice(0, 5).join(', ')}`);
    const invented = introducedUnsupportedValues(model, candidateModel, evidenceCorpus(evidence), changedIds);
    if (invented.length > 0) violations.push(`편집자가 자료에 없는 값을 새로 넣음: ${invented.slice(0, 5).join(', ')}`);
    if (violations.length > 0) {
      manual.push(`PRESERVATION_VIOLATION(round ${cycles}): ${violations.join('; ')}`);
      state.writeArtifact(`Q2-preservation-r${cycles}.json`, report);
      break; // the candidate is discarded — the article stays as it was
    }
    content = candidate;
    model = candidateModel;

    const pendingIssues = open.filter((i) => changedIds.includes(i.sectionId));
    ledger = markPending(ledger, pendingIssues.map((i) => i.issueKey));
    const verifierRoute = await routeFor(state, input.resolveRoute, 'verification');
    if (!verifierRoute) { manual.push('NO_ROUTE: 검증 라우트 없음'); break; }
    const verified = await runVerification(verifierRoute, editorCtx, model, changedIds, pendingIssues, evidence, cycles);
    state.writeArtifact(`Q3-verification-r${cycles}.json`, { prompt: verified.prompt, ...verified.result });
    ledger = applyVerification(ledger, verified.result.resolved, verified.result.stillOpen);
    ledger = addIssues(ledger, verified.result.newIssues);
  }
  // Terminal reconciliation, part 1: unresolved INTEGRITY issues block regardless of the Judge;
  //   unresolved editorial/intent issues are handed to the Judge (part 2, below).
  if (!fastPath && blockingIssues(ledger).length > 0 && manual.every((m) => !m.startsWith('REVISION_NOOP') && !m.startsWith('PRESERVATION'))) {
    const { integrity } = splitByLayer(blockingIssues(ledger));
    if (integrity.length > 0) manual.push(`UNRESOLVED_INTEGRITY_AFTER_${cycles}_CYCLES: ${integrity.map((i) => `${i.sectionId}/${i.type}`).join(', ')}`);
  }

  // 5. Editorial / homefeed critic (structure, redundancy, focus) + one minimal fix if budget remains.
  const editorialRoute = await routeFor(state, input.resolveRoute, 'editorial');
  if (editorialRoute) {
    state.round = cycles + 1;
    const removedValues = removedFactTokens(listIssues(ledger), model);
    const editorial = await runEditorialCritic(editorialRoute, { ...ctx, homefeed: input.contentMode === 'homefeed', removedValues }, model, evidence, state.round);
    state.writeArtifact('Q4-editorial.json', { prompt: editorial.prompt, ...editorial.result });
    const structural = editorial.result.issues.filter((i: QualityIssue) => i.severity !== 'MINOR');
    ledger = addIssues(ledger, [...editorial.result.issues, ...editorial.result.dropped]);
    if (structural.length > 0) {
      if (cycles < MAX_REVISION_CYCLES) {
        cycles += 1;
        const editorRoute = await routeFor(state, input.resolveRoute, 'revision');
        if (editorRoute) {
          const edited = await runBatchEditor(editorRoute, editorCtx, model, structural, evidence);
          const merged = mergeRevisions(edited.results);
          state.writeArtifact('Q4b-editorial-fix.json', { changed: Object.keys(merged.sections), rejected: merged.rejected, raw: edited.results.map((r) => r.rawText) });
          const candidate = applySectionEdits(content, model, merged.sections);
          const candidateModel = buildArticleModel(candidate);
          const violations = preservationViolations(buildPreservationReport(model, candidateModel, structural, evidenceCorpus(evidence)));
          const restored = [...reintroducedTokens(removedValues, candidateModel), ...introducedUnsupportedValues(model, candidateModel, evidenceCorpus(evidence), Object.keys(merged.sections))];
          if (restored.length > 0) {
            // A structural fix must not undo a verified fact fix; the pre-fix article is kept and judged.
            state.writeArtifact('Q4c-editorial-fix-rejected.json', { restored, changed: Object.keys(merged.sections) });
            state.log(`[QualityLoop] 편집 데스크 수정 폐기 — 제거된 미지원 값 재유입: ${restored.join(', ')}`);
          } else if (violations.length === 0 && Object.keys(merged.sections).length > 0) {
            content = candidate; model = candidateModel;
            ledger = applyVerification(markPending(ledger, structural.map((i) => i.issueKey)), structural.map((i) => i.issueKey), []);
          } else if (violations.length > 0) {
            manual.push(`PRESERVATION_VIOLATION(editorial): ${violations.join('; ')}`);
          }
        }
      }
      // else: budget spent — these editorial issues stay OPEN and go to the Judge as terminal candidates.
    }
  }

  // 6. Final Judge on the actual final article (body + FAQ + CTA + hashtags with provenance) plus the
  //    OPEN issues left after the budget. Terminal reconciliation, part 2:
  //      integrityOpen > 0 -> MANUAL_REVIEW (already pushed above)
  //      judge BLOCK       -> MANUAL_REVIEW
  //      otherwise         -> remaining editorial OPEN issues become terminal advisory, article converges.
  const judgeRoute = await routeFor(state, input.resolveRoute, 'judge');
  if (!judgeRoute) { manual.push('NO_ROUTE: 판정 라우트 없음'); return finish(null); }
  const hashtags = classifyHashtags({
    hashtags: model.hashtags, primaryKeyword: input.keyword, relatedKeywords: input.relatedKeywords,
    relatedKeywordsAreLlmExpanded: input.relatedKeywordsAreLlmExpanded, articleText: model.sections.map((s) => s.text).join('\n'),
  });
  const openAtJudge = blockingIssues(ledger);
  const judged = await runFinalJudge(judgeRoute, { ...ctx, hashtags, precheckHardStops: precheck.hardStops, openIssues: openAtJudge }, model, evidence);
  state.writeArtifact('Q5-judge.json', { prompt: judged.prompt, openIssues: openAtJudge.map((i) => i.issueKey), ...judged.result });
  const { editorial: editorialOpen } = splitByLayer(openAtJudge);
  terminalAdvisory = editorialOpen.map((i) => `TERMINAL_ADVISORY[${i.sectionId}/${i.type}] ${i.problem.slice(0, 160)}`);
  if (judged.result.decision === 'PASS' && editorialOpen.length > 0) {
    ledger = markAdvisory(ledger, editorialOpen.map((i) => i.issueKey), 'terminal advisory (judge PASS)');
    state.writeArtifact('Q5b-terminal.json', { advisory: terminalAdvisory });
  }
  return finish({ decision: judged.result.decision, blockingIssues: judged.result.blockingIssues, advisory: judged.result.advisory });
}
