import type { McpConnectionProfile, McpConnectionRegistry, McpRouteSelection } from './contracts.js';

const MAX_ARGUMENT_BYTES = 2 * 1024 * 1024;
const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_TOTAL_IMAGE_BYTES = 50 * 1024 * 1024;
const MAX_CONTENT_BLOCKS = 128;
const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const SHELL_METACHARACTER_PATTERN = /[&|;<>`\r\n\0]/;

export type McpRuntimeErrorCode =
  | 'MCP_RUNTIME_NOT_CONFIGURED'
  | 'MCP_RUNTIME_CONFIGURATION_INVALID'
  | 'MCP_TOOL_NOT_DISCOVERED'
  | 'MCP_INVOCATION_UNKNOWN_OUTCOME'
  | 'MCP_TOOL_RETURNED_ERROR'
  | 'MCP_RESULT_INVALID'
  | 'MCP_RESULT_TOO_LARGE';

const ERROR_MESSAGES: Readonly<Record<McpRuntimeErrorCode, string>> = Object.freeze({
  MCP_RUNTIME_NOT_CONFIGURED: '선택한 MCP 연결 정보가 없습니다. MCP 설정을 확인해주세요.',
  MCP_RUNTIME_CONFIGURATION_INVALID: 'MCP 연결 설정이 안전하지 않거나 올바르지 않습니다.',
  MCP_TOOL_NOT_DISCOVERED: '선택한 MCP 도구를 서버에서 찾지 못했습니다. 다른 경로로 자동 전환하지 않았습니다.',
  MCP_INVOCATION_UNKNOWN_OUTCOME: 'MCP 응답을 받지 못했습니다. 과금 여부가 불명확하므로 자동 재전송하지 않았습니다.',
  MCP_TOOL_RETURNED_ERROR: '선택한 MCP 도구가 실패를 반환했습니다. 다른 경로로 자동 전환하지 않았습니다.',
  MCP_RESULT_INVALID: 'MCP 도구가 지원되지 않는 응답 형식을 반환했습니다.',
  MCP_RESULT_TOO_LARGE: 'MCP 도구 응답이 앱의 안전한 처리 한도를 초과했습니다.',
});

export class McpRuntimeError extends Error {
  readonly code: McpRuntimeErrorCode;

  constructor(code: McpRuntimeErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = 'McpRuntimeError';
    this.code = code;
  }
}

export interface McpStdioConnectionMaterial {
  readonly profileId: string;
  readonly transport: 'stdio';
  readonly command: string;
  readonly args?: readonly string[];
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string>>;
}

export interface McpStreamableHttpConnectionMaterial {
  readonly profileId: string;
  readonly transport: 'streamable-http';
  readonly url: string;
  readonly headers?: Readonly<Record<string, string>>;
}

export type McpRuntimeConnectionMaterial =
  | McpStdioConnectionMaterial
  | McpStreamableHttpConnectionMaterial;

export interface McpRuntimeRequestOptions {
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
}

export interface McpRuntimeClient {
  listTools(options: McpRuntimeRequestOptions): Promise<readonly string[]>;
  callTool(
    toolName: string,
    args: Readonly<Record<string, unknown>>,
    options: McpRuntimeRequestOptions,
  ): Promise<unknown>;
  close(): Promise<void>;
}

export interface McpRuntimeClientFactory {
  create(
    material: McpRuntimeConnectionMaterial,
    profile: McpConnectionProfile,
  ): Promise<McpRuntimeClient>;
}

export interface NormalizedMcpImage {
  readonly data: string;
  readonly mimeType: string;
  readonly uri?: string;
}

export interface NormalizedMcpResourceLink {
  readonly uri: string;
  readonly name: string;
  readonly mimeType?: string;
}

export interface NormalizedMcpToolResult {
  readonly text: readonly string[];
  readonly images: readonly NormalizedMcpImage[];
  readonly resourceLinks: readonly NormalizedMcpResourceLink[];
  readonly structuredContent?: Readonly<Record<string, unknown>>;
}

export interface McpRuntimeManager {
  checkRoute(
    route: McpRouteSelection,
    options?: { readonly timeoutMs?: number; readonly signal?: AbortSignal },
  ): Promise<Readonly<{ profileId: string; toolId: string }>>;
  invokeRoute(
    route: McpRouteSelection,
    request: unknown,
    options?: { readonly timeoutMs?: number; readonly signal?: AbortSignal },
  ): Promise<NormalizedMcpToolResult>;
  close(): Promise<void>;
}

interface CreateMcpRuntimeManagerOptions {
  readonly registry: McpConnectionRegistry;
  readonly clientFactory: McpRuntimeClientFactory;
  readonly getConnectionMaterial: (
    profileId: string,
  ) => McpRuntimeConnectionMaterial | undefined | Promise<McpRuntimeConnectionMaterial | undefined>;
  readonly defaultTimeoutMs?: number;
}

function fail(code: McpRuntimeErrorCode): never {
  throw new McpRuntimeError(code);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function copyJsonValue(value: unknown, depth = 0): unknown {
  if (depth > 32) return fail('MCP_RUNTIME_CONFIGURATION_INVALID');
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) {
    if (value.length > 10_000) return fail('MCP_RUNTIME_CONFIGURATION_INVALID');
    return value.map((entry) => copyJsonValue(entry, depth + 1));
  }
  if (!isPlainRecord(value)) return fail('MCP_RUNTIME_CONFIGURATION_INVALID');

  const copy: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Object.getOwnPropertyNames(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      return fail('MCP_RUNTIME_CONFIGURATION_INVALID');
    }
    if (key.length === 0 || key.length > 256 || key === '__proto__' || key === 'constructor') {
      return fail('MCP_RUNTIME_CONFIGURATION_INVALID');
    }
    copy[key] = copyJsonValue(descriptor.value, depth + 1);
  }
  return copy;
}

function copyToolArguments(request: unknown): Readonly<Record<string, unknown>> {
  if (!isPlainRecord(request)) return fail('MCP_RUNTIME_CONFIGURATION_INVALID');
  const descriptor = Object.getOwnPropertyDescriptor(request, 'arguments');
  if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
    return fail('MCP_RUNTIME_CONFIGURATION_INVALID');
  }
  const copied = copyJsonValue(descriptor.value);
  if (!isPlainRecord(copied)) return fail('MCP_RUNTIME_CONFIGURATION_INVALID');
  if (Buffer.byteLength(JSON.stringify(copied), 'utf8') > MAX_ARGUMENT_BYTES) {
    return fail('MCP_RUNTIME_CONFIGURATION_INVALID');
  }
  return Object.freeze(copied);
}

function validateStringMap(
  input: Readonly<Record<string, string>> | undefined,
  keyPattern: RegExp,
): Readonly<Record<string, string>> | undefined {
  if (input === undefined) return undefined;
  if (!isPlainRecord(input) || Object.keys(input).length > 64) {
    return fail('MCP_RUNTIME_CONFIGURATION_INVALID');
  }
  const copy: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const key of Object.keys(input)) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      return fail('MCP_RUNTIME_CONFIGURATION_INVALID');
    }
    const value = descriptor.value;
    if (!keyPattern.test(key) || typeof value !== 'string' || value.length > 16_384 || /[\r\n\0]/.test(value)) {
      return fail('MCP_RUNTIME_CONFIGURATION_INVALID');
    }
    copy[key] = value;
  }
  return Object.freeze(copy);
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1';
}

export function normalizeMcpRuntimeConnectionMaterial(
  material: McpRuntimeConnectionMaterial | undefined,
): McpRuntimeConnectionMaterial {
  if (!material) return fail('MCP_RUNTIME_NOT_CONFIGURED');
  if (!isPlainRecord(material)) {
    return fail('MCP_RUNTIME_CONFIGURATION_INVALID');
  }
  if (typeof material.profileId !== 'string'
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(material.profileId)) {
    return fail('MCP_RUNTIME_CONFIGURATION_INVALID');
  }

  if (material.transport === 'stdio') {
    const command = String(material.command || '').trim();
    if (!command || command.length > 1024 || SHELL_METACHARACTER_PATTERN.test(command)) {
      return fail('MCP_RUNTIME_CONFIGURATION_INVALID');
    }
    const args = material.args === undefined ? [] : material.args;
    if (!Array.isArray(args) || args.length > 64 || args.some((arg) => (
      typeof arg !== 'string' || arg.length > 4096 || /[\r\n\0]/.test(arg)
    ))) {
      return fail('MCP_RUNTIME_CONFIGURATION_INVALID');
    }
    const cwd = material.cwd;
    if (cwd !== undefined && (typeof cwd !== 'string' || cwd.length > 2048 || /[\r\n\0]/.test(cwd))) {
      return fail('MCP_RUNTIME_CONFIGURATION_INVALID');
    }
    return Object.freeze({
      profileId: material.profileId,
      transport: 'stdio',
      command,
      args: Object.freeze([...args]),
      cwd,
      env: validateStringMap(material.env, /^[A-Z_][A-Z0-9_]{0,127}$/i),
    });
  }

  let url: URL;
  try {
    url = new URL(material.url);
  } catch {
    return fail('MCP_RUNTIME_CONFIGURATION_INVALID');
  }
  if (material.url.length > 2048
    || url.username
    || url.password
    || (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopbackHostname(url.hostname)))) {
    return fail('MCP_RUNTIME_CONFIGURATION_INVALID');
  }
  return Object.freeze({
    profileId: material.profileId,
    transport: 'streamable-http',
    url: url.toString(),
    headers: validateStringMap(material.headers, /^[!#$%&'*+.^_`|~0-9A-Z-]{1,128}$/i),
  });
}

