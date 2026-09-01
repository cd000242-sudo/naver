import { describe, expect, it } from 'vitest';

import { stripSourceNoise } from '../content/sourceNoiseFilter';
import { extractCoreFacts } from '../content/sourceFidelityCheck';

/**
 * [2026-09-02] 크롤 쓰레기가 "반드시 다뤄야 할 사실"이 되어 본문에 실렸다.
 *
 * 실측 — 냉장고 글 본문 원문:
 *   "2026년 8월 31일 기사 본문 끝에는 4e4fee07-6480-4f15-9023-98d2f1898c72라는
 *    식별 문자열과 함께 99번째, 100번째, 3대, 3일, 1개월, 75%만, 4단계 … 라는
 *    표기가 섞여 있습니다."
 *
 * 사슬이었다. 세 고리가 순서대로 물려 있다:
 *   1. sourceNoiseFilter 에 기계 식별자 규칙이 없어 UUID 가 자료에 그대로 남고
 *   2. sourceFidelityCheck 의 열린 문자 클래스 [가-힣A-Za-z…]+ 가 그것을
 *      4e · 4fee · 98d · 2f 로 잘라 "사실"로 승격시키고
 *   3. sourceFactChecklist 가 "이 목록을 다 다뤄야 끝난 글" 계약을 씌운다.
 * "4e" 를 문장에 녹일 방법이 없으니, 모델이 계약을 지키는 유일한 방법이
 * 그것을 독자에게 설명하는 것이었다. 침구 글의 "5G와 6G처럼 침구 선택과 무관한
 * 표기는 판단 재료가 아닙니다" 도 같은 자리에서 나왔다.
 *
 * 자리 독식도 있었다 — 상한 30칸 중 22칸이 쓰레기로 차면 진짜 고유명사는 8칸만 받는다.
 *
 * 1·2번 고리를 끊는다. 3번 계약은 목록이 깨끗해지면 그대로 둬도 된다.
 */

const UUID = '4e4fee07-6480-4f15-9023-98d2f1898c72';

describe('기계 식별자를 자료에서 걷어낸다', () => {
  it('UUID 를 지운다', () => {
    const out = stripSourceNoise(`본문입니다. ${UUID} 이어집니다.`);
    expect(out.text).not.toContain(UUID);
    expect(out.text).toContain('본문입니다');
    expect(out.text).toContain('이어집니다');
  });

  it('긴 hex 해시를 지운다', () => {
    const out = stripSourceNoise('본문 a3f9c2e81b7d4a6f 계속');
    expect(out.text).not.toContain('a3f9c2e81b7d4a6f');
  });

  it('순수 숫자는 건드리지 않는다 — 연도·전화번호가 사라지면 안 된다', () => {
    for (const keep of ['2026', '01012345678', '1234567890123456']) {
      expect(stripSourceNoise(`값은 ${keep} 입니다`).text).toContain(keep);
    }
  });

  it('영문 단어는 건드리지 않는다', () => {
    expect(stripSourceNoise('제품명은 Coffee Machine 입니다').text).toContain('Coffee Machine');
  });
});

describe('숫자 사실 추출이 쓰레기를 승격시키지 않는다', () => {
  it('UUID 조각을 사실로 올리지 않는다', () => {
    const facts = extractCoreFacts(UUID);
    for (const junk of ['4e', '4fee', '98d', '2f', '1898c']) {
      expect(facts).not.toContain(junk);
    }
  });

  it('의미 없는 세는말·기호를 사실로 올리지 않는다', () => {
    const facts = extractCoreFacts('3대 4단계 1단계 3가지 5G와 6G처럼');
    for (const junk of ['3대', '4단계', '1단계', '3가', '5G', '6G처럼']) {
      expect(facts).not.toContain(junk);
    }
  });

  it('진짜 수치는 그대로 살린다 — 이게 깨지면 글이 앙상해진다', () => {
    const facts = extractCoreFacts('25만원짜리 제품이 2.8% 절약되고 3일 뒤 1개월 무상, 5분 걸립니다.');
    for (const real of ['25만원', '2.8%', '3일', '1개월', '5분']) {
      expect(facts, `진짜 수치 ${real} 가 사라졌다`).toContain(real);
    }
  });

  it('실측 문자열 전체에서 쓰레기 비중이 뒤집힌다', () => {
    const raw = `냉장고 청소. ${UUID} 99번째 3대 4단계 3가지 5G와 6G처럼 `
      + '무관한 것도 있습니다. 25만원 제품이 2.8% 절약, 3일 걸립니다.';
    const facts = extractCoreFacts(stripSourceNoise(raw).text);
    const real = facts.filter((f) => ['25만원', '2.8%', '3일'].includes(f));
    expect(real).toHaveLength(3);
    // 고치기 전에는 15개 중 12개가 쓰레기였다. 이제 진짜가 과반이어야 한다.
    expect(real.length * 2).toBeGreaterThan(facts.length);
  });
});
