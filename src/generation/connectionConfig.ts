import type {
  BillingKind,
  GenerationCapability,
  GenerationMode,
  GenerationRoute,
  GenerationRouteInput,
  GenerationRouteStage,
} from './routeSnapshot.js';
import { normalizeGeminiPrepaidTextModelId } from '../runtime/geminiTextModelNormalization.js';
import { createMcpConnectionRegistry } from './mcp/registry.js';
import type { McpConnectionProfile } from './mcp/contracts.js';

export const GENERATION_CONNECTION_SETTINGS_VERSION = 1 as const;

export interface PersistedGenerationRoute extends GenerationRouteInput {}

/**
 * Persisted user choice. It is intentionally route-per-capability rather than
 * one global provider setting, so text and images can be independently chosen.
 */
export interface PersistedGenerationConnectionSettings {
  version: number;
  fallbackPolicy: 'manual-only';
  text: PersistedGenerationRoute;
  image?: PersistedGenerationRoute;
  vision?: PersistedGenerationRoute;
}

export interface GenerationConnectionSettings {
  readonly version: typeof GENERATION_CONNECTION_SETTINGS_VERSION;
  readonly fallbackPolicy: 'manual-only';
  readonly text: GenerationRoute;
  readonly image?: GenerationRoute;
  readonly vision?: GenerationRoute;
}

/** Only MCP is an optional execution override; agent/API use the legacy controls. */
export function resolveMcpTextOverride(
  settings: GenerationConnectionSettings | undefined,
): GenerationRoute | undefined {
  return settings?.text.mode === 'mcp' ? settings.text : undefined;
}

export interface LegacyGenerationSelection {
  readonly primaryGeminiTextModel?: unknown;
  readonly defaultAiProvider?: unknown;
  readonly geminiModel?: unknown;
  readonly perplexityModel?: unknown;
}

export interface NormalizeGenerationConnectionSettingsResult {
  readonly settings: GenerationConnectionSettings;
  /** True when the caller should persist the returned canonical form. */
  readonly changed: boolean;
}

export interface NormalizeMcpConnectionProfilesResult {
  readonly profiles: readonly McpConnectionProfile[];
  readonly changed: boolean;
}

/** Public MCP metadata only. Runtime commands, endpoints, and credentials are never accepted here. */
export function normalizeMcpConnectionProfiles(
  input: unknown,
): NormalizeMcpConnectionProfilesResult {
  try {
    const source = input === undefined ? [] : input;
    const profiles = createMcpConnectionRegistry(source).profiles;
    return Object.freeze({
      profiles,
      changed: input !== undefined && JSON.stringify(input) !== JSON.stringify(profiles),
    });
  } catch {
    return Object.freeze({ profiles: Object.freeze([]), changed: true });
  }
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
const VALID_CAPABILITIES = new Set<GenerationCapability>([
  'text.generate',
  'image.generate.text',
  'image.generate.reference',
  'image.edit',
  'vision.analyze',
]);

const DEFAULT_API_TOOL: Readonly<Record<LegacyApiProvider, string>> = Object.freeze({
  gemini: 'gemini-3.1-flash-lite',
  openai: 'default',
  claude: 'default',
  perplexity: 'sonar',
});

type LegacyApiProvider = 'gemini' | 'openai' | 'claude' | 'perplexity';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= 512 ? normalized : undefined;
}

function matchesStage(stage: GenerationRouteStage, capability: GenerationCapability): boolean {
  if (stage === 'text') return capability === 'text.generate';
  if (stage === 'image') return capability.startsWith('image.');
  return capability === 'vision.analyze';
}

function cloneRoute(
  stage: GenerationRouteStage,
  value: unknown,
): GenerationRoute | undefined {
  if (!isRecord(value)) return undefined;
  const mode = value.mode;
  const capability = value.capability;
  const billingKind = value.billingKind;
  if (!VALID_MODES.has(mode as GenerationMode)
    || !VALID_CAPABILITIES.has(capability as GenerationCapability)
    || !VALID_BILLING_KINDS.has(billingKind as BillingKind)
    || !matchesStage(stage, capability as GenerationCapability)) {
    return undefined;
  }
  const routeId = stringValue(value.routeId);
  const connectorId = stringValue(value.connectorId);
  const toolOrModelId = stringValue(value.toolOrModelId);
  if (!routeId || !connectorId || !toolOrModelId) return undefined;

  return Object.freeze({
    routeId,
    mode: mode as GenerationMode,
    connectorId,
    capability: capability as GenerationCapability,
    toolOrModelId,
    billingKind: billingKind as BillingKind,
  });
}

function apiProviderFromModel(value: string | undefined): LegacyApiProvider | undefined {
  if (!value) return undefined;
  const lower = value.toLowerCase();
  if (lower.startsWith('gemini-')) return 'gemini';
  if (/^(gpt-|o\d|chatgpt-)/.test(lower)) return 'openai';
  if (lower.startsWith('claude-')) return 'claude';
  if (lower.startsWith('sonar') || lower.startsWith('pplx-')) return 'perplexity';
  return undefined;
}

