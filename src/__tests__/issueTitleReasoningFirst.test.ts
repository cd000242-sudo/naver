import { describe, expect, it } from 'vitest';

import { buildContentJsonOutputFormat } from '../contentJsonPromptFormat';

/**
 * [2026-08-05] 이슈픽 제목의 추론 선행 — 사용자 요구.
 *
 * "특히 스타·연예인 홈판글은 제목이 정말 중요하다. AI로 먼저 추론을 해서
 *  제목과 글 생성이 되게끔 해달라. 크롤링을 하잖나."
 *
 * 기존 구조의 문제: JSON 스키마의 첫 필드가 selectedTitle 이라, LLM 이 크롤링
 * 자료를 분석하기 전에 제목부터 생성했다(LLM 은 필드 순서대로 생성한다).
 *
 * 해법 — 추가 API 호출 없이(비용 0) 같은 호출 안에서 순서를 강제한다:
 * issue-story 조합(homefeed + entertainment/society)에서 스키마 맨 앞에
 * issueAnalysis 필드를 둔다. 모델은 자료의 핵심 사건·확정/미확정 구분·궁금증 갭
 * 후보를 먼저 채운 뒤에야 제목을 고르게 된다.
 *
 * 안전: 파서 소비 필드 실측(selectedTitle/headings/introduction/bodyPlain/
 * titleCandidates 뿐) — issueAnalysis 는 어디서도 소비되지 않아 본문에 누출될
 * 수 없다. 미확정 항목은 제목·궁금증 소재로 쓰지 않는다는 연결 지시로
 * 홈판 안전 규율(배치 2b)과 정합한다.
 */

const issueSource = { categoryHint: '연예' } as never;
const plainSource = { categoryHint: '반려동물' } as never;

function format(mode: 'homefeed' | 'seo', source: never): string {
  return buildContentJsonOutputFormat({
    contentMode: mode, mode, source,
    title: '', rawText: '테스트 자료 본문', primaryKeyword: '테스트', subKeywords: '',
  } as never);
}

describe('이슈픽 — 제목보다 추론이 먼저다', () => {
  const f = format('homefeed', issueSource);

  it('issueAnalysis 필드가 스키마에 있다', () => {
    expect(f).toContain('"issueAnalysis"');
  });

  it('issueAnalysis 가 selectedTitle 보다 앞이다 (생성 순서 강제)', () => {
    const analysisAt = f.indexOf('"issueAnalysis"');
    const titleAt = f.indexOf('"selectedTitle"');
    expect(analysisAt).toBeGreaterThan(-1);
    expect(titleAt).toBeGreaterThan(-1);
    expect(analysisAt, 'LLM 은 필드 순서대로 생성한다 — 분석이 뒤면 의미가 없다').toBeLessThan(titleAt);
  });

  it('확정/미확정 구분을 요구하고 미확정은 제목 소재에서 차단한다', () => {
    expect(f).toMatch(/"confirmed"/);
    expect(f).toMatch(/"unconfirmed"/);
    expect(f).toMatch(/unconfirmed[\s\S]{0,120}?제목|미확정[\s\S]{0,60}?제목.{0,20}쓰지 않는다/);
  });

  it('궁금증 갭 후보를 자료에서 뽑게 한다', () => {
    expect(f).toMatch(/"curiosityGaps"/);
    expect(f).toMatch(/공적 활동/);
  });

  it('제목 후보 3개가 서로 다른 공식을 쓰게 한다', () => {
    expect(f).toMatch(/서로 다른 (제목 )?공식/);
  });

  it('분석 내용을 본문에 옮겨 적지 말라고 명시한다', () => {
    expect(f).toMatch(/issueAnalysis[\s\S]{0,80}?본문[^\n]{0,30}(옮기지|쓰지) 않는다/);
  });
});

describe('이슈픽 외 — 스키마가 바뀌지 않는다 (회귀)', () => {
  it('일반 홈판(pet)에는 issueAnalysis 가 없다', () => {
    expect(format('homefeed', plainSource)).not.toContain('"issueAnalysis"');
  });

  it('SEO 에는 issueAnalysis 가 없다', () => {
    expect(format('seo', issueSource)).not.toContain('"issueAnalysis"');
  });

  it('이슈픽에서도 selectedTitle·titleCandidates 는 그대로 있다', () => {
    const f = format('homefeed', issueSource);
    expect(f).toContain('"selectedTitle"');
    expect(f).toContain('"titleCandidates"');
  });
});
