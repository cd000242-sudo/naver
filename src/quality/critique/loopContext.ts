// [2026-09-22 Critique Loop] Loop state helpers shared by the orchestrator: route resolution
// with call instrumentation, model recording, artifact writing. Kept apart from the
// orchestration so each file stays small and the orchestrator reads as the pipeline.

import type { QualityCallRecord, QualityRoute } from './types';
import { createCostLedger, instrumentedCall, recordCall, type CostLedgerState } from './costLedger';

export type LoopStage = QualityCallRecord['stage'];
export type RouteResolver = (stage: LoopStage) => Promise<QualityRoute | null>;
export type ArtifactWriter = (name: string, payload: unknown) => void;

export interface LoopState {
  cost: CostLedgerState;
  models: Record<'criticModel' | 'revisionModel' | 'verificationModel' | 'editorialModel' | 'judgeModel', string>;
  subscription: boolean;
  round: number;
  readonly log: (line: string) => void;
  readonly writeArtifact: ArtifactWriter;
}

export function createLoopState(baseCalls: number, log?: (line: string) => void, writeArtifact?: ArtifactWriter): LoopState {
  return {
    cost: createCostLedger(baseCalls),
    models: { criticModel: '', revisionModel: '', verificationModel: '', editorialModel: '', judgeModel: '' },
    subscription: false,
    round: 0,
    log: log ?? ((line) => console.log(line)),
    writeArtifact: writeArtifact ?? (() => undefined),
  };
}

const MODEL_KEY: Record<LoopStage, keyof LoopState['models'] | null> = {
  critic: 'criticModel',
  revision: 'revisionModel',
  verification: 'verificationModel',
  editorial: 'editorialModel',
  judge: 'judgeModel',
  research: null,
};

/** Resolve the route for a stage and wrap it so every call lands in the cost ledger. */
export async function routeFor(state: LoopState, resolver: RouteResolver, stage: LoopStage): Promise<QualityRoute | null> {
  const route = await resolver(stage);
  if (!route) return null;
  const key = MODEL_KEY[stage];
  if (key) state.models[key] = route.engine;
  if (route.subscription) state.subscription = true;
  const callModel = instrumentedCall(route.callModel, (call) => {
    state.cost = recordCall(state.cost, { ...call, stage, engine: route.engine, round: state.round });
  });
  return { engine: route.engine, subscription: route.subscription, callModel };
}

export function todayLabel(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
