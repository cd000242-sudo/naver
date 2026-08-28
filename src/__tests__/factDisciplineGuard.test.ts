import { describe, expect, it } from 'vitest';
import {
  appendFactDisciplineGuard,
  buildFactDisciplineGuardBlock,
  isFactDisciplineGuardEnabled,
} from '../content/factDisciplineGuard';

describe('factDisciplineGuard', () => {
  it('defaults to on and only turns off on an explicit false', () => {
    expect(isFactDisciplineGuardEnabled(null)).toBe(true);
    expect(isFactDisciplineGuardEnabled({})).toBe(true);
    expect(isFactDisciplineGuardEnabled({ factDisciplineGuard: true })).toBe(true);
    expect(isFactDisciplineGuardEnabled({ factDisciplineGuard: false })).toBe(false);
  });

  it('states all seven assembly rules, including the two the live run exposed', () => {
    const block = buildFactDisciplineGuardBlock();
    expect(block).toContain('한 문장에 둘 이상의 지역');
    expect(block).toContain('모든·전부·유일·최초·최대·전국');
    expect(block).toContain("'출생연도 끝자리' ≠ '생년월일 끝자리'");
    expect(block).toContain('월 없는 날짜');
    expect(block).toContain('이유·유래·전망을 지어내지 않는다');
  });

  it('separates an article write date from the event date — the live run merged them', () => {
    const block = buildFactDisciplineGuardBlock();
    expect(block).toContain('그 글이 쓰인 날짜');
    expect(block).toContain('사건 날짜처럼 옮기지 마라');
  });

  it('forbids narrating unverified material to the reader', () => {
    expect(buildFactDisciplineGuardBlock()).toContain('확인 못 한 정보는 언급 자체를 하지 않는다');
  });

  it('appends without mutating the original prompt, and is a no-op when disabled', () => {
    const base = 'SYSTEM PROMPT';
    const applied = appendFactDisciplineGuard(base, true);
    expect(applied.startsWith(base)).toBe(true);
    expect(applied.length).toBeGreaterThan(base.length);
    expect(base).toBe('SYSTEM PROMPT');
    expect(appendFactDisciplineGuard(base, false)).toBe(base);
  });
});
