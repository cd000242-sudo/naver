import { describe, expect, it } from 'vitest';

import {
  stripMaterialNarration,
  stripMaterialNarrationFromContent,
  stripMaterialNarrationFromParagraph,
} from '../content/materialNarrationStrip';

/** [2026-09-03 사장님 지적 ④] "검색 결과에는 …" 자료 목록 서술이 본문에 남았다 — 프롬프트 금지만으로는 안 지켜졌다 */
describe('자료 목록 서술 제거', () => {
  it('검색 결과·자료를 서술하는 문장만 떼고 사실 문장은 남긴다', () => {
    const paragraph = '가입 요건은 나이만 맞으면 끝나는 게 아니에요. 막상 검색 결과에는 나이와 개인소득, 가구소득을 함께 언급하는 내용이 섞여 있죠. 개인소득 6000만원 이하면 정부기여금이 붙습니다.';
    expect(stripMaterialNarrationFromParagraph(paragraph)).toBe('가입 요건은 나이만 맞으면 끝나는 게 아니에요. 개인소득 6000만원 이하면 정부기여금이 붙습니다.');
    expect(stripMaterialNarration('검색 결과에는 2025년 9월 17일에 작성된 꽃구경 글도 남아 있습니다. 평창은 9월 4일 개막입니다.')).toBe('평창은 9월 4일 개막입니다.');
  });

  it('문단이 통째로 서술문이면 비우지 않고 원문을 남긴다', () => {
    const only = '검색 결과에는 관련 글이 많습니다.';
    expect(stripMaterialNarrationFromParagraph(only)).toBe(only);
  });

  it('사실을 인용한 문장은 건드리지 않는다', () => {
    const fact = '평창 효석문화제는 2026년 9월 4일부터 13일까지 열립니다. 입장료는 7,000원입니다.';
    expect(stripMaterialNarration(fact)).toBe(fact);
    expect(stripMaterialNarration('')).toBe('');
  });

  it('콘텐츠 객체는 새 객체로, 소제목 본문·결론까지 정리한다', () => {
    const content = {
      headings: [{ title: '조건', content: '검색 결과를 보면 조건이 제각각이에요. 개인소득 기준은 6000만원입니다.' }],
      conclusion: '자료에는 다른 얘기도 있지만 핵심은 하나입니다. 가구소득부터 확인하세요.',
      bodyPlain: '본문입니다.',
    };
    const out = stripMaterialNarrationFromContent(content);
    expect(out).not.toBe(content);
    expect(out.headings[0].content).toBe('개인소득 기준은 6000만원입니다.');
    expect(out.conclusion).toBe('가구소득부터 확인하세요.');
    expect(content.conclusion).toContain('자료에는');
  });
});
