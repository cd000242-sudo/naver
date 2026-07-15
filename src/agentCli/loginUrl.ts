import type { AgentProvider } from './types.js';

const MAX_LOGIN_OUTPUT_SCAN_CHARS = 32 * 1024;
const OSC_SEQUENCE_PATTERN = /\u001B\][^\u0007]*(?:\u0007|\u001B\\)/g;
const CSI_SEQUENCE_PATTERN = /\u001B\[[0-?]*[ -/]*[@-~]/g;
const HTTPS_URL_PATTERN = /https:\/\/[^\s<>"'`\u0000-\u001F]+/gi;

const EXACT_LOGIN_ENDPOINTS: Readonly<Record<AgentProvider, Readonly<{
  origin: string;
  pathname: string;
}>>> = Object.freeze({
  codex: Object.freeze({
    origin: 'https://auth.openai.com',
    pathname: '/oauth/authorize',
  }),
  claude: Object.freeze({
    origin: 'https://claude.com',
    pathname: '/cai/oauth/authorize',
  }),
});

/** Validate an OAuth URL before it can reach the operating-system browser. */
export function isAllowedAgentLoginUrl(provider: AgentProvider, rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') return false;
    if (parsed.username || parsed.password) return false;
    if (parsed.port && parsed.port !== '443') return false;
    if (parsed.hash) return false;
    const endpoint = EXACT_LOGIN_ENDPOINTS[provider];
    return parsed.origin.toLowerCase() === endpoint.origin
      && parsed.pathname === endpoint.pathname;
  } catch {
    return false;
  }
}

function stripTerminalControlSequences(value: string): string {
  return value.replace(OSC_SEQUENCE_PATTERN, '').replace(CSI_SEQUENCE_PATTERN, '');
}

function trimTerminalPunctuation(value: string): string {
  return value.replace(/[),.;\]}]+$/g, '');
}

/**
 * Observe streamed CLI output and emit the first provider-owned OAuth URL only.
 * The bounded rolling buffer makes URL extraction work across arbitrary chunk boundaries.
 */
export function createAgentLoginUrlObserver(
  provider: AgentProvider,
  onUrl: (url: string) => void,
): (chunk: string) => void {
  let rollingOutput = '';
  let emitted = false;

  return (chunk: string): void => {
    if (emitted || typeof chunk !== 'string' || chunk.length === 0) return;
    rollingOutput = (rollingOutput + chunk).slice(-MAX_LOGIN_OUTPUT_SCAN_CHARS);
    const visibleOutput = stripTerminalControlSequences(rollingOutput);
    const candidates = visibleOutput.match(HTTPS_URL_PATTERN) ?? [];

    for (const candidate of candidates) {
      const normalizedCandidate = trimTerminalPunctuation(candidate);
      if (!isAllowedAgentLoginUrl(provider, normalizedCandidate)) continue;
      emitted = true;
      onUrl(new URL(normalizedCandidate).toString());
      return;
    }
  };
}

/** Detect a CLI request for a one-time OAuth code without exposing any output content. */
export function createAgentLoginCodePromptObserver(
  onCodeRequired: (attempt: number) => void,
): (chunk: string) => void {
  let visibleOutput = '';
  let attempt = 0;

  const signalPatterns = Object.freeze([
    /paste code here if prompted/i,
    /invalid code\.\s*please make sure the full code was copied\.?/i,
    /paste(?: the)?(?: oauth| authorization| login)? code/i,
    /enter(?: the)?(?: oauth| authorization| verification| login)? code/i,
  ]);

  return (chunk: string): void => {
    if (typeof chunk !== 'string' || chunk.length === 0) return;
    visibleOutput = stripTerminalControlSequences(visibleOutput + chunk).slice(-4_096);

    while (visibleOutput) {
      const match = signalPatterns
        .map((pattern) => pattern.exec(visibleOutput))
        .filter((candidate): candidate is RegExpExecArray => candidate != null)
        .sort((left, right) => left.index - right.index || right[0].length - left[0].length)[0];
      if (!match) return;
      visibleOutput = visibleOutput.slice(match.index + match[0].length);
      attempt += 1;
      onCodeRequired(attempt);
    }
  };
}
