/**
 * SPEC-NAVER-IMAGE-2026 — section image role planner (pure, no network).
 *
 * Why this exists: every heading's image prompt is produced by an independent call that never
 * sees the sibling headings (renderer promptTranslation.generateEnglishPromptForHeading), and the
 * final brief says "make this section visually distinct from every other section" without any
 * sibling data. The only variety was a camera rotation, so the subject type repeated across a post
 * ("person + laptop", "person + phone", "product + similar background") and the whole set read as AI.
 *
 * The planner gives each section a different visual ROLE before generation. It is a pure function
 * of the full heading list, so a caller that sends one item per IPC call gets the same role as a
 * caller that sends the whole batch.
 */

export type SectionVisualRole =
  | 'scene'
  | 'comparison'
  | 'closeup'
  | 'procedure'
  | 'criteria'
  | 'place'
  | 'problem';

export type ArticleVisualKind = 'issue' | 'info' | 'product' | 'travel' | 'auto';

export interface SectionRolePlanEntry {
  readonly heading: string;
  readonly role: SectionVisualRole;
  /** The cue text that decided the role, or null when a kind default was used. */
  readonly cue: string | null;
}

interface RoleCue {
  readonly role: SectionVisualRole;
  readonly pattern: RegExp;
}

// Cue order breaks ties (same match count): earlier = more specific wins, so the generic 'scene'
// cue (공개, 모습 …) never beats a concrete document or step cue in the same heading.
// Words that only exist around cars (경고등, 계기판, 충전구, 리콜 …) are safe for every article; the
// broader car cues (가격, 옵션, 기능, 증상 …) live in AUTO_ROLE_CUES and apply to car articles only, so a
// policy "보조금 대상" or a health "감기 증상" heading keeps the role it had before.
const ROLE_CUES: readonly RoleCue[] = [
  { role: 'comparison', pattern: /차이|비교|대비|\bvs\b|어느 쪽|둘 중|보다 (?:싸|비싸|저렴|유리|나은|낫)/giu },
  { role: 'criteria', pattern: /기준|고르는|고를 때|선택|추천|체크리스트|확인할|조건|자격|대상|주의|피해야|따져|장단점|포인트/giu },
  { role: 'procedure', pattern: /방법|하는 ?법|절차|신청|순서|단계|따라 ?하|설정|등록|접수|발급|가입|해지|신고|작성|준비물/giu },
  { role: 'closeup', pattern: /성분|구성품|디테일|서류|문서|판결문|증명서|계약서|명세|영수증|표기|라벨|원문|공문|고지서|약관|경고등|계기판|충전구|충전\s?커넥터|엔진룸/giu },
  { role: 'problem', pattern: /문제|논란|피해|실수|오해|사고|고소|갈등|불만|위험|부작용|사기|분쟁|거절|탈락|반박|리콜/giu },
  { role: 'place', pattern: /장소|위치|가는 ?길|코스|여행|풍경|명소|어디|주차|근처|동선|숙소|맛집/giu },
  { role: 'scene', pattern: /경위|당시|장면|발표|방송|공개|모습|현장|순간|하루|일상/giu },
];

// [NAVER FULL AUTO §8] Car search intents → image role (auto kind only): a price / real-purchase / trim
// heading is a comparison, an option / feature / interior heading is a close-up, a symptom heading shows
// the problem part. Merged into ROLE_CUES for car articles (same role order, so ties behave the same).
const AUTO_ROLE_CUE_EXTRA: Readonly<Partial<Record<SectionVisualRole, string>>> = Object.freeze({
  comparison: '실구매가|보조금|가격|트림',
  closeup: '디스플레이|기능|옵션|사양|편의|실내|타이어',
  problem: '증상|안 ?빠(?:짐|지|져)|고장|소음|떨림|누유|방전|안 ?(?:됨|돼|되)',
});

const AUTO_ROLE_CUES: readonly RoleCue[] = ROLE_CUES.map(({ role, pattern }) => {
  const extra = AUTO_ROLE_CUE_EXTRA[role];
  return extra ? { role, pattern: new RegExp(`${pattern.source}|${extra}`, pattern.flags) } : { role, pattern };
});

