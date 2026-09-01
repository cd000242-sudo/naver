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

describe('체험 표기 오탐 — 라이브에서 잡힌 것들', () => {
  /*
   * [2026-09-01 라이브 로그] 냉장고 글에서 이 문장이 경험 문장으로 잡혔다.
   *   "성에가 보이면 전원을 먼저 끄고 내부 음식물을 모두 꺼내는 순서가 기본입니다."
   *
   * 체험 표기 목록의 `가\s*보` 가 "성에'가 보'이면" 에 걸렸다.
   * "갔다 보다" 를 잡으려던 규칙이 조사 + 보이다 에 걸린 것이다.
   * 앞서 "신고"(申告) 오탐을 잡을 때와 같은 실수를 다른 자리에서 또 했다.
   */
  it('"~가 보이면" 을 체험으로 읽지 않는다', () => {
    const body = '성에가 보이면 전원을 먼저 끄고 내부 음식물을 모두 꺼내는 순서가 기본입니다.';
    expect(auditExperienceSentences(body).checked).toBe(0);
  });

  it('"눈에 보이는" 같은 표현도 체험이 아니다', () => {
    expect(auditExperienceSentences('남은 양이 보이게 두면 중복 구매를 줄이기 쉽습니다.').checked).toBe(0);
  });

  it('진짜 방문 체험은 여전히 잡는다', () => {
    const body = '지난주에 매장에 가 보았는데 재고가 없었습니다.';
    expect(auditExperienceSentences(body).checked).toBe(1);
  });
});

describe('체험 표기 오탐 — 전수 점검에서 나온 것들', () => {
  /*
   * [2026-09-01] 흔한 정보 문장 12개를 통과시켜 보니 넷이 더 걸렸다.
   * 짧은 조각으로 만든 규칙은 조사 · 의존명사에 걸린다.
   *
   *   "겪는 사람이 많다"       `겪` — 남이 겪는 것도 잡혔다
   *   "들어 보관하지 말고"      `들어 보` — 들다 + 보관
   *   "우리 집 근처 마트"       `우리 집` — 소유 표현이지만 여기선 위치 설명
   *   "한 주 살아온 기록"       `주 살아` — 한 주(week) + 살아오다
   */
  const notFirsthand = (s: string) => expect(auditExperienceSentences(s).checked).toBe(0);

  it('남이 겪는 일은 내 체험이 아니다', () => {
    notFirsthand('비염을 겪는 사람이 많다고 알려져 있습니다.');
  });

  it('"들어 보관하다" 를 "들어 보다" 로 읽지 않는다', () => {
    notFirsthand('무거운 것은 들어 보관하지 말고 눕혀 두세요.');
  });

  it('"한 주 살아온" 을 거주 체험으로 읽지 않는다', () => {
    notFirsthand('한 주 살아온 기록을 표로 정리하면 흐름이 보입니다.');
  });

  it('진짜 체험은 여전히 잡는다 — 완화가 아니다', () => {
    for (const s of [
      '제가 직접 겪어 보니 첫 이틀이 가장 힘들었습니다.',
      '한 달 살아 보니 소음이 신경 쓰였습니다.',
      '3주 써보니 손목이 아팠습니다.',
    ]) {
      expect(auditExperienceSentences(s).checked).toBe(1);
    }
  });
});

describe('"우리 집" — 소유와 위치를 가른다', () => {
  it('"우리 집 근처" 는 위치 설명이지 소유 체험이 아니다', () => {
    expect(auditExperienceSentences('우리 집 근처 마트에서도 판매합니다.').checked).toBe(0);
  });

  it('"우리 집 건" 같은 소유 표현은 체험으로 잡는다', () => {
    expect(auditExperienceSentences('우리 집 건 3년째 쓰고 있는데 아직 멀쩡합니다.').checked).toBe(1);
  });
});
