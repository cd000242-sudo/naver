import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

function readSource(...segments: string[]): string {
  return readFileSync(resolve(process.cwd(), ...segments), 'utf8');
}

describe('Claude Code packaged-app UI copy', () => {
  it('does not tell users that a working Claude subscription path is disabled', () => {
    const html = readSource('public', 'index.html');
    const guard = readSource('src', 'renderer', 'utils', 'agentModeGuard.ts');

    expect(html).not.toContain('배포 앱의 구독 연동은 <strong>Codex</strong>만 제공합니다.');
    expect(html).not.toContain('배포 앱에서는 구독 로그인이 아닌 <strong>Claude API 키</strong> 방식 사용');
    expect(html).toContain('Codex, <strong>Claude Code</strong>, <strong>Gemini CLI(Antigravity)</strong> 모두 본인 구독 로그인으로 사용할 수 있습니다.');
    expect(guard).not.toContain('배포 앱에서는 Claude 구독 로그인을 지원하지 않습니다.');
  });
});
