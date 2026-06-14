type LooseRecord = Record<string, any>;

interface RecoveredHeading {
  title: string;
  content: string;
  summary: string;
  keywords: string[];
  imagePrompt: string;
}

export interface StructuredRecoveryResult {
  bodyRecovered: boolean;
  headingsRecovered: boolean;
  bodySource?: string;
  headingsSource?: string;
}

const BODY_TEXT_KEYS = [
  'bodyPlain',
  'body',
  'content',
  'article',
  'articleText',
  'mainText',
  'markdown',
  'plainText',
  'text',
  'postBody',
  'fullText',
  'answer',
  'description',
];

const BODY_HTML_KEYS = [
  'bodyHtml',
  'html',
  'articleHtml',
  'contentHtml',
  'postHtml',
];

const SECTION_KEYS = [
  'headings',
  'sections',
  'bodySections',
  'articleSections',
  'chapters',
  'blocks',
  'items',
  'outline',
];

const PARAGRAPH_KEYS = [
  'paragraphs',
  'sentences',
  'lines',
  'bullets',
];

const TITLE_KEYS = [
  'selectedTitle',
  'title',
  'heading',
  'headline',
  'subtitle',
  'name',
  'question',
];

const NESTED_CONTAINER_KEYS = [
  'article',
  'post',
  'result',
  'data',
  'payload',
  'output',
  'response',
  'message',
];

