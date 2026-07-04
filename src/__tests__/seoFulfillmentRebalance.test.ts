/**
 * seoFulfillmentRebalance.test.ts
 *
 * SPEC-KEYWORD-ENDGAME Phase 4 — 밀도→충실도 배점 전환.
 * 옛 체계는 밀도 30%(2~3% 만점)로 스터핑을 장려했다. 새 체계의 본질을 행동으로 잠근다:
 * "키워드 스터핑+빈약" 글 < "자연 밀도+충실(수치·근거·직답)" 글.
 */
import { describe, it, expect } from 'vitest';
import { calculateSEOScore } from '../seoCalculator';

const HEADINGS_PLAIN = [
  { title: '제습기 고르는 기준' },
  { title: '사용 위치와 시간대' },
  { title: '제습기 관리 방법' },
  { title: '계절별 활용법' },
  { title: '마무리 정리' },
];

const HEADINGS_QA = [
  { title: '제습기 어떤 걸 골라야 할까요?' },
  { title: '전기세는 얼마나 나올까?' },
  { title: '제습기 관리 방법' },
  { title: '계절별 활용법' },
  { title: '마무리 정리' },
];

// 충실한 본문: 구체 수치+단위 다수, 근거 연결어, 자연 밀도(~1%)
const RICH_CONTENT = [
  '제습기를 고를 때는 용량을 기준으로 판단해야 합니다. 10평 기준으로 하루 16L 용량이면 충분합니다.',
  '실제로 6평 원룸에서 10L 모델을 써 보니 하루 2회 물통을 비웠습니다. 전기 요금은 월 8,000원 수준이었어요.',
  '예를 들어 습도 80%에서 50%까지 내리는 데 약 40분이 걸렸고, 소비전력은 200W였습니다.',
  '비교하면 300W급은 30분으로 빨랐지만 월 12,000원으로 요금이 늘었습니다. 결과적으로 10평 이하는 200W면 충분합니다.',
  '필터는 2주에 1회, 물통은 3일에 1회 세척하는 것이 공식 자료 기준입니다.',
].join('\n\n');

// 스터핑 본문: 키워드 도배(밀도 >4%), 수치·근거 빈약
const STUFFED_CONTENT = [
  '제습기 추천 제습기 순위 제습기 후기 제습기 가격 제습기 비교.',
  '제습기 좋아요. 제습기 필요해요. 제습기 사세요. 제습기 최고.',
  '제습기 제습기 제습기 여름엔 제습기. 습기엔 무조건 제습기.',
].join('\n\n');

describe('Phase 4 — 밀도→충실도 배점 전환', () => {
  it('[핵심 역전] 스터핑+빈약 글이 자연밀도+충실 글보다 점수가 낮다', () => {
    const rich = calculateSEOScore({
      content: RICH_CONTENT,
      title: '제습기 고르는 기준, 10평 기준 용량과 전기세 정리',
      headings: HEADINGS_QA,
      keywords: ['제습기'],
      targetKeyword: '제습기',
      wordCount: 2200,
    });
    const stuffed = calculateSEOScore({
      content: STUFFED_CONTENT,
      title: '제습기 추천 제습기 순위 제습기 후기',
      headings: HEADINGS_PLAIN,
      keywords: ['제습기'],
      targetKeyword: '제습기',
      wordCount: 2200,
    });
    expect(rich.totalScore).toBeGreaterThan(stuffed.totalScore);
  });

  it('충실도 점수: 수치·단위+근거+질문형 소제목이 있으면 높고, 빈약하면 낮다', () => {
    const rich = calculateSEOScore({
      content: RICH_CONTENT, title: '제습기 기준', headings: HEADINGS_QA,
      keywords: ['제습기'], targetKeyword: '제습기', wordCount: 2000,
    });
    const bland = calculateSEOScore({
      content: '제습기는 좋습니다. 여름에 유용합니다. 습기를 잡아줍니다. 추천합니다.',
      title: '제습기 기준', headings: HEADINGS_PLAIN,
      keywords: ['제습기'], targetKeyword: '제습기', wordCount: 2000,
    });
    expect(rich.fulfillment).toBeGreaterThanOrEqual(10);
    expect(bland.fulfillment).toBeLessThanOrEqual(4);
  });

  it('과밀(>4%)은 강벌점 + 스팸 경고, 저밀도는 거의 무벌점 (스터핑 장려 문구 제거)', () => {
    const stuffed = calculateSEOScore({
      content: STUFFED_CONTENT, title: '제습기 추천', headings: HEADINGS_PLAIN,
      keywords: ['제습기'], targetKeyword: '제습기', wordCount: 500,
    });
    expect(stuffed.keywordDensity).toBeLessThanOrEqual(3);
    expect(stuffed.strategy).toContain('과밀');
    // 옛 스터핑 장려 문구는 어떤 경우에도 안 나온다
    const lowDensity = calculateSEOScore({
      content: '오늘은 여름 습기 관리 이야기를 해 보겠습니다. 제습기 이야기도 잠깐 나옵니다. ' + '일반적인 생활 팁을 위주로 정리했습니다. '.repeat(20),
      title: '여름 습기 관리', headings: HEADINGS_PLAIN,
      keywords: ['제습기'], targetKeyword: '제습기', wordCount: 1500,
    });
    expect(lowDensity.strategy).not.toContain('키워드를 더 자주');
    expect(lowDensity.keywordDensity).toBeGreaterThanOrEqual(12); // 저밀도 무벌점
  });

  it('총점은 100을 넘지 않고 fulfillment 필드가 반환된다 (하위호환)', () => {
    const r = calculateSEOScore({
      content: RICH_CONTENT, title: '제습기 고르는 기준, 10평 기준 용량과 전기세',
      headings: HEADINGS_QA, keywords: ['제습기'], targetKeyword: '제습기', wordCount: 2500,
    });
    expect(r.totalScore).toBeLessThanOrEqual(100);
    expect(typeof r.fulfillment).toBe('number');
    expect(typeof r.strategy).toBe('string');
  });
});
