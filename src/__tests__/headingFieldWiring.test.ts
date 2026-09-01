import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * [2026-09-01] 감사기들이 소제목을 한 글자도 못 받고 있었다.
 *
 * 실제 필드는 HeadingPlan.title(contentGenerator.ts:2101) 인데
 * 감사 코드 네 곳이 h?.heading 을 읽는다. 그 필드는 없으므로 늘 빈 문자열이다.
 *
 * 결과:
 *   · analyzeHeadingSkeletons 에 제목 1개만 들어가고 소제목은 전부 걸러진다.
 *     하한이 3개라 이 감지기는 한 번도 발화하지 못했다(로그에 [HeadingVariety] 가 없다).
 *   · 감사용 본문(:527)에도 소제목이 빠져, 그 아래 여섯 감사기
 *     (반응 날조 · 수치 검증 · 경험 · 수치 누출 · 자료 라벨 · 팩트 검증)가
 *     소제목을 못 본다.
 *   · 섹션 간 반복 판정(:588)도 heading 이 전부 빈 문자열이라 이름을 못 붙인다.
 *
 * 코드가 이 결함을 이미 알고 있었다 — :456 주석에 "기존 logTitlePayoff 는
 * h.heading 을 읽는데 실제 필드는 h.title 이라 (기존 결함)" 이라고 적혀 있고
 * 바로 아래 한 곳만 국소 우회했다. 나머지는 그대로 남았고 오늘 그 패턴을 복사했다.
 *
 * (h: any) 캐스팅이라 타입 검사가 못 잡았다. 같은 실수가 두 번 반복된 이유가 그것이다.
 */
const src = () => readFileSync(resolve(__dirname, '..', 'contentGenerator.ts'), 'utf-8');

describe('감사기가 소제목을 실제로 받는다', () => {
  it('h.heading 만 읽는 감사 코드가 남아 있지 않다', () => {
    const codeOnly = src().split('\n')
      .filter((l) => { const t = l.trim(); return t && !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*'); })
      .join('\n');
    // h?.title 폴백 없이 h?.heading 만 읽는 자리를 찾는다.
    const bare = codeOnly.match(/h\?\.heading(?!\s*\)?\s*\|\|)/gu) ?? [];
    expect(bare).toEqual([]);
  });

  it('소제목 골격 감지가 title 을 읽는다', () => {
    const block = src().slice(src().indexOf('analyzeHeadingSkeletons(headingList)') - 700, src().indexOf('analyzeHeadingSkeletons(headingList)'));
    expect(block).toMatch(/h\?\.title/u);
  });

  it('감사용 본문 조립이 title 을 읽는다', () => {
    const at = src().indexOf('const experienceAudit');
    expect(src().slice(Math.max(0, at - 1800), at)).toMatch(/h\?\.title/u);
  });

  it('섹션 간 반복 판정이 title 을 읽는다', () => {
    const at = src().indexOf('findCrossSectionRepeats(');
    expect(src().slice(at, at + 500)).toMatch(/h\?\.title/u);
  });
});
