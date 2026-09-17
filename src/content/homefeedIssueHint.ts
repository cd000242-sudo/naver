// src/content/homefeedIssueHint.ts
// 홈판 이슈 서사 골격이 "카테고리 미선택" 때문에 조용히 빠지는 것을 막는다.
//
// [2026-09-17 실측 사고] 연예 이슈 글(전현무 예능 논란)을 홈판 모드로 뽑았는데
// 제목이 "…한 이유" 설명형으로, 소제목은 5개로 나왔다. 두 값 모두 homefeed/base
// 골격의 결과다 — issue-story.prompt(제목 3공식 + 소제목 0~3)가 아예 안 붙은 것이다.
//
// 원인은 promptLoader 의 게이트가 카테고리로만 판정하기 때문이다.
//   resolveCategory(undefined) === 'general'
//   HOMEFEED_ISSUE_STORY_CATEGORIES = { entertainment, society }
// UI 에서 글 유형을 고르지 않으면 categoryHint 가 비고, 연예 이슈 글이어도
// 'general' 로 떨어져 골격이 통째로 빠진다. 경고도 남지 않아 눈에 띄지 않는다.
//
// 그래서 **아무 카테고리도 선택되지 않은 경우에만** 본문에서 신호를 읽어 보정한다.
// 이미 고른 카테고리는 건드리지 않는다 — 잘못된 카테고리 보정은 보정 없음보다 나쁘다는
// categoryTaxonomy 의 원칙을 그대로 따른다.

/** 연예 신호 — 작품·인물·방송 축. entertainment.prompt 스코프와 맞춘다. */
const ENTERTAINMENT_SIGNALS: readonly RegExp[] = [
  /예능|드라마|영화|방송|출연|시청률|촬영|제작진|편성|회차/,
  /배우|가수|아이돌|연예인|개그맨|MC|소속사|연예기획사/,
  /열애|결별|은퇴|복귀|캐스팅|섭외|하차|논란|해명|입장문/,
];

/** 사회 신호 — 정책·사건·제도 축. society.prompt 스코프와 맞춘다. */
const SOCIETY_SIGNALS: readonly RegExp[] = [
  /정책|법안|국회|정부|부처|지자체|조례|시행령/,
  /수사|기소|재판|판결|고소|고발|경찰|검찰/,
  /금리|세금|연금|지원금|보조금|물가|고용/,
];

const MIN_SIGNALS = 2;

function countSignals(text: string, patterns: readonly RegExp[]): number {
  return patterns.filter(pattern => pattern.test(text)).length;
}

export interface HomefeedIssueHintResult {
  /** 보정된 힌트. 보정하지 않았으면 원래 힌트를 그대로 돌려준다. */
  readonly hint?: string;
  /** 보정이 일어났는지. 로그를 남길지 판단하는 데 쓴다. */
  readonly upgraded: boolean;
  /** 로그에 그대로 쓸 근거 한 줄. */
  readonly reason: string;
}

/**
 * 홈판 모드에서 카테고리가 비어 있을 때만 이슈형 힌트를 추론한다.
 *
 * @param mode        생성 모드. 'homefeed' 가 아니면 아무것도 하지 않는다.
 * @param categoryHint UI 에서 온 원래 힌트
 * @param isGeneral   resolveCategory(categoryHint) 가 'general' 인지 (호출자가 판정)
 * @param text        제목 + 본문 자료. 신호를 여기서 읽는다.
 */
export function resolveHomefeedIssueHint(
  mode: string | undefined,
  categoryHint: string | undefined,
  isGeneral: boolean,
  text: string,
): HomefeedIssueHintResult {
  const keep = (reason: string): HomefeedIssueHintResult => ({ hint: categoryHint, upgraded: false, reason });

  if (mode !== 'homefeed') return keep('홈판 모드가 아님');
  if (!isGeneral) return keep(`카테고리가 이미 지정됨(${categoryHint})`);

  const haystack = String(text || '').slice(0, 4000);
  if (haystack.length < 80) return keep('자료가 짧아 판정 보류');

  const entertainment = countSignals(haystack, ENTERTAINMENT_SIGNALS);
  const society = countSignals(haystack, SOCIETY_SIGNALS);

  if (entertainment < MIN_SIGNALS && society < MIN_SIGNALS) {
    return keep(`이슈 신호 부족(연예 ${entertainment}, 사회 ${society} / 기준 ${MIN_SIGNALS})`);
  }

  const picked = entertainment >= society ? '연예' : '사회';
  return {
    hint: picked,
    upgraded: true,
    reason: `카테고리 미선택 + 이슈 신호(연예 ${entertainment}, 사회 ${society}) → ${picked} 로 보정`,
  };
}
