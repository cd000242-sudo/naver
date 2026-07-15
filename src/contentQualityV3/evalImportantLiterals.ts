const PHONE_LITERAL_SOURCE = String.raw`0\d{1,2}[-. ]\d{3,4}[-. ]\d{4}`;
const KRW_LITERAL_SOURCE = String.raw`(?:KRW|₩)\s*\d[\d,]*(?:\.\d+)?`;
const USD_PREFIX_LITERAL_SOURCE = String.raw`(?:US\$|USD|\$)\s*\d[\d,]*(?:\.\d+)?`;
const USD_SUFFIX_LITERAL_SOURCE = String.raw`\d[\d,]*(?:\.\d+)?\s*(?:미국\s*)?달러`;
const KOREAN_FULL_DATE_SOURCE = String.raw`(?:19|20)\d{2}년\s*\d{1,2}월\s*\d{1,2}일`;
const ISO_DATE_SOURCE = String.raw`(?:19|20)\d{2}[-/.]\d{1,2}[-/.]\d{1,2}`;
const KOREAN_MAGNITUDE_LITERAL_SOURCE =
  String.raw`\d[\d,]*(?:\.\d+)?\s*(?:천|만|억|조)\s*(?:원|명|건|개|회)`;
const STANDARD_UNIT_LITERAL_SOURCE =
  String.raw`\d[\d,]*(?:\.\d+)?\s*(?:%|퍼센트|만원|억원|원|kg|g|cm|mm|km|gb|mb|ml|l|cc|mah|wh|w|v|㎡|m²|평|점|인치|시간|분|일|개월|년|건|명|회|개|대)`;
const IMPORTANT_LITERAL_PATTERN = new RegExp([
  KOREAN_FULL_DATE_SOURCE,
  ISO_DATE_SOURCE,
  PHONE_LITERAL_SOURCE,
  KRW_LITERAL_SOURCE,
  USD_PREFIX_LITERAL_SOURCE,
  USD_SUFFIX_LITERAL_SOURCE,
  KOREAN_MAGNITUDE_LITERAL_SOURCE,
  String.raw`(?:19|20)\d{2}년`,
  STANDARD_UNIT_LITERAL_SOURCE,
  String.raw`\d{1,2}:\d{2}`,
].map(source => `(?:${source})`).join('|'), 'gi');
const PHONE_LITERAL_EXACT_PATTERN = new RegExp(`^(?:${PHONE_LITERAL_SOURCE})$`);
const KRW_LITERAL_EXACT_PATTERN = /^(?:KRW|₩)/i;
const USD_PREFIX_LITERAL_EXACT_PATTERN = /^(?:US\$|USD|\$)/i;
const USD_SUFFIX_LITERAL_EXACT_PATTERN = /(?:미국\s*)?달러$/i;
const KOREAN_FULL_DATE_EXACT_PATTERN = new RegExp(`^(?:${KOREAN_FULL_DATE_SOURCE})$`);
const ISO_DATE_EXACT_PATTERN = new RegExp(`^(?:${ISO_DATE_SOURCE})$`);

function normalizeFullDate(value: string): string {
  const parts = value.match(/\d+/g) ?? [];
  const [year = '', month = '', day = ''] = parts;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function normalizeImportantLiteral(value: string): string {
  const compact = value.trim().replace(/\s+/g, ' ');
  if (PHONE_LITERAL_EXACT_PATTERN.test(compact)) {
    return compact.split(/[-. ]/).join('-');
  }
  if (KRW_LITERAL_EXACT_PATTERN.test(compact)) {
    const amount = compact
      .replace(KRW_LITERAL_EXACT_PATTERN, '')
      .replace(/[\s,]/g, '');
    return `KRW${amount}`;
  }
  if (USD_PREFIX_LITERAL_EXACT_PATTERN.test(compact)) {
    const amount = compact
      .replace(USD_PREFIX_LITERAL_EXACT_PATTERN, '')
      .replace(/[\s,]/g, '');
    return `USD${amount}`;
  }
  if (USD_SUFFIX_LITERAL_EXACT_PATTERN.test(compact)) {
    const amount = compact
      .replace(USD_SUFFIX_LITERAL_EXACT_PATTERN, '')
      .replace(/[\s,]/g, '');
    return `USD${amount}`;
  }
  if (KOREAN_FULL_DATE_EXACT_PATTERN.test(compact) || ISO_DATE_EXACT_PATTERN.test(compact)) {
    return normalizeFullDate(compact);
  }
  return compact
    .replace(/,/g, '')
    .replace(/\s+/g, '')
    .replace(/gb|mb/gi, unit => unit.toUpperCase());
}

export function extractContentQualityV3ImportantLiterals(text: string): readonly string[] {
  if (!text) return Object.freeze([]);
  const matches = text.match(IMPORTANT_LITERAL_PATTERN) ?? [];
  return Object.freeze([...new Set(matches.map(normalizeImportantLiteral))]);
}
