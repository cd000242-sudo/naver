import { describe, expect, it } from 'vitest';

import { stripResearchNoteChatter } from '../content/researchNoteHygiene';

/** [2026-09-03 self-run 08:06] "원하시면 … SEO용 제목 20개 …" 제안이 재료로 들어가 본문에 "SEO용 제목 20개처럼" 이 새었다 */
describe('리서치 노트 잡담 제거', () => {
  const note = [
    '아래 자료는 **실시간 검색으로 확인된 2026년 기준 최신 정보**를 바탕으로, 블로그 글 작성에 바로 활용할 수 있도록 정리한 리서치 노트입니다.',
    '',
    '## 1) 핵심 정보',
    '',
    '평창 효석문화제는 2026년 **9월 4일~9월 13일**에 열립니다[4][7].',
    '',
    '- **감악산 꽃별**: 최신 공식 일정 재확인이 필요함.',
    '',
    '원하시면 다음 단계로 바로 이어서  ',
    '**1) 블로그 SEO용 제목 20개**,  ',
    '**2) 서론/본론/결론 형태의 완성형 블로그 글**  ',
    '형태로 재구성해드릴 수 있습니다.',
  ].join('\n');

  it('서두 설명과 말미 제안을 떼고 사실 문단만 남긴다', () => {
    const out = stripResearchNoteChatter(note);
    expect(out.startsWith('## 1) 핵심 정보')).toBe(true);
    expect(out).toContain('9월 4일~9월 13일');
    expect(out).toContain('감악산 꽃별');
    expect(out).not.toContain('SEO용 제목');
    expect(out).not.toContain('리서치 노트입니다');
  });

  it('잡담이 없으면 원문 그대로, 사실 문단이 하나뿐이면 지우지 않는다', () => {
    const plain = '## 일정\n\n평창 효석문화제는 9월 4일 개막입니다.';
    expect(stripResearchNoteChatter(plain)).toBe(plain);
    const onlyOne = '원하시면 더 정리해드릴 수 있습니다.';
    expect(stripResearchNoteChatter(onlyOne)).toBe(onlyOne);
    expect(stripResearchNoteChatter('')).toBe('');
  });

  it('맺음 인사도 뗀다', () => {
    const out = stripResearchNoteChatter('## 일정\n\n9월 4일 개막입니다.\n\n도움이 되셨길 바랍니다.');
    expect(out).toBe('## 일정\n\n9월 4일 개막입니다.');
  });
});
