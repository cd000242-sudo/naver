import { describe, expect, it } from 'vitest';

import {
  stripAiConclusionOpeners,
  stripAiConclusionOpenersFromContent,
  stripAiConclusionOpenersFromHtml,
} from '../content/aiConclusionOpener';

/** [2026-09-03 self-run 07:55] 마지막 문단이 "정리하면 …"으로 열렸다 — 검사기는 Critical, 본문은 그대로였다 */
describe('AI 마무리 여는말 제거', () => {
  it('문단 첫머리의 정리하면/결론적으로/요약하면만 떼고 뒤 문장은 그대로 둔다', () => {
    expect(stripAiConclusionOpeners('정리하면 흰 메밀꽃과 문학 산책은 평창, 정원 풍경은 자라섬이 선명합니다.')).toBe('흰 메밀꽃과 문학 산책은 평창, 정원 풍경은 자라섬이 선명합니다.');
    expect(stripAiConclusionOpeners('결론적으로, 야간 일정은 운영일을 먼저 봅니다.')).toBe('야간 일정은 운영일을 먼저 봅니다.');
    expect(stripAiConclusionOpeners('첫 문단.\n요약하면 둘째 문단.')).toBe('첫 문단.\n둘째 문단.');
  });

  it('문단 가운데 문장 첫머리의 정리하면도 뗀다 (2026-09-03 4차 실측)', () => {
    expect(stripAiConclusionOpeners('가을 운영 공지를 보고 결정하는 편이 맞겠네요. 정리하면 9월 초 주말이라면 평창이 먼저입니다.'))
      .toBe('가을 운영 공지를 보고 결정하는 편이 맞겠네요. 9월 초 주말이라면 평창이 먼저입니다.');
  });

  it('문장 중간의 정리하면, 살펴보았습니다 같은 종결형, 너무 짧은 잔여는 건드리지 않는다', () => {
    expect(stripAiConclusionOpeners('이를 정리하면 다음과 같다.')).toBe('이를 정리하면 다음과 같다.');
    expect(stripAiConclusionOpeners('오늘은 여기까지 살펴보았습니다.')).toBe('오늘은 여기까지 살펴보았습니다.');
    expect(stripAiConclusionOpeners('정리하면 끝')).toBe('정리하면 끝');
    expect(stripAiConclusionOpeners('')).toBe('');
  });

  it('HTML은 여는 태그 바로 뒤에서 뗀다', () => {
    expect(stripAiConclusionOpenersFromHtml('<p>정리하면 평창은 문학 산책입니다.</p>')).toBe('<p>평창은 문학 산책입니다.</p>');
  });

  it('콘텐츠 객체는 새 객체로 돌려주고 소제목 본문·결론·본문 모두 정리한다', () => {
    const content = {
      headings: [{ title: '자라섬', content: '정리하면 비용은 7,000원입니다.' }],
      conclusion: '종합하면 평지부터 고르세요.',
      bodyPlain: '정리하면 평지부터 고르세요.',
      bodyHtml: '<p>정리하면 평지부터 고르세요.</p>',
    };
    const out = stripAiConclusionOpenersFromContent(content);
    expect(out).not.toBe(content);
    expect(out.headings[0].content).toBe('비용은 7,000원입니다.');
    expect(out.conclusion).toBe('평지부터 고르세요.');
    expect(out.bodyPlain).toBe('평지부터 고르세요.');
    expect(out.bodyHtml).toBe('<p>평지부터 고르세요.</p>');
    expect(content.conclusion).toBe('종합하면 평지부터 고르세요.');
  });
});
