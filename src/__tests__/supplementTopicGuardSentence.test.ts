import { describe, expect, it } from 'vitest';
import {
  isOnTopicForKeyword,
  isPrimaryTopicMaterial,
  scoreTopicMatch,
} from '../content/supplementTopicGuard';

/**
 * [2026-09-05 사용자 실측] 문장형 키워드("제목으로 사용" 흐름)에서 자료 게이트 붕괴.
 *
 * 머리 명사 = 키워드의 마지막 실질 명사 규칙은 명사구("아파트 베란다 창문")용이다.
 * 문장형 키워드에서는 마지막 토큰이 "애매하다면" 같은 서술어라 어떤 자료에도 없어
 * 본류가 0건 — 정답 자료(보관법)까지 곁가지 몫(30%)으로 잘리고, 낱말만 겹치는
 * 중고거래·섬유 폐기물 자료가 그 자리를 채웠다. 문장형이면 머리 판정을 포기하고
 * score(주제어 절반 이상)로만 가른다.
 */
const SENTENCE_KW = '한 번 입은 옷, 옷장에 넣기는 찝찝하고 빨기는 애매하다면 ??';

const STORAGE_DOC = '한 번 입은 옷을 옷장에 바로 넣기 찝찝할 때는 별도 옷걸이에 걸어 하루 통풍시킨 뒤 세탁 여부를 정합니다. 니트는 냄새와 얼룩만 없으면 다시 입어도 됩니다.';
const RESALE_DOC = '중고거래로 산 옷을 그대로 입은 뒤 피부 트러블을 겪었다는 사례가 늘고 있다. 전문가는 세탁 후 착용을 권했다. 옷장에 보관하기 전 소독이 필요하다.';
const WASTE_DOC = '국내 섬유 폐기물은 연간 수십만 톤에 달한다. 버려지는 옷이 늘면서 의류 소비 방식에 대한 지적이 나온다. 한 번 입은 옷도 쉽게 버려진다.';

describe('문장형 키워드 — 본류/곁가지 판정', () => {
  it('정답 자료(보관법)가 본류로 잡힌다 (실사고 회귀: hasHead=false 로 전멸하던 케이스)', () => {
    const match = scoreTopicMatch(STORAGE_DOC, SENTENCE_KW);
    expect(match.hasHead).toBe(true);
    expect(isPrimaryTopicMaterial(match)).toBe(true);
  });

  it('낱말만 겹치는 자료(중고거래)는 통과해도 곁가지에 머문다', () => {
    const match = scoreTopicMatch(RESALE_DOC, SENTENCE_KW);
    expect(isPrimaryTopicMaterial(match)).toBe(false);
  });

  it('주제어가 거의 없는 자료(섬유 폐기물)는 게이트에서 떨어진다', () => {
    expect(isOnTopicForKeyword(WASTE_DOC, SENTENCE_KW)).toBe(false);
  });
});

describe('명사구 키워드 — 기존 머리 명사 판정 유지 (회귀 확인)', () => {
  const NOUN_KW = '아파트 베란다 창문';

  it('머리 명사(창문)를 말하는 자료가 본류다', () => {
    const match = scoreTopicMatch('아파트 베란다 창문 단열 시공 후기와 창문 청소 방법', NOUN_KW);
    expect(match.hasHead).toBe(true);
    expect(isPrimaryTopicMaterial(match)).toBe(true);
  });

  it('머리 명사 없이 곁가지 낱말만 겹치면 본류가 아니다', () => {
    // 실외기 화재 기사: 아파트·베란다는 말하지만 창문은 말하지 않는다.
    const match = scoreTopicMatch('아파트 베란다 실외기 화재 통계가 발표됐다', NOUN_KW);
    expect(match.hasHead).toBe(false);
    expect(isPrimaryTopicMaterial(match)).toBe(false);
  });
});
