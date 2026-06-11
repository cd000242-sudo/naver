import type { Frame, Page } from 'puppeteer';

export interface MobileRichHtmlOptions {
  maxChunkChars?: number;
  highlight?: boolean;
  maxHighlights?: number;
  fontSizePx?: number;
  tableTheme?: SoftTableTheme;
  highlightTheme?: SoftHighlightTheme;
  headingTheme?: SoftHeadingTheme;
  toc?: boolean;
  boxedHeadings?: boolean;
  centerAlign?: boolean;
}

export interface MobileRichHtmlResult {
  html: string;
  plainText: string;
  highlightCount: number;
  tableCount: number;
  paragraphCount: number;
}

export interface RichPasteResult {
  ok: boolean;
  method: 'clipboard-html' | 'none';
  reason?: string;
  beforeChars: number;
  afterChars: number;
  beforeTables: number;
  afterTables: number;
}

export interface SoftTableTheme {
  name: string;
  accent: string;
  headerBg: string;
  headerText: string;
  rowBg: string;
  altRowBg: string;
  border: string;
}

export interface SoftHighlightTheme {
  name: string;
  background: string;
  text: string;
  border: string;
  accent: string;
  panelBg: string;
  headingBg: string;
}

export interface SoftHeadingTheme {
  name: string;
  text: string;
  accent: string;
  markerBg: string;
  muted: string;
}

export interface RichArticleThemes {
  tableTheme: SoftTableTheme;
  highlightTheme: SoftHighlightTheme;
  headingTheme: SoftHeadingTheme;
}

// 22자: 2026-06-11 사용자 레퍼런스(직접 수정한 발행물) 라인 폭 실측값.
// 38자는 모바일 폭(19px 기준 ~20자)에서 재줄바꿈을 일으켜 단어 중간 꺾임을
// 만들었다 — 청크가 화면 폭보다 좁아야 이중 꺾임이 사라진다.
const DEFAULT_MAX_CHUNK_CHARS = 22;
const DEFAULT_MAX_HIGHLIGHTS = 7;
const SECTION_HIGHLIGHT_MIN_SCORE = 3;
const INLINE_FORMAT_COMMANDS = ['bold', 'italic', 'underline', 'strikeThrough', 'subscript', 'superscript'];
const TEXT_DECORATION_RESET = 'text-decoration:none';
const FONT_STYLE_RESET = 'font-style:normal';

export const SOFT_TABLE_THEMES: SoftTableTheme[] = [
  {
    name: 'sage',
    accent: '#4f8f73',
    headerBg: '#e5f3ec',
    headerText: '#173f31',
    rowBg: '#fbfefd',
    altRowBg: '#f3faf6',
    border: '#c7dfd3',
  },
  {
    name: 'sky',
    accent: '#4f7fa8',
    headerBg: '#e7f1fb',
    headerText: '#173955',
    rowBg: '#fbfdff',
    altRowBg: '#f2f7fd',
    border: '#c7d9ea',
  },
  {
    name: 'lavender',
    accent: '#7a6aa8',
    headerBg: '#eeeaf8',
    headerText: '#332b55',
    rowBg: '#fefcff',
    altRowBg: '#f7f4fc',
    border: '#d8d0eb',
  },
  {
    name: 'peach',
    accent: '#b77a55',
    headerBg: '#faefe6',
    headerText: '#5c321e',
    rowBg: '#fffdfb',
    altRowBg: '#fbf4ee',
    border: '#ead2bd',
  },
  {
    name: 'rose',
    accent: '#aa6675',
    headerBg: '#faeaf0',
    headerText: '#552b36',
    rowBg: '#fffdfd',
    altRowBg: '#fcf4f7',
    border: '#e8cbd3',
  },
  {
    name: 'sand',
    accent: '#9a844f',
    headerBg: '#f4efd9',
    headerText: '#493c18',
    rowBg: '#fffefa',
    altRowBg: '#f9f6e9',
    border: '#ded3a6',
  },
];

export function pickSoftTableTheme(random: () => number = Math.random): SoftTableTheme {
  const safeRandom = Math.max(0, Math.min(0.999999, random()));
  return SOFT_TABLE_THEMES[Math.floor(safeRandom * SOFT_TABLE_THEMES.length)];
}

export const SOFT_HIGHLIGHT_THEMES: SoftHighlightTheme[] = [
  {
    name: 'warm-yellow',
    background: '#fff3bf',
    text: '#3f3210',
    border: '#f1d978',
    accent: '#c99a2e',
    panelBg: '#fffaf0',
    headingBg: '#fff5d8',
  },
  {
    name: 'soft-mint',
    background: '#dff5ea',
    text: '#123d2b',
    border: '#a9ddc2',
    accent: '#3f8f69',
    panelBg: '#f3fbf7',
    headingBg: '#e8f7ef',
  },
  {
    name: 'calm-sky',
    background: '#e1f0ff',
    text: '#173955',
    border: '#b7d7f4',
    accent: '#4f7fa8',
    panelBg: '#f4f9ff',
    headingBg: '#eaf4ff',
  },
  {
    name: 'soft-lavender',
    background: '#eee7fb',
    text: '#332b55',
    border: '#d5c7ef',
    accent: '#7a6aa8',
    panelBg: '#faf7ff',
    headingBg: '#f1ecfb',
  },
  {
    name: 'gentle-peach',
    background: '#ffe8d8',
    text: '#5c321e',
    border: '#efc6a9',
    accent: '#b77a55',
    panelBg: '#fff8f3',
    headingBg: '#fff0e6',
  },
  {
    name: 'quiet-rose',
    background: '#f9e3ea',
    text: '#552b36',
    border: '#e5bdc8',
    accent: '#aa6675',
    panelBg: '#fff7f9',
    headingBg: '#faecf1',
  },
];

export function pickSoftHighlightTheme(random: () => number = Math.random): SoftHighlightTheme {
  const safeRandom = Math.max(0, Math.min(0.999999, random()));
  return SOFT_HIGHLIGHT_THEMES[Math.floor(safeRandom * SOFT_HIGHLIGHT_THEMES.length)];
}

export const SOFT_HEADING_THEMES: SoftHeadingTheme[] = [
  {
    name: 'ink-line',
    text: '#3f3430',
    accent: '#8b6f62',
    markerBg: '#f4ece8',
    muted: '#9a8278',
  },
  {
    name: 'forest-line',
    text: '#233b32',
    accent: '#5a8a70',
    markerBg: '#edf7f1',
    muted: '#789487',
  },
  {
    name: 'navy-line',
    text: '#23354b',
    accent: '#5c7da6',
    markerBg: '#edf4fb',
    muted: '#748aa5',
  },
  {
    name: 'plum-line',
    text: '#3d3148',
    accent: '#80649b',
    markerBg: '#f3edf8',
    muted: '#8d7a9f',
  },
  {
    name: 'slate-line',
    text: '#34383d',
    accent: '#7b8794',
    markerBg: '#f1f4f6',
    muted: '#8c96a1',
  },
  {
    name: 'clay-line',
    text: '#4a3329',
    accent: '#a06f55',
    markerBg: '#fbefe8',
    muted: '#a18374',
  },
];

export function pickSoftHeadingTheme(random: () => number = Math.random): SoftHeadingTheme {
  const safeRandom = Math.max(0, Math.min(0.999999, random()));
  return SOFT_HEADING_THEMES[Math.floor(safeRandom * SOFT_HEADING_THEMES.length)];
}

function nextTheme<T>(themes: T[], current: T): T {
  const index = themes.indexOf(current);
  return themes[(index + 1) % themes.length];
}

function hasOverlappingThemeName(a: string, b: string): boolean {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  return left.includes(right) || right.includes(left);
}

export function pickRichArticleThemes(random: () => number = Math.random): RichArticleThemes {
  const tableTheme = pickSoftTableTheme(random);
  let highlightTheme = pickSoftHighlightTheme(random);
  let headingTheme = pickSoftHeadingTheme(random);

  if (hasOverlappingThemeName(highlightTheme.name, tableTheme.name)) {
    highlightTheme = nextTheme(SOFT_HIGHLIGHT_THEMES, highlightTheme);
  }

  if (
    hasOverlappingThemeName(headingTheme.name, tableTheme.name) ||
    hasOverlappingThemeName(headingTheme.name, highlightTheme.name)
  ) {
    headingTheme = nextTheme(SOFT_HEADING_THEMES, headingTheme);
  }

  return { tableTheme, highlightTheme, headingTheme };
}

