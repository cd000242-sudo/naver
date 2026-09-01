import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * [2026-09-01] 검사기들이 사장님이 노린 검색어가 아니라 남의 기사 제목을 채점하고 있었다.
 *
 * ContentSource 에는 최상위 keywords 필드가 없다. keywords 는 HeadingPlan 의 필드다
 * (contentGenerator.ts:2135). 사용자가 넣은 키워드는 source.metadata.keywords 에 들어간다
 * (contentKeywordHelpers.ts:11-13, sourceAssembler 가 그렇게 채운다).
 *
 * 그런데 네 곳이 `source?.keywords?.[0]` 을 읽는다 — 언제나 undefined 다.
 *   :466 · :486 · :501  제목 상환 · 본문 응답 검사의 primaryKeyword
 *   :668                SEO 스캐너의 mainKeyword — `|| source?.title` 로 떨어져
 *                       크롤링해 온 남의 기사 제목을 메인 키워드로 놓고 채점한다
 *
 * 전용 헬퍼 getPrimaryKeywordFromSource 가 이미 있는데 쓰지 않았다.
 * 같은 파일 :5560 은 metadata.keywords 를 제대로 읽고 있다 — 경로를 알면서 여기만 틀렸다.
 *
 * 오늘 만든 제목 상환 검사도 이 값을 받는다. 키워드 토큰은 "약속"에서 빼야 하는데
 * (검색어는 제목에 있는 게 당연하므로 상환 대상이 아니다) 빈 문자열이라 그 제외가
 * 한 번도 작동하지 않았다. 검사는 돌았지만 기준이 틀린 채로 돌았다.
 */
const src = readFileSync(resolve(__dirname, '..', 'contentGenerator.ts'), 'utf-8');

describe('메인 키워드를 올바른 자리에서 읽는다', () => {
  it('존재하지 않는 source.keywords 를 읽는 곳이 없다', () => {
    const offenders = src.split('\n')
      .map((line, i) => ({ line: line.trim(), no: i + 1 }))
      .filter(({ line }) => line && !line.startsWith('*') && !line.startsWith('//'))
      .filter(({ line }) => /source\??\.keywords\?*\.\[?0/u.test(line));
    expect(offenders.map((o) => o.no)).toEqual([]);
  });

  it('전용 헬퍼를 쓴다', () => {
    expect(src).toMatch(/getPrimaryKeywordFromSource/u);
  });
});
