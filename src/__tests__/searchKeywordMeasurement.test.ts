/**
 * [2026-09-15 사장님 진단] 쌓인 109편 중 66%가 "검색어 = 제목 그대로"였다.
 *
 * 그 기록이 노출률에 그대로 합산돼 성적을 부풀렸다(제목검색 36% vs 진짜 키워드 19%).
 * 아무도 "나연이 치과 진료 후 써본 혀클리너, 이게 뭐길래 하나요" 를 검색하지 않는다.
 *
 * 다만 버리지 않는다 — 제 제목으로도 1위를 못 잡는 블로그(rimi_77-: 0/10)를 찾아낸 게
 * 바로 그 기록이었다. 노출과 색인을 **분리해서** 둘 다 쓴다.
 */
import { describe, expect, it } from 'vitest';
import { resolveSearchKeyword, looksLikeSentence, isExposureMeasurement } from '../analytics/searchKeyword';
import { splitExposureGroups, type PublishedPost } from '../analytics/publishedPostTracker';

describe('resolveSearchKeyword — 무엇을 잰 것인지 가른다', () => {
  it('짧은 검색어는 노출 측정이다', () => {
    const v = resolveSearchKeyword('전기요금 폭탄', '전기요금 폭탄 맞은 날 확인한 것들');
    expect(v.kind).toBe('exposure');
    expect(v.keyword).toBe('전기요금 폭탄');
  });

  it('검색어가 제목과 같으면 색인 확인이다', () => {
    const title = '고유가 피해지원금 이의신청 결과조회와 접수번호 확인';
    expect(resolveSearchKeyword(title, title).kind).toBe('index');
  });

  it('공백만 다른 경우도 같은 것으로 본다', () => {
    expect(resolveSearchKeyword('전기  요금 폭탄', '전기 요금  폭탄').kind).toBe('index');
  });

  it('문장형 검색어는 색인 확인이다 — 실측 오염의 대부분이 이 꼴이었다', () => {
    const v = resolveSearchKeyword('나연이 치과 진료 후 써본 혀클리너, 이게 뭐길래 하나요', '다른 제목');
    expect(v.kind).toBe('index');
    expect(v.reason).toMatch(/문장형/);
  });

  it('키워드가 없으면 제목으로 색인만 확인한다', () => {
    const v = resolveSearchKeyword('', '어떤 제목');
    expect(v).toMatchObject({ kind: 'index', keyword: '어떤 제목' });
  });

  it('둘 다 없으면 측정 불가', () => {
    expect(resolveSearchKeyword('', '')).toMatchObject({ kind: 'index', keyword: '' });
  });

  it('제목에서 키워드를 지어내지 않는다 — 가짜 측정을 새로 만들지 않기 위해', () => {
    const title = '2026 본인부담상한제 환급금 신청 방법과 지급일 총정리';
    // 앞 어절을 잘라 "2026 본인부담상한제" 같은 걸 만들어내면 안 된다.
    expect(resolveSearchKeyword('', title).keyword).toBe(title);
  });
});

describe('looksLikeSentence', () => {
  it('20자를 넘으면 문장', () => {
    expect(looksLikeSentence('가'.repeat(21))).toBe(true);
    expect(looksLikeSentence('가'.repeat(20))).toBe(false);
  });
  it('쉼표·물음표가 있으면 문장', () => {
    expect(looksLikeSentence('혀클리너, 이게 뭐길래')).toBe(true);
    expect(looksLikeSentence('청약통장 해지하면?')).toBe(true);
  });
  it('7어절 이상이면 문장', () => {
    expect(looksLikeSentence('가 나 다 라 마 바 사')).toBe(true);
  });
  it('빈 값은 문장이 아니다', () => {
    expect(looksLikeSentence('')).toBe(false);
  });
});

describe('isExposureMeasurement — 옛 기록도 같은 잣대로 본다', () => {
  it('라벨이 있으면 그대로 믿는다', () => {
    expect(isExposureMeasurement({ keywordKind: 'exposure', searchedKeyword: '아무거나' })).toBe(true);
    expect(isExposureMeasurement({ keywordKind: 'index', searchedKeyword: '짧은말' })).toBe(false);
  });

  it('라벨 없는 옛 기록은 제목과 비교해 되판정한다', () => {
    const title = '고유가 피해지원금 이의신청 결과조회와 접수번호 확인';
    expect(isExposureMeasurement({ searchedKeyword: title }, title)).toBe(false);
    expect(isExposureMeasurement({ searchedKeyword: '고유가 지원금' }, title)).toBe(true);
  });
});

describe('splitExposureGroups — 색인 확인이 노출률을 부풀리지 않는다', () => {
  const base = {
    publishedAt: '2026-08-20T00:00:00.000Z',
    mode: 'seo',
    blogId: 'b',
    logNo: '1',
    url: 'https://blog.naver.com/b/1',
    evaluator: { finalScore: 80, modeScore: 80, safetyScore: 100, humanlikeScore: 80, decision: 'pass', details: {} },
  };
  const post = (id: string, title: string, searchedKeyword: string, position: number | null): PublishedPost => ({
    ...base, id, keyword: searchedKeyword, title,
    exposureChecks: [{ checkedAt: base.publishedAt, hoursAfter: 24, searchedKeyword, position, hasSmartblock: false }],
  } as PublishedPost);

  it('제목 그대로 검색해 1위를 찾은 글은 노출로 세지 않는다', () => {
    const title = '나연이 치과 진료 후 써본 혀클리너, 이게 뭐길래 하나요';
    const { exposed, notExposed, unknownCheck } = splitExposureGroups([post('p1', title, title, 1)]);
    expect(exposed).toHaveLength(0);
    expect(notExposed).toHaveLength(0);
    // 유효한 노출 체크가 하나도 없으므로 "모름"이다 — 성공으로도 실패로도 세지 않는다.
    expect(unknownCheck).toHaveLength(1);
  });

  it('진짜 키워드로 잡힌 글만 노출로 센다', () => {
    const { exposed } = splitExposureGroups([
      post('p1', '전기요금 폭탄 맞은 날', '전기요금 폭탄', 3),
      post('p2', '같은 제목 검색', '같은 제목 검색', 1),
    ]);
    expect(exposed.map((p) => p.id)).toEqual(['p1']);
  });

  it('진짜 키워드로 미발견이면 비노출로 센다', () => {
    const { notExposed } = splitExposureGroups([post('p1', '어떤 제목', '짧은 키워드', null)]);
    expect(notExposed.map((p) => p.id)).toEqual(['p1']);
  });
});