function validateConnectionMaterial(
  profile: McpConnectionProfile,
  material: McpRuntimeConnectionMaterial | undefined,
): McpRuntimeConnectionMaterial {
  const normalized = normalizeMcpRuntimeConnectionMaterial(material);
  if (normalized.profileId !== profile.profileId || normalized.transport !== profile.transport) {
    return fail('MCP_RUNTIME_CONFIGURATION_INVALID');
  }
  return normalized;
}

function decodeImageSize(data: string): number {
  if (!data || data.length > Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 8
    || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) {
    return fail('MCP_RESULT_INVALID');
  }
  const decoded = Buffer.from(data, 'base64');
  if (decoded.byteLength > MAX_IMAGE_BYTES) return fail('MCP_RESULT_TOO_LARGE');
  if (decoded.byteLength === 0) return fail('MCP_RESULT_INVALID');
  return decoded.byteLength;
}

function normalizeImage(data: unknown, mimeType: unknown, uri?: unknown): {
  image: NormalizedMcpImage;
  size: number;
} {
  if (typeof data !== 'string'
    || typeof mimeType !== 'string'
    || !ALLOWED_IMAGE_MIME_TYPES.has(mimeType)
    || (uri !== undefined && typeof uri !== 'string')) {
    return fail('MCP_RESULT_INVALID');
  }
  const size = decodeImageSize(data);
  return {
    image: Object.freeze({ data, mimeType, ...(uri ? { uri } : {}) }),
    size,
  };
}

