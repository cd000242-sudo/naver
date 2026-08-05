import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

import { collectUnsupportedFirstPersonClaims } from '../content/evidenceIntegrity';

/**
 * [2026-08-05] 판단 1인칭 개방 — 체험만 닫고 판단·조사·정리·권유·전달을 연다.
 *
 * 발견된 병: 카테고리 26파일 전부가 "메모가 있을 때만 [체험] 1인칭"만 말하고,
 * **판단 1인칭을 허용하는 문장이 홈판 base·최후미 계약 어디에도 없었다.**
 * 글 쓰는 주체는 실제로 자료를 찾고 대조하고 판단했다 — 그 행위의 1인칭은
 * 날조가 아닌데, 아무도 허용해주지 않아 모델이 1인칭 전체를 회피했다.
 * 결과가 안내문체다.
 *
 * 개방은 "의미"가 아니라 "표기(어형)" 단위다. 근거 검출기가 어형으로 판정하기
 * 때문이다 — "제가 직접 찾아보니"는 조사 행위지만 `직접` 매칭으로 하드 실패
 * → 유료 재생성. 그래서 지시문이 권하는 어형 자체가 검출기를 통과해야 한다.
 */

const humanWriting = readFileSync(
  new URL('../prompts/shared/human-writing-anti-pattern.prompt', import.meta.url), 'utf8');
const homefeedBase = readFileSync(
  new URL('../prompts/homefeed/base.prompt', import.meta.url), 'utf8');
const seoBase = readFileSync(new URL('../prompts/seo/base.prompt', import.meta.url), 'utf8');
const evidenceSrc = readFileSync(new URL('../content/evidenceIntegrity.ts', import.meta.url), 'utf8');

describe('검출기 대칭 — 지시문이 권하는 어형이 게이트를 통과한다', () => {
  it.each([
    ['제 기준으로는 여기가 갈림길이에요. 조건이 소득 기준과 가입 시점 둘로 갈리거든요.'],
    ['찾아보니 조건이 두 갈래로 갈리더라구요.'],
    ['정리하다 보니 A랑 B가 계속 엇갈렸어요.'],
    ['저라면 콘센트 위치부터 재보고 결정하겠어요.'],
    ['후기에서 설치가 어렵다는 말이 반복되더라구요.'],
  ])('허용 어형 "%s" 은 근거 없이도 걸리지 않는다', (sentence) => {
    expect(collectUnsupportedFirstPersonClaims(sentence, false)).toEqual([]);
  });

  it.each([
    ['제가 직접 공고문을 열어봤어요.'],
    ['제가 비교해 봤는데 이쪽이 낫습니다.'],
  ])('금지 표기 "%s" 는 여전히 걸린다 (게이트 무변경 증명)', (sentence) => {
    expect(collectUnsupportedFirstPersonClaims(sentence, false).length).toBeGreaterThan(0);
  });
});

describe('패치 A — human-writing §4 가 판단 1인칭을 연다', () => {
  it('허용 5종을 명시한다', () => {
    for (const kind of ['판단', '조사', '정리', '권유', '전달']) {
      expect(humanWriting, `${kind} 유형이 명시돼야 한다`).toContain(`✅ ${kind}`);
    }
  });

  it('체험 금지는 유지한다', () => {
    expect(humanWriting).toMatch(/금지는 체험뿐|체험만 금지|겪은 일.{0,8}에만 금지/);
    expect(humanWriting).toMatch(/작성자 메모에 있을 때만|메모가 있을 때만/);
  });

  it('검출기에 걸리는 표기 3종을 지시문 차원에서 막는다', () => {
    expect(humanWriting).toMatch(/제가 직접~?/);
    expect(humanWriting).toMatch(/~?해 봤는데/);
  });

  it('빈도 상한을 둔다 (후렴 방지)', () => {
    expect(humanWriting).toMatch(/2~4곳/);
  });

  it('판단은 근거 뒤에 온다 (환각 세탁 차단)', () => {
    expect(humanWriting).toMatch(/판단은 근거 뒤/);
  });

  it('기존 검증된 줄은 유지한다', () => {
    expect(humanWriting).toMatch(/근거 표현 없이 그냥 단정/);
    expect(humanWriting).toMatch(/1~2곳/);
  });
});

describe('패치 B — 홈판 base 에 화자 권한이 생긴다', () => {
  it('판단·정리·권유 1인칭을 허용한다', () => {
    expect(homefeedBase).toMatch(/판단·정리·권유는 1인칭으로 쓴다/);
  });

  it('체험 게이트는 유지한다', () => {
    expect(homefeedBase).toMatch(/직접 경험 메모가 있을 때만/);
    expect(homefeedBase).toMatch(/제3자 후기[^\n]*작성자 경험이 아니다/);
  });

  it('양쪽 실패를 함께 명시한다 (회피 방지)', () => {
    // 겪은 척도 실패, 1인칭 전면 회피(안내문)도 실패.
    expect(homefeedBase).toMatch(/안내문이 되는 것[^\n]*실패|둘 다 실패/);
  });
});

describe('패치 C — 최후미 계약이 판단 1인칭을 무효화하지 않는다', () => {
  it('메모 없음 분기가 판단·조사·정리·권유를 허용한다', () => {
    expect(evidenceSrc).toMatch(/판단·조사·정리·권유는 1인칭으로 쓴다/);
  });

  it('체험 금지 문구는 유지한다', () => {
    expect(evidenceSrc).toMatch(/써봤다·가봤다·신청했다·받았다는 1인칭 체험을 만들지 않는다/);
  });

  it('탐지 로직은 무변경이다 (게이트 보존)', () => {
    // 패턴 3종이 그대로 있어야 한다 — 프롬프트 문자열만 바뀌고 판정은 그대로.
    expect(evidenceSrc).toMatch(/FIRST_PERSON_EXPERIENCE_PATTERNS/);
    expect(evidenceSrc).toMatch(/내돈내산/);
  });
});

describe('패치 D — seo base 의 자기모순 예시 제거', () => {
  it('"직접 해결해본" 체험 예시를 모범으로 제시하지 않는다', () => {
    // :222 가 "직접 해보니"를 금지하는데 :554 가 모범 예시로 줬다.
    expect(seoBase).not.toMatch(/직접 해결해본 꿀팁/);
  });
});
