import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

/*
 * [2026-09-17 사장님 실측] 초안을 반자동 편집칸에 붙여 넣고 발행할 계정을 고르는 순간
 * 글이 사라졌다.
 *
 * 계정 전환 핸들러는 저장된 세션이 없으면 clearSession() 을 부르는데, 그 함수가
 * unified-generated-title / content / hashtags 를 함께 비운다. 그런데 이 칸들은
 * 계정이 아니라 글에 속한 입력이다 — 키워드·URL 을 같은 이유로 이미 보존하고 있었고,
 * 초안만 빠져 있었다.
 *
 * "발행 직전에 계정을 고른다"는 정상 동선이므로, 그 지점에서 글이 날아가면 안 된다.
 * 수동 "세션 초기화" 버튼은 그대로 전부 지운다 — 그건 사용자가 의도한 초기화다.
 */
const SOURCE = readFileSync(new URL('../renderer/modules/multiAccountManager.ts', import.meta.url), 'utf8');

const DRAFT_FIELDS = [
  'unified-generated-title',
  'unified-generated-content',
  'unified-generated-hashtags',
] as const;

describe('계정 전환이 붙여 넣은 초안을 지우지 않는다', () => {
  it('전환 전에 초안 세 칸을 스냅샷한다', () => {
    expect(SOURCE).toMatch(/const _preservedDraft = \[/);
    for (const id of DRAFT_FIELDS) {
      expect(SOURCE.slice(SOURCE.indexOf('const _preservedDraft'), SOURCE.indexOf('const _preservedDraft') + 400))
        .toContain(id);
    }
  });

  it('전환 뒤에 다시 채워 넣는다', () => {
    expect(SOURCE).toMatch(/_preservedDraft\.forEach\(/);
  });

  it('스냅샷이 복원보다 먼저 온다', () => {
    expect(SOURCE.indexOf('const _preservedDraft')).toBeLessThan(SOURCE.indexOf('_preservedDraft.forEach'));
  });

  it('빈 값은 덮어쓰지 않는다 — 저장된 세션 복원을 막지 않기 위해서다', () => {
    const block = SOURCE.slice(SOURCE.indexOf('_preservedDraft.forEach'));
    expect(block.slice(0, 220)).toMatch(/if \(el && value\)/);
  });

  it('수동 초기화(clearSession)는 여전히 초안을 지운다', () => {
    const clearFn = SOURCE.slice(SOURCE.indexOf('function clearSession'));
    for (const id of DRAFT_FIELDS) {
      expect(clearFn.slice(0, 900)).toContain(id);
    }
  });
});