function safeResourceUri(value: unknown): string {
  if (typeof value !== 'string' || value.length > 4096) return fail('MCP_RESULT_INVALID');
  let url: URL;
  try { url = new URL(value); } catch { return fail('MCP_RESULT_INVALID'); }
  if (!['https:', 'http:', 'mcp:'].includes(url.protocol)) return fail('MCP_RESULT_INVALID');
  if (url.protocol === 'http:' && !isLoopbackHostname(url.hostname)) return fail('MCP_RESULT_INVALID');
  return value;
}

export function normalizeMcpToolResult(result: unknown): NormalizedMcpToolResult {
  if (!isPlainRecord(result)) return fail('MCP_RESULT_INVALID');
  if (result.isError === true) return fail('MCP_TOOL_RETURNED_ERROR');
  if (!Array.isArray(result.content) || result.content.length > MAX_CONTENT_BLOCKS) {
    return fail('MCP_RESULT_INVALID');
  }

  const text: string[] = [];
  const images: NormalizedMcpImage[] = [];
  const resourceLinks: NormalizedMcpResourceLink[] = [];
  let textBytes = 0;
  let imageBytes = 0;

  for (const block of result.content) {
    if (!isPlainRecord(block) || typeof block.type !== 'string') return fail('MCP_RESULT_INVALID');
    if (block.type === 'text') {
      if (typeof block.text !== 'string') return fail('MCP_RESULT_INVALID');
      textBytes += Buffer.byteLength(block.text, 'utf8');
      if (textBytes > MAX_TEXT_BYTES) return fail('MCP_RESULT_TOO_LARGE');
      text.push(block.text);
      continue;
    }
    if (block.type === 'image') {
      const normalized = normalizeImage(block.data, block.mimeType);
      imageBytes += normalized.size;
      if (imageBytes > MAX_TOTAL_IMAGE_BYTES) return fail('MCP_RESULT_TOO_LARGE');
      images.push(normalized.image);
      continue;
    }
    if (block.type === 'resource') {
      if (!isPlainRecord(block.resource)) return fail('MCP_RESULT_INVALID');
      if (typeof block.resource.blob === 'string') {
        const uri = safeResourceUri(block.resource.uri);
        const normalized = normalizeImage(block.resource.blob, block.resource.mimeType, uri);
        imageBytes += normalized.size;
        if (imageBytes > MAX_TOTAL_IMAGE_BYTES) return fail('MCP_RESULT_TOO_LARGE');
        images.push(normalized.image);
      } else if (typeof block.resource.text === 'string') {
        textBytes += Buffer.byteLength(block.resource.text, 'utf8');
        if (textBytes > MAX_TEXT_BYTES) return fail('MCP_RESULT_TOO_LARGE');
        text.push(block.resource.text);
      } else {
        return fail('MCP_RESULT_INVALID');
      }
      continue;
    }
    if (block.type === 'resource_link') {
      if (typeof block.name !== 'string' || block.name.length > 512) return fail('MCP_RESULT_INVALID');
      const uri = safeResourceUri(block.uri);
      const mimeType = typeof block.mimeType === 'string' ? block.mimeType : undefined;
      resourceLinks.push(Object.freeze({ uri, name: block.name, ...(mimeType ? { mimeType } : {}) }));
      continue;
    }
    return fail('MCP_RESULT_INVALID');
  }

  const structuredContent = result.structuredContent === undefined
    ? undefined
    : copyJsonValue(result.structuredContent);
  if (structuredContent !== undefined && !isPlainRecord(structuredContent)) {
    return fail('MCP_RESULT_INVALID');
  }
  return Object.freeze({
    text: Object.freeze(text),
    images: Object.freeze(images),
    resourceLinks: Object.freeze(resourceLinks),
    ...(structuredContent ? { structuredContent: Object.freeze(structuredContent) } : {}),
  });
}

