/**
 * Homefeed plain-register (평서체) policy.
 *
 * Homefeed guide v5.2 writes broadcast / celebrity / sports / IT·car posts in plain declarative
 * endings ("~다"), with polite endings banned. Health / fashion / beauty / living keep the polite
 * "~요" register. This module decides which register a post uses and holds the prompt blocks that
 * replace the polite-register rules. It has no imports so promptLoader can use it without a cycle.
 */

export type HomefeedPlainKind = 'broadcast' | 'sports' | 'tech';

const CAR_HINT = /자동차|car\b/i;
const SPORTS_HINT = /스포츠|sports?\b/i;

/**
 * @param mode content mode ('homefeed' only qualifies)
 * @param category result of resolveCategory(categoryHint)
 * @param categoryHint raw hint — cars resolve to 'life', so the hint itself must be read
 */
export function resolveHomefeedPlainKind(
  mode: string | undefined,
  category: string | undefined,
  categoryHint: string | undefined,
): HomefeedPlainKind | null {
  if (mode !== 'homefeed') return null;
  const hint = String(categoryHint ?? '');
  if (category === 'entertainment') return SPORTS_HINT.test(hint) ? 'sports' : 'broadcast';
  if (category === 'it' || CAR_HINT.test(hint)) return 'tech';
  return null;
}

const KIND_VOICE: Record<HomefeedPlainKind, string> = {
  broadcast: [
    '- 화자: 어제 방송·소식을 같이 본 사람이 친구에게 카톡으로 썰 풀듯 쓴다. 시청자·블로거 시각의 감상과 공감 포인트가 살아 있어야 한다.',
    '- 리액션 예: "진짜 충격이었다", "이건 좀 의외였다", "솔직히 좀 부럽긴 했다", "나도 모르게 끝까지 봤다". 자료에 없는 시청·경험은 지어내지 않는다.',
    '- 섞을 어미: ~했다 / ~였다 / ~보인다 / ~았을까(자문) / 명사 종결("마지막 5분의 반전.") / 짧은 의문("우연이었을까?").',
  ].join('\n'),
  sports: [
    '- 화자: 어제 경기를 본 팬이 그 순간의 감정을 되살리며 친구에게 중계하듯 쓴다. 장면 재생과 감정 리액션이 핵심이다.',
    '- 리액션 예: "진짜 소리 질렀다", "이건 다시 봐도 소름이다", "심장이 내려앉는 줄 알았다". 글 전체 2~3회, 남발하지 않는다.',
    '- 섞을 어미: ~했다 / ~였다 / ~보인다 / ~았을까(자문) / 명사 종결("후반 43분의 그 순간.") / 짧은 의문.',
  ].join('\n'),
  tech: [
    '- 화자: 기계적 설명을 버린 친근한 개인 블로거. 긍정·비판 시각을 균형 있게, 개인 판단을 충분히 담는다.',
    '- 섞을 어미: 기본(~이다/~했다/~된다/~있다) · 판단(~보인다/~싶다/~인 셈이다) · 정도(~한 편이다/~할 만하다) · 전언(~라고 한다/~라고 보면 된다) · 명사형("~라는 게 핵심").',
    '- 친근 표현: "쉽게 말하면 ~이다", "한마디로 ~인 셈이다", "체감상 ~정도라 보면 된다".',
  ].join('\n'),
};

/** Tail block: placed last so it wins over every polite-register sentence earlier in the prompt. */
export function buildPlainRegisterFinalBlock(kind: HomefeedPlainKind): string {
  return [
    '[말투 최종 규칙 — 평서체 (이 글 주제 전용, 위의 모든 말투·어미 지시보다 우선)]',
    '- 본문·도입부·마무리를 전부 평서체(~다/~했다/~된다/~보인다)로 쓴다. 존댓말(~요/~습니다/~입니다/~죠/~네요/~거든요/~더라고요) 종결은 한 문장도 쓰지 않는다.',
    '- 위 문서에 나온 "존댓말 기반", "낮은 존댓말", "~요체", "~입니다체", "평어 단정형 금지", 해요체 어미 목록·예시 문장은 이 글에 적용하지 않는다. 그 규칙이 요구한 리듬·구체성·근거 원칙만 평서체 안에서 지킨다.',
    '- 글톤(STYLE OVERRIDE)에서는 시선·거리감·문장 리듬만 가져오고, 말끝은 이 규칙을 따른다.',
    KIND_VOICE[kind],
    '- "~이다/~다" 한 가지로만 끝내지 않는다. 한 소제목 안에 어미를 3종류 이상 섞고, 같은 어미 3연속 금지, 문단 첫 문장과 끝 문장의 어미를 다르게 한다.',
    '- 평서체는 기사체가 아니다. "~로 알려졌다 / ~것으로 전해졌다 / ~라고 밝혔다"의 보도 문장 나열, "~하였다/~인바/~이며" 문어체, 반말 호칭("너", "~해라")은 쓰지 않는다.',
    '- 제목·소제목 규칙은 그대로다(이 규칙은 본문 말끝만 정한다). 직접 인용문 안의 말투는 원문 그대로 둔다.',
  ].join('\n');
}

