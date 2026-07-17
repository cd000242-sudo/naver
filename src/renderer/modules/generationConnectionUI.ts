import type { AppConfig } from '../../configManager.js';
import type {
  GenerationConnectionSettings,
} from '../../generation/connectionConfig.js';
import type {
  BillingKind,
  GenerationCapability,
  GenerationMode,
  GenerationRoute,
  GenerationRouteInput,
} from '../../generation/routeSnapshot.js';
import type {
  McpConnectionProfileInput,
  McpRuntimeConnectionMaterial,
  McpToolConfigInput,
} from '../../generation/mcp/index.js';

type RouteStage = 'text' | 'image';
type NonMcpMode = Exclude<GenerationMode, 'mcp'>;

interface UiRouteChoice {
  readonly value: string;
  readonly label: string;
  readonly routeId: string;
  readonly connectorId: string;
  readonly toolOrModelId: string;
  readonly capability: GenerationCapability;
  readonly billingKind: BillingKind;
}

interface McpUiRouteInput {
  readonly routeId: string;
  readonly connectorId: string;
  readonly toolId: string;
  readonly capability: GenerationCapability;
  readonly billingKind: BillingKind;
}

const TEXT_AGENT_CHOICES: readonly UiRouteChoice[] = Object.freeze([
  Object.freeze({ value: 'agent-codex', label: 'Codex 구독', routeId: 'agent-codex-text', connectorId: 'agent-codex', toolOrModelId: 'codex', capability: 'text.generate', billingKind: 'subscription' }),
  Object.freeze({ value: 'agent-claude', label: 'Claude Code 구독', routeId: 'agent-claude-text', connectorId: 'agent-claude', toolOrModelId: 'claude', capability: 'text.generate', billingKind: 'subscription' }),
]);

