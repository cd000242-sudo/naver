import { describe, expect, it } from 'vitest';
import { buildFullPrompt } from '../promptLoader';
import { buildContentJsonOutputFormat } from '../contentJsonPromptFormat';
import { buildEvidenceAndIntentFinalContract } from '../content/evidenceIntegrity';
import { buildSituationDepthContract } from '../content/situationDepthContract';

// [2026-09-22 P1 홈판 병합] Canonical-rule coverage + repetition budget for the homefeed writer prompt.
// The full runtime prompt (system + JSON format + user-part contracts) is composed the same way
// contentGenerator does, for an issue category (연예) and a practical category (일상). Each quality
// rule must exist, and each canonical rule must not be restated more than the budget allows.

function composeHomefeedPrompt(categoryHint: string): string {
  const system = buildFullPrompt('homefeed', categoryHint, false, 'friendly');
  const format = buildContentJsonOutputFormat({
    contentMode: 'homefeed',
    mode: 'homefeed',
    source: { rawText: '원본 본문입니다.', title: '제목 참고', metadata: { keywords: ['테스트 키워드'] }, categoryHint } as never,
    title: '제목 참고',
    rawText: '테스트 원문 '.repeat(50),
    primaryKeyword: '테스트 키워드',
    subKeywords: '',
    minChars: 2000,
  });
  const contract = buildEvidenceAndIntentFinalContract({ contentMode: 'homefeed', rawText: '자료 '.repeat(100) } as never);
  const depth = buildSituationDepthContract({ rawText: '자료 원문 '.repeat(40) });
  return `${system}\n\n${format}\n\n${depth}\n\n${contract}`;
}

const count = (text: string, re: RegExp): number => (text.match(re) || []).length;
/** Prose only — JSON schema placeholders like `"제목 1 (33~42자)"` are field hints, not restated rules. */
const prose = (text: string): string => text.split('\n').filter((l) => !/"(text|selectedTitle)"\s*:/.test(l)).join('\n');

describe.each([['연예', 'issue-story'], ['일상', 'practical']])('homefeed prompt (%s)', (category) => {
  const prompt = composeHomefeedPrompt(category);

  it('contains every required quality rule at least once', () => {
    const required: Array<[string, RegExp]> = [
      ['검색/독자 의도', /독자가 무엇을 알고 싶은가|독자가 실제로 겪는 상황|readerSituation/],
      ['제목 약속', /TITLE PAYOFF|제목이 던진 질문|제목이 만든 궁금증/],
      ['팩트 유지', /자료 외 사실|입력에 없는 숫자|없는 숫자·날짜·금액/],
      ['근거 있는 숫자 사용', /자료에 있는 숫자·날짜·기관명은 빠뜨리지 않고|근거 있는 구체적 숫자/],
      ['출처 규칙', /기관\/매체 이름을 그대로|발언자를 밝힌다|출처 표시가 필요한 주장|출처를 구분해/],
      ['도입부', /\[GAMMA-7\]/],
      ['소제목 흐름', /\[HEADINGS: 홈판\]|소제목은 서로 다른 역할/],
      ['CTA', /\[RETENTION\]/],
      ['FAQ', /FAQ/],
      ['모바일 가독성', /\[MOBILE\]|모바일 문단은 2~3문장/],
      ['중복 억제', /반복하지 않는다|되풀이하지 않는다|같은 상투어·전환문/],
    ];
    for (const [name, re] of required) {
      expect(re.test(prompt), `${name} 규칙이 최종 프롬프트에 없다`).toBe(true);
    }
  });

  it('declares one canonical block each for title, intro and CTA', () => {
    // declarations only — pointer lines ("[TITLE](HOMEFEED_TITLE_RULES) 정본을 따른다") may reference the name
    expect(count(prompt, /정본 \(HOMEFEED_TITLE_RULES\)/g)).toBe(1);
    expect(count(prompt, /정본 \(HOMEFEED_INTRO_RULES\)/g)).toBe(1);
    expect(count(prompt, /정본 \(HOMEFEED_CTA_RULES\)/g)).toBe(1);
  });

  it('does not restate canonical rules beyond the repetition budget', () => {
    const budgets: Array<[string, RegExp, number]> = [
      ['CTA 하나만/복합 CTA 금지', /(모두|동시에) 요구하지 않는다|복합 CTA/g, 4],
      ['첫 3문장 도입 스펙', /첫 3문장/g, 3],
      ['제목 길이 값', /33~42/g, 4],
      ['옛 제목 길이 값(충돌)', /28~42/g, 0],
      ['정체 공개 위치', /8~20%/g, 3],
      ['답부터/핵심 답 먼저', /답부터 준다|핵심 답을 먼저/g, 4],
      ['클릭베이트 금지어 목록', /충격·(경악|소름)/g, 3],
      ['진행 안내 금지', /알아보겠습니다/g, 4],
    ];
    for (const [name, re, max] of budgets) {
      const n = count(prose(prompt), re);
      expect(n, `${name} 반복 ${n}회 > 허용 ${max}회`).toBeLessThanOrEqual(max);
    }
  });

  it('keeps hard rules hard but does not threaten style preferences with 0점/폐기', () => {
    // style-only sentences must not carry score threats; fact/title/JSON gates may.
    const styleThreats = prompt.match(/(감탄사|어미|말투|문체)[^\n]{0,40}(0점|폐기)/g) || [];
    expect(styleThreats, styleThreats.join(' | ')).toHaveLength(0);
  });
});