/** Replaces the "사람 말투 리듬" polite-register rule inside STYLE OVERRIDE. */
export const PLAIN_HUMAN_RHYTHM_RULE = [
  '■ 사람 말투 리듬 (평서체 주제):',
  '- 이 글은 평서체로 쓴다. 이 글톤 설명의 "존댓말"·"평어 금지" 문구는 적용하지 않고, 시선·거리감·리듬만 가져온다.',
  '- 한 단락 안에서 서술(~했다) + 판단(~보인다/~싶다) + 자문(~았을까) + 짧은 명사 종결을 섞어 사람 호흡을 만든다.',
  '- 다음 문장은 어미만 바꾸지 말고 근거·예외·체감·판단 중 하나로 전진시킨다.',
  '- "사실", "막상", "다만", "그래도" 같은 입말 연결어는 필요한 곳에만 쓰고 계속 재사용하지 않는다.',
  '- 독자가 실제 사람이 옆에서 얘기한다고 느껴야 한다. 감탄사가 아니라 구체 상황, 판단의 이유, 조심스러운 한계가 보여야 한다.',
].join('\n');

/** Replaces the "■ 홈판에 유리한 말투" lines of the homefeed MODE VOICE. */
export const PLAIN_MODE_VOICE_LINES = [
  '■ 홈판에 유리한 말투 (평서체 주제):',
  '  - 기본은 평서체. ~했다/~였다/~보인다/~싶다와 짧은 명사 종결을 자연스럽게 섞는다. 존댓말 종결은 쓰지 않는다.',
  '  - 같은 어미가 후렴처럼 반복되면 홈판에서도 AI 티가 난다.',
  '  - 한 문단은 한 판단만 담고, 완성된 생각 뒤에는 모바일에서 숨 쉴 수 있게 공백을 둔다.',
].join('\n');

export const PLAIN_TONE_OVERRIDE_LINES = [
  '■ 톤 오버라이드: 사용자 톤이 무엇이든 이 주제의 홈판 글은',
  '  평서체와 모바일 피드 리듬으로 쓴다. 단, 전문성/근거는 버리지 않는다.',
].join('\n');

/** Ending candidates for the identity block (replaces ~해요/~네요/~입니다/~죠). */
export const PLAIN_CORE_ENDINGS = [
  { ending: '~했다', percent: 30 },
  { ending: '~보인다', percent: 25 },
  { ending: '~인 셈이다', percent: 20 },
  { ending: '~았을까', percent: 25 },
];

/** Voice-profile line that replaces the "해요체가 기본" ratio rule. */
export const PLAIN_VOICE_PROFILE_ENDING_LINE =
  '- 종결어미: 평서체(~했다/~였다/~보인다/~싶다)가 기본이고 존댓말 종결은 쓰지 않는다. "~이다" 종결이 절반을 넘지 않게 하고, 같은 어미 3연속 금지.';

/** Regeneration directive that replaces "딱딱한 ~다 종결을 줄이고 …" for plain-register posts. */
export const PLAIN_REGEN_ENDING_DIRECTIVE =
  '평서체는 유지하되 같은 어미 3연속을 풀고, ~했다/~보인다/~싶다/~았을까/명사 종결을 섞어 말하듯 쓴다. 존댓말로 바꾸지 않는다.';

/** humanlike-eval suggestion for plain-register posts. */
export const PLAIN_ENDING_VARIETY_SUGGESTION =
  '평서체 안에서 어미를 다양하게: ~했다/~였다/~보인다/~싶다/~인 셈이다/~았을까/명사 종결 혼합';
