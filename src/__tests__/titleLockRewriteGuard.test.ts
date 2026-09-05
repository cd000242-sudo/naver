import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolveLockedTitle } from '../contentKeywordTitlePolicy';

/**
 * [2026-09-05 사용자 실측] "키워드를 제목으로 사용"을 체크했는데 발행 제목이
 * "한 번 입은 옷, 옷장에 넣기 전 무엇을 확인할까?" 로 바뀌어 나감.
 *
 * 뿌리: 콘텐츠 정책 파이프라인(rewrite_count > 0)이 생성 측 잠금 **이후**에 돌면서
 * result.article.title 을 selectedTitle 위에 그대로 덮었다 — 잠금 검사 없이.
 * 모든 사후 제목 교체는 resolveLockedTitle 을 먼저 거쳐야 한다.
 */
describe('resolveLockedTitle', () => {
  it('keyword-as-title 잠금이 있으면 그 제목을 돌려준다', () => {
    expect(resolveLockedTitle({
      keywordAsTitleLocked: true,
      keywordAsTitleValue: '한 번 입은 옷, 옷장에 넣기는 찝찝하고 빨기는 애매하다면 ??',
    })).toBe('한 번 입은 옷, 옷장에 넣기는 찝찝하고 빨기는 애매하다면 ??');
  });

  it('수동 지정 제목 잠금도 존중한다', () => {
    expect(resolveLockedTitle({
      manualTitleLocked: true,
      manualTitleValue: '사용자 지정 제목',
    })).toBe('사용자 지정 제목');
  });

  it('잠금이 없으면 빈 문자열 — 퇴고 제목이 그대로 적용된다', () => {
    expect(resolveLockedTitle({})).toBe('');
    expect(resolveLockedTitle(null)).toBe('');
    expect(resolveLockedTitle({ keywordAsTitleLocked: false, keywordAsTitleValue: '무시' })).toBe('');
  });

  it('잠금 플래그만 있고 값이 비면 잠그지 않는다 (빈 제목 발행 방지)', () => {
    expect(resolveLockedTitle({ keywordAsTitleLocked: true, keywordAsTitleValue: '  ' })).toBe('');
  });
});

describe('정책 퇴고 경로가 잠금을 거친다 (회귀 앵커)', () => {
  const guard = readFileSync(new URL('../contentPolicy/generatedContentGuard.ts', import.meta.url), 'utf8');
  const service = readFileSync(new URL('../contentPolicy/policyService.ts', import.meta.url), 'utf8');

  it('generatedContentGuard 는 rewrite 시 lockedTitle 을 우선한다', () => {
    expect(guard).toMatch(/resolveLockedTitle/);
    expect(guard).toMatch(/lockedTitle \|\| result\.article\.title/);
    // 잠금 검사 없이 퇴고 제목을 직접 대입하는 옛 코드가 돌아오면 안 된다.
    expect(guard).not.toMatch(/next\.selectedTitle = result\.article\.title;/);
  });

  it('policyService 도 rewrite 시 lockedTitle 을 우선한다 (structured + payload.title 양쪽)', () => {
    expect(service).toMatch(/resolveLockedTitle/);
    expect(service).toMatch(/structured\.selectedTitle = lockedTitle \|\| result\.article\.title/);
    expect(service).toMatch(/\(lockedTitle \|\| result\.article\.title\) : payload\.title/);
  });
});