const STOP_WORDS = new Set([
  '그리고',
  '그래서',
  '하지만',
  '그러나',
  '때문에',
  '이번',
  '오늘',
  '정도',
  '경우',
  '부분',
  '사람',
  '사용',
  '확인',
  '내용',
  '방법',
  '추천',
  '정리',
  '포인트',
  '블로그',
  '네이버',
]);

const IMPORTANT_PATTERNS = [
  /핵심|중요|결론|요약|주의|반드시|필수|추천|선정|비교|차이|장점|단점|체크/i,
  /AI\s*브리핑|네이버\s*메이트|Mate|SEO|검색|노출/i,
  /\d+(?:\.\d+)?\s*(?:%|원|만원|개|가지|일|시간|분|초|배|위|점)/,
];

const READABILITY_STOP_WORDS = new Set([
  'and',
  'or',
  'the',
  'this',
  'that',
  'with',
  'from',
  'naver',
  '\uADF8\uB9AC\uACE0',
  '\uADF8\uB798\uC11C',
  '\uD558\uC9C0\uB9CC',
  '\uADF8\uB7EC\uB098',
  '\uC774\uBC88',
  '\uC624\uB298',
  '\uC815\uB3C4',
  '\uACBD\uC6B0',
  '\uBD80\uBD84',
  '\uC0AC\uB78C',
  '\uC0AC\uC6A9',
  '\uD655\uC778',
  '\uB0B4\uC6A9',
  '\uBC29\uBC95',
  '\uCD94\uCC9C',
  '\uC815\uB9AC',
  '\uC0AC\uC9C4',
  '\uBE14\uB85C\uADF8',
  '\uB124\uC774\uBC84',
]);

const IMPORTANT_KEYWORDS = [
  'ai',
  'seo',
  'mate',
  'core',
  'important',
  'must',
  'required',
  'conclusion',
  'summary',
  'recommend',
  'warning',
  'compare',
  'difference',
  'benefit',
  'risk',
  'result',
  'proof',
  'experience',
  'review',
  'check',
  'tip',
  '\uD575\uC2EC',
  '\uC911\uC694',
  '\uACB0\uB860',
  '\uC694\uC57D',
  '\uC8FC\uC758',
  '\uBC18\uB4DC\uC2DC',
  '\uD544\uC218',
  '\uCD94\uCC9C',
  '\uC120\uC815',
  '\uBE44\uAD50',
  '\uCC28\uC774',
  '\uC7A5\uC810',
  '\uB2E8\uC810',
  '\uCCB4\uD06C',
  '\uAE30\uC900',
  '\uADFC\uAC70',
  '\uACBD\uD5D8',
  '\uD6C4\uAE30',
  '\uBB38\uC81C',
  '\uD574\uACB0',
  '\uACB0\uACFC',
  '\uC218\uC775',
  '\uD6A8\uACFC',
  '\uC804\uB7B5',
  '\uC2E4\uD589',
];

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeText(value: string): string {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

function normalizeDanglingClosingBrackets(value: string): string {
  return value
    .replace(/\[\s*([^\]\n]{4,180})\s*\n+\s*\]/g, (_match, body: string) => {
      const compact = body.replace(/\s+/g, ' ').trim();
      return compact ? `[ ${compact} ]` : '';
    })
    .replace(/(^|\n)\s*\]\s*(?=\n|$)/g, '$1');
}

function normalizeKoreanVerdictLabels(value: string): string {
  const verdictLabel = '(?:한\\s*줄\\s*(?:판정|결론|정리)|한줄\\s*(?:판정|결론|정리))';
  return value
    .replace(new RegExp(`^\\s*\\[\\s*${verdictLabel}\\s*[:：]\\s*([^\\]\\n]{4,220})\\s*\\]\\s*$`, 'gim'), '$1')
    .replace(new RegExp(`^\\s*${verdictLabel}\\s*[:：]\\s*`, 'gim'), '');
}

function normalizeInlineNumberedLists(value: string): string {
  return value
    .split('\n')
    .map((line) => {
      const markers = line.match(/\b\d{1,2}[.)]\s+/g) || [];
      if (markers.length === 0) return line;
      if (markers.length === 1 && /^\s*\d{1,2}[.)]\s+/.test(line)) return line;
      return line.replace(/\s+(?=\d{1,2}[.)]\s+)/g, '\n\n').trim();
    })
    .join('\n');
}

function normalizeInlineDashLists(value: string): string {
  return value
    .split('\n')
    .map((line) => {
      if (!/(^|\s)-\s+\S/.test(line)) return line;
      return line.replace(/\s+-\s+/g, '\n\n- ').trim();
    })
    .join('\n');
}

function normalizeInlineQaMarkers(value: string): string {
  return value
    .replace(/[ \t]+(?=Q\s*\d*\s*[\.:]\s+)/gi, '\n\n')
    .replace(/[ \t]+(?=A\s*\d*\s*[\.:]\s+)/gi, '\n');
}

function normalizeMateReadableText(value: string): string {
  return normalizeInlineQaMarkers(
    normalizeInlineDashLists(
      normalizeInlineNumberedLists(
        normalizeKoreanVerdictLabels(normalizeDanglingClosingBrackets(value))
      )
    )
  )
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

function stripInlineMarkdown(value: string): string {
  return value
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

function isMarkdownTableBlock(lines: string[]): boolean {
  if (lines.length < 2) return false;
  const pipeRows = lines.filter(line => line.includes('|'));
  if (pipeRows.length < 2) return false;
  return pipeRows.some(line => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line));
}

function splitTableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(cell => stripInlineMarkdown(cell.trim()));
}

