import { describe, expect, it } from 'vitest';

import { checkFabrication } from '../content/fabricationCheck';

/** [2026-09-03 self-run 08:06] 자료의 "2026년 **9월 4일~9월 13일**" 을 본문 "2026년 9월 4일" 이 없다고 오판했다 */
describe('조작 검사 — 마크다운 강조 표시는 대조에서 무시한다', () => {
  const material = [
    '## 2-1. 평창 효석문화제',
    '평창 효석문화제는 2026년 **9월 4일~9월 13일**에 봉평면 효석문화마을 일원에서 열립니다[4][7].',
    '입장료는 **7,000원**이고 지역화폐 *5,000원* 환급이 안내됐습니다.',
    '이 줄은 길이를 채우기 위한 문장입니다. '.repeat(20),
  ].join('\n');

  it('강조 표시 사이의 날짜·금액을 자료에 있는 것으로 본다', () => {
    const result = checkFabrication(material, '평창 효석문화제는 2026년 9월 4일 개막이고 입장료는 7,000원입니다.');
    expect(result.checked).toBe(true);
    expect(result.findings).toEqual([]);
  });

  it('연도가 문맥에만 있고 월일이 자료에 있으면 조립된 날짜로 본다', () => {
    const note = '2026년 축제는 **9월 4일~13일**로 잡혀 있다[1]. ' + '길이를 채우는 문장입니다. '.repeat(20);
    const result = checkFabrication(note, '평창 메밀꽃 축제는 2026년 9월 4일에 시작합니다.');
    expect(result.findings).toEqual([]);
    const otherYear = checkFabrication(note, '평창 메밀꽃 축제는 2025년 9월 4일에 시작했습니다.');
    expect(otherYear.findings.map((f) => f.claim)).toEqual(['2025년 9월 4일']);
  });

  it("조사 '부터' 로 끝나는 말은 기관명이 아니다 (2026-09-03 5차 실측 '야간인지부터')", () => {
    const result = checkFabrication(material, '머무는 시간이 낮인지 야간인지부터 정하는 게 빠릅니다.');
    expect(result.findings.filter((f) => f.kind === 'org')).toEqual([]);
  });

  it('자료에 정말 없는 날짜는 여전히 잡는다', () => {
    const result = checkFabrication(material, '평창 효석문화제는 2026년 10월 2일 개막입니다.');
    expect(result.findings.map((f) => f.claim)).toEqual(['2026년 10월 2일']);
  });
});
