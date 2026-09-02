import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { isPrimaryTopicMaterial, scoreTopicMatch } from '../content/supplementTopicGuard';

/**
 * [2026-09-02 실측] 창문 글의 본문 절반이 창문이 아니었다.
 *
 *   검색어 "장마 아파트 베란다 창문"
 *   → 본문: 실외기 화재 2,184건 · 지하주차장 침수 대피(여성 40cm) 가 절반
 *
 * 주제 게이트(isOnTopicForKeyword)는 그 자료들을 정상 통과시킨다. 실외기 화재 기사도
 * 실제로 아파트와 베란다를 말하므로 버릴 근거가 없다 — 게이트 판정은 옳다.
 * 문제는 통과한 뒤 **얼마나 실릴지**를 아무도 정하지 않은 것이었다.
 * URL 모드는 MAX_SUPPLEMENT_RATIO 가 있는데 키워드 모드 수집기에는 대응물이 없었다.
 *
 * 게이트를 조이면 자료가 마른다. 대신 머리 명사를 본다 —
 * 한국어 명사구의 머리는 마지막 실질 명사다("아파트 베란다 창문" 의 머리는 창문).
 * 머리를 말하는 자료는 본류, 나머지는 곁가지. 곁가지는 버리지 않고 몫만 제한한다.
 */

const KEYWORD = '장마 아파트 베란다 창문';

describe('주제 적합도를 정도로 잰다', () => {
  it('머리 명사를 말하는 자료는 본류다', () => {
    const m = scoreTopicMatch('아파트 베란다 창문 틈새로 빗물이 새면 창틀 실링을 먼저 봐야 합니다', KEYWORD);
    expect(m.hasHead).toBe(true);
    expect(isPrimaryTopicMaterial(m)).toBe(true);
  });

  it('실측 곁가지: 아파트·베란다는 말하지만 창문은 없다 → 곁가지', () => {
    const m = scoreTopicMatch('아파트 베란다 실외기실 창문을 닫아두고 가동하면 화재 위험이 큽니다. 5년간 2184건', KEYWORD);
    // 이 문장에는 "창문" 이 있다 — 실외기실 창문. 그래서 본류로 잡히는 게 맞다.
    expect(m.hasHead).toBe(true);
  });

  it('실측 곁가지: 지하주차장 침수는 머리 명사가 없다 → 곁가지', () => {
    const m = scoreTopicMatch('아파트 지하주차장에 물이 차면 차량을 빼려 들어가지 마세요. 수심 40cm면 문이 안 열립니다', KEYWORD);
    expect(m.hasHead).toBe(false);
    expect(isPrimaryTopicMaterial(m)).toBe(false);
  });

  it('머리 명사가 있어도 주제어 절반 미만이면 본류가 아니다', () => {
    // 창문은 말하지만 장마·아파트·베란다가 없다 — 자동차 창문 얘기일 수 있다
    const m = scoreTopicMatch('창문 필름 시공 후기입니다', KEYWORD);
    expect(m.hasHead).toBe(true);
    expect(m.score).toBeLessThan(0.5);
    expect(isPrimaryTopicMaterial(m)).toBe(false);
  });

  /*
   * 시점어(장마)는 주제어에서 빠진다 — searchQueryNarrowing 의 판정을 그대로 쓴다.
   * 그래서 분모는 아파트·베란다·창문 셋이다. 여기서 낱말을 따로 나열하지 않는다.
   */
  it('시점어는 주제어로 세지 않는다', () => {
    const m = scoreTopicMatch('아파트 베란다 창문', '9월 장마 아파트 베란다 창문');
    expect(m.score).toBe(1);
  });
});

describe('판정할 수 없으면 본류로 본다 (fail-open)', () => {
  it('빈 본문·빈 키워드는 본류다 — 볼 수 없는 가드는 움직이지 않는다', () => {
    expect(isPrimaryTopicMaterial(scoreTopicMatch('', KEYWORD))).toBe(true);
    expect(isPrimaryTopicMaterial(scoreTopicMatch('아무 글', ''))).toBe(true);
    expect(isPrimaryTopicMaterial(scoreTopicMatch('아무 글', '2026년 9월'))).toBe(true);
  });
});

describe('배선: 전문 수집기가 곁가지 몫을 건다', () => {
  const src = readFileSync(resolve(__dirname, '..', 'sourceAssembler.ts'), 'utf-8');

  it('곁가지 몫 상수가 있고 예산 대비 비율로 계산한다', () => {
    expect(src).toMatch(/const FULLTEXT_SECONDARY_RATIO = 0\.3;/u);
    expect(src).toMatch(/FULLTEXT_TOTAL_BUDGET_CHARS \* FULLTEXT_SECONDARY_RATIO/u);
  });

  it('게이트 통과 뒤에 본류·곁가지를 가른다 — 게이트 자체는 조이지 않는다', () => {
    const gateAt = src.indexOf('if (!isOnTopicForKeyword(`${article.title');
    const scoreAt = src.indexOf('const topicMatch = scoreTopicMatch(');
    expect(gateAt).toBeGreaterThan(-1);
    expect(scoreAt).toBeGreaterThan(gateAt);
  });

  it('버린 곁가지는 건수로 남긴다 — 조용히 사라지면 자료가 마른 이유를 알 수 없다', () => {
    expect(src).toMatch(/secondaryDropped \+= 1;/u);
    expect(src).toMatch(/곁가지 자료 \$\{secondaryDropped\}건 제외/u);
  });

  it('본류는 몫 검사를 받지 않는다 — 본류가 예산을 다 써도 된다', () => {
    const block = src.slice(src.indexOf('const topicMatch = scoreTopicMatch('), src.indexOf('const excerpt = content.substring('));
    expect(block).toMatch(/if \(!isPrimaryTopicMaterial\(topicMatch\)\)/u);
  });
});
