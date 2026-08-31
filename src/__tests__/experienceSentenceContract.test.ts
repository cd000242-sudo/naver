import { describe, expect, it } from 'vitest';

import {
  EXPERIENCE_CONTRACT_PARTS,
  checkExperienceSentence,
  auditExperienceSentences,
} from '../content/experienceSentenceContract';

/**
 * [2026-08-31] AI 경험 생성의 품질 계약.
 *
 * 사장님 요구가 두 겹이다.
 *   "경험이 필요한 글 있잖아, 리빙이나 후기 같은 거. 그런 걸 AI 로 경험을 생성해도
 *    사용자가 책임지게끔 하면 안 되니? 사용자마저 경험이 없다면 어중이떠중이 글이
 *    되는 것보다는 낫다고 보는데."
 *   "말도 안 되는 경험 말고 공감이 가는 경험이고 (…) 약간의 과장은 괜찮은데
 *    과한 과장은 티가 나고 누가 봐도 AI 가 적었구나라고 티가 확실히 나.
 *    네이버 봇도 그걸 알 테고."
 *
 * 그래서 "경험을 넣는다" 가 아니라 "어떤 형태의 경험만 넣는다" 로 짠다.
 * 기준은 사장님이 든 나이키 예시 그대로다.
 *
 *   남들 다 하는 말   "통풍 잘되고 가볍고 오래 달려도 괜찮다"        — 검색하면 나온다. 값이 없다.
 *   값이 있는 문장    "내성발톱이 있어서 오래 못 뛰는데, 완전히 안 아픈 건
 *                     아니지만 다른 걸 신을 때에 비해서는 좀 낫더라"
 *
 * 뒷문장에는 셋이 있다.
 *   ① 제약  "내성발톱이 있어서"          — 남이 못 쓰는 조건. 신박함의 출처.
 *   ② 유보  "완전히 안 아픈 건 아니지만"  — 좋기만 하면 광고다. 흠이 섞여야 사람이다.
 *   ③ 비교  "다른 걸 신을 때에 비해"      — 절대 단정이 아니라 상대 비교.
 *
 * 이 셋을 강제하면 과장이 형태적으로 못 들어온다. "인생이 바뀌었다" 에는
 * 제약도 유보도 비교도 넣을 자리가 없다. 금지어 목록으로 막는 것보다 튼튼하다.
 *
 * 노출 근거도 같은 방향이다. 네이버 홈피드 MDE 랭커는 클릭 확률과 함께
 * 체류시간 기반 만족 확률을 예측한다(D2 2025-06). 과장된 경험은 클릭은 되고
 * 읽다가 이탈하므로, 클릭만 잘 되는 글이 오히려 깎인다.
 *
 * 이 파일은 경고만 낸다 — 발행을 막지 않는다.
 */
