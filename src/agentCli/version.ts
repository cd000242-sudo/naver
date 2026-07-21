import type { AgentProvider } from './types.js';

const ANSI_ESCAPE_PATTERN = /\u001b\[[0-?]*[ -/]*[@-~]/g;
const MAX_VERSION_OUTPUT_CHARS = 16_384;
const MAX_VERSION_LINES = 200;
const MAX_VERSION_LINE_CHARS = 120;
const SEMVER = '(\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?)';

const BARE_VERSION = new RegExp(`^v?${SEMVER}$`, 'i');
const CODEX_VERSION_PATTERNS = [
  new RegExp(`^(?:@openai\\/)?(?:codex-cli|codex|codex cli)\\s+(?:version\\s+)?v?${SEMVER}$`, 'i'),
] as const;
const CLAUDE_VERSION_PATTERNS = [
  new RegExp(`^(?:claude|claude-code|claude code)\\s+(?:version\\s+)?v?${SEMVER}$`, 'i'),
  new RegExp(`^v?${SEMVER}\\s+\\(claude code\\)$`, 'i'),
] as const;
const GEMINI_VERSION_PATTERNS = [
  new RegExp(`^(?:@google\\/)?(?:gemini-cli|gemini)\\s+(?:version\\s+)?v?${SEMVER}$`, 'i'),
] as const;

export function agentVersionFallbackLabel(provider: AgentProvider): string {
  if (provider === 'codex') return 'Codex CLI';
  if (provider === 'gemini') return 'Gemini CLI';
  return 'Claude Code';
}

function providerVersionPatterns(provider: AgentProvider): readonly RegExp[] {
  if (provider === 'codex') return CODEX_VERSION_PATTERNS;
  if (provider === 'gemini') return GEMINI_VERSION_PATTERNS;
  return CLAUDE_VERSION_PATTERNS;
}

function canonicalVersion(provider: AgentProvider, version: string): string {
  return `${agentVersionFallbackLabel(provider)} ${version}`;
}

/** Extract one allowlisted version line. Raw logs are never returned. */
export function parseAgentVersionOutput(
  provider: AgentProvider,
  stdout: string,
  stderr: string,
): string | undefined {
  const boundedOutput = `${String(stdout || '').slice(0, MAX_VERSION_OUTPUT_CHARS)}\n${String(stderr || '').slice(0, MAX_VERSION_OUTPUT_CHARS)}`;
  const lines = boundedOutput
    .replace(ANSI_ESCAPE_PATTERN, '')
    .split(/\r?\n/)
    .slice(0, MAX_VERSION_LINES)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line.length <= MAX_VERSION_LINE_CHARS);
  const providerPatterns = providerVersionPatterns(provider);

  for (const line of lines) {
    for (const pattern of providerPatterns) {
      const match = line.match(pattern);
      if (match?.[1]) return canonicalVersion(provider, match[1]);
    }
    const bareMatch = line.match(BARE_VERSION);
    if (bareMatch?.[1]) return canonicalVersion(provider, bareMatch[1]);
  }
  return undefined;
}
