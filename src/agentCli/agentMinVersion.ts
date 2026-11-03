// src/agentCli/agentMinVersion.ts
// Minimum CLI versions the app's default models need. gpt-6.1-terra is only served by Codex CLI >= 0.159.0;
// an older CLI would answer "model not supported" on every call, so the app reports "업데이트 필요"
// (distinct from "설치 필요") and the connect button installs the pinned version into the app folder.
// Pure: no imports besides a type.

import type { AgentProvider } from './types.js';

export const AGENT_MIN_VERSIONS: Readonly<Partial<Record<AgentProvider, string>>> = Object.freeze({
  codex: '0.159.0',
});

const SEMVER_TRIPLE = /(\d+)\.(\d+)\.(\d+)/;

export function extractVersionTriple(label: string | undefined): readonly [number, number, number] | undefined {
  const match = String(label ?? '').match(SEMVER_TRIPLE);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : undefined;
}

/** Negative when a < b, 0 when equal, positive when a > b. */
export function compareVersionTriples(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < 3; i += 1) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** True only when both versions are readable and the installed one is lower; unreadable never blocks. */
export function isAgentVersionBelowMinimum(provider: AgentProvider, versionLabel: string | undefined): boolean {
  const minimum = extractVersionTriple(AGENT_MIN_VERSIONS[provider]);
  const installed = extractVersionTriple(versionLabel);
  return Boolean(minimum && installed && compareVersionTriples(installed, minimum) < 0);
}

export function agentUpdateRequiredDetail(provider: AgentProvider, versionLabel: string | undefined): string {
  const name = provider === 'codex' ? 'Codex' : provider === 'gemini' ? 'Antigravity CLI' : 'Claude Code';
  const current = extractVersionTriple(versionLabel)?.join('.') ?? '확인 불가';
  return `${name} ${current} — ${AGENT_MIN_VERSIONS[provider]} 이상이 필요합니다. [연결하기]를 누르면 앱 전용 폴더에 새 버전을 설치합니다(기존 설치본은 건드리지 않습니다).`;
}
