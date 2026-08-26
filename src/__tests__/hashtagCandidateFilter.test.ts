import { describe, it, expect } from 'vitest';
import { toHashtagCandidate, filterHashtagCandidates } from '../content/hashtagCandidateFilter';

/**
 * [2026-08-26 라이브 실측] 발행된 글의 해시태그에 #8월 #25일 #친함 #셀카 #장으로 가 붙었다.
 * 제목 "…셀카 한 장으로 시작된…"을 공백으로만 쪼갠 결과다.
 */
describe('해시태그 조각 필터', () => {
  it('실측 사례의 쓰레기 태그를 걸러낸다', () => {
    const title = '김윤주 권정열 연애 8월 25일 꽤 친함 셀카 한 장으로 시작된 때아닌 공개 축하';
    const out = filterHashtagCandidates(title.split(/\s+/));
    expect(out).not.toContain('8월');
    expect(out).not.toContain('25일');
    expect(out).not.toContain('장으로');
    expect(out).toContain('셀카');
    expect(out).toContain('김윤주');
  });

  it('숫자가 섞인 조각은 태그가 아니다', () => {
    for (const t of ['8월', '25일', '3가지', '10cm']) {
      expect(toHashtagCandidate(t)).toBeNull();
    }
  });

  it('조사를 떼고 한 글자만 남으면 버린다', () => {
    expect(toHashtagCandidate('장으로')).toBeNull();
    expect(toHashtagCandidate('것을')).toBeNull();
  });

  it('조사가 붙은 멀쩡한 명사는 조사를 떼고 살린다', () => {
    expect(toHashtagCandidate('셀카를')).toBe('셀카');
    expect(toHashtagCandidate('청약통장은')).toBe('청약통장');
  });

  it('중복은 앞의 것만 남긴다', () => {
    expect(filterHashtagCandidates(['셀카', '셀카를', '셀카'])).toEqual(['셀카']);
  });
});

describe('멀쩡한 단어를 다치지 않는다', () => {
  it('우연히 조사로 끝나는 두 글자 단어를 보존한다', () => {
    for (const w of ['사이', '바다', '나이', '고기', '아이']) {
      expect(toHashtagCandidate(w)).toBe(w);
    }
  });
});
