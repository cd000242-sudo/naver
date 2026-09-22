import { describe, expect, it } from 'vitest';

import { buildAgentFailureMessage } from '../agentCli/failureMessage';
import { classifyExit, extractClaudeEnvelopeError } from '../agentCli/parse';

describe('agent failure messages', () => {
  // [2026-09-22 live] A 529 came back as `nonzero_exit` with the envelope's usage blob as the
  // "detail" — the real cause ("API Error: 529 Overloaded") was cut off and never retried.
  it('classifies an upstream 529 envelope as server_overloaded and surfaces its result text', () => {
    const envelope = JSON.stringify({
      duration_api_ms: 2437,
      stop_reason: 'stop_sequence',
      is_error: true,
      total_cost_usd: 0.07,
      usage: { input_tokens: 0 },
      result: 'API Error: 529 Overloaded. This is a server-side issue, usually temporary — try again in a moment.',
    });
    const surfaced = extractClaudeEnvelopeError(envelope);
    expect(surfaced).toContain('529 Overloaded');
    expect(classifyExit('claude', '', surfaced ?? '')).toBe('server_overloaded');
    const message = buildAgentFailureMessage('claude', 'server_overloaded', surfaced);
    expect(message).toContain('529');
    expect(message).toContain('1회 자동 재시도');
    expect(message).not.toContain('total_cost_usd');
  });

  it('does not treat a success envelope or plain stderr as an envelope error', () => {
    expect(extractClaudeEnvelopeError(JSON.stringify({ is_error: false, result: 'ok' }))).toBeNull();
    expect(extractClaudeEnvelopeError('error: unsupported option')).toBeNull();
    expect(classifyExit('claude', 'error: unsupported option --future-flag')).toBe('nonzero_exit');
  });

  it('shows a stable reason code, a safe CLI detail, and the no-retry guarantee', () => {
    const message = buildAgentFailureMessage(
      'codex',
      'nonzero_exit',
      'error: unsupported option --future-flag; token=secret-token',
    );

    expect(message).toContain('원인 코드: nonzero_exit');
    expect(message).toContain('unsupported option --future-flag');
    expect(message).toContain('자동 재시도하지 않았습니다');
    expect(message).not.toContain('secret-token');
  });

  it('gives actionable login and quota guidance without requiring raw detail', () => {
    expect(buildAgentFailureMessage('codex', 'not_logged_in')).toContain('로그인');
    expect(buildAgentFailureMessage('codex', 'rate_limited')).toContain('사용 한도');
  });
});
