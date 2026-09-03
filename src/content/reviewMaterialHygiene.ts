/**
 * [2026-09-03] Review material hygiene for the first-person (AI experience) mode.
 *
 * Two defects surfaced when the model rewrote buyer reviews as the author's own
 * experience (self-run critique, DR-5180):
 *   1. Store option labels glued to review text by the DOM crawler —
 *      "구성: (그레이)본체+다리무릎 내측인대가 파열돼서 …" — leaked as "핑크 본체+다리 구성은".
 *   2. Reviewer biographies (knee ligament tear, boxing, parents, a massage chair
 *      bought two years ago, the family dog) were stitched onto one narrator even
 *      though the prompt forbade it. The model cannot borrow what it never sees,
 *      so the clauses are removed from the material before the prompt is built.
 * Product-usage clauses are kept; only the biographical clauses go.
 */
const OPTION_LABEL = /^\s*(?:구성|옵션|선택|색상)\s*[:：]\s*\([^)]{1,30}\)(?:본체\+다리|세트|단품)?\s*/;
// [2026-09-03 5차 실측] "2년전에 안마의자 사드린", "가나지"(강아지 오타), "5번도 못하고 으로 보냈" — 붙여 쓴 년 전·선물 동사·이전 제품 소유·오타도 표지다.

export const BORROWED_BIOGRAPHY_CLAUSE = /파열|수술|인대|디스크|도수\s*치료|치료\s*받|침(?:을|도)\s*맞|병원|어머님|어머니|아버님|아버지|부모님|남편|아내|와이프|아줌씨|우리\s*(?:아이|딸|아들|집)|아기|출산|강아지|가나지|고양이|반려|\d+\s*년\s*전|\d+\s*개월\s*(?:정도)?\s*고생|생신|생일|(?:사|해|보내|주문해)\s*드[렸린]|안마의자|스툴형|예전에\s*(?:쓰|산|샀)|이전\s*제품|으로\s*보[내냈]|당근|중고|복싱|헬스장|마라톤|등산|짖/;

export function stripReviewOptionLabel(review: string): string {
  return String(review || '').replace(OPTION_LABEL, '').trim();
}

/** Drops the clauses that carry someone else's life; keeps the product-usage clauses. */
export function stripBorrowedBiography(review: string): string {
  const text = String(review || '').trim();
  if (!text || !BORROWED_BIOGRAPHY_CLAUSE.test(text)) return text;
  // [2026-09-03 7차 실측] 절만 지우면 조각("5번도 못하고", "짖은 적이 없어서")이 남아 모델이 억지로 이어 붙인다.
  //   문장 안에서 지운 분량이 40% 를 넘거나 남은 게 12자 미만이면 문장을 통째로 버린다.
  const sentences = text.split(/(?<=[.!?~。])\s*/u).map((sentence) => sentence.trim()).filter(Boolean);
  const kept = sentences.flatMap((sentence) => {
    if (!BORROWED_BIOGRAPHY_CLAUSE.test(sentence)) return [sentence];
    const clauses = sentence
      .split(/,\s*|(?<=는데|은데|지만|하고|해서|어서|아서|니까)\s+/u)
      .map((clause) => clause.trim())
      .filter(Boolean);
    const survivors = clauses.filter((clause) => !BORROWED_BIOGRAPHY_CLAUSE.test(clause));
    const survivorChars = survivors.join(' ').length;
    if (survivorChars < 12 || survivorChars < sentence.length * 0.6) return [];
    const joined = survivors.join(' ');
    return [/[.!?~。]$/u.test(joined) ? joined : `${joined}.`];
  });
  return kept.join(' ').replace(/\s{2,}/g, ' ').trim();
}

export interface ReviewMaterialSource {
  /** 상위호환 1단 분석 브리프 — 정리 전 원문으로 만들어져 리뷰 신상이 그대로 실린다(6차 실측). */
  readonly paraphraseUpgradeBrief?: unknown;
  readonly productReviews?: unknown;
  readonly rawText?: unknown;
}

// [2026-09-03 4차 실측] 섹션 머리가 "=== 실제 구매자 리뷰 (11건 중 발췌) ===" 로도 온다 — 후기/리뷰가 든 === 머리면 전부 진입한다.
const REVIEW_SECTION_HEADER = /^===\s*.*(?:후기|리뷰).*===\s*$/;
const SECTION_BOUNDARY = /^(?:===|출처 URL:)/;

/** Applies the same hygiene to the review section embedded in rawText (the model reads both copies). */
/** 판매 페이지 문구는 어느 섹션에 있든 글 재료가 아니다 — 브랜드 슬로건이 본문에 "[닥터웰] 제품이 아닌 작품을…" 으로 실렸다. */
const SALES_BOILERPLATE_LINE = /제품이\s*아닌\s*작품|\bBRAND\b|㈜|\(\s*주\s*\)|&#40;\s*주\s*&#41;|추가\s*설치\s*비용|No\.?\s*1\b/;

export function stripSalesBoilerplateLines(rawText: string): string {
  return String(rawText || '').split('\n').filter((line) => !SALES_BOILERPLATE_LINE.test(line)).join('\n');
}

export function cleanReviewSectionInRawText(rawText: string, clean: (review: string) => string): string {
  const lines = String(rawText || '').split('\n');
  let inside = false;
  const out = lines.map((line) => {
    if (REVIEW_SECTION_HEADER.test(line.trim())) { inside = true; return line; }
    if (inside && SECTION_BOUNDARY.test(line.trim())) inside = false;
    if (!inside) return line;
    const match = line.match(/^(\s*(?:REVIEW_\d+:|\d+\.)\s*)(.*)$/);
    if (!match) return line;
    const cleaned = clean(match[2]);
    return cleaned ? `${match[1]}${cleaned}` : '';
  });
  return out.join('\n');
}

/** Returns a new source with option labels stripped, and biographies removed when `firstPerson` is on. */
export function applyReviewMaterialHygiene<T extends ReviewMaterialSource>(source: T, firstPerson: boolean): { readonly source: T; readonly changed: number } {
  const clean = (review: string): string => {
    const noLabel = stripReviewOptionLabel(review);
    return firstPerson ? stripBorrowedBiography(noLabel) : noLabel;
  };
  let changed = 0;
  const productReviews = Array.isArray(source.productReviews)
    ? source.productReviews.map((review) => {
      const before = String(review || '');
      const after = clean(before);
      if (after !== before) changed += 1;
      return after;
    }).filter(Boolean)
    : source.productReviews;
  const rawText = typeof source.rawText === 'string'
    ? stripSalesBoilerplateLines(cleanReviewSectionInRawText(source.rawText, clean))
    : source.rawText;
  if (typeof source.rawText === 'string' && rawText !== source.rawText) changed += 1;
  const brief = firstPerson && typeof source.paraphraseUpgradeBrief === 'string'
    ? source.paraphraseUpgradeBrief.split('\n').map((line) => (BORROWED_BIOGRAPHY_CLAUSE.test(line) ? stripBorrowedBiography(line) : line)).join('\n')
    : source.paraphraseUpgradeBrief;
  if (typeof source.paraphraseUpgradeBrief === 'string' && brief !== source.paraphraseUpgradeBrief) changed += 1;
  return { source: { ...source, productReviews, rawText, ...(brief === undefined ? {} : { paraphraseUpgradeBrief: brief }) }, changed };
}