function apiProvider(value: unknown): LegacyApiProvider | undefined {
  return value === 'gemini' || value === 'openai' || value === 'claude' || value === 'perplexity'
    ? value
    : undefined;
}

function isModelForProvider(provider: LegacyApiProvider, model: string | undefined): boolean {
  return apiProviderFromModel(model) === provider;
}

function makeRoute(input: GenerationRouteInput): GenerationRoute {
  return Object.freeze({ ...input });
}

function normalizeGeminiPrepaidTextRoute(route: GenerationRoute | undefined): GenerationRoute | undefined {
  if (!route || route.mode !== 'api' || route.connectorId !== 'gemini-api') {
    return route;
  }
  if (!route.toolOrModelId.startsWith('gemini-')) {
    return undefined;
  }

  const toolOrModelId = normalizeGeminiPrepaidTextModelId(route.toolOrModelId);
  return toolOrModelId === route.toolOrModelId
    ? route
    : makeRoute({ ...route, toolOrModelId });
}

function createLegacyTextRoute(legacy: LegacyGenerationSelection): GenerationRoute {
  const selected = stringValue(legacy.primaryGeminiTextModel);
  if (selected === 'agent-codex') {
    return makeRoute({
      routeId: 'agent-codex-text',
      mode: 'agent',
      connectorId: 'agent-codex',
      capability: 'text.generate',
      toolOrModelId: 'codex',
      billingKind: 'subscription',
    });
  }
  if (selected === 'agent-claude') {
    return makeRoute({
      routeId: 'agent-claude-text',
      mode: 'agent',
      connectorId: 'agent-claude',
      capability: 'text.generate',
      toolOrModelId: 'claude',
      billingKind: 'subscription',
    });
  }

  const provider = apiProvider(legacy.defaultAiProvider)
    ?? apiProviderFromModel(selected)
    ?? 'gemini';
  const configuredGemini = stringValue(legacy.geminiModel);
  const configuredPerplexity = stringValue(legacy.perplexityModel);
  const selectedModel = isModelForProvider(provider, selected) ? selected : undefined;
  const fallbackModel = provider === 'gemini'
    ? (isModelForProvider(provider, configuredGemini) ? configuredGemini : undefined)
    : provider === 'perplexity'
      ? (isModelForProvider(provider, configuredPerplexity) ? configuredPerplexity : undefined)
      : undefined;
  const selectedToolOrModelId = selectedModel ?? fallbackModel ?? DEFAULT_API_TOOL[provider];
  const toolOrModelId = provider === 'gemini'
    ? normalizeGeminiPrepaidTextModelId(selectedToolOrModelId)
    : selectedToolOrModelId;

  return makeRoute({
    routeId: `api-${provider}-text`,
    mode: 'api',
    connectorId: `${provider}-api`,
    capability: 'text.generate',
    toolOrModelId,
    billingKind: 'metered-api',
  });
}

function routesEqual(left: GenerationRoute | undefined, right: GenerationRoute | undefined): boolean {
  if (!left || !right) return left === right;
  return left.routeId === right.routeId
    && left.mode === right.mode
    && left.connectorId === right.connectorId
    && left.capability === right.capability
    && left.toolOrModelId === right.toolOrModelId
    && left.billingKind === right.billingKind;
}

function freezeSettings(input: {
  text: GenerationRoute;
  image?: GenerationRoute;
  vision?: GenerationRoute;
}): GenerationConnectionSettings {
  return Object.freeze({
    version: GENERATION_CONNECTION_SETTINGS_VERSION,
    fallbackPolicy: 'manual-only',
    text: input.text,
    image: input.image,
    vision: input.vision,
  });
}

/**
 * Converts legacy single-provider preferences into versioned per-capability
 * routes. Invalid persisted routes are never executed or defaulted to a paid
 * image route; only a valid legacy text setting is reconstructed.
 */
export function normalizeGenerationConnectionSettings(
  raw: unknown,
  legacy: LegacyGenerationSelection = {},
): NormalizeGenerationConnectionSettingsResult {
  const record = isRecord(raw) ? raw : undefined;
  const clonedText = cloneRoute('text', record?.text);
  const savedText = normalizeGeminiPrepaidTextRoute(clonedText);
  const savedImage = cloneRoute('image', record?.image);
  const savedVision = cloneRoute('vision', record?.vision);
  const text = savedText ?? createLegacyTextRoute(legacy);
  const settings = freezeSettings({ text, image: savedImage, vision: savedVision });

  const changed = !record
    || record.version !== GENERATION_CONNECTION_SETTINGS_VERSION
    || record.fallbackPolicy !== 'manual-only'
    || !savedText
    || !routesEqual(clonedText, savedText)
    || !routesEqual(savedText, text)
    || (Object.prototype.hasOwnProperty.call(record, 'image') && !savedImage)
    || (Object.prototype.hasOwnProperty.call(record, 'vision') && !savedVision);

  return Object.freeze({ settings, changed });
}
