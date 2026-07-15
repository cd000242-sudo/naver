// Agent CLI shared types — subscription-backed generation via local codex/claude CLIs.
//
// Background: users run their own ChatGPT/Claude subscription through the codex/claude
// command-line tools on their own PC, so the app spends no API tokens — it only spawns
// the CLI and parses the structured output. No silent fallback: every failure surfaces
// a typed error the UI can act on (install, login, rate-limit guidance).

/** Supported agent CLIs. */
export type AgentProvider = 'codex' | 'claude';

/** Stable error codes so the renderer can branch (modal copy, install button, etc.). */
export type AgentErrorCode =
  | 'provider_disabled' // product policy blocks this subscription-backed provider
  | 'not_installed'    // binary missing on PATH (ENOENT)
  | 'not_logged_in'    // CLI present but no active subscription session
  | 'subscription_inactive' // OAuth remains, but the paid plan/entitlement is inactive
  | 'rate_limited'     // subscription window / weekly cap exhausted
  | 'timeout'          // no response within the deadline
  | 'aborted'          // caller cancelled via AbortSignal
  | 'spawn_failed'     // process failed to start for another reason
  | 'nonzero_exit'     // CLI exited with an unclassified non-zero code
  | 'empty_output'     // CLI returned an empty final message
  | 'bad_json';        // schema requested but output was not valid JSON

/** Typed error carrying a stable code plus a user-facing Korean message. */
export class AgentCliError extends Error {
  readonly code: AgentErrorCode;
  readonly provider: AgentProvider;
  readonly detail?: string;

  constructor(
    code: AgentErrorCode,
    provider: AgentProvider,
    message: string,
    detail?: string,
  ) {
    super(message);
    this.name = 'AgentCliError';
    this.code = code;
    this.provider = provider;
    this.detail = detail;
  }
}

/** Request to generate content through an agent CLI. */
export interface AgentGenerateOptions {
  provider: AgentProvider;
  /** Full prompt; always delivered over stdin as UTF-8 (never as a CLI argument). */
  prompt: string;
  /** JSON Schema forcing structured output. codex uses --output-schema; claude relies on prompt instruction. */
  schema?: Record<string, unknown>;
  /** Optional model override. Omit to use the subscription default. */
  model?: string;
  /** Hard deadline in milliseconds (default 180000). */
  timeoutMs?: number;
  /** Cancellation signal. */
  signal?: AbortSignal;
}

/** Result of a successful generation. */
export interface AgentGenerateResult {
  provider: AgentProvider;
  /** Raw final message text (a JSON string when a schema was supplied). */
  text: string;
  /** Parsed JSON when a schema was supplied and parsing succeeded. */
  json?: unknown;
  durationMs: number;
}

/** Install / login status for a single provider (drives the UI badge). */
export interface AgentCliStatus {
  provider: AgentProvider;
  installed: boolean;
  version?: string;
  loggedIn: boolean;
  /** True only after the current account is confirmed usable for an agent request. */
  available: boolean;
  /** Whether availability came from auth metadata only or a live minimal request. */
  availabilityCheck?: 'authentication' | 'live';
  /** Stable reason when available is false. */
  errorCode?: AgentErrorCode;
  /** Human-readable detail (e.g. "Logged in using ChatGPT"). */
  detail?: string;
}