// Two money/percent values in one heading also mean "compare these".
const COMPARABLE_NUMBER = /\d[\d,.]*\s*(?:만|억|천)?\s*원|\d+(?:\.\d+)?\s*%/gu;

// Roles used when a heading gives no cue. 'comparison' is never a default: without two
// comparable things in the section it produces a meaningless split image.
const KIND_DEFAULTS: Readonly<Record<ArticleVisualKind, readonly SectionVisualRole[]>> = {
  issue: ['scene', 'place', 'closeup', 'problem', 'criteria', 'procedure'],
  info: ['scene', 'closeup', 'procedure', 'criteria', 'place'],
  product: ['closeup', 'procedure', 'criteria', 'place', 'scene'],
  travel: ['place', 'scene', 'closeup', 'procedure', 'criteria'],
  // Cars read as generic stock photography fastest, so a close-up of the actual part leads. Like every
  // kind, 'comparison' and 'problem' are cue-only (price/trim → comparison, symptom → problem via
  // AUTO_ROLE_CUE_EXTRA): a neutral heading must not get a split image or a damage scene.
  auto: ['closeup', 'scene', 'procedure', 'criteria', 'place'],
};

const META_HEADING = /썸네일|thumbnail|대표 ?이미지|^서론$|^마무리$|^결론$/iu;

export function isMetaImageHeading(heading: string): boolean {
  return META_HEADING.test(String(heading || '').trim());
}

