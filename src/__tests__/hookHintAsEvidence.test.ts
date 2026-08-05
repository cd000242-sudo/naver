import { describe, expect, it } from 'vitest';

import { hasExplicitFirstPartyEvidence } from '../content/evidenceIntegrity';

/**
 * [2026-08-05] 후킹 도입부에 적은 진짜 경험이 감점되던 문제.
 *
 * 사용자가 후킹란에 자기 경험을 적으면 그 문장은 프롬프트에 들어가 본문에 반영된다.
 * 그런데 hookHint 는 hasExplicitFirstPartyEvidence 의 인정 경로(personalExperience /
 * FIRST_PARTY_METADATA_KEYS / rawText 마커) 어디에도 없었다.
 * 결과: 본문에 1인칭이 나오면 evidenceIntegrity 가 "근거 없는 1인칭"으로 하드 실패시킨다.
 * **앱이 시키는 대로 진짜 경험을 적을수록 점수가 깎이는 구조**였다.
 *
 * 다만 hookHint 를 무조건 근거로 인정하면 반대 위험이 생긴다 —
 * 수사적 훅("이 시간에 검색하셨다면…")만 적어도 1인칭이 글 전체에서 열려,
 * 모델이 재료 없이 체험을 지어낼 license 가 된다.
 *
 * 그래서 **내용 기준**으로 판정한다: 후킹에 실제 경험 표현이 있을 때만 근거로 센다.
 * 판정에는 출력을 감점할 때 쓰는 것과 **같은 패턴**을 쓴다 — 같은 잣대여야 대칭이 맞다.
 */

const base = { title: '테스트', rawText: '자료 본문입니다.' };

describe('후킹 도입부 — 경험이 적혀 있으면 근거로 인정한다', () => {
  it.each([
    ['직접 써보니 물통 위치가 불편했습니다'],
    ['3개월 사용해보니 소음이 줄었습니다'],
    ['제가 직접 신청해 봤는데 서류가 하나 더 필요했습니다'],
    // 주어 없는 "작년에 다녀왔는데"는 감점 패턴에도 안 걸리므로 인정 대상이 아니다(대칭).
    ['제가 작년에 다녀 왔는데 주차가 가장 어려웠습니다'],
  ])('경험 훅 "%s" 는 1차 경험으로 센다', (hook) => {
    expect(hasExplicitFirstPartyEvidence({ ...base, hookHint: hook } as never)).toBe(true);
  });
});

describe('후킹 도입부 — 수사적 훅은 근거가 아니다', () => {
  it.each([
    ['이 시간에 검색하셨다면 이미 공식 안내는 보셨을 겁니다'],
    ['조건이 두 갈래로 갈리는 지점이 있습니다'],
    ['신청 전에 확인할 것이 하나 있습니다'],
    ['가습기 물때 때문에 검색하셨다면 세척 주기부터 갈립니다'],
  ])('수사 훅 "%s" 는 근거로 세지 않는다', (hook) => {
    expect(
      hasExplicitFirstPartyEvidence({ ...base, hookHint: hook } as never),
      '경험이 아닌 훅을 근거로 세면 모델이 체험을 지어낼 license 가 된다',
    ).toBe(false);
  });

  it('빈 후킹은 근거가 아니다', () => {
    expect(hasExplicitFirstPartyEvidence({ ...base, hookHint: '' } as never)).toBe(false);
    expect(hasExplicitFirstPartyEvidence({ ...base } as never)).toBe(false);
  });

  it('너무 짧은 후킹은 근거가 아니다', () => {
    expect(hasExplicitFirstPartyEvidence({ ...base, hookHint: '써봤다' } as never)).toBe(false);
  });
});

describe('후킹 도입부 — 기존 인정 경로는 그대로다 (회귀 방지)', () => {
  it('경험 메모는 계속 근거다', () => {
    expect(hasExplicitFirstPartyEvidence({
      ...base, personalExperience: '3월에 신청했는데 서류를 빠뜨려 반려됐습니다.',
    } as never)).toBe(true);
  });

  it('rawText 마커는 계속 근거다', () => {
    expect(hasExplicitFirstPartyEvidence({
      ...base, rawText: '본문\n\n=== 작성자 직접 사용 메모 ===\n직접 써봤습니다.',
    } as never)).toBe(true);
  });

  it('아무것도 없으면 근거가 아니다', () => {
    expect(hasExplicitFirstPartyEvidence(base as never)).toBe(false);
  });
});
