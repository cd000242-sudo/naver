import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildSituationTitleContract } from '../content/situationTitleContract';

/**
 * [2026-09-02] 사장님이 쓰던 CTR 제목 프롬프트에서 두 조항만 가져온다.
 *
 * 55개 에이전트 조사에서 20건이 확정됐지만, 그중 대부분은
 * src/prompts/title/** (38파일 · 3,313줄) 안의 모순이었다. 그 트리는 죽어 있다 —
 * 읽는 코드가 generateTitleOnlyPatch 하나뿐이고
 * CONTENT_ALLOW_PAID_POST_GENERATION_REPAIR === '1' 뒤에 있다(contentGenerator:5613).
 * 세 세션 로그에 [TitleGen] 이 한 줄도 없다. 거기를 고쳐봐야 아무 일도 안 일어난다.
 *
 * 그래서 살아 있는 계약에만 넣는다. 사장님 스펙 중 가져온 것은 둘뿐이다:
 *
 *  ① 감정을 직접 말하지 않고 장면으로 보여준다
 *     "놀랐어요" → "영수증을 다시 확인하게 됐습니다"
 *     앱에는 자극어 금지 목록만 있고 대안이 없었다. 오늘만 다섯 번 고친 그 패턴이다 —
 *     금지만 있고 대안이 없으면 모델이 임의로 고른다.
 *
 *  ② 단정어 대신 현실 어휘 (생각보다 · 의외로 · 많이들 · 자주)
 *
 * 가져오지 않은 것도 근거가 있다:
 *  · "결론 미공개" 일괄 적용 — 홈판엔 맞지만 검색면에선 독이다.
 *    검색자는 질문을 들고 오므로 답을 숨기면 눌러보고 즉시 되돌아간다.
 *    앱은 이미 모드별로 갈라 놓았다(contentJsonPromptFormat 의 seo/homefeed 클릭 계약).
 *  · 35~45자 — 42자 상한은 실측 사고에서 왔다(53자 제목이 피드에서 잘림).
 *  · "대부분 놓치는 부분 / 많은 사람이 착각하는 부분" — 앱이 의도적으로 버린 계열이다.
 *    본문이 그 약속을 못 갚아 첫 화면 이탈로 끝난다.
 */

const MODES = ['seo', 'homefeed', 'mate', 'business'] as const;

function build(mode: (typeof MODES)[number]) {
  return buildSituationTitleContract(mode as never, {} as never);
}

describe('감정은 말하지 말고 장면으로', () => {
  it.each(MODES.map((m) => [m]))('%s 계약에 조항이 실린다', (mode) => {
    const c = build(mode);
    expect(c).toContain('[감정은 말하지 말고 장면으로]');
    expect(c).toContain('영수증을 다시 확인하게 됐습니다');
  });

  it('왜 그래야 하는지를 함께 준다 — 금지만 하면 모델이 임의로 고른다', () => {
    const c = build('homefeed');
    expect(c).toContain('감정어는 독자가 아니라 글쓴이의 반응이라');
    expect(c).toContain('독자가 자기 상황과 대볼 수 있어서');
  });

  it('대체 예시가 한 쌍 이상이다 — 하나면 그것만 베낀다', () => {
    const c = build('homefeed');
    expect(c).toContain('"놀랐어요" →');
    expect(c).toContain('"충격적이었다" →');
  });
});

describe('단정 대신 현실 어휘', () => {
  it.each(MODES.map((m) => [m]))('%s 계약에 조항이 실린다', (mode) => {
    const c = build(mode);
    expect(c).toContain('[단정 대신 현실 어휘]');
    for (const w of ['생각보다', '의외로', '많이들', '자주']) {
      expect(c).toContain(w);
    }
  });

  it('꾸며낸 수치·희소성을 이름으로 막는다', () => {
    const c = build('homefeed');
    expect(c).toContain('"90%가 모르는"');
    expect(c).toContain('"나만 몰랐던"');
  });

  it('이유를 체류시간으로 댄다 — CTR만 올리는 규칙이 아님을 못박는다', () => {
    const c = build('homefeed');
    expect(c).toContain('독자는 첫 화면에서 나간다');
    expect(c).toContain('클릭이 안 된 제목보다 나쁘다');
  });
});

describe('기존 계약을 밀어내지 않는다', () => {
  it('약속과 이행 조항은 그대로 있다', () => {
    const c = build('homefeed');
    expect(c).toContain('[약속과 이행]');
    expect(c).toContain('도입부 첫 3~5문장이 직접 답한다');
  });

  it('요약 명사 제목 금지도 그대로다', () => {
    const c = build('homefeed');
    expect(c).toContain('"○○ 총정리"');
    expect(c).toContain('AI 요약이 이미 답한 자리다');
  });
});

describe('죽은 제목 프롬프트 트리에 손대지 않았음을 기록한다', () => {
  const gen = readFileSync(resolve(__dirname, '..', 'contentGenerator.ts'), 'utf-8');

  /*
   * 이 테스트는 사실을 박제한다. src/prompts/title/** 를 고치려는 다음 사람이
   * 먼저 이 게이트를 확인하도록 만든다 — 안 그러면 3,313줄을 고치고 아무 일도 안 일어난다.
   */
  it('title 프롬프트 로더는 유료 보수 게이트 뒤에 있다', () => {
    const loaderAt = gen.indexOf("'prompts', 'title'");
    const fnAt = gen.lastIndexOf('async function generateTitleOnlyPatch', loaderAt);
    expect(fnAt).toBeGreaterThan(-1);
    expect(loaderAt).toBeGreaterThan(fnAt);
    // [2026-09-04] 유료 보수는 기본 ON, opt-out 은 '0' — 게이트 자체는 그대로 있다.
    expect(gen).toMatch(/CONTENT_ALLOW_PAID_POST_GENERATION_REPAIR !== '0'/u);
  });

  it('살아 있는 제목 규칙은 situationTitleContract 가 소유한다', () => {
    expect(gen).toMatch(/buildSituationTitleContract/u);
  });
});