export function normalizePlanHeading(heading: string): string {
  return String(heading || '')
    .replace(/^\s{0,3}#{1,6}\s+/u, '')
    .replace(/^\s*\d{1,2}\s*[.)]\s*/u, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

const KIND_PATTERNS: ReadonlyArray<readonly [ArticleVisualKind, RegExp]> = [
  ['travel', /여행|맛집|카페|코스|관광|호텔|숙소|축제/u],
  ['product', /쇼핑|제품|리뷰|구매|추천템|가전|화장품|쿠팡|상품/u],
  ['issue', /연예|이슈|사건|뉴스|시사|논란|재판|법원|경찰|검찰|스포츠|방송|배우|가수|아이돌|팬심|고백|열애|결혼|웨딩|컴백|데뷔|출연|예능|드라마|고소|항소|구형|선고|기소|혐의|징역/u],
];

// [NAVER FULL AUTO §8] Only words that mean "car" on their own: generic car nouns, model-code shapes
// (EV3/EV9, GV70) and popular models. Words that also live elsewhere — 트림(아기 트림), 충전구(아이폰),
// 리콜(분유), 타이어(자전거), 하이브리드(근무), 주행거리(전기자전거), PV(홍보 영상), CAR-T — never make an
// article 'auto' by themselves; a real car title carries one of these anyway ("EV9 충전구", "셀토스 트림").
// No 'g' flag: `.test()` on a shared global regex is stateful (lastIndex) and skips the next title.
const AUTO_TERMS =
  /자동차|차량|신차|중고차|전기차|세단|시승|\bSUV\b|\bEV\d|\bGV\d{2}|\bPV[57]\b|아이오닉|셀토스|쏘렌토|카니발|그랜저|싼타페|투싼|스포티지|제네시스/iu;
/** The app's category key for car blogs ('car' → 자동차). */
const AUTO_CATEGORY_KEY = /^\s*car\s*$/iu;

/**
 * Coarse article kind from category and title — only picks the default role order.
 * Non-car titles keep the original precedence (travel → product → issue). A car title is 'auto' —
 * over 'product' (a car price/review is not a shopping post) but never over 'travel' (차박·드라이브
 * 코스) or 'issue' (a celebrity or crime story that mentions a car).
 */
export function inferArticleVisualKind(category?: string, title?: string): ArticleVisualKind {
  const text = `${category || ''} ${title || ''}`;
  const [travel, , issue] = KIND_PATTERNS;
  const carArticle = AUTO_CATEGORY_KEY.test(category || '') || AUTO_TERMS.test(text);
  if (!travel[1].test(text) && carArticle) return issue[1].test(text) ? 'issue' : 'auto';
  for (const [kind, pattern] of KIND_PATTERNS) {
    if (pattern.test(text)) return kind;
  }
  return 'info';
}

interface CueScore {
  readonly role: SectionVisualRole;
  readonly score: number;
  readonly first: number;
  readonly cue: string;
}

function scoreCues(heading: string, kind?: ArticleVisualKind): CueScore[] {
  const scores: CueScore[] = [];
  for (const { role, pattern } of kind === 'auto' ? AUTO_ROLE_CUES : ROLE_CUES) {
    const matches = [...heading.matchAll(pattern)];
    if (matches.length === 0) continue;
    scores.push({ role, score: matches.length, first: matches[0].index ?? 0, cue: matches[0][0] });
  }
  const numbers = [...heading.matchAll(COMPARABLE_NUMBER)];
  if (numbers.length >= 2 && !scores.some((s) => s.role === 'comparison')) {
    scores.push({ role: 'comparison', score: 1, first: numbers[0].index ?? 0, cue: numbers.map((m) => m[0]).join('/') });
  }
  // Stable sort: equal scores keep ROLE_CUES order (specific roles first).
  return scores.sort((a, b) => b.score - a.score);
}

function adjacentConflict(roles: ReadonlyArray<SectionVisualRole | null>, index: number, role: SectionVisualRole): boolean {
  return roles[index - 1] === role || roles[index + 1] === role;
}

/**
 * Plan one visual role per section heading.
 *  1. Headings with the strongest cues claim their role first (each role once while unused remain).
 *  2. The rest take the article kind's default order.
 *  3. Adjacent sections never share a role; beyond seven sections roles repeat, never side by side.
 */
export function planSectionRoles(
  headings: readonly string[],
  options: { kind?: ArticleVisualKind } = {},
): SectionRolePlanEntry[] {
  const titles = headings.map(normalizePlanHeading).filter((t) => t.length > 0 && !isMetaImageHeading(t));
  const roles: Array<SectionVisualRole | null> = titles.map(() => null);
  const cues: Array<string | null> = titles.map(() => null);
  const used = new Set<SectionVisualRole>();
  const scored = titles.map((title, index) => ({ index, cues: scoreCues(title, options.kind) }));

  const byStrength = [...scored]
    .filter((s) => s.cues.length > 0)
    .sort((a, b) => b.cues[0].score - a.cues[0].score || a.index - b.index);
  for (const { index, cues: candidates } of byStrength) {
    const pick = candidates.find((c) => !used.has(c.role) && !adjacentConflict(roles, index, c.role));
    if (!pick) continue;
    roles[index] = pick.role;
    cues[index] = pick.cue;
    used.add(pick.role);
  }

  const defaults = KIND_DEFAULTS[options.kind ?? 'info'];
  const fallbackPool: SectionVisualRole[] = [...defaults, 'problem', 'closeup', 'scene'];
  for (let index = 0; index < titles.length; index++) {
    if (roles[index]) continue;
    const fresh = defaults.find((role) => !used.has(role) && !adjacentConflict(roles, index, role));
    const reuse = fallbackPool.find((role) => !adjacentConflict(roles, index, role));
    const role = fresh ?? reuse ?? 'scene';
    roles[index] = role;
    used.add(role);
  }

  return titles.map((heading, index) => ({ heading, role: roles[index] as SectionVisualRole, cue: cues[index] }));
}

/** Role planned for one heading, matched on the normalized title; null when it is not in the plan. */
export function findPlannedRole(
  plan: readonly SectionRolePlanEntry[],
  heading: string | undefined,
): SectionVisualRole | null {
  const key = normalizePlanHeading(String(heading || ''));
  if (!key) return null;
  return plan.find((entry) => entry.heading === key)?.role ?? null;
}