function isRecord(value: unknown): value is LooseRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function cleanWhitespace(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

function stripHtml(value: string): string {
  return cleanWhitespace(
    value
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p\s*>/gi, '\n\n')
      .replace(/<\/h[1-6]\s*>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"'),
  );
}

function normalizeTextValue(value: unknown, html = false): string {
  if (typeof value === 'string') {
    const text = html ? stripHtml(value) : cleanWhitespace(value);
    return text;
  }

  if (Array.isArray(value)) {
    return cleanWhitespace(
      value
        .map((item) => normalizeTextValue(item, html))
        .filter(Boolean)
        .join('\n\n'),
    );
  }

  return '';
}

function normalizeForCompare(value: string): string {
  return value.replace(/\s+/g, '').toLowerCase();
}

function isMeaningfulBodyText(text: string, title: string): boolean {
  const compact = normalizeForCompare(text);
  if (compact.length < 30) return false;

  const normalizedTitle = normalizeForCompare(title);
  if (normalizedTitle && compact === normalizedTitle) return false;
  if (normalizedTitle && compact.length <= normalizedTitle.length + 12 && compact.includes(normalizedTitle)) {
    return false;
  }

  return true;
}

function firstString(record: LooseRecord, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function extractParagraphText(record: LooseRecord): string {
  for (const key of PARAGRAPH_KEYS) {
    const text = normalizeTextValue(record[key]);
    if (text) return text;
  }
  return '';
}

function extractSectionBody(section: unknown): string {
  if (typeof section === 'string') return cleanWhitespace(section);
  if (!isRecord(section)) return '';

  const directText = BODY_TEXT_KEYS
    .filter((key) => !TITLE_KEYS.includes(key))
    .map((key) => normalizeTextValue(section[key]))
    .find(Boolean);
  if (directText) return directText;

  const directHtml = BODY_HTML_KEYS
    .map((key) => normalizeTextValue(section[key], true))
    .find(Boolean);
  if (directHtml) return directHtml;

  return extractParagraphText(section);
}

function extractSectionTitle(section: unknown, fallbackIndex: number): string {
  if (!isRecord(section)) return `본문 ${fallbackIndex + 1}`;
  return firstString(section, TITLE_KEYS) || `본문 ${fallbackIndex + 1}`;
}

function getSectionArray(content: LooseRecord): { key: string; sections: unknown[] } | null {
  for (const key of SECTION_KEYS) {
    const value = content[key];
    if (Array.isArray(value) && value.length > 0) {
      return { key, sections: value };
    }
  }
  return null;
}

function extractHeadingsFromSections(content: LooseRecord): { key: string; headings: RecoveredHeading[] } | null {
  const sectionArray = getSectionArray(content);
  if (!sectionArray) return null;

  const headings: RecoveredHeading[] = [];
  sectionArray.sections.forEach((section, index) => {
    const title = extractSectionTitle(section, index);
    const body = extractSectionBody(section);
    if (!body) return;

    headings.push({
      title,
      content: body,
      summary: body,
      keywords: [],
      imagePrompt: '',
    });
  });

  if (headings.length < 1) return null;
  return { key: sectionArray.key, headings };
}

function extractHeadingsFromNestedContainers(
  content: LooseRecord,
  depth = 0,
  prefix = '',
): { key: string; headings: RecoveredHeading[] } | null {
  if (depth > 2) return null;

  for (const key of NESTED_CONTAINER_KEYS) {
    const value = content[key];
    if (!isRecord(value)) continue;

    const nestedPrefix = prefix ? `${prefix}.${key}` : key;
    const sectionResult = extractHeadingsFromSections(value);
    if (sectionResult) {
      return {
        key: `${nestedPrefix}.${sectionResult.key}`,
        headings: sectionResult.headings,
      };
    }

    const deeperResult = extractHeadingsFromNestedContainers(value, depth + 1, nestedPrefix);
    if (deeperResult) return deeperResult;
  }

  return null;
}

function extractBodyFromSections(content: LooseRecord, title: string): { key: string; body: string } | null {
  const headingsResult = extractHeadingsFromSections(content);
  if (!headingsResult) return null;

  const body = headingsResult.headings
    .map((heading) => `${heading.title}\n\n${heading.content}`)
    .join('\n\n\n');

  if (!isMeaningfulBodyText(body, title)) return null;
  return { key: headingsResult.key, body };
}

function extractBodyFromDirectAliases(content: LooseRecord, title: string): { key: string; body: string } | null {
  for (const key of BODY_TEXT_KEYS) {
    const body = normalizeTextValue(content[key]);
    if (body && isMeaningfulBodyText(body, title)) return { key, body };
  }

  for (const key of BODY_HTML_KEYS) {
    const body = normalizeTextValue(content[key], true);
    if (body && isMeaningfulBodyText(body, title)) return { key, body };
  }

  const paragraphText = extractParagraphText(content);
  if (paragraphText && isMeaningfulBodyText(paragraphText, title)) {
    return { key: 'paragraphs', body: paragraphText };
  }

  return null;
}

function extractBodyFromNestedContainers(
  content: LooseRecord,
  title: string,
  depth = 0,
  prefix = '',
): { key: string; body: string } | null {
  if (depth > 2) return null;

  for (const key of NESTED_CONTAINER_KEYS) {
    const value = content[key];
    if (!isRecord(value)) continue;

    const nestedPrefix = prefix ? `${prefix}.${key}` : key;
    const direct = extractBodyFromDirectAliases(value, title);
    if (direct) {
      return {
        key: `${nestedPrefix}.${direct.key}`,
        body: direct.body,
      };
    }

    const sectionBody = extractBodyFromSections(value, title);
    if (sectionBody) {
      return {
        key: `${nestedPrefix}.${sectionBody.key}`,
        body: sectionBody.body,
      };
    }

    const deeperBody = extractBodyFromNestedContainers(value, title, depth + 1, nestedPrefix);
    if (deeperBody) return deeperBody;
  }

  return null;
}

function hasUsableBody(content: LooseRecord): boolean {
  return typeof content.bodyPlain === 'string' && content.bodyPlain.trim().length > 0;
}

function hasUsableHeadings(content: LooseRecord): boolean {
  return Array.isArray(content.headings) && content.headings.length > 0;
}

export function recoverLooseStructuredContentFields(content: unknown): StructuredRecoveryResult {
  const result: StructuredRecoveryResult = {
    bodyRecovered: false,
    headingsRecovered: false,
  };

  if (!isRecord(content)) return result;

  const title = firstString(content, ['selectedTitle', 'title']) || '';

  if (!hasUsableHeadings(content)) {
    const headingsResult = extractHeadingsFromSections(content) || extractHeadingsFromNestedContainers(content);
    if (headingsResult) {
      content.headings = headingsResult.headings;
      result.headingsRecovered = true;
      result.headingsSource = headingsResult.key;
    }
  }

  if (!hasUsableBody(content)) {
    const direct = extractBodyFromDirectAliases(content, title);
    const sectionBody =
      direct ||
      extractBodyFromSections(content, title) ||
      extractBodyFromNestedContainers(content, title);

    if (sectionBody) {
      content.bodyPlain = sectionBody.body;
      result.bodyRecovered = true;
      result.bodySource = sectionBody.key;
    }
  }

  return result;
}
