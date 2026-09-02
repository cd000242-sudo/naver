/**
 * Marks search-only compound keywords so they do not surface as prose.
 *
 * 실측 — 침구 글 본문:
 *   "9월침실정리라는 표현이 붙은 이유도 침실 전체를 …"
 *
 * "9월침실정리" is a search-ranking combination, not a word anyone says. It
 * reached the prompt verbatim beside real sub-keywords, so the model treated
 * it as a term worth explaining to the reader.
 *
 * Detection is by shape, not by a list. A list would only ever hold the
 * combinations we happened to see — the next niche invents its own. The shape
 * that matters: no whitespace, a digit inside, and a run of Hangul long enough
 * that a human would have spaced it.
 *
 * We do not try to restore the spacing. Segmenting Korean without a dictionary
 * guesses wrong ("9월침실정리" → 침실 정리? 침 실정 리?), and a wrong split in
 * the prompt is worse than none. Naming it as search-only is enough — the model
 * writes the spaced form on its own once it knows it is not a word.
 */

/** Digits plus a Hangul run this long means someone glued search terms together. */
const MIN_GLUED_HANGUL = 3;

export function isSearchOnlyCompound(keyword: string): boolean {
  const k = String(keyword ?? '').trim();
  if (!k || /\s/u.test(k)) return false;
  if (!/\d/u.test(k)) return false;
  return new RegExp(`[가-힣]{${MIN_GLUED_HANGUL},}`, 'u').test(k);
}

/**
 * Annotates compounds inside a comma-joined sub-keyword string.
 * Returns the input unchanged when nothing looks glued.
 */
export function annotateSearchOnlyCompounds(subKeywords: string): string {
  const raw = String(subKeywords ?? '');
  if (!raw.trim()) return raw;

  let touched = false;
  const out = raw
    .split(',')
    .map((part) => {
      const token = part.trim();
      if (!isSearchOnlyCompound(token)) return part;
      touched = true;
      return `${token}(검색용 조합어 — 본문 문장에는 그대로 쓰지 말고 띄어 쓴 말로 푼다)`;
    })
    .join(',');

  return touched ? out : raw;
}