const TEXT_API_CHOICES: readonly UiRouteChoice[] = Object.freeze([
  Object.freeze({ value: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite', routeId: 'api-gemini-text', connectorId: 'gemini-api', toolOrModelId: 'gemini-3.1-flash-lite', capability: 'text.generate', billingKind: 'metered-api' }),
  Object.freeze({ value: 'openai-gpt4o-mini', label: 'OpenAI (현재 선택 모델)', routeId: 'api-openai-text', connectorId: 'openai-api', toolOrModelId: 'openai-gpt4o-mini', capability: 'text.generate', billingKind: 'metered-api' }),
  Object.freeze({ value: 'claude-haiku', label: 'Claude API (현재 선택 모델)', routeId: 'api-claude-text', connectorId: 'claude-api', toolOrModelId: 'claude-haiku', capability: 'text.generate', billingKind: 'metered-api' }),
  Object.freeze({ value: 'perplexity-sonar', label: 'Perplexity Sonar', routeId: 'api-perplexity-text', connectorId: 'perplexity-api', toolOrModelId: 'perplexity-sonar', capability: 'text.generate', billingKind: 'metered-api' }),
]);

const IMAGE_AGENT_CHOICES: readonly UiRouteChoice[] = Object.freeze([
  Object.freeze({ value: 'dropshot', label: '리더스 나노바나나프로 무제한', routeId: 'agent-dropshot-image', connectorId: 'agent-dropshot', toolOrModelId: 'dropshot', capability: 'image.generate.reference', billingKind: 'subscription' }),
  Object.freeze({ value: 'flow', label: 'Google Flow 로그인', routeId: 'agent-flow-image', connectorId: 'agent-flow', toolOrModelId: 'flow', capability: 'image.generate.reference', billingKind: 'subscription' }),
  Object.freeze({ value: 'imagefx', label: 'Google ImageFX 로그인', routeId: 'agent-imagefx-image', connectorId: 'agent-imagefx', toolOrModelId: 'imagefx', capability: 'image.generate.text', billingKind: 'free-quota' }),
]);

const IMAGE_API_CHOICES: readonly UiRouteChoice[] = Object.freeze([
  Object.freeze({ value: 'nano-banana-2', label: 'Gemini 3.1 Flash Image', routeId: 'api-gemini-flash-image', connectorId: 'gemini-image-api', toolOrModelId: 'nano-banana-2', capability: 'image.generate.reference', billingKind: 'metered-api' }),
  Object.freeze({ value: 'nano-banana-pro', label: 'Gemini 3 Pro Image', routeId: 'api-gemini-pro-image', connectorId: 'gemini-image-api', toolOrModelId: 'nano-banana-pro', capability: 'image.generate.reference', billingKind: 'metered-api' }),
  Object.freeze({ value: 'openai-image', label: 'OpenAI Image', routeId: 'api-openai-image', connectorId: 'openai-image-api', toolOrModelId: 'openai-image', capability: 'image.generate.text', billingKind: 'metered-api' }),
  Object.freeze({ value: 'deepinfra', label: 'DeepInfra FLUX', routeId: 'api-deepinfra-image', connectorId: 'deepinfra-api', toolOrModelId: 'deepinfra', capability: 'image.generate.text', billingKind: 'metered-api' }),
  Object.freeze({ value: 'leonardoai', label: 'Leonardo AI', routeId: 'api-leonardo-image', connectorId: 'leonardo-api', toolOrModelId: 'leonardoai', capability: 'image.generate.text', billingKind: 'metered-api' }),
  Object.freeze({ value: 'prodia', label: 'Prodia', routeId: 'api-prodia-image', connectorId: 'prodia-api', toolOrModelId: 'prodia', capability: 'image.generate.text', billingKind: 'metered-api' }),
]);

function choicesFor(stage: RouteStage, mode: NonMcpMode): readonly UiRouteChoice[] {
  if (stage === 'text') return mode === 'agent' ? TEXT_AGENT_CHOICES : TEXT_API_CHOICES;
  return mode === 'agent' ? IMAGE_AGENT_CHOICES : IMAGE_API_CHOICES;
}

function invalidRoute(): never {
  throw new Error('GENERATION_UI_ROUTE_INVALID');
}

export function createNonMcpUiRoute(
  stage: RouteStage,
  mode: NonMcpMode,
  choiceValue: string,
): GenerationRoute {
  const choice = choicesFor(stage, mode).find((entry) => entry.value === choiceValue);
  if (!choice) return invalidRoute();
  return Object.freeze({
    routeId: choice.routeId,
    mode,
    connectorId: choice.connectorId,
    capability: choice.capability,
    toolOrModelId: choice.toolOrModelId,
    billingKind: choice.billingKind,
  });
}

export function createMcpUiRoute(input: McpUiRouteInput): GenerationRoute {
  if (!input.routeId || !input.connectorId || !input.toolId || !input.capability.startsWith('text.') && !input.capability.startsWith('image.')) {
    return invalidRoute();
  }
  return Object.freeze({
    routeId: input.routeId,
    mode: 'mcp',
    connectorId: input.connectorId,
    capability: input.capability,
    toolOrModelId: input.toolId,
    billingKind: input.billingKind,
  });
}

export function mergeUiRouteSettings(
  current: Partial<GenerationConnectionSettings> | undefined,
  text: GenerationRoute,
  image: GenerationRoute,
): GenerationConnectionSettings {
  return Object.freeze({
    version: 1,
    fallbackPolicy: 'manual-only',
    text,
    image,
    vision: current?.vision,
  });
}

function generationConnectionElement<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function generationConnectionSetStatus(message: string, tone: 'idle' | 'working' | 'success' | 'error' = 'idle'): void {
  const target = generationConnectionElement<HTMLDivElement>('generation-connection-status');
  if (!target) return;
  target.textContent = message;
  target.dataset.tone = tone;
}

function generationConnectionToast(message: string, type: 'success' | 'error' | 'warning' = 'success'): void {
  const manager = (window as any).toastManager;
  if (manager?.[type]) manager[type](message);
  else if (type === 'error') alert(message);
}

function setSelectOptions(select: HTMLSelectElement, choices: readonly { value: string; label: string }[], preferred?: string): void {
  select.replaceChildren(...choices.map((choice) => {
    const option = document.createElement('option');
    option.value = choice.value;
    option.textContent = choice.label;
    return option;
  }));
  if (preferred && choices.some((choice) => choice.value === preferred)) select.value = preferred;
}

function routeChoiceValue(route: GenerationRoute | undefined): string | undefined {
  if (!route || route.mode === 'mcp') return undefined;
  const choices = choicesFor(route.capability === 'text.generate' ? 'text' : 'image', route.mode);
  return choices.find((choice) => choice.toolOrModelId === route.toolOrModelId)?.value;
}

function profileRouteValue(profileId: string, routeId: string): string {
  return `${profileId}\u001f${routeId}`;
}

function splitProfileRouteValue(value: string): readonly [string, string] {
  const [profileId, routeId] = value.split('\u001f');
  if (!profileId || !routeId) return invalidRoute();
  return [profileId, routeId] as const;
}

function populateRouteChoice(
  stage: RouteStage,
  mode: GenerationMode,
  profiles: readonly McpConnectionProfileInput[],
  preferredRoute?: GenerationRoute,
): void {
  const select = generationConnectionElement<HTMLSelectElement>(`generation-${stage}-choice`);
  if (!select) return;
  if (mode !== 'mcp') {
    const choices = choicesFor(stage, mode);
    setSelectOptions(select, choices, routeChoiceValue(preferredRoute));
    return;
  }
  const mcpChoices = profiles.flatMap((profile) => profile.tools
    .filter((tool) => stage === 'text' ? tool.capability === 'text.generate' : tool.capability.startsWith('image.'))
    .map((tool) => ({
      value: profileRouteValue(profile.profileId, tool.routeId),
      label: `${profile.profileId} · ${tool.toolId}`,
    })));
  const preferred = preferredRoute?.mode === 'mcp'
    ? profiles.flatMap((profile) => profile.tools
      .filter((tool) => profile.connectorId === preferredRoute.connectorId && tool.routeId === preferredRoute.routeId)
      .map((tool) => profileRouteValue(profile.profileId, tool.routeId)))[0]
    : undefined;
  setSelectOptions(select, mcpChoices, preferred);
  if (mcpChoices.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = '먼저 아래에서 MCP 연결과 도구를 등록하세요';
    select.append(option);
  }
}

function describeRoute(route: GenerationRoute | undefined): string {
  if (!route) return '미설정';
  const prefix = route.mode === 'mcp' ? 'MCP' : route.mode === 'agent' ? '에이전트' : 'API 키';
  return `${prefix} · ${route.toolOrModelId}`;
}

function renderCurrentRouteSummary(config: AppConfig): void {
  const text = generationConnectionElement<HTMLElement>('generation-current-text');
  const image = generationConnectionElement<HTMLElement>('generation-current-image');
  if (text) text.textContent = describeRoute(config.generationConnectionSettings?.text);
  if (image) image.textContent = describeRoute(config.generationConnectionSettings?.image);
}

function profileForSelectedRoute(
  stage: RouteStage,
  profiles: readonly McpConnectionProfileInput[],
): { profile: McpConnectionProfileInput; tool: McpToolConfigInput } {
  const value = generationConnectionElement<HTMLSelectElement>(`generation-${stage}-choice`)?.value || '';
  const [profileId, routeId] = splitProfileRouteValue(value);
  const profile = profiles.find((entry) => entry.profileId === profileId);
  const tool = profile?.tools.find((entry) => entry.routeId === routeId);
  if (!profile || !tool) return invalidRoute();
  return { profile, tool };
}

function selectedRoute(
  stage: RouteStage,
  profiles: readonly McpConnectionProfileInput[],
): GenerationRoute {
  const mode = generationConnectionElement<HTMLSelectElement>(`generation-${stage}-mode`)?.value as GenerationMode;
  const choice = generationConnectionElement<HTMLSelectElement>(`generation-${stage}-choice`)?.value || '';
  if (mode === 'mcp') {
    const selected = profileForSelectedRoute(stage, profiles);
    return createMcpUiRoute({
      routeId: selected.tool.routeId,
      connectorId: selected.profile.connectorId,
      toolId: selected.tool.toolId,
      capability: selected.tool.capability,
      billingKind: selected.tool.billingKind,
    });
  }
  if (mode === 'agent' || mode === 'api') return createNonMcpUiRoute(stage, mode, choice);
  return invalidRoute();
}

function legacyTextConfig(route: GenerationRoute): Partial<AppConfig> {
  if (route.mode === 'agent') {
    return { primaryGeminiTextModel: route.connectorId === 'agent-codex' ? 'agent-codex' : 'agent-claude' };
  }
  if (route.mode !== 'api') return {};
  const provider = route.connectorId.replace(/-api$/, '');
  return {
    primaryGeminiTextModel: route.toolOrModelId,
    defaultAiProvider: provider as AppConfig['defaultAiProvider'],
  };
}

export function resolveLegacyImageStorageValue(route: GenerationRoute): string | undefined {
  return route.mode === 'mcp' ? undefined : route.toolOrModelId;
}

function renderMcpProfileList(profiles: readonly McpConnectionProfileInput[], configuredIds: readonly string[]): void {
  const select = generationConnectionElement<HTMLSelectElement>('mcp-profile-list');
  if (!select) return;
  const options = profiles.map((profile) => ({
    value: profile.profileId,
    label: `${profile.profileId} · ${profile.transport}${configuredIds.includes(profile.profileId) ? ' · 연결정보 저장됨' : ' · 연결정보 필요'}`,
  }));
  setSelectOptions(select, options);
  if (options.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = '등록된 MCP 연결 없음';
    select.append(option);
  }
}

function readTrimmed(id: string): string {
  return generationConnectionElement<HTMLInputElement | HTMLTextAreaElement>(id)?.value.trim() || '';
}

function parseHeaderJson(value: string): Readonly<Record<string, string>> | undefined {
  if (!value) return undefined;
  const parsed = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('HTTP 헤더는 JSON 객체 형식이어야 합니다.');
  const entries = Object.entries(parsed);
  if (!entries.every(([key, entry]) => key && typeof entry === 'string')) throw new Error('HTTP 헤더 이름과 값은 문자열이어야 합니다.');
  const headers: Record<string, string> = {};
  for (const [key, entry] of entries) headers[key] = entry as string;
  return Object.freeze(headers);
}

function buildMcpConnectionPayload(): { profile: McpConnectionProfileInput; material: McpRuntimeConnectionMaterial } {
  const profileId = readTrimmed('mcp-profile-id');
  const connectorId = readTrimmed('mcp-connector-id') || profileId;
  const transport = generationConnectionElement<HTMLSelectElement>('mcp-transport')?.value as 'stdio' | 'streamable-http';
  const billingKind = (generationConnectionElement<HTMLSelectElement>('mcp-billing-kind')?.value || 'unknown') as BillingKind;
  const textTool = readTrimmed('mcp-text-tool');
  const imageTool = readTrimmed('mcp-image-tool');
  if (!profileId || !connectorId || !transport || (!textTool && !imageTool)) throw new Error('프로필 ID와 글/이미지 도구 중 하나 이상을 입력하세요.');
  const profilePattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;
  const publicIdentifierPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
  if (!profilePattern.test(profileId)
    || !publicIdentifierPattern.test(connectorId)
    || (textTool && !publicIdentifierPattern.test(textTool))
    || (imageTool && !publicIdentifierPattern.test(imageTool))) {
    throw new Error('프로필·커넥터·tool ID는 영문, 숫자, 점, 밑줄, 하이픈만 사용할 수 있습니다.');
  }
  if (!generationConnectionElement<HTMLInputElement>('mcp-trust-confirm')?.checked) {
    throw new Error('신뢰하는 MCP 서버인지 확인한 뒤 실행 동의에 체크하세요.');
  }

  const tools: McpToolConfigInput[] = [];
  if (textTool) tools.push({ routeId: `${profileId}-text`, toolId: textTool, capability: 'text.generate', billingKind });
  if (imageTool) tools.push({ routeId: `${profileId}-image`, toolId: imageTool, capability: 'image.generate.text', billingKind });
  const profile: McpConnectionProfileInput = {
    profileId,
    connectorId,
    transport,
    fallbackPolicy: 'manual-only',
    tools,
  };

  if (transport === 'stdio') {
    const command = readTrimmed('mcp-command');
    if (!command) throw new Error('STDIO 연결에는 실행 명령이 필요합니다.');
    const args = readTrimmed('mcp-args').split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean);
    const cwd = readTrimmed('mcp-cwd');
    return {
      profile,
      material: { profileId, transport, command, args, ...(cwd ? { cwd } : {}) },
    };
  }
  const url = readTrimmed('mcp-url');
  if (!url) throw new Error('Streamable HTTP 연결에는 HTTPS URL이 필요합니다.');
  const headers = parseHeaderJson(readTrimmed('mcp-headers'));
  return { profile, material: { profileId, transport, url, ...(headers ? { headers } : {}) } };
}

function updateTransportFields(): void {
  const transport = generationConnectionElement<HTMLSelectElement>('mcp-transport')?.value;
  const stdio = generationConnectionElement<HTMLDivElement>('mcp-stdio-fields');
  const http = generationConnectionElement<HTMLDivElement>('mcp-http-fields');
  if (stdio) stdio.hidden = transport !== 'stdio';
  if (http) http.hidden = transport !== 'streamable-http';
}

function hydrateMcpForm(profile: McpConnectionProfileInput | undefined): void {
  if (!profile) return;
  const profileId = generationConnectionElement<HTMLInputElement>('mcp-profile-id');
  const connectorId = generationConnectionElement<HTMLInputElement>('mcp-connector-id');
  const transport = generationConnectionElement<HTMLSelectElement>('mcp-transport');
  const textTool = generationConnectionElement<HTMLInputElement>('mcp-text-tool');
  const imageTool = generationConnectionElement<HTMLInputElement>('mcp-image-tool');
  if (profileId) profileId.value = profile.profileId;
  if (connectorId) connectorId.value = profile.connectorId;
  if (transport) transport.value = profile.transport;
  if (textTool) textTool.value = profile.tools.find((tool) => tool.capability === 'text.generate')?.toolId || '';
  if (imageTool) imageTool.value = profile.tools.find((tool) => tool.capability.startsWith('image.'))?.toolId || '';
  updateTransportFields();
}

let generationConnectionUiInitialized = false;
let profiles: readonly McpConnectionProfileInput[] = Object.freeze([]);
let currentConfig: AppConfig | undefined;

async function refreshConnections(): Promise<void> {
  const result = await window.api.mcpListConnections();
  if (!result.success) throw new Error(result.message || 'MCP 연결 목록을 불러오지 못했습니다.');
  profiles = Object.freeze((result.profiles || []).map((profile) => Object.freeze({ ...profile, tools: Object.freeze(profile.tools.map((tool) => Object.freeze({ ...tool }))) })));
  renderMcpProfileList(profiles, result.configuredProfileIds || []);
  if (currentConfig) {
    for (const stage of ['text', 'image'] as const) {
      const mode = generationConnectionElement<HTMLSelectElement>(`generation-${stage}-mode`)?.value as GenerationMode;
      populateRouteChoice(stage, mode, profiles, currentConfig.generationConnectionSettings?.[stage]);
    }
  }
}

async function refreshAll(): Promise<void> {
  currentConfig = await window.api.getConfig();
  renderCurrentRouteSummary(currentConfig);
  await refreshConnections();
  for (const stage of ['text', 'image'] as const) {
    const route = currentConfig.generationConnectionSettings?.[stage];
    const modeSelect = generationConnectionElement<HTMLSelectElement>(`generation-${stage}-mode`);
    if (modeSelect) modeSelect.value = route?.mode || (stage === 'text' ? 'api' : 'agent');
    populateRouteChoice(stage, (modeSelect?.value || 'api') as GenerationMode, profiles, route);
  }
  generationConnectionSetStatus('현재 경로를 불러왔습니다. 실패 시 다른 방식으로 자동 전환하지 않습니다.');
}

async function saveRoutes(): Promise<void> {
  generationConnectionSetStatus('선택한 경로를 저장하는 중입니다…', 'working');
  const config = await window.api.getConfig();
  const text = selectedRoute('text', profiles);
  const image = selectedRoute('image', profiles);
  const nextSettings = mergeUiRouteSettings(config.generationConnectionSettings, text, image);
  const nextConfig: AppConfig = {
    ...config,
    ...legacyTextConfig(text),
    generationConnectionSettings: nextSettings,
  };
  currentConfig = await window.api.saveConfig(nextConfig);
  try {
    const legacyImageStorageValue = resolveLegacyImageStorageValue(image);
    if (legacyImageStorageValue) {
      localStorage.setItem('fullAutoImageSource', legacyImageStorageValue);
      localStorage.setItem('globalImageSource', legacyImageStorageValue);
    }
  } catch { /* main-process route remains authoritative */ }
  renderCurrentRouteSummary(currentConfig);
  generationConnectionSetStatus('저장 완료 · 글과 이미지는 표시된 경로만 사용합니다.', 'success');
  generationConnectionToast('생성 경로를 저장했습니다. 자동 폴백은 사용하지 않습니다.');
  window.dispatchEvent(new CustomEvent('generation-connection-changed', { detail: nextSettings }));
}

async function saveMcpConnection(): Promise<void> {
  generationConnectionSetStatus('MCP 연결정보를 암호화 저장하는 중입니다…', 'working');
  const payload = buildMcpConnectionPayload();
  const result = await window.api.mcpSaveConnection(payload);
  if (!result.success) throw new Error(result.message || 'MCP 연결 저장에 실패했습니다.');
  await refreshConnections();
  generationConnectionSetStatus('MCP 연결정보를 암호화 저장했습니다. 생성 도구는 아직 호출하지 않았습니다.', 'success');
  generationConnectionToast('MCP 연결정보를 안전하게 저장했습니다.');
}

async function testMcpConnection(): Promise<void> {
  const profileId = generationConnectionElement<HTMLSelectElement>('mcp-profile-list')?.value || readTrimmed('mcp-profile-id');
  const profile = profiles.find((entry) => entry.profileId === profileId);
  const tool = profile?.tools[0];
  if (!profile || !tool) throw new Error('테스트할 MCP 프로필과 도구를 먼저 저장하세요.');
  generationConnectionSetStatus('MCP 서버의 도구 목록만 확인 중입니다…', 'working');
  const route: GenerationRouteInput = {
    routeId: tool.routeId,
    mode: 'mcp',
    connectorId: profile.connectorId,
    capability: tool.capability,
    toolOrModelId: tool.toolId,
    billingKind: tool.billingKind,
  };
  const result = await window.api.mcpTestConnection(route);
  if (!result.success) throw new Error(result.message || 'MCP 연결 테스트에 실패했습니다.');
  generationConnectionSetStatus(`연결 확인 완료 · ${result.toolId} 발견 · 생성/과금 도구 호출 0회`, 'success');
  generationConnectionToast('MCP 도구 검색이 완료되었습니다. 생성 호출은 하지 않았습니다.');
}

async function removeMcpConnection(): Promise<void> {
  const profileId = generationConnectionElement<HTMLSelectElement>('mcp-profile-list')?.value || '';
  if (!profileId) throw new Error('삭제할 MCP 프로필을 선택하세요.');
  if (!confirm(`${profileId} 연결을 삭제할까요? 현재 생성 경로라면 먼저 경로를 변경해야 합니다.`)) return;
  const result = await window.api.mcpRemoveConnection(profileId);
  if (!result.success) throw new Error(result.message || 'MCP 연결 삭제에 실패했습니다.');
  await refreshConnections();
  generationConnectionSetStatus(result.removed ? 'MCP 연결을 삭제했습니다.' : '이미 삭제된 MCP 연결입니다.', 'success');
}

function wireAsync(id: string, operation: () => Promise<void>): void {
  generationConnectionElement<HTMLButtonElement>(id)?.addEventListener('click', async () => {
    try {
      await operation();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      generationConnectionSetStatus(message, 'error');
      generationConnectionToast(message, 'error');
    }
  });
}

export function initGenerationConnectionUI(): void {
  if (generationConnectionUiInitialized || typeof document === 'undefined') return;
  if (!generationConnectionElement('generation-connection-panel')) return;
  generationConnectionUiInitialized = true;

  for (const stage of ['text', 'image'] as const) {
    generationConnectionElement<HTMLSelectElement>(`generation-${stage}-mode`)?.addEventListener('change', (event) => {
      populateRouteChoice(stage, (event.currentTarget as HTMLSelectElement).value as GenerationMode, profiles);
    });
  }
  generationConnectionElement<HTMLSelectElement>('mcp-transport')?.addEventListener('change', updateTransportFields);
  generationConnectionElement<HTMLSelectElement>('mcp-profile-list')?.addEventListener('change', (event) => {
    hydrateMcpForm(profiles.find((profile) => profile.profileId === (event.currentTarget as HTMLSelectElement).value));
  });
  document.querySelectorAll<HTMLElement>('[data-generation-mode-card]').forEach((card) => {
    card.addEventListener('click', () => {
      document.querySelectorAll('[data-generation-mode-card]').forEach((entry) => entry.classList.remove('is-active'));
      card.classList.add('is-active');
      const mode = card.dataset.generationModeCard as GenerationMode;
      for (const stage of ['text', 'image'] as const) {
        const modeSelect = generationConnectionElement<HTMLSelectElement>(`generation-${stage}-mode`);
        if (modeSelect) modeSelect.value = mode;
        populateRouteChoice(stage, mode, profiles, currentConfig?.generationConnectionSettings?.[stage]);
      }
      const editor = generationConnectionElement<HTMLDetailsElement>('mcp-connection-editor');
      editor?.classList.toggle('is-emphasized', mode === 'mcp');
      if (editor && mode === 'mcp') editor.open = true;
    });
  });

  wireAsync('generation-routes-save-btn', saveRoutes);
  wireAsync('mcp-connection-save-btn', saveMcpConnection);
  wireAsync('mcp-connection-test-btn', testMcpConnection);
  wireAsync('mcp-connection-remove-btn', removeMcpConnection);
  wireAsync('mcp-connections-refresh-btn', refreshAll);
  updateTransportFields();
  refreshAll().catch((error) => {
    generationConnectionSetStatus(error instanceof Error ? error.message : String(error), 'error');
  });
}