describe('3요소 계약', () => {
  it('세 요소를 이름으로 노출한다', () => {
    expect(EXPERIENCE_CONTRACT_PARTS).toEqual(['constraint', 'reservation', 'comparison']);
  });

  it('사장님 나이키 문장은 통과한다 — 이게 기준선이다', () => {
    const sentence = '저는 내성발톱이 있어서 오래 못 뛰는데, 완전히 안 아픈 건 아니지만 다른 걸 신을 때보다는 좀 나았어요.';
    const result = checkExperienceSentence(sentence);
    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it('남들 다 하는 말은 세 요소가 다 빠져서 걸린다', () => {
    const result = checkExperienceSentence('통풍이 잘되고 가벼워서 오래 달려도 좋았어요.');
    expect(result.ok).toBe(false);
    expect(result.missing).toContain('constraint');
    expect(result.missing).toContain('reservation');
    expect(result.missing).toContain('comparison');
  });

  it('과장 문장은 세 요소를 채울 자리가 없어서 걸린다', () => {
    const result = checkExperienceSentence('3주 써보니 인생이 완전히 달라졌습니다.');
    expect(result.ok).toBe(false);
  });
});

describe('요소별 인식', () => {
  it('제약은 조건 표현으로 알아본다', () => {
    for (const s of [
      '손목이 약한 편이라 무거운 건 오래 못 들어요.',
      '평발이라서 쿠션 없는 신발은 30분이 한계였어요.',
      '자취방이 좁다 보니 큰 건 놓을 자리가 없더라고요.',
    ]) {
      expect(checkExperienceSentence(s).missing).not.toContain('constraint');
    }
  });

  it('유보는 부분 인정 표현으로 알아본다', () => {
    for (const s of [
      '완전히 해결된 건 아니지만 견딜 만했어요.',
      '아주 조용하지는 않아도 신경 쓰일 정도는 아니었어요.',
      '단점이 없는 건 아닌데 그럭저럭 쓸 만합니다.',
    ]) {
      expect(checkExperienceSentence(s).missing).not.toContain('reservation');
    }
  });

  it('비교는 대조 표현으로 알아본다', () => {
    for (const s of [
      '전에 쓰던 것보다는 나았어요.',
      '다른 제품에 비해 손이 덜 갔습니다.',
      '이전 모델과 비교하면 확실히 가벼웠어요.',
    ]) {
      expect(checkExperienceSentence(s).missing).not.toContain('comparison');
    }
  });
});

describe('본문 감사', () => {
  const withExperience = (body: string) => auditExperienceSentences(body);

  it('경험 문장이 아닌 정보 문장은 검사 대상이 아니다', () => {
    const body = '청약통장 납입 한도는 월 25만 원입니다.\n\n가입 기간에 따라 순위가 갈립니다.';
    expect(withExperience(body).checked).toBe(0);
  });

  it('계약을 어긴 경험 문장을 집어낸다', () => {
    const body = '제품 설명은 이렇습니다.\n\n3주 써보니 인생이 달라졌어요.';
    const report = withExperience(body);
    expect(report.checked).toBe(1);
    expect(report.violations).toHaveLength(1);
    expect(report.violations[0].sentence).toContain('3주 써보니');
  });

  it('경험 문장이 너무 많으면 그 자체가 AI 티라고 알린다', () => {
    const line = '제가 직접 써봤는데 손목이 약한 편이라 무겁긴 했지만 전에 쓰던 것보다는 나았어요.';
    const report = withExperience(Array.from({ length: 9 }, () => line).join('\n\n'));
    expect(report.tooMany).toBe(true);
  });

  it('한두 줄 섞인 정도는 많다고 하지 않는다', () => {
    const body = [
      '기본 정보는 이렇습니다.',
      '제가 써봤을 때는 손목이 약한 편이라 조금 무거웠지만 전에 쓰던 것보다는 나았어요.',
      '규격은 표에 정리했습니다.',
    ].join('\n\n');
    expect(withExperience(body).tooMany).toBe(false);
  });

  it('빈 입력에 던지지 않는다', () => {
    expect(() => auditExperienceSentences('')).not.toThrow();
    expect(auditExperienceSentences(undefined as never).checked).toBe(0);
  });
});

describe('오탐 방지 — 체험이 아닌 문장을 체험으로 몰지 않는다', () => {
  it('"신고"(申告)를 신발 신은 일로 읽지 않는다', () => {
    // 세금 · 지원금 글에 흔한 단어라, 여기서 걸리면 정보 문장이 통째로 경험으로 몰린다.
    const body = '종합소득세 신고 기한은 5월 31일입니다.\n\n신고 대상은 홈택스에서 확인합니다.';
    expect(auditExperienceSentences(body).checked).toBe(0);
  });

  it('남의 말을 옮기는 전달 문장은 체험이 아니다', () => {
    const body = '후기에서 이 얘기가 반복되더라고요.\n\n공고문을 살펴보니 단서가 붙어 있습니다.';
    expect(auditExperienceSentences(body).checked).toBe(0);
  });
});
