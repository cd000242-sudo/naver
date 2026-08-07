// Executable name per provider.
//
// Kept separate from AgentProvider because the two diverged in v2.11.145: the 'gemini' provider
// now runs `agy` (Antigravity CLI). Google stopped serving Gemini CLI requests for individual
// accounts on 2026-06-18, so `gemini` can no longer authenticate at all — it fails with
// "IneligibleTierError: This client is no longer supported for Gemini Code Assist for individuals".
// agy is Google's official replacement and signs in to the same Google account via the OS keyring.

import type { AgentProvider } from './types.js';

const COMMANDS: Readonly<Record<AgentProvider, string>> = Object.freeze({
  codex: 'codex',
  claude: 'claude',
  gemini: 'agy',
});

/** Executable to spawn for a provider. Never assume it equals the provider id. */
export function agentCommandName(provider: AgentProvider): string {
  return COMMANDS[provider];
}
