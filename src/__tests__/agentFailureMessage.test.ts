import { describe, expect, it } from 'vitest';

import { buildAgentFailureMessage } from '../agentCli/failureMessage';

describe('agent failure messages', () => {
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