export function createMcpRuntimeManager(
  options: CreateMcpRuntimeManagerOptions,
): McpRuntimeManager {
  const defaultTimeoutMs = Number.isFinite(options.defaultTimeoutMs)
    ? Math.min(600_000, Math.max(1_000, Math.round(options.defaultTimeoutMs!)))
    : 120_000;
  const sessions = new Map<string, Promise<{ client: McpRuntimeClient; tools: ReadonlySet<string> }>>();

  const getSession = async (profile: McpConnectionProfile) => {
    const existing = sessions.get(profile.profileId);
    if (existing) return existing;
    const pending = (async () => {
      const rawMaterial = await options.getConnectionMaterial(profile.profileId);
      const material = validateConnectionMaterial(profile, rawMaterial);
      const client = await options.clientFactory.create(material, profile);
      try {
        const tools = await client.listTools({ timeoutMs: defaultTimeoutMs });
        return { client, tools: new Set(tools) as ReadonlySet<string> };
      } catch {
        await client.close().catch(() => undefined);
        return fail('MCP_RUNTIME_NOT_CONFIGURED');
      }
    })();
    sessions.set(profile.profileId, pending);
    pending.catch(() => sessions.delete(profile.profileId));
    return pending;
  };

  const checkRoute: McpRuntimeManager['checkRoute'] = async (route) => {
    const binding = options.registry.assertRouteIsConfigured(route);
    const session = await getSession(binding.profile);
    if (!session.tools.has(binding.tool.toolId)) return fail('MCP_TOOL_NOT_DISCOVERED');
    return Object.freeze({
      profileId: binding.profile.profileId,
      toolId: binding.tool.toolId,
    });
  };

  const invokeRoute: McpRuntimeManager['invokeRoute'] = async (
    route,
    request,
    invocationOptions = {},
  ) => {
      const binding = options.registry.assertRouteIsConfigured(route);
      const args = copyToolArguments(request);
      await checkRoute(route, invocationOptions);
      const session = await getSession(binding.profile);
      const timeoutMs = Number.isFinite(invocationOptions.timeoutMs)
        ? Math.min(600_000, Math.max(1_000, Math.round(invocationOptions.timeoutMs!)))
        : defaultTimeoutMs;
      let rawResult: unknown;
      try {
        rawResult = await session.client.callTool(binding.tool.toolId, args, {
          timeoutMs,
          signal: invocationOptions.signal,
        });
      } catch {
        return fail('MCP_INVOCATION_UNKNOWN_OUTCOME');
      }
      return normalizeMcpToolResult(rawResult);
    };

  return Object.freeze({
    checkRoute,
    invokeRoute,
    close: async () => {
      const activeSessions = [...sessions.values()];
      sessions.clear();
      await Promise.allSettled(activeSessions.map(async (session) => (await session).client.close()));
    },
  });
}
