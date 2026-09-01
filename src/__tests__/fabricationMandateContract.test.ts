import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * [2026-09-01] 근거 없는 것을 "반드시" 로 요구하던 자리들.
 *
 * 60개 에이전트 전수 조사에서 55건을 제기하고 45건을 기각해 남은 10건 중,
 * 배선 추적까지 확인된 넷을 잠근다. 넷 다 같은 모양이다 —
 * 프롬프트가 입력 자료로는 채울 수 없는 것을 필수로 요구하고,
 * 그래서 규칙을 지키는 유일한 방법이 지어내기가 된다.
 *
 * 정량 강제 자체가 나쁜 게 아니다. 자료로 채울 수 있으면 정상이다.
 * 여기서 잠그는 것은 "자료에 없어도 개수를 채워라" 뿐이다.
 */

const ROOT = resolve(__dirname, '..');
const read = (rel: string) => readFileSync(resolve(ROOT, ...rel.split('/')), 'utf-8').replace(/\r/g, '');

describe('storyteller — 겪지 않은 감각을 소제목 수만큼 요구하지 않는다', () => {
  const code = read('promptLoader.ts');
  const storyteller = code.slice(code.indexOf('  storyteller: {'), code.indexOf('  expert_review: {'));

  /*
   * 이 톤은 사용자가 고르지 않아도 켜진다 — contentTonePolicy.ts:35·94-95 가
   * 여행 카테고리에 자동 배정한다. 그리고 promptLoader:714 가 페르소나와 룰을
   * 프롬프트 앞뒤로 두 번 주입한다("최종 가중치 부여").
   *
   * 그 상태에서 같은 조립물의 homefeed/travel.prompt 는 정반대를 말한다:
   * "풍경·냄새·소리·현지 분위기는 사용자 메모나 자료의 서술에 실재할 때만".
   * 여행 글은 어느 쪽으로 가도 위반이었다.
   */
  it('소제목당 감각 개수 하한을 두지 않는다', () => {
    expect(storyteller).not.toMatch(/소제목당 시각 외 감각/u);
    expect(storyteller).not.toMatch(/오감\(시각 외 1개\) 반드시 포함/u);
  });

  it('감각은 자료·메모에 실재할 때만이라고 조건을 건다', () => {
    expect(storyteller).toMatch(/자료·메모에 실재하는 감각만/u);
    expect(storyteller).toMatch(/근거가 있을 때만/u);
  });

  it('본문 절반을 행동·감정으로 채우라는 자수 비율 강제를 두지 않는다', () => {
    expect(storyteller).not.toMatch(/Before:During:After 자수 비율/u);
    expect(storyteller).not.toMatch(/30:50:20/u);
  });

  it('행동 서사는 실제 행동 기록이 있을 때만이라고 조건을 건다', () => {
    expect(storyteller).toMatch(/실제 행동 기록이 있을 때만/u);
  });
});

describe('페르소나 forbidden 이 rule 과 반대를 가리키지 않는다', () => {
  const code = read('promptLoader.ts');

  /*
   * forbidden 에 "1단락에 Q-A 패턴 0개" 가 있었다 — 모든 단락에 Q-A 를 넣으라는 뜻이다.
   * 같은 톤의 rule 은 "소제목마다 기계적으로 넣지 않는다" 였다. 정반대다.
   * 단락 수만큼 질문을 채우려면 독자가 묻지 않을 질문을 지어내야 한다.
   * 개수는 rule 이 정하고, forbidden 은 0인 경우만 막는다.
   */
  it('Q-A 는 단락 단위가 아니라 글 전체 단위로만 하한을 둔다', () => {
    expect(code).not.toMatch(/1단락에 Q-A 패턴 0개/u);
    expect(code).toMatch(/글 전체에 Q-A 패턴 0개/u);
    expect(code).toMatch(/Q\+A 패턴은 독자가 실제로 물을 지점에만/u);
  });
});

describe('날짜 앵커 — 모델은 오늘 날짜를 모른다', () => {
  const brief = read('prompts/shared/fact-brief-header.prompt');
  const seoBase = read('prompts/seo/base.prompt');

  /*
   * seo/base.prompt F1 이 "○월 ○일 기준 작성일 못박기 금지" 라고 선언하는데,
   * 뒤에 붙는 fact-brief-header 가 "첫 문장을 YYYY년 M월 D일 기준으로 열어라" 였다.
   * 조립 순서상 뒤가 이긴다(promptLoader:289~297, seo·mate 전 카테고리 무조건 주입).
   * 본문 프롬프트에 현재 날짜는 주입되지 않으므로 채우는 방법은 추정뿐이었다.
   */
  it('금지 쪽(F1)은 그대로 살아 있다', () => {
    expect(seoBase).toMatch(/"○월 ○일 기준" 작성일 못박기 금지/u);
  });

  it('날짜 앵커를 무조건 요구하지 않는다', () => {
    expect(brief).not.toMatch(/★ 첫 문장을 "YYYY년 M월 D일 기준," 으로 연다/u);
  });

  it('자료에 날짜가 있을 때만 쓰고, 없으면 쓰지 말라고 명시한다', () => {
    expect(brief).toMatch(/입력 자료에 시행일·개정일·기준일이 있으면/u);
    expect(brief).toMatch(/자료에 날짜가 없으면 날짜 앵커를 쓰지 말고/u);
    expect(brief).toMatch(/너는 오늘 날짜를 모른다/u);
  });
});

describe('mate FAQ — 되묻는 질문이 없는 주제에 FAQ 를 만들지 않는다', () => {
  const mate = read('prompts/mate/base.prompt');
  const seoBase = read('prompts/seo/base.prompt');

  /*
   * mate 는 seo/base + mate/base 로 조립된다(promptLoader:189~191).
   * 앞의 R0-3 은 "FAQ는 실제 반복 질문이 있을 때만" 인데
   * 뒤의 mate 가 "4~6개" 와 "빠지면 안 됩니다" 로 개수를 강제했다.
   * 사건 정리 · 인물 근황 글에는 되묻는 질문이 없으므로 지어낼 수밖에 없었다.
   */
  it('앞선 조건부 규칙(R0-3)은 그대로 살아 있다', () => {
    expect(seoBase).toMatch(/FAQ는 실제 반복 질문이 있을 때만 넣고/u);
  });

  it('개수를 무조건 채우라고 하지 않는다', () => {
    expect(mate).not.toMatch(/FAQ는 4~6개를 작성합니다/u);
    expect(mate).not.toMatch(/FAQ: 실제 검색자가 이어서 물을 법한 질문 4~6개/u);
  });

  it('자료가 답을 가진 질문이 있을 때만이라고 조건을 건다', () => {
    expect(mate).toMatch(/자료가 답을 가진 질문이 실제로 있을 때만/u);
    expect(mate).toMatch(/개수를 채우려고 아무도 묻지 않을 질문을 만들지 않습니다/u);
  });

  it('FAQ 를 필수 골격에서 뺀다 — 주제에 해당할 때만', () => {
    expect(mate).not.toMatch(/주의점, FAQ는 빠지면 안 됩니다/u);
    expect(mate).toMatch(/그 주제에 실제로 해당할 때만 넣습니다/u);
  });
});