function isTableDivider(line: string): boolean {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function tableStyle(theme: SoftTableTheme): string {
  return [
    'width:100%',
    'border-collapse:collapse',
    'margin:10px 0 16px',
    'font-size:15px',
    'line-height:1.65',
    TEXT_DECORATION_RESET,
    FONT_STYLE_RESET,
    `border:1px solid ${theme.border}`,
    `border-top:3px solid ${theme.accent}`,
  ].join(';');
}

function tableCellStyle(theme: SoftTableTheme, rowIndex: number, header = false): string {
  if (header) {
    return [
      `background-color:${theme.headerBg}`,
      `color:${theme.headerText}`,
      `border:1px solid ${theme.border}`,
      'padding:9px 10px',
      'font-weight:700',
      'text-align:center',
      TEXT_DECORATION_RESET,
      FONT_STYLE_RESET,
    ].join(';');
  }

  return [
    `background-color:${rowIndex % 2 === 0 ? theme.rowBg : theme.altRowBg}`,
    `border:1px solid ${theme.border}`,
    'padding:9px 10px',
    'vertical-align:top',
    TEXT_DECORATION_RESET,
    FONT_STYLE_RESET,
  ].join(';');
}

function highlightStyle(theme: SoftHighlightTheme, strong = false): string {
  return [
    `background-color:${theme.background}`,
    `color:${theme.text}`,
    strong ? 'font-weight:700' : 'font-weight:600',
    'border-radius:4px',
    'padding:0 2px',
    TEXT_DECORATION_RESET,
    FONT_STYLE_RESET,
  ].join(';');
}

function paragraphStyle(fontSizePx: number, centerAlign: boolean): string {
  return [
    `font-size:${fontSizePx}px`,
    'line-height:1.95',
    'margin:0 auto 30px',
    'max-width:520px',
    centerAlign ? 'text-align:center' : 'text-align:left',
    'color:#5f4b45',
    'background-color:#ffffff',
    'word-break:keep-all',
    'overflow-wrap:break-word',
    TEXT_DECORATION_RESET,
    FONT_STYLE_RESET,
  ].join(';');
}

function paragraphSpacerHtml(fontSizePx: number, centerAlign: boolean): string {
  return `<p data-rich-spacer="true" style="${[
    `font-size:${fontSizePx}px`,
    'line-height:1.4',
    'margin:0 auto 18px',
    'max-width:520px',
    centerAlign ? 'text-align:center' : 'text-align:left',
    'color:#5f4b45',
    'background-color:#ffffff',
    'word-break:keep-all',
    'overflow-wrap:break-word',
    TEXT_DECORATION_RESET,
    FONT_STYLE_RESET,
  ].join(';')}"><br></p>`;
}

function shouldInsertParagraphSpacer(html: string): boolean {
  return /^<p\b/.test(html)
    && !html.includes('data-rich-heading="true"')
    && !html.includes('data-rich-toc="true"')
    && !html.includes('data-rich-spacer="true"');
}

function joinHtmlPartsWithParagraphSpacers(parts: string[], spacerHtml: string): string {
  const joined: string[] = [];
  parts.forEach((part, index) => {
    joined.push(part);
    if (index < parts.length - 1 && shouldInsertParagraphSpacer(part)) {
      joined.push(spacerHtml);
    }
  });
  return joined.join('\n\n');
}

function qaQuestionStyle(): string {
  return [
    'font-size:24px',
    'line-height:1.65',
    'margin:34px auto 12px',
    'max-width:520px',
    'text-align:center',
    'color:#5a3f35',
    'background-color:#ffffff',
    'font-weight:500',
    'word-break:keep-all',
    'overflow-wrap:break-word',
    TEXT_DECORATION_RESET,
    FONT_STYLE_RESET,
  ].join(';');
}

function headingMarkerStyle(theme: SoftHeadingTheme): string {
  return [
    'display:inline',
    'max-width:100%',
    'padding:0 6px 4px',
    `background-color:${theme.markerBg}`,
    `border-bottom:2px solid ${theme.accent}`,
    `color:${theme.text}`,
    'font-weight:800',
    'box-sizing:border-box',
    TEXT_DECORATION_RESET,
    FONT_STYLE_RESET,
  ].join(';');
}

function headingParagraphStyle(theme: SoftHeadingTheme, index: number): string {
  return [
    'max-width:520px',
    'margin:28px auto 18px',
    'font-size:20px',
    'line-height:1.7',
    'text-align:center',
    'word-break:keep-all',
    'overflow-wrap:break-word',
    `color:${theme.text}`,
    TEXT_DECORATION_RESET,
    FONT_STYLE_RESET,
  ].join(';');
}

function headingNumberStyle(theme: SoftHeadingTheme): string {
  return [
    'display:block',
    `color:${theme.muted}`,
    'font-size:13px',
    'line-height:1.4',
    'font-weight:700',
    'margin:0 0 4px',
    TEXT_DECORATION_RESET,
    FONT_STYLE_RESET,
  ].join(';');
}

function tocStyle(): string {
  return [
    'max-width:520px',
    'margin:12px auto 26px',
    'padding:0',
    'box-sizing:border-box',
    'text-align:center',
    TEXT_DECORATION_RESET,
    FONT_STYLE_RESET,
  ].join(';');
}

function tocTitleStyle(theme: SoftHeadingTheme): string {
  return [
    'margin:0 0 10px',
    `color:${theme.text}`,
    'font-size:18px',
    'line-height:1.45',
    'font-weight:800',
    'text-align:center',
    TEXT_DECORATION_RESET,
    FONT_STYLE_RESET,
  ].join(';');
}

function tocItemStyle(): string {
  return [
    'margin:0 0 7px',
    'font-size:16px',
    'line-height:1.65',
    'text-align:center',
    'word-break:keep-all',
    TEXT_DECORATION_RESET,
    FONT_STYLE_RESET,
  ].join(';');
}

function tocNumberStyle(theme: SoftHeadingTheme): string {
  return [
    'display:inline-block',
    `color:${theme.accent}`,
    'font-weight:800',
    'margin-right:7px',
    TEXT_DECORATION_RESET,
    FONT_STYLE_RESET,
  ].join(';');
}

function tocLinkStyle(theme: SoftHeadingTheme): string {
  return [
    `color:${theme.text}`,
    'background-color:#ffffff',
    TEXT_DECORATION_RESET,
    FONT_STYLE_RESET,
  ].join(';');
}

function markdownTableToHtml(lines: string[], theme: SoftTableTheme): { html: string; plain: string } {
  const rows = lines.filter(line => line.includes('|') && !isTableDivider(line)).map(splitTableCells);
  if (rows.length === 0) return { html: '', plain: '' };

  const [header, ...bodyRows] = rows;
  const headerHtml = header.map(cell => `<th style="${tableCellStyle(theme, 0, true)}">${escapeHtml(cell)}</th>`).join('');
  const bodyHtml = bodyRows
    .map((row, rowIndex) => `<tr>${row.map(cell => `<td style="${tableCellStyle(theme, rowIndex)}">${escapeHtml(cell)}</td>`).join('')}</tr>`)
    .join('');
  const plain = rows.map(row => row.join('\t')).join('\n');

  return {
    html: `<table data-rich-table-theme="${theme.name}" style="${tableStyle(theme)}"><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`,
    plain,
  };
}

function splitSentencesForMobile(value: string): string[] {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (!compact) return [];
  const matches = compact.match(/[^.!?。！？\n]+[.!?。！？]?/g);
  return (matches && matches.length > 0 ? matches : [compact])
    .map(sentence => sentence.trim())
    .filter(Boolean);
}

function getMobileBreakCandidates(windowText: string): number[] {
  const candidates: number[] = [];
  const semanticPatterns = [
    /기준(?:으로|,|\s)/g,
    /입장에서\s*/g,
    /위해\s*/g,
    /곳에\s*(?:두고|놓고)?/g,
    /두고,?\s*/g,
    /향하게\s*/g,
    /경우(?:가|는)?\s*/g,
    /때보다,?\s*/g,
    /있지만,?\s*/g,
    /때문에,?\s*/g,
    /그리고\s*/g,
    /또는\s*/g,
    /하지만\s*/g,
    /,\s*/g,
    /，\s*/g,
    /、\s*/g,
    /·/g,
    /\//g,
    /\s+/g,
  ];

  for (const pattern of semanticPatterns) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(windowText)) !== null) {
      const cut = match.index + match[0].length;
      if (cut > 0 && cut < windowText.length) candidates.push(cut);
    }
  }

  return Array.from(new Set(candidates));
}

function splitLongSentenceForMobile(sentence: string, maxChars: number): string[] {
  if (sentence.length <= maxChars) return [sentence];

  const chunks: string[] = [];
  let rest = sentence.trim();
  while (rest.length > maxChars) {
    const windowText = rest.slice(0, Math.min(rest.length, maxChars + 12));
    const minCut = Math.max(10, Math.floor(maxChars * 0.55));
    const target = Math.min(maxChars, Math.max(minCut, Math.floor(rest.length / 2)));
    const candidates = getMobileBreakCandidates(windowText).filter(cut => cut >= minCut);
    let cut = candidates.length > 0
      ? candidates.sort((a, b) => Math.abs(a - target) - Math.abs(b - target))[0]
      : -1;
    if (cut < 0) {
      // [2026-06-11] No clause boundary in the window — back off to the
      // nearest SPACE instead of slicing inside a word ("범/위에" breaks).
      const lastSpace = windowText.lastIndexOf(' ', maxChars);
      cut = lastSpace >= minCut ? lastSpace + 1 : maxChars;
    }
    // [2026-06-11] Never strand punctuation at the start of the next line
    // (", 빠뜨리기" class) — semantic patterns like 기준(으로) cut before a
    // trailing comma, so consume it into the current line.
    while (cut < rest.length && /[,，、.!?…:;)\]]/.test(rest[cut])) cut += 1;
    const piece = rest.slice(0, cut).trim();
    rest = rest.slice(cut).trim();
    // [2026-06-11] A tiny tail reads as an orphan line — glue it back.
    if (piece && rest.length > 0 && rest.length <= 4) {
      chunks.push(`${piece} ${rest}`.trim());
      rest = '';
      break;
    }
    if (piece) chunks.push(piece);
  }
  if (rest) chunks.push(rest);
  return chunks;
}

