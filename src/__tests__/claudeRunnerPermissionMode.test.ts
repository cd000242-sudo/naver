import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

/**
 * [2026-08-08 사용자 실측] "코덱스는 결과가 나오는데 클로드코드는 연동했는데도 글생성이
 * 안 된다."
 *
 * 원인은 인증도 설치도 아니고 `--permission-mode plan` 한 줄이었다. 계획 모드의 CLI 는
 * 글을 쓰지 않고 계획을 답한다 — "실제 최종 JSON 산출물은 계획 승인 후 별도 턴에서
 * 작성". exit 0 / is_error:false 로 끝나 에러로도 잡히지 않고, JSON 이 없으니 파싱만
 * 실패해 사용자에게는 그냥 "글이 안 나온다"로 보였다. codex 는 `exec` 라 무관했다.
 *
 * 실측(같은 기사 프롬프트 16,137자, 2026-08-08):
 *   --permission-mode plan     → 143자, JSON 파싱 실패, headings 없음
 *   --permission-mode 없음     → 3,111자, JSON OK, headings 5개
 *   --permission-mode default  → 2,885자, JSON OK, headings 5개
 *
 * default 를 명시한다. -p 는 헤드리스라 권한 프롬프트가 뜰 수 없고 --disallowedTools '*'
 * 가 모든 툴을 막으므로 안전하며, CLI 기본값이 바뀌어도 답하지 않는 모드로 되돌아가지
 * 않는다.
 */
describe('claudeRunner — 권한 모드', () => {
  const runner = readFileSync(new URL('../agentCli/claudeRunner.ts', import.meta.url), 'utf8');

  it('계획 모드를 쓰지 않는다 (회귀 잠금)', () => {
    expect(runner).not.toMatch(/'--permission-mode',\s*'plan'/);
    expect(runner).not.toMatch(/"--permission-mode",\s*"plan"/);
  });

  it('답변 모드를 명시한다', () => {
    expect(runner).toMatch(/'--permission-mode',\s*'default'/);
  });

  it('헤드리스 단일 응답 + JSON 봉투 계약은 그대로다', () => {
    expect(runner).toMatch(/'-p'/);
    expect(runner).toMatch(/'--output-format',\s*'json'/);
    expect(runner).toMatch(/parseClaudeEnvelope\(res\.stdout\)/);
  });

  it('툴 차단 격리가 유지된다 (권한 프롬프트가 뜰 수 없는 근거)', () => {
    const env = readFileSync(new URL('../agentCli/subscriptionEnv.ts', import.meta.url), 'utf8');
    expect(env).toMatch(/'--disallowedTools',\s*'\*'/);
  });

  it('실패 원인이 주석으로 남아 있다 (같은 실수 반복 방지)', () => {
    expect(runner).toMatch(/NOT 'plan'/);
  });
});
