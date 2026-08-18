import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

/**
 * [2026-08-11] 수집이 "전부 아니면 전무" 로 날아가던 문제.
 *
 * 렌더러가 collectContentFromPlatforms **전체**를 30초로 감싸는데
 * (contentGeneration.ts) 부분 결과를 돌려주는 경로가 없었다.
 * 그래서 본문 한 편이 Playwright 폴백으로 넘어가 20초를 먹으면
 * **이미 받아둔 스니펫까지 포함해 수집 결과 전부가 폐기**되고
 * "가능한 정보로 계속합니다" 로 근거 0 상태 글이 나갔다.
 *
 * 느린 PC 일수록 자주 터진다 — dev 에서만 되는 전형적인 형태다.
 * 관련 선례: realtimeCrawlCredentialResolution.test.ts (같은 증상, 다른 원인)
 */
describe('실시간 수집 부분 결과 보존', () => {
  const assembler = read('sourceAssembler.ts');
  const renderer = read('renderer/modules/contentGeneration.ts');

  /** 소스에서 상수 값을 읽는다 — 값이 바뀌면 테스트가 같이 따라간다 */
  function constValue(source: string, name: string): number {
    const m = source.match(new RegExp(`const\\s+${name}\\s*=\\s*(\\d+)`));
    return m ? Number(m[1]) : NaN;
  }

  it('본문 수집 예산이 렌더러 상한보다 확실히 짧다 (핵심 불변식)', () => {
    const budget = constValue(assembler, 'FULLTEXT_COLLECT_BUDGET_MS');
    expect(Number.isFinite(budget)).toBe(true);

    // 렌더러가 이 호출을 감싸는 실제 상한을 읽어온다
    const m = renderer.match(/collectContentFromPlatforms\(searchQuery, crawlOptions\),\s*(\d+),\s*'실시간 크롤링'/);
    expect(m).not.toBeNull();
    const rendererLimit = Number(m![1]);

    // 검색 API 호출 + IPC 왕복까지 감안해 넉넉히 앞서 끝나야 한다.
    // 이 관계가 깨지면 다시 "전부 폐기" 로 돌아간다.
    expect(budget).toBeLessThan(rendererLimit);
    expect(rendererLimit - budget).toBeGreaterThanOrEqual(5000);
  });

  it('마감이 닿으면 새 요청을 시작하지 않고 확보한 만큼 돌려준다', () => {
    expect(assembler).toContain('if (remainingMs() <= FULLTEXT_STOP_MARGIN_MS)');
    expect(assembler).toContain('stoppedByDeadline = true');
    expect(assembler).toContain('확보한');
    // 마감에 걸려도 그때까지 모은 parts 를 그대로 반환해야 한다 (예외를 던지지 않는다)
    expect(assembler).not.toMatch(/stoppedByDeadline[\s\S]{0,200}throw /);
  });

  it('한 편이 남은 예산을 다 먹지 못하게 건당 상한을 둔다', () => {
    // Playwright 폴백은 goto 만 18초라 건당 상한이 없으면 한 편이 예산을 통째로 먹는다
    expect(assembler).toContain('FULLTEXT_PER_ARTICLE_TIMEOUT_MS');
    expect(assembler).toMatch(/Promise\.race\(\[\s*fetchArticleContent\(candidate\.link\)/);

    const perArticle = constValue(assembler, 'FULLTEXT_PER_ARTICLE_TIMEOUT_MS');
    const budget = constValue(assembler, 'FULLTEXT_COLLECT_BUDGET_MS');
    // 건당 상한이 예산보다 크면 상한이 무의미하다
    expect(perArticle).toBeLessThan(budget);
  });

  it('호출부가 마감을 실제로 넘긴다 (인자를 안 넘기면 기능이 죽는다)', () => {
    expect(assembler).toContain('const fullTextDeadline = Date.now() + FULLTEXT_COLLECT_BUDGET_MS');
    expect(assembler).toMatch(/collectTopArticleFullTexts\(\s*keyword, \(?clientId(?: \?\? '')?\)?, \(?clientSecret(?: \?\? '')?\)?, logger, fullTextDeadline,?\s*\)/);
  });

  it('마감을 안 넘기면 예전처럼 끝까지 돈다 (다른 호출부 후퇴 없음)', () => {
    expect(assembler).toContain('deadlineAt ? deadlineAt - Date.now() : Number.POSITIVE_INFINITY');
  });
});
