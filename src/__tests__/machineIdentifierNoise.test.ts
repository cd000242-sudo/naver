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
  /*
   * [정정] 처음에는 '3대'·'4단계'·'3가지' 도 쓰레기로 박았다. 틀렸다 —
   * 차 3대, 절차 4단계는 진짜 사실이다. 실측 글에서 쓰레기처럼 보였던 것은
   * 그 낱말들이 UUID 옆 잡동사니 구간에 있었기 때문이지 낱말 자체의 문제가 아니었다.
   * 한 글에서 본 맥락을 낱말의 성질로 굳히면 그게 하드코딩이다.
   */
  it('라틴 한 글자 접미는 사실이 아니다 — UUID 조각과 통신 규격 표기', () => {
    const facts = extractCoreFacts('4e 98d 5G와 6G처럼');
    for (const junk of ['4e', '98d', '5G', '6G']) {
      expect(facts).not.toContain(junk);
    }
  });

  it('숫자 + 한글 단위는 살린다 — 맥락이 나빴을 뿐 낱말은 사실이다', () => {
    const facts = extractCoreFacts('차량 3대와 절차 4단계를 확인했습니다');
    expect(facts).toContain('3대');
    expect(facts).toContain('4단계');
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
    // 걸러야 할 것은 UUID 조각과 라틴 한 글자뿐이다.
    for (const junk of ['4e', '4fee', '98d', '2f', '1898c', '5G', '6G']) {
      expect(facts).not.toContain(junk);
    }
  });
});

describe('실측 네 편에 없던 단위도 살아야 한다 — 하드코딩 방지', () => {
  /*
   * 사장님 지적: "내가 준 글을 분석한 기반은 되어야 되지만
   *              그게 하드코딩이 되어버리면 안 된다".
   *
   * 처음 고칠 때 단위를 나열했다가 되돌렸다. 나열하면 내가 떠올린 것만 들어간다 —
   * 요리 글의 "2큰술", 한약의 "5첩", 장롱의 "3자" 는 실측 네 편에 없었다는 이유로
   * 없는 단위가 된다. 이 테스트는 그 목록에 한 번도 적힌 적 없는 단위를 쓴다.
   * 여기가 빨개지면 누군가 구조 규칙을 나열로 되돌린 것이다.
   */
  it.each([['2큰술'], ['4인분'], ['5첩'], ['3자'], ['2관'], ['7모'], ['3꼬치']])(
    '%s 처럼 코드에 적힌 적 없는 한글 단위도 사실로 잡는다',
    (token) => {
      expect(extractCoreFacts(`재료는 ${token} 입니다`)).toContain(token);
    },
  );

  it('라틴 한 글자는 계속 막는다 — 5G 가 돌아오면 그 문장도 돌아온다', () => {
    for (const junk of ['5G', '6G', '4e', '3T']) {
      expect(extractCoreFacts(`표기 ${junk} 가 있다`)).not.toContain(junk);
    }
  });

  it('한글 접미가 길면 단위가 아니다 — 문장 조각을 사실로 올리지 않는다', () => {
    const facts = extractCoreFacts('3번째로중요한것은');
    expect(facts.join(' ')).not.toContain('중요한것은');
  });
});
