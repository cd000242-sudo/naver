import type { StructuredContent } from './contentGenerator.js';

const MODEL_DISCLOSURE_PATTERNS = Object.freeze([
  /^\s*\[(?:광고|제휴|협찬|파트너스)\]/iu,
  /(?:제휴\s*링크|어필리에이트\s*링크).{0,100}(?:포함|수수료|커미션|대가|지급|발생)/iu,
  /(?:쇼핑커넥트|제휴\s*마케팅|파트너스\s*활동).{0,100}(?:수수료|커미션|광고비|대가|지급|발생|제공받)/iu,
  /(?:수수료|커미션|광고비|경제적\s*대가).{0,80}(?:지급받|제공받|받을\s*수|발생할\s*수).{0,20}(?:있습니다|있어요|있음)/iu,
]);

function isModelDisclosureSentence(value: string): boolean {
  const normalized = value.replace(/\s+/gu, ' ').trim();
  return Boolean(normalized) && MODEL_DISCLOSURE_PATTERNS.some(pattern => pattern.test(normalized));
}

function stripModelGeneratedShoppingDisclosureTitle(value: unknown): {
  text: string;
  changed: boolean;
} {
  const source = typeof value === 'string' ? value : '';
  const withoutMarker = source.replace(/^\s*\[(?:광고|제휴|협찬|파트너스)\]\s*/iu, '');
  const repaired = stripModelGeneratedShoppingDisclosureText(withoutMarker);
  return {
    text: repaired.text,
    changed: withoutMarker !== source || repaired.changed,
  };
}

export function stripModelGeneratedShoppingDisclosureText(value: unknown): {
  text: string;
  changed: boolean;
} {
  const source = typeof value === 'string' ? value : '';
  if (!source.trim()) return { text: source, changed: false };

  let changed = false;
  const lines = source.replace(/\r\n?/gu, '\n').split('\n');
  const repaired = lines.map((line) => {
    if (!line.trim()) return '';
    const sentences = line.split(/(?<=[.!?。！？])\s+/u);
    const kept = sentences.filter((sentence) => {
      const remove = isModelDisclosureSentence(sentence);
      if (remove) changed = true;
      return !remove;
    });
    return kept.join(' ').trim();
  });

  return {
    text: repaired.join('\n').replace(/\n{3,}/gu, '\n\n').trim(),
    changed,
  };
}

/**
 * Removes only AI-authored disclosure prose. The publisher-owned
 * `ftcDisclosure` field is deliberately preserved byte-for-byte.
 */
export function stripModelGeneratedShoppingDisclosures(
  content: Readonly<StructuredContent>,
): { content: StructuredContent; repaired: boolean } {
  const selectedTitle = stripModelGeneratedShoppingDisclosureTitle(content.selectedTitle);
  const legacyTitleValue = (content as StructuredContent & { title?: string }).title;
  const legacyTitle = stripModelGeneratedShoppingDisclosureTitle(legacyTitleValue);
  const titleCandidates = content.titleCandidates
    .map((candidate) => {
      const repaired = stripModelGeneratedShoppingDisclosureTitle(candidate.text);
      return repaired.text ? { ...candidate, text: repaired.text } : null;
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null);
  const titleAlternatives = content.titleAlternatives
    .map(alternative => stripModelGeneratedShoppingDisclosureTitle(alternative).text)
    .filter(Boolean);
  const fallbackTitle = titleCandidates[0]?.text
    || titleAlternatives[0]
    || '상품 정보 확인 가이드';
  const safeSelectedTitle = selectedTitle.text || fallbackTitle;
  const safeLegacyTitle = legacyTitle.text || safeSelectedTitle;
  const titleCollectionsChanged = titleCandidates.some((candidate, index) => (
    candidate.text !== content.titleCandidates[index]?.text
  ))
    || titleCandidates.length !== content.titleCandidates.length
    || titleAlternatives.some((alternative, index) => (
      alternative !== content.titleAlternatives[index]
    ))
    || titleAlternatives.length !== content.titleAlternatives.length;
  const body = stripModelGeneratedShoppingDisclosureText(content.bodyPlain);
  const legacyContent = stripModelGeneratedShoppingDisclosureText(content.content);
  const introduction = stripModelGeneratedShoppingDisclosureText(content.introduction);
  const conclusion = stripModelGeneratedShoppingDisclosureText(content.conclusion);
  let headingChanged = false;
  const headings = content.headings.map((heading, index) => {
    const repairedTitle = stripModelGeneratedShoppingDisclosureTitle(heading.title);
    const repairedContent = stripModelGeneratedShoppingDisclosureText(heading.content);
    if (repairedTitle.changed || repairedContent.changed) headingChanged = true;
    if (!repairedTitle.changed && !repairedContent.changed) return heading;
    return {
      ...heading,
      title: repairedTitle.text || `상품 정보 ${index + 1}`,
      content: repairedContent.text,
    };
  });
  const repaired = selectedTitle.changed
    || legacyTitle.changed
    || titleCollectionsChanged
    || body.changed
    || legacyContent.changed
    || introduction.changed
    || conclusion.changed
    || headingChanged;

  if (!repaired) return { content: content as StructuredContent, repaired: false };
  return {
    repaired: true,
    content: {
      ...content,
      selectedTitle: safeSelectedTitle,
      titleCandidates,
      titleAlternatives,
      ...(legacyTitleValue === undefined ? {} : { title: safeLegacyTitle }),
      bodyPlain: body.text,
      content: content.content === undefined ? content.content : legacyContent.text,
      introduction: content.introduction === undefined ? content.introduction : introduction.text,
      conclusion: content.conclusion === undefined ? content.conclusion : conclusion.text,
      headings,
    },
  };
}
