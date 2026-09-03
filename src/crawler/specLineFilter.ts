/**
 * [2026-09-03] Product-notice lines that never belong in a blog post.
 *
 * The store's "상품정보 제공고시" table carries KC certification numbers, the
 * manufacturer/country, warranty boilerplate and terms-of-service pointers.
 * Fed as material, the model dumps them into the body to reach the target
 * length (live post 224399398683: "KC 인증정보는 HU071627-18006F …",
 * "제조국은 중국산", "소비자분쟁해결기준에 의거하여 …"). They are not a
 * purchase reason, so they are dropped at the crawler before they become
 * rawText / productSpec. Size, power, composition and release month stay.
 */
const REGULATORY_KEY = /^(?:\s*(?:KC\s*인증|인증\s*정보|품명\s*\/?\s*모델명|모델명|에너지\s*소비\s*효율|제조자|제조국|원산지|품질\s*보증|A\/?S|AS\s*책임|사후\s*서비스|거래에\s*관한\s*약관|약관|법에\s*의한\s*인증|허가|수입자|수입|소비자\s*상담|고객\s*센터|브랜드|BRAND|추가\s*설치|설치\s*비용|배송\s*(?:방법|기간|안내)))/i;

const REGULATORY_VALUE = /소비자분쟁해결기준|이용약관|공정거래위원회|HU\d{6}|R-REI|R-R-[A-Za-z]|제품이\s*아닌\s*작품|No\.?\s*1\b|\(\s*주\s*\)|㈜/;

export function isRegulatorySpecLine(line: string): boolean {
  const text = String(line || '').trim();
  if (!text) return false;
  const key = text.split(/[:：]/)[0] || '';
  return REGULATORY_KEY.test(key) || REGULATORY_VALUE.test(text);
}

/** Returns the spec text without regulatory lines; the count tells the caller what was dropped. */
export function dropRegulatorySpecLines(text: string): { readonly text: string; readonly dropped: number } {
  const lines = String(text || '').split('\n');
  const kept = lines.filter((line) => !isRegulatorySpecLine(line));
  return { text: kept.join('\n'), dropped: lines.length - kept.length };
}