function buildReadableParagraphs(paragraph: string, maxChars: number): string[] {
  const compactParagraph = paragraph.replace(/\s+/g, ' ').trim();
  if (/^\[\s*.+\s*\]$/.test(compactParagraph)) {
    return [compactParagraph];
  }

  const sentences = splitSentencesForMobile(paragraph);
  const chunks: string[] = [];

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;
    chunks.push(splitLongSentenceForMobile(trimmed, maxChars).join('\n'));
  }

  return chunks;
}

function scoreImportantSentence(value: string): number {
  const plain = stripInlineMarkdown(value).replace(/\s+/g, ' ').trim();
  const lower = plain.toLowerCase();
  let score = 0;
  for (const keyword of IMPORTANT_KEYWORDS) {
    if (lower.includes(keyword.toLowerCase())) score += 3;
  }
  if (plain.length >= 24 && plain.length <= 110) score += 1;
  if (/[!?]/.test(plain)) score += 1;
  if (/\d|%/.test(plain)) score += 1;
  return score;
}

function extractHighlightTerms(text: string): string[] {
  const words = normalizeText(stripInlineMarkdown(text))
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .map(word => word.trim())
    .filter(word => word.length >= 2 && word.length <= 18 && !READABILITY_STOP_WORDS.has(word.toLowerCase()));

  const counts = new Map<string, number>();
  for (const word of words) {
    counts.set(word, (counts.get(word) || 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([word, count]) => ({ word, score: count * 2 + word.length }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map(item => item.word)
    .sort((a, b) => b.length - a.length);
}

function applyTermHighlights(escapedText: string, terms: string[], theme: SoftHighlightTheme): string {
  let result = escapedText;
  for (const term of terms) {
    const escapedTerm = escapeHtml(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!escapedTerm) continue;
    result = result
      .split(/(<[^>]+>)/g)
      .map(part => {
        if (part.startsWith('<') && part.endsWith('>')) return part;
        return part.replace(
          new RegExp(escapedTerm, 'g'),
          match => `<span style="${highlightStyle(theme, true)}">${match}</span>`
        );
      })
      .join('');
  }
  return result;
}

function formatInline(text: string, _terms: string[], highlightWhole: boolean, theme: SoftHighlightTheme): string {
  const parts: Array<{ text: string; bold: boolean }> = [];
  const re = /\*\*([^*]+)\*\*|__([^_]+)__|`([^`]+)`/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ text: text.slice(lastIndex, match.index), bold: false });
    }
    parts.push({ text: match[1] || match[2] || match[3] || '', bold: true });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), bold: false });
  }

  const inner = parts
    .map(part => {
      const escaped = escapeHtml(part.text);
      const withBreaks = escaped.replace(/\n/g, '<br>');
      return part.bold ? `<strong>${withBreaks}</strong>` : withBreaks;
    })
    .join('');

  if (!highlightWhole) return `<span style="background-color:#ffffff;color:inherit;${TEXT_DECORATION_RESET};${FONT_STYLE_RESET};">${inner}</span>`;
  return `<span style="${highlightStyle(theme, true)}">${inner}</span>`;
}

function isListBlock(lines: string[]): boolean {
  return lines.length > 1 && lines.every(line => /^\s*(?:[-*•]|\d+[.)])\s+/.test(line));
}

function listBlockToHtml(lines: string[], terms: string[], theme: SoftHighlightTheme): { html: string; plain: string } {
  const ordered = lines.every(line => /^\s*\d+[.)]\s+/.test(line));
  const tag = ordered ? 'ol' : 'ul';
  const items = lines.map(line => line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim());
  return {
    html: `<${tag} style="max-width:520px;margin:0 auto 18px;padding-left:24px;line-height:1.85;font-size:17px;">${items.map(item => `<li>${formatInline(item, terms, false, theme)}</li>`).join('')}</${tag}>`,
    plain: items.map(item => `- ${stripInlineMarkdown(item)}`).join('\n'),
  };
}

function isStandaloneAnswerLabel(line: string): boolean {
  return /^(?:A|답변)\s*[\.:：)]?\s*$/i.test(line.trim());
}

function stripAnswerPrefix(line: string): string {
  return line
    .trim()
    .replace(/^(?:A|답변)\s*[\.:：)]\s*/i, '')
    .trim();
}

function parseQuestionLine(line: string): string | null {
  const trimmed = line.trim();
  const match = trimmed.match(/^(?:Q(?:\s*\d+)?|질문\s*\d*)\s*[\.:：)]\s*(.+)$/i);
  if (!match) return null;
  return (match[1]?.trim() || trimmed)
    .replace(/\s*(?:A|답변)\s*[\.:：)]?\s*$/i, '')
    .trim();
}

interface ReadableParsedQuestionLine {
  number: number | null;
  text: string;
}

interface ReadableParsedAnswerLine {
  number: number | null;
  text: string;
}

function isReadableListBlock(lines: string[]): boolean {
  return lines.length > 1 && lines.every(line => /^\s*(?:[-*\u2022]|\d+[.)])\s+/u.test(line));
}

function readableListBlockToHtml(lines: string[], terms: string[], theme: SoftHighlightTheme): { html: string; plain: string } {
  const ordered = lines.every(line => /^\s*\d+[.)]\s+/.test(line));
  const items = lines.map((line) => {
    const markerMatch = line.match(/^\s*(?:(\d+)[.)]|[-*\u2022])\s+/u);
    const marker = ordered && markerMatch?.[1] ? `${markerMatch[1]})` : '-';
    const content = line.replace(/^\s*(?:[-*\u2022]|\d+[.)])\s+/u, '').trim();
    return { marker, content };
  });

  return {
    html: items
      .map(item => `<p style="${paragraphStyle(17, true)}">${formatInline(`${item.marker} ${item.content}`, terms, false, theme)}</p>`)
      .join('\n'),
    plain: items.map(item => `${item.marker} ${stripInlineMarkdown(item.content)}`).join('\n\n'),
  };
}

function isReadableStandaloneAnswerLabel(line: string): boolean {
  return /^A\s*\d*\s*[\.:]?\s*$/i.test(line.trim());
}

function parseReadableAnswerLine(line: string): ReadableParsedAnswerLine | null {
  const match = line.trim().match(/^A\s*(\d*)\s*[\.:]\s*(.+)$/i);
  if (!match) return null;
  const number = match[1] ? Number(match[1]) : null;
  return {
    number: Number.isFinite(number) ? number : null,
    text: match[2]?.trim() || '',
  };
}

function parseReadableQuestionLine(line: string): ReadableParsedQuestionLine | null {
  const match = line.trim().match(/^Q\s*(\d*)\s*[\.:]\s*(.+)$/i);
  if (!match) return null;
  const number = match[1] ? Number(match[1]) : null;
  const text = (match[2]?.trim() || '')
    .replace(/\s*A\s*\d*\s*[\.:]?\s*$/i, '')
    .trim();
  return {
    number: Number.isFinite(number) ? number : null,
    text,
  };
}

function formatReadableQuestion(question: ReadableParsedQuestionLine, fallbackNumber: number): string {
  const number = question.number ?? fallbackNumber;
  return `Q${number}. ${question.text}`;
}

function formatReadableAnswer(text: string, fallbackNumber: number | null): string {
  const number = fallbackNumber && fallbackNumber > 0 ? fallbackNumber : 1;
  return `A${number}: ${text.trim()}`;
}

type RenderNode =
  | { type: 'table'; html: string; plain: string }
  | { type: 'list'; html: string; plain: string; count: number }
  | { type: 'heading'; id: string; title: string; level: number; index: number }
  | { type: 'qa-question'; text: string; plain: string; sectionIndex: number }
  | { type: 'paragraph'; text: string; plain: string; score: number; sectionIndex: number };

interface HeadingEntry {
  id: string;
  title: string;
  level: number;
  index: number;
}

function sectionId(index: number): string {
  return `naver-mate-section-${index}`;
}

function buildTocHtml(headings: HeadingEntry[], theme: SoftHeadingTheme): { html: string; plain: string } {
  const items = headings
    .map(heading => (
      `<p style="${tocItemStyle()}">` +
      `<span style="${tocNumberStyle(theme)}">${String(heading.index).padStart(2, '0')}</span>` +
      `<a href="#${heading.id}" style="${tocLinkStyle(theme)}">${escapeHtml(heading.title)}</a>` +
      `</p>`
    ))
    .join('');

  return {
    html: `<div data-rich-toc="true" style="${tocStyle()}"><p style="${tocTitleStyle(theme)}">\uBAA9\uCC28</p>${items}</div>`,
    plain: ['\uBAA9\uCC28', ...headings.map((heading, index) => `${index + 1}. ${heading.title}`)].join('\n'),
  };
}

function selectImportantParagraphs(nodes: RenderNode[], maxHighlights: number): Set<number> {
  const bestBySection = new Map<number, { index: number; score: number }>();

  nodes.forEach((node, index) => {
    if (node.type !== 'paragraph' || node.score < SECTION_HIGHLIGHT_MIN_SCORE) return;
    const current = bestBySection.get(node.sectionIndex);
    if (!current || node.score > current.score) {
      bestBySection.set(node.sectionIndex, { index, score: node.score });
    }
  });

  const selected = Array.from(bestBySection.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, maxHighlights)
    .map(item => item.index)
    .sort((a, b) => a - b);

  return new Set(selected);
}

export function buildMobileRichHtml(text: string, options: MobileRichHtmlOptions = {}): MobileRichHtmlResult {
  const normalized = normalizeMateReadableText(normalizeText(text));
  const maxChunkChars = options.maxChunkChars ?? DEFAULT_MAX_CHUNK_CHARS;
  const maxHighlights = options.maxHighlights ?? DEFAULT_MAX_HIGHLIGHTS;
  const fontSizePx = options.fontSizePx ?? 19;
  const enableHighlight = options.highlight !== false;
  const terms: string[] = [];
  const articleThemes = pickRichArticleThemes();
  const tableTheme = options.tableTheme ?? articleThemes.tableTheme;
  const highlightTheme = options.highlightTheme ?? articleThemes.highlightTheme;
  const headingTheme = options.headingTheme ?? articleThemes.headingTheme;
  const enableToc = options.toc === true;
  const boxedHeadings = options.boxedHeadings !== false;
  const centerAlign = options.centerAlign !== false;

  if (!normalized) {
    return { html: '', plainText: '', highlightCount: 0, tableCount: 0, paragraphCount: 0 };
  }

  // [2026-06-11] LLMs sometimes emit markdown tables with BLANK lines between
  // rows; the block splitter then shreds the table into per-row paragraphs
  // and the raw "| --- |" source gets published as text (live screenshot).
  // Stitch such rows back together — but keep a blank line that separates two
  // COMPLETE tables (next pipe-line followed by its own |---| separator).
  const stitched = (() => {
    const srcLines = normalized.split('\n');
    const isRow = (s: string) => /^[ \t]*\|.*\|[ \t]*$/.test(s);
    const isSep = (s: string) => /^[ \t]*\|[ \t:|-]+\|[ \t]*$/.test(s) && s.includes('-');
    const out: string[] = [];
    for (let i = 0; i < srcLines.length; i += 1) {
      out.push(srcLines[i]);
      if (!isRow(srcLines[i])) continue;
      let j = i + 1;
      while (j < srcLines.length && srcLines[j].trim() === '') j += 1;
      if (j > i + 1 && j < srcLines.length && isRow(srcLines[j])) {
        let k = j + 1;
        while (k < srcLines.length && srcLines[k].trim() === '') k += 1;
        const nextStartsNewTable = !isSep(srcLines[j]) && k < srcLines.length && isSep(srcLines[k]);
        if (!nextStartsNewTable) {
          i = j - 1; // drop the blank gap — the next row continues this table
        }
      }
    }
    return out.join('\n');
  })();

  const blocks = stitched.split(/\n{2,}/).map(block => block.trim()).filter(Boolean);
  const nodes: RenderNode[] = [];
  const headings: HeadingEntry[] = [];
  let currentSectionIndex = 0;
  let headingIndex = 0;
  let tableCount = 0;
  let qaSequence = 0;
  let pendingAnswerNumber: number | null = null;

  for (const block of blocks) {
    const lines = block.split('\n').map(line => line.trim()).filter(Boolean);

    if (isMarkdownTableBlock(lines)) {
      const table = markdownTableToHtml(lines, tableTheme);
      if (table.html) {
        nodes.push({ type: 'table', html: table.html, plain: table.plain });
        tableCount += 1;
        continue;
      }
    }

    if (isReadableListBlock(lines)) {
      const list = readableListBlockToHtml(lines, terms, highlightTheme);
      nodes.push({ type: 'list', html: list.html, plain: list.plain, count: lines.length });
      continue;
    }

    for (const line of lines) {
      if (isReadableStandaloneAnswerLabel(line)) {
        pendingAnswerNumber = pendingAnswerNumber ?? (qaSequence > 0 ? qaSequence : null);
        continue;
      }

      const question = parseReadableQuestionLine(line);
      if (question) {
        qaSequence = question.number ?? (qaSequence + 1);
        const questionText = formatReadableQuestion(question, qaSequence);
        nodes.push({
          type: 'qa-question',
          text: questionText,
          plain: stripInlineMarkdown(questionText),
          sectionIndex: currentSectionIndex,
        });
        pendingAnswerNumber = qaSequence;
        continue;
      }

      const parsedAnswer = parseReadableAnswerLine(line);
      const lineWithoutAnswerPrefix = parsedAnswer ? parsedAnswer.text : stripAnswerPrefix(line);
      if (!lineWithoutAnswerPrefix) continue;

      const headingMatch = lineWithoutAnswerPrefix.match(/^(#{1,3})\s+(.+)$/);
      if (headingMatch) {
        pendingAnswerNumber = null;
        headingIndex += 1;
        currentSectionIndex = headingIndex;
        const title = stripInlineMarkdown(headingMatch[2]);
        const id = sectionId(headingIndex);
        const level = headingMatch[1].length;
        headings.push({ id, title, level, index: headingIndex });
        nodes.push({ type: 'heading', id, title, level, index: headingIndex });
        continue;
      }

      const answerNumber = parsedAnswer?.number ?? pendingAnswerNumber;
      const cleanedLine = parsedAnswer || pendingAnswerNumber !== null
        ? formatReadableAnswer(lineWithoutAnswerPrefix, answerNumber)
        : lineWithoutAnswerPrefix;
      pendingAnswerNumber = null;

      const chunks = buildReadableParagraphs(cleanedLine, maxChunkChars);
      for (const chunk of chunks) {
        nodes.push({
          type: 'paragraph',
          text: chunk,
          plain: stripInlineMarkdown(chunk),
          score: scoreImportantSentence(chunk),
          sectionIndex: currentSectionIndex,
        });
      }
    }
  }

  const selectedHighlights = enableHighlight ? selectImportantParagraphs(nodes, maxHighlights) : new Set<number>();
  const htmlParts: string[] = [];
  const plainParts: string[] = [];
  let paragraphCount = 0;

  if (enableToc && headings.length >= 2) {
    const toc = buildTocHtml(headings, headingTheme);
    htmlParts.push(toc.html);
    plainParts.push(toc.plain);
  }

  nodes.forEach((node, index) => {
    if (node.type === 'table') {
      htmlParts.push(node.html);
      plainParts.push(node.plain);
      return;
    }

    if (node.type === 'list') {
      htmlParts.push(node.html);
      plainParts.push(node.plain);
      paragraphCount += node.count;
      return;
    }

    if (node.type === 'heading') {
      const content = escapeHtml(node.title);
      const tag = node.level <= 2 ? 'h2' : 'h3';
      if (boxedHeadings) {
        htmlParts.push(
          `<p id="${node.id}" data-rich-heading="true" style="${headingParagraphStyle(headingTheme, node.index)}">` +
          `<span style="${headingNumberStyle(headingTheme)}">${String(node.index).padStart(2, '0')}</span>` +
          `<span style="${headingMarkerStyle(headingTheme)}">${content}</span>` +
          `</p>`
        );
      } else {
        htmlParts.push(`<${tag} id="${node.id}" data-rich-heading="true">${content}</${tag}>`);
      }
      plainParts.push(node.title);
      return;
    }

    if (node.type === 'qa-question') {
      htmlParts.push(`<p style="${qaQuestionStyle()}">${formatInline(node.text, terms, false, highlightTheme)}</p>`);
      plainParts.push(node.plain);
      paragraphCount += 1;
      return;
    }

    const important = selectedHighlights.has(index);
    htmlParts.push(
      `<p style="${paragraphStyle(fontSizePx, centerAlign)}">${formatInline(node.text, terms, important, highlightTheme)}</p>`
    );
    plainParts.push(node.plain);
    paragraphCount += 1;
  });

  return {
    html: joinHtmlPartsWithParagraphSpacers(htmlParts, paragraphSpacerHtml(fontSizePx, centerAlign)),
    plainText: plainParts.join('\n\n'),
    highlightCount: selectedHighlights.size,
    tableCount,
    paragraphCount,
  };
}

async function readEditorStats(frame: Frame): Promise<{ chars: number; tables: number; text: string }> {
  return await frame.evaluate(() => {
    const roots = Array.from(document.querySelectorAll('.se-section-text, .se-main-container, .se-component'));
    const text = roots.map(el => (el as HTMLElement).innerText || el.textContent || '').join('\n').trim();
    return {
      chars: text.length,
      tables: document.querySelectorAll('table, .se-component.se-table, .se-component-table').length,
      text,
    };
  }).catch(() => ({ chars: 0, tables: 0, text: '' }));
}

async function grantClipboardPermission(page: Page, frame: Frame): Promise<void> {
  const origin = (() => {
    try {
      return new URL(frame.url() || page.url()).origin;
    } catch {
      return 'https://blog.naver.com';
    }
  })();

  const browserTarget = page.browser().target();
  const client = await browserTarget.createCDPSession();
  try {
    await client.send('Browser.grantPermissions', {
      origin,
      permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'],
    } as any);
  } finally {
    await client.detach().catch(() => undefined);
  }
}

async function resetInlineFormattingState(page: Page, frame: Frame): Promise<void> {
  const resetCommands = async (target: Page | Frame): Promise<void> => {
    await target.evaluate((commands: string[]) => {
      try {
        const editable =
          (document.querySelector('.se-main-container .se-text-paragraph, .se-section-text, [contenteditable="true"]') as HTMLElement | null) ||
          (document.activeElement as HTMLElement | null);
        editable?.focus?.();

        for (const command of commands) {
          if (typeof document.queryCommandState !== 'function' || typeof document.execCommand !== 'function') continue;
          if (document.queryCommandState(command)) {
            document.execCommand(command, false);
          }
        }
      } catch {
        // Toolbar reset is a best-effort guard. Rich HTML styles still prevent inheritance.
      }
    }, INLINE_FORMAT_COMMANDS).catch(() => undefined);
  };

  const resetToolbarButtons = async (target: Page | Frame): Promise<void> => {
    await target.evaluate(() => {
      const selectors = [
        'button[data-name="bold"]',
        'button[data-name="italic"]',
        'button[data-name="underline"]',
        'button[data-name="strikethrough"]',
        'button[data-name="strikeThrough"]',
        'button[data-command="bold"]',
        'button[data-command="italic"]',
        'button[data-command="underline"]',
        'button[data-command="strikethrough"]',
        'button[data-command="strikeThrough"]',
      ];

      for (const selector of selectors) {
        const button = document.querySelector(selector);
        if (!(button instanceof HTMLElement)) continue;
        const active =
          button.classList.contains('active') ||
          button.classList.contains('selected') ||
          button.classList.contains('on') ||
          button.classList.contains('se-toolbar-button-active') ||
          button.getAttribute('aria-pressed') === 'true';
        if (active) button.click();
      }
    }).catch(() => undefined);
  };

  await resetCommands(frame);
  await resetCommands(page);
  await resetToolbarButtons(frame);
  await resetToolbarButtons(page);
}

export async function focusLastEditableLine(page: Page, frame: Frame): Promise<void> {
  const focusedBySelection = await frame.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll('.se-main-container .se-text-paragraph, .se-section-text, [contenteditable="true"]')) as HTMLElement[];
    for (let i = candidates.length - 1; i >= 0; i -= 1) {
      const target = candidates[i];
      const rect = target.getBoundingClientRect();
      const style = window.getComputedStyle(target);
      if (rect.width <= 0 || rect.height <= 0 || style.visibility === 'hidden' || style.display === 'none') continue;
      const editable = (target.closest('[contenteditable="true"]') as HTMLElement | null) || target;
      target.scrollIntoView({ block: 'center', inline: 'nearest' });
      editable.focus();
      const range = document.createRange();
      range.selectNodeContents(target);
      range.collapse(false);
      const selection = window.getSelection();
      if (!selection) return false;
      selection.removeAllRanges();
      selection.addRange(range);
      return true;
    }
    return false;
  }).catch(() => false);

  if (focusedBySelection) return;

  const handles = await frame.$$('.se-text-paragraph, .se-section-text, [contenteditable="true"]');
  for (let i = handles.length - 1; i >= 0; i -= 1) {
    const handle = handles[i];
    const box = await handle.boundingBox().catch(() => null);
    if (!box || box.width <= 0 || box.height <= 0 || box.x < -1000) continue;
    await page.mouse.click(box.x + Math.min(40, Math.max(8, box.width / 4)), box.y + Math.min(16, Math.max(8, box.height / 2)));
    await page.keyboard.press('End').catch(() => undefined);
    return;
  }

  await frame.click('body').catch(() => undefined);
}

// 2026-06-11 structure dump: the redesigned editor renders the DOCUMENT in a
// read-only component tree (.se-container > .se-content > SECTION.se-canvas >
// ARTICLE.se-components-wrap > .se-component...) with NO contenteditable on
// it. The single [contenteditable] in the page is a hidden INPUT PROXY —
// keystrokes only reach the document when SmartEditor's model caret is set,
// which happens through real clicks on the rendered paragraphs. Text stuck in
// the proxy renders nowhere and never publishes. Therefore: read/verify
// against the component tree, and anchor the caret by clicking paragraphs.
function editableRootText(frame: Frame): Promise<string> {
  return frame
    .evaluate(() => {
      const scope = (document.querySelector('.se-components-wrap, .se-canvas, .se-content') as HTMLElement | null)
        || document.body;
      return (scope?.innerText || scope?.textContent || '').replace(/\s+$/g, '');
    })
    .catch(() => '');
}

/**
 * Post-paste keyboard recovery ladder. Right after a clipboard paste the
 * editor may still be digesting the pasted DOM — keystrokes silently die.
 * This waits for the paste to settle, then verifies with a probe Enter that
 * keyboard input actually registers, escalating focus methods until it does.
 * The probe Enter is real tail spacing — callers should type one Enter less.
 * Mouse is used only as the last resort, and only at the computed END-caret
 * position of the last text block (never mid-paragraph).
 */
export async function ensureTailTypingReady(
  page: Page,
  frame: Frame,
  log?: (message: string) => void
): Promise<boolean> {
  // 1) Wait until the editor stops mutating (paste digestion complete).
  let previousLength = -1;
  for (let i = 0; i < 12; i += 1) {
    const length = await frame
      .evaluate(() => (document.body?.innerText || '').length)
      .catch(() => -1);
    if (length >= 0 && length === previousLength) break;
    previousLength = length;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }

  // Primary anchor: a REAL click at the end of the last rendered paragraph.
  // SmartEditor sets its model caret from clicks on the component tree —
  // programmatic Selection on the hidden input proxy never does. Puppeteer's
  // element click handles the iframe offset math that broke the manual
  // coordinate path historically (N3).
  const clickParagraphEnd = async (textBearingOnly: boolean): Promise<void> => {
    const handle = await frame.evaluateHandle((onlyText) => {
      const wrap = (document.querySelector('.se-components-wrap, .se-canvas, .se-content') as HTMLElement | null)
        || document.body;
      const paras = Array.from(wrap.querySelectorAll('p.se-text-paragraph')) as HTMLElement[];
      for (let i = paras.length - 1; i >= 0; i -= 1) {
        if (onlyText && (paras[i].innerText || '').trim().length === 0) continue;
        const rect = paras[i].getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;
        paras[i].scrollIntoView({ block: 'center', inline: 'nearest' });
        return paras[i];
      }
      return null;
    }, textBearingOnly).catch(() => null);
    const el = handle ? handle.asElement() : null;
    if (!el) return;
    const box = await (el as import('puppeteer').ElementHandle<Element>).boundingBox().catch(() => null);
    if (!box) return;
    await (el as import('puppeteer').ElementHandle<Element>)
      .click({ offset: { x: Math.max(4, box.width - 6), y: Math.max(4, box.height - 6) } })
      .catch(() => undefined);
    await page.keyboard.press('End').catch(() => undefined);
  };

  // The literal LAST paragraph — empty ones included. After a link-card (or
  // image) converts, the editor leaves an EMPTY trailing paragraph below the
  // component and that is the ONLY caret position below the card. Skipping
  // empty paragraphs anchored typing ABOVE the card (2026-06-11 live: the
  // next block's divider landed between the URL text and its card).
  const clickLastParagraphEnd = async (): Promise<void> => clickParagraphEnd(false);
  // Text-bearing fallback — the old dead-keyboard observation said clicking
  // an empty block sometimes fails to revive input; the probe decides.
  const clickLastTextParagraphEnd = async (): Promise<void> => clickParagraphEnd(true);

  const caretEndClick = async (): Promise<void> => {
    // Scroll the true last block into view FIRST — clicking coordinates that
    // sit below the fold misses or hits the wrong paragraph (the cause of
    // tail-inserted-mid-body incidents). Rect is computed after the scroll.
    const rect = await frame.evaluate(() => {
      // Target the editable ROOT's last visible child — by definition the
      // final block, immune to editor-internal class changes (class-based
      // "last paragraph" lookups landed one block short on the redesign).
      let root: HTMLElement | null = null; let bestScore = -1;
      document.querySelectorAll('[contenteditable="true"]').forEach((el) => {
        const score = el.querySelectorAll('.se-component').length * 100000 + ((el as HTMLElement).innerText || '').length;
        if (score > bestScore) { bestScore = score; root = el as HTMLElement; }
      });
      if (!root) return null;
      const rootEl = root as HTMLElement;
      let el = rootEl.lastElementChild as HTMLElement | null;
      while (el) {
        const probe = el.getBoundingClientRect();
        // Must carry TEXT: clicking an empty trailing block does not restore
        // keyboard focus (live-observed) — only a text-bearing block does.
        const hasText = (el.innerText || el.textContent || '').trim().length > 0;
        if (hasText && probe.width > 0 && probe.height > 0) break;
        el = el.previousElementSibling as HTMLElement | null;
      }
      if (!el) return null;
      el.scrollIntoView({ block: 'center', inline: 'nearest' });
      const box = el.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const caret = range.getBoundingClientRect();
      const usable = caret && caret.width + caret.height > 0;
      return {
        x: usable ? caret.x : box.x + Math.min(12, box.width / 2),
        y: usable ? caret.y + caret.height / 2 : box.y + Math.max(4, box.height - 8),
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      };
    }).catch(() => null);
    if (!rect) return;

    const frameEl = await page.$('#mainFrame, iframe[name="mainFrame"]').catch(() => null);
    const frameBox = frameEl ? await frameEl.boundingBox().catch(() => null) : null;
    const baseX = frameBox?.x ?? 0;
    const baseY = frameBox?.y ?? 0;
    // Clamp inside the frame's visible area — never click outside it.
    const maxX = baseX + Math.min(rect.viewportWidth, frameBox?.width ?? rect.viewportWidth) - 2;
    const maxY = baseY + Math.min(rect.viewportHeight, frameBox?.height ?? rect.viewportHeight) - 2;
    const clickX = Math.min(Math.max(baseX + 2, baseX + rect.x), maxX);
    const clickY = Math.min(Math.max(baseY + 2, baseY + rect.y), maxY);
    await page.mouse.click(clickX, clickY).catch(() => undefined);
    // End only — Ctrl+End jumps the caret past the last managed paragraph
    // into trailing orphan blocks at the editable root, and everything typed
    // there is dropped by the publish serializer (2026-06-11 forensics:
    // divider/hook/hashtags all at depth 1 bare DIVs).
    await page.keyboard.press('End').catch(() => undefined);
  };

  const focusRootEnd = async (): Promise<void> => {
    await frame.evaluate(() => {
      let root: HTMLElement | null = null; let bestScore = -1;
      document.querySelectorAll('[contenteditable="true"]').forEach((el) => {
        const score = el.querySelectorAll('.se-component').length * 100000 + ((el as HTMLElement).innerText || '').length;
        if (score > bestScore) { bestScore = score; root = el as HTMLElement; }
      });
      if (!root) return;
      const rootEl = root as HTMLElement;
      rootEl.focus();
      // The caret must land INSIDE the last text-bearing block. Collapsing at
      // the root level (after the last component) renders fine in the editor,
      // but that text lives outside the SmartEditor component model and the
      // publish serializer drops it wholesale — 2026-06-11 live incident:
      // divider/CTA/hashtags all typed, all missing from the published post.
      let block = rootEl.lastElementChild as HTMLElement | null;
      while (block) {
        if ((block.innerText || block.textContent || '').trim().length > 0) break;
        block = block.previousElementSibling as HTMLElement | null;
      }
      const range = document.createRange();
      if (block) {
        let leaf: Node = block;
        while (leaf.lastChild) leaf = leaf.lastChild;
        if (leaf.nodeType === Node.TEXT_NODE) {
          range.setStart(leaf, (leaf.textContent || '').length);
          range.collapse(true);
        } else {
          range.selectNodeContents(leaf as HTMLElement);
          range.collapse(false);
        }
      } else {
        range.selectNodeContents(rootEl);
        range.collapse(false);
      }
      const selection = window.getSelection();
      if (!selection) return;
      selection.removeAllRanges();
      selection.addRange(range);
      (block || (rootEl.lastElementChild as HTMLElement | null))?.scrollIntoView({ block: 'center', inline: 'nearest' });
    }).catch(() => undefined);
  };

  const strategies: Array<{ name: string; run: () => Promise<void> }> = [
    // A REAL paragraph click FIRST — the redesigned editor only moves its
    // model caret on clicks; Selection tricks land in the hidden input proxy
    // (2026-06-11 structure dump: document tree has no contenteditable).
    { name: 'paragraph-end-click', run: clickLastParagraphEnd },
    // Same click but restricted to text-bearing paragraphs — covers the case
    // where clicking the trailing empty paragraph fails to revive input.
    { name: 'text-paragraph-end-click', run: clickLastTextParagraphEnd },
    // Manual-coordinate click as backup (legacy path, frame-offset math).
    { name: 'caret-end-click', run: caretEndClick },
    // Selection-based anchors only as last resorts — they cannot move the
    // model caret on the redesigned editor but are harmless.
    { name: 'root-end', run: focusRootEnd },
    {
      name: 'cdp-focus',
      run: async () => {
        const editableHandle = await frame.evaluateHandle(() => {
          let root: HTMLElement | null = null; let bestScore = -1;
          document.querySelectorAll('[contenteditable="true"]').forEach((el) => {
            const score = el.querySelectorAll('.se-component').length * 100000 + ((el as HTMLElement).innerText || '').length;
            if (score > bestScore) { bestScore = score; root = el as HTMLElement; }
          });
          return root;
        }).catch(() => null);
        const editable = editableHandle ? editableHandle.asElement() : null;
        if (editable) await (editable as import('puppeteer').ElementHandle<Element>).focus().catch(() => undefined);
        await focusRootEnd();
      },
    },
    { name: 'programmatic-focus', run: async () => focusLastEditableLine(page, frame) },
  ];

  // Structure-agnostic probe: type a sentinel char and confirm it (a)
  // actually registered and (b) landed at the very END of the document.
  // Counting paragraph nodes broke on the redesigned editor (real input was
  // misread as "no response"); reading text is class-independent.
  const SENTINEL = '￬'; // halfwidth won sign — never appears in content
  const probeTypingReady = async (): Promise<boolean> => {
    const before = await editableRootText(frame);
    await page.keyboard.type(SENTINEL).catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 220));
    const after = await editableRootText(frame);
    const registered = after.includes(SENTINEL) && after.length > before.length;
    const atEnd = after.endsWith(SENTINEL);
    // (c) the sentinel must sit INSIDE the document model — root-level text
    // renders in the editor but the publish serializer drops it (2026-06-11
    // live: whole tail lost). SELF-CALIBRATING: compare the sentinel's DOM
    // depth against real BODY text depth. A fixed `.se-component`/depth>=3
    // rule false-negatived the redesigned editor (live 2026-06-11 round 2:
    // every strategy "위치오류", typing fell back to an orphan caret, tail
    // dropped AGAIN while the probe's own sentinels survived publish).
    let inModel = false;
    if (registered) {
      inModel = await frame.evaluate((sentinel) => {
        const root = (document.querySelector('.se-components-wrap, .se-canvas, .se-content') as HTMLElement | null)
          || document.body;
        if (!root) return false;
        const rootEl = root as HTMLElement;
        const depthOf = (el: HTMLElement | null): number => {
          let depth = 0;
          let cur: HTMLElement | null = el;
          while (cur && cur !== rootEl) { depth += 1; cur = cur.parentElement; }
          return depth;
        };
        const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT);
        let sentinelEl: HTMLElement | null = null;
        let bodyDepthMax = 0;
        let node: Node | null;
        while ((node = walker.nextNode())) {
          const txt = node.textContent || '';
          if (txt.includes(sentinel)) {
            sentinelEl = node.parentElement;
            continue;
          }
          if (txt.trim().length >= 4 && node.parentElement) {
            const d = depthOf(node.parentElement);
            if (d > bodyDepthMax) bodyDepthMax = d;
          }
        }
        if (!sentinelEl) return false;
        if (sentinelEl.closest('.se-component')) return true;
        const sentinelDepth = depthOf(sentinelEl);
        // As deep as the real body text (−1 tolerance for span nesting) =
        // same structural layer the serializer keeps.
        return bodyDepthMax > 0
          ? sentinelDepth >= Math.max(1, bodyDepthMax - 1)
          : sentinelDepth >= 3;
      }, SENTINEL).catch(() => false);
    }
    if (after.includes(SENTINEL)) {
      await page.keyboard.press('Backspace').catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 150));
      // Cleanup verification — live 2026-06-11: two probe sentinels survived
      // into the PUBLISHED post. If Backspace missed, select the sentinel
      // itself and delete through a real key event (model-safe).
      for (let cleanupTry = 0; cleanupTry < 2; cleanupTry += 1) {
        const residue = await editableRootText(frame);
        if (!residue.includes(SENTINEL)) break;
        await frame.evaluate((sentinel) => {
          const root = (document.querySelector('.se-components-wrap, .se-canvas, .se-content') as HTMLElement | null)
            || document.body;
          if (!root) return;
          const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
          let node: Node | null;
          while ((node = walker.nextNode())) {
            const idx = (node.textContent || '').lastIndexOf(sentinel);
            if (idx >= 0) {
              const selection = window.getSelection();
              if (!selection) return;
              const range = document.createRange();
              range.setStart(node, idx);
              range.setEnd(node, idx + sentinel.length);
              selection.removeAllRanges();
              selection.addRange(range);
              return;
            }
          }
        }, SENTINEL).catch(() => undefined);
        await page.keyboard.press('Backspace').catch(() => undefined);
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
    }
    return registered && atEnd && inModel;
  };

  for (const strategy of strategies) {
    await strategy.run();
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (await probeTypingReady()) {
      log?.(`   ⌨️ 키보드 입력 확인 — 문서 끝 (${strategy.name})`);
      return true;
    }
    log?.(`   ⚠️ 키보드 미반응/위치오류 — 다음 단계 (${strategy.name})`);
  }
  // Ladder exhausted (callers proceed best-effort): leave the caret at the
  // structurally BEST position, not wherever the last fallback dropped it —
  // live 2026-06-11: the final fallback's orphan caret ate the whole tail.
  await clickLastParagraphEnd();
  return false;
}

export async function pasteRichHtmlAtCursor(
  page: Page,
  frame: Frame,
  html: string,
  plainText: string
): Promise<RichPasteResult> {
  const before = await readEditorStats(frame);
  const trimmedHtml = String(html || '').trim();
  const trimmedPlain = String(plainText || '').trim();

  if (!trimmedHtml || !trimmedPlain) {
    return {
      ok: false,
      method: 'none',
      reason: 'empty rich payload',
      beforeChars: before.chars,
      afterChars: before.chars,
      beforeTables: before.tables,
      afterTables: before.tables,
    };
  }

  try {
    await page.bringToFront().catch(() => undefined);
    await page.evaluate(() => window.focus()).catch(() => undefined);
    await focusLastEditableLine(page, frame).catch(() => undefined);
    await resetInlineFormattingState(page, frame).catch(() => undefined);
    await new Promise(resolve => setTimeout(resolve, 120));
    await grantClipboardPermission(page, frame).catch(() => undefined);

    const payload = { richHtml: trimmedHtml, fallbackText: trimmedPlain };
    const writeInPage = await page.evaluate(async ({ richHtml, fallbackText }) => {
      const ClipboardItemCtor = (window as any).ClipboardItem;
      if (!navigator.clipboard || !ClipboardItemCtor) {
        return { ok: false, reason: 'clipboard api unavailable' };
      }
      try {
        await navigator.clipboard.write([
          new ClipboardItemCtor({
            'text/html': new Blob([richHtml], { type: 'text/html' }),
            'text/plain': new Blob([fallbackText], { type: 'text/plain' }),
          }),
        ]);
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          reason: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
        };
      }
    }, payload).catch(error => ({
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    }));

    const writeResult = writeInPage.ok ? writeInPage : await frame.evaluate(async ({ richHtml, fallbackText }) => {
      const ClipboardItemCtor = (window as any).ClipboardItem;
      if (!navigator.clipboard || !ClipboardItemCtor) {
        return { ok: false, reason: 'clipboard api unavailable' };
      }
      try {
        await navigator.clipboard.write([
          new ClipboardItemCtor({
            'text/html': new Blob([richHtml], { type: 'text/html' }),
            'text/plain': new Blob([fallbackText], { type: 'text/plain' }),
          }),
        ]);
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          reason: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
        };
      }
    }, payload).catch(error => ({
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    }));

    if (!writeResult.ok) {
      const after = await readEditorStats(frame);
      return {
        ok: false,
        method: 'none',
        reason: writeResult.reason || 'clipboard write failed',
        beforeChars: before.chars,
        afterChars: after.chars,
        beforeTables: before.tables,
        afterTables: after.tables,
      };
    }

    await focusLastEditableLine(page, frame);
    await new Promise(resolve => setTimeout(resolve, 150));
    await page.keyboard.down('Control');
    await page.keyboard.press('V');
    await page.keyboard.up('Control');
    await new Promise(resolve => setTimeout(resolve, 800));

    const after = await readEditorStats(frame);
    const needle = trimmedPlain.replace(/\s+/g, ' ').slice(0, 12);
    const normalizedAfter = after.text.replace(/\s+/g, ' ');
    const inserted = (needle.length > 0 && normalizedAfter.includes(needle)) ||
      after.chars > before.chars + Math.min(20, trimmedPlain.length / 2) ||
      after.tables > before.tables;

    return {
      ok: inserted,
      method: inserted ? 'clipboard-html' : 'none',
      reason: inserted ? undefined : 'paste verification failed',
      beforeChars: before.chars,
      afterChars: after.chars,
      beforeTables: before.tables,
      afterTables: after.tables,
    };
  } catch (error) {
    const after = await readEditorStats(frame);
    return {
      ok: false,
      method: 'none',
      reason: error instanceof Error ? error.message : String(error),
      beforeChars: before.chars,
      afterChars: after.chars,
      beforeTables: before.tables,
      afterTables: after.tables,
    };
  }
}
