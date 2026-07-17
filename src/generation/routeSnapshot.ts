export type GenerationMode = 'mcp' | 'agent' | 'api';

export type GenerationCapability =
  | 'text.generate'
  | 'image.generate.text'
  | 'image.generate.reference'
  | 'image.edit'
  | 'vision.analyze';

export type BillingKind =
  | 'subscription'
  | 'server-credits'
  | 'local-compute'
  | 'metered-api'
  | 'free-quota'
  | 'unknown';

export type GenerationRouteStage = 'text' | 'image' | 'vision';

export interface GenerationRouteInput {
  routeId: string;
  mode: GenerationMode;
  connectorId: string;
  capability: GenerationCapability;
  toolOrModelId: string;
  billingKind: BillingKind;
}

export interface GenerationRoute extends Readonly<GenerationRouteInput> {}

export interface GenerationRouteSnapshotInput {
  runId: string;
  accountId: string;
  promptVersion: string;
  promptHash: string;
  text: GenerationRouteInput;
  image?: GenerationRouteInput;
  vision?: GenerationRouteInput;
}

export interface GenerationRouteSnapshot {
  readonly runId: string;
  readonly accountId: string;
  readonly promptVersion: string;
  readonly promptHash: string;
  readonly fallbackPolicy: 'manual-only';
  readonly text: GenerationRoute;
  readonly image?: GenerationRoute;
  readonly vision?: GenerationRoute;
}

const VALID_MODES = new Set<GenerationMode>(['mcp', 'agent', 'api']);
const VALID_BILLING_KINDS = new Set<BillingKind>([
  'subscription',
  'server-credits',
  'local-compute',
  'metered-api',
  'free-quota',
  'unknown',
]);

function requireNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be a string`);
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} must not be empty`);
  if (normalized.length > 512) throw new Error(`${label} is too long`);
  return normalized;
}

function capabilityMatchesStage(stage: GenerationRouteStage, capability: GenerationCapability): boolean {
  if (stage === 'text') return capability === 'text.generate';
  if (stage === 'image') return capability.startsWith('image.');
  return capability === 'vision.analyze';
}

function cloneAndValidateRoute(
  stage: GenerationRouteStage,
  route: GenerationRouteInput,
): GenerationRoute {
  if (!route || typeof route !== 'object') throw new Error(`${stage} route is required`);
  const mode = route.mode;
  if (!VALID_MODES.has(mode)) throw new Error(`${stage} route mode is invalid`);
  const capability = route.capability;
  if (!capabilityMatchesStage(stage, capability)) {
    throw new Error(`${stage} route capability is invalid`);
  }
  const billingKind = route.billingKind;
  if (!VALID_BILLING_KINDS.has(billingKind)) throw new Error(`${stage} route billing kind is invalid`);

  return Object.freeze({
    routeId: requireNonEmptyString(route.routeId, `${stage} routeId`),
    mode,
    connectorId: requireNonEmptyString(route.connectorId, `${stage} connectorId`),
    capability,
    toolOrModelId: requireNonEmptyString(route.toolOrModelId, `${stage} toolOrModelId`),
    billingKind,
  });
}

/**
 * Captures the exact provider choices for one generation run. This function is
 * deliberately independent of renderer state, config, DOM, and localStorage.
 */
export function createGenerationRouteSnapshot(
  input: GenerationRouteSnapshotInput,
): GenerationRouteSnapshot {
  const snapshot: GenerationRouteSnapshot = {
    runId: requireNonEmptyString(input?.runId, 'runId'),
    accountId: requireNonEmptyString(input?.accountId, 'accountId'),
    promptVersion: requireNonEmptyString(input?.promptVersion, 'promptVersion'),
    promptHash: requireNonEmptyString(input?.promptHash, 'promptHash'),
    fallbackPolicy: 'manual-only',
    text: cloneAndValidateRoute('text', input?.text),
    image: input?.image ? cloneAndValidateRoute('image', input.image) : undefined,
    vision: input?.vision ? cloneAndValidateRoute('vision', input.vision) : undefined,
  };
  return Object.freeze(snapshot);
}

function routesMatch(expected: GenerationRoute, actual: GenerationRouteInput): boolean {
  return expected.routeId === actual.routeId
    && expected.mode === actual.mode
    && expected.connectorId === actual.connectorId
    && expected.capability === actual.capability
    && expected.toolOrModelId === actual.toolOrModelId
    && expected.billingKind === actual.billingKind;
}

/**
 * Stops any downstream caller from silently substituting an engine, account,
 * tool, model, or billing route after a run has started.
 */
export function assertRouteSnapshotMatch(
  snapshot: GenerationRouteSnapshot,
  stage: GenerationRouteStage,
  actualRoute: GenerationRouteInput,
): void {
  const expected = snapshot[stage];
  if (!expected || !routesMatch(expected, actualRoute)) {
    throw new Error(`route mismatch for ${stage}`);
  }
}
