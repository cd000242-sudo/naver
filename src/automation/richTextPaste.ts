import type { Frame, KeyInput, Page } from 'puppeteer';

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
  method: 'clipboard-html' | 'paste-event-html' | 'clipboard-plain' | 'none';
  reason?: string;
  safeToFallback?: boolean;
  beforeChars: number;
  afterChars: number;
  beforeTables: number;
  afterTables: number;
}

export interface PasteRollbackState {
  restored: boolean;
  tailReady: boolean;
}

export function resolvePasteRollbackPolicy(state: PasteRollbackState): {
  safeToFallback: boolean;
  canContinuePasteFallback: boolean;
} {
  return {
    safeToFallback: state.restored,
    canContinuePasteFallback: state.restored && state.tailReady,
  };
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
const SMART_EDITOR_ROOT_SELECTORS = [
  'article.se-components-wrap',
  '.se-canvas > article.se-components-wrap',
  '.se-content article.se-components-wrap',
  '.se-components-wrap',
  '.se-main-container',
] as const;
// `.se-panel` is intentionally excluded here. Naver SmartEditor also uses
// that class in the normal editor layout, so treating it as a transient panel
// can hide the real article root and make tail/hashtag checks read 0 chars.
const SMART_EDITOR_PANEL_SELECTOR = '.se-popup, .se-layer, .se-modal, [role="dialog"], [aria-modal="true"]';

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

// [2026-07-03] LLM/원본이 인용부호를 줄바꿈으로 떼어놓는 경우가 있다.
//   "문장\n'" 처럼 닫는 따옴표가 홀로 다음 줄에 떨어지면 리치입력이 이를 별도 단락으로 렌더해
//   발행물에 "'문장" / "'" 두 줄로 나온다(사용자 실측). 홀로 남은 여닫는 따옴표를 인접 텍스트에
//   다시 붙여 한 줄로 만든다. normalizeDanglingClosingBrackets의 따옴표 버전.
function normalizeDanglingQuotes(value: string): string {
  return value
    // 닫는 따옴표만 홀로 다음 줄에 떨어짐 → 앞 줄 끝에 붙임 ("문장\n'" → "문장'")
    .replace(/([^\s'"‘’“”])[ \t]*\n+[ \t]*(['"‘’“”])(?=[ \t]*(?:\n|$))/g, '$1$2')
    // 여는 따옴표만 홀로 앞 줄에 있음 → 다음 줄 앞에 붙임 ("'\n문장" → "'문장")
    .replace(/(^|\n)[ \t]*(['"‘“])[ \t]*\n+[ \t]*(?=\S)/g, '$1$2');
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
        normalizeKoreanVerdictLabels(normalizeDanglingQuotes(normalizeDanglingClosingBrackets(value)))
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

// [2026-06-12] Pipe characters must NEVER reach the published post. Block
// detection alone missed two live cases: an orphan header row sharing a block
// with prose, and a row with trailing prose after its last pipe. Normalize
// per line — full rows become "first — rest · rest" sentences, dividers are
// dropped, and stray inline pipes become a readable separator.
function normalizeOrphanPipeLine(line: string): string | null {
  // The prompt's format example "| 항목 | 정리 |" gets copied verbatim by the
  // LLM as a stray header outside the real table — boilerplate, not content.
  // Pipeless variants ("· 항목 · 정리") also occur: the crawler feeds the
  // model previously contaminated posts and it reproduces them literally, so
  // this check must run BEFORE the pipe gate.
  if (/^[\s|·—–-]*항목[\s|·—–-]+정리[\s|·—–-]*$/.test(line)) return null;
  if (!line.includes('|')) return line;
  if (isTableDivider(line)) return null;
  const rowMatch = line.match(/^\s*(\|.+\|)(.*)$/);
  if (rowMatch) {
    const cells = splitTableCells(rowMatch[1]).filter(
      (cell) => cell.length > 0 && !/^:?-{3,}:?$/.test(cell),
    );
    const trailing = rowMatch[2].trim();
    if (cells.length === 0) return trailing || null;
    const sentence = cells.length >= 2
      ? `${cells[0]} — ${cells.slice(1).join(' · ')}`
      : cells[0];
    return trailing ? `${sentence} ${trailing}` : sentence;
  }
  const replaced = line.replace(/\s*\|+\s*/g, ' · ').replace(/^\s*·\s*/, '').replace(/\s*·\s*$/, '').trim();
  return replaced || null;
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

// [2026-07-04] 무의미한 라벨 열 제거 — 요약 표의 왼쪽 열이 본문 행마다 같은 라벨("핵심"×N, "항목"×N 등)로
//   반복되면 정보가 0이고 어색하다(사용자 지적). 본문 2행 이상 + 2열 이상 + 첫 열이 전부 동일할 때만 그 열을
//   드롭한다. 비교표(제품명·항목이 서로 다른 첫 열)는 영향 없음.
function dropUniformLabelColumn(rows: string[][]): string[][] {
  if (rows.length < 3) return rows; // header + 본문 2행 미만이면 판단 보류
  const colCount = rows[0]?.length ?? 0;
  if (colCount < 2) return rows;
  const firstColBody = rows.slice(1).map((r) => (r[0] || '').trim());
  const allSame = firstColBody.length >= 2 && firstColBody.every((v) => v && v === firstColBody[0]);
  if (!allSame) return rows;
  return rows.map((r) => r.slice(1)); // 헤더 포함 첫 열 제거
}

function markdownTableToHtml(lines: string[], theme: SoftTableTheme): { html: string; plain: string } {
  const rawRows = lines.filter(line => line.includes('|') && !isTableDivider(line)).map(splitTableCells);
  if (rawRows.length === 0) return { html: '', plain: '' };

  const rows = dropUniformLabelColumn(rawRows);
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

const TABLE_REFERENCE_CUE_RE = /(?:\uC544\uB798\s*\uD45C|\uD45C\uB85C\s*\uC815\uB9AC|\uD45C\uB97C\s*(?:\uBCF4|\uCC38\uACE0)|\uD45C\uC5D0\uC11C|\uBE44\uAD50\uD45C)/;

function hasTableReferenceCue(value: string): boolean {
  return TABLE_REFERENCE_CUE_RE.test(stripInlineMarkdown(String(value || '')));
}

function trimFallbackTableCell(value: string, fallback: string): string {
  const cleaned = stripInlineMarkdown(value)
    .replace(TABLE_REFERENCE_CUE_RE, '')
    .replace(/\s+/g, ' ')
    .trim();
  const source = cleaned || fallback;
  return source.length > 62 ? `${source.slice(0, 59).trim()}...` : source;
}

function plainTextFromRenderNode(node: RenderNode): string {
  if (node.type === 'heading') return node.title;
  if (node.type === 'qa-question') return node.plain;
  if (node.type === 'paragraph') return node.plain;
  if (node.type === 'list') return node.plain.replace(/\n+/g, ' ');
  if (node.type === 'table') return node.plain;
  return '';
}

function buildFallbackTableFromTableReference(nodes: readonly RenderNode[], theme: SoftTableTheme): RenderNode | null {
  const rows: string[][] = [];
  let currentHeading = '\uD575\uC2EC';

  for (const node of nodes) {
    if (node.type === 'heading') {
      currentHeading = trimFallbackTableCell(node.title, currentHeading);
      continue;
    }

    if (node.type !== 'paragraph' && node.type !== 'qa-question' && node.type !== 'list') continue;
    const plain = plainTextFromRenderNode(node);
    if (!plain || hasTableReferenceCue(plain)) continue;

    const cell = trimFallbackTableCell(plain, '');
    if (cell.length < 8) continue;
    rows.push([currentHeading, cell]);
    if (rows.length >= 3) break;
  }

  if (rows.length === 0) return null;
  if (rows.length === 1) {
    rows.push([
      '\uCD94\uAC00 \uD655\uC778',
      '\uC870\uAC74\uACFC \uC608\uC678\uB97C \uD568\uAED8 \uC810\uAC80\uD558\uBA74 \uC2E4\uC218\uB97C \uC904\uC77C \uC218 \uC788\uC5B4\uC694.',
    ]);
  }

  const table = markdownTableToHtml([
    '|\uD56D\uBAA9|\uD655\uC778 \uD3EC\uC778\uD2B8|',
    '|---|---|',
    ...rows.map(([label, detail]) => `|${label}|${detail}|`),
  ], theme);

  return table.html ? { type: 'table', html: table.html, plain: table.plain } : null;
}

function insertFallbackTableAfterReference(nodes: readonly RenderNode[], tableNode: RenderNode): RenderNode[] {
  const cueIndex = nodes.findIndex((node) => hasTableReferenceCue(plainTextFromRenderNode(node)));
  const insertIndex = cueIndex >= 0 ? cueIndex + 1 : Math.min(nodes.length, 1);
  return [
    ...nodes.slice(0, insertIndex),
    tableNode,
    ...nodes.slice(insertIndex),
  ];
}

const DOMAIN_DOT_PLACEHOLDER = '\uE000';
const DOMAIN_TOKEN_RE = /\b(?:https?:\/\/)?(?:www\.)?[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+){1,}(?:\/[^\s)]*)?/g;

function protectDomainDots(value: string): string {
  return value.replace(DOMAIN_TOKEN_RE, token => token.replace(/\./g, DOMAIN_DOT_PLACEHOLDER));
}

function restoreDomainDots(value: string): string {
  return value.replace(new RegExp(DOMAIN_DOT_PLACEHOLDER, 'g'), '.');
}

function getDomainTokenRanges(value: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  let match: RegExpExecArray | null;
  DOMAIN_TOKEN_RE.lastIndex = 0;
  while ((match = DOMAIN_TOKEN_RE.exec(value)) !== null) {
    ranges.push({ start: match.index, end: match.index + match[0].length });
  }
  return ranges;
}

function moveCutOutsideDomainToken(value: string, cut: number, minCut: number, maxCut: number): number {
  for (const range of getDomainTokenRanges(value)) {
    if (cut <= range.start || cut >= range.end) continue;
    if (range.end <= maxCut) return range.end;
    if (range.start >= minCut) return range.start;
  }
  return cut;
}

function splitSentencesForMobile(value: string): string[] {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (!compact) return [];
  const protectedCompact = protectDomainDots(compact);
  // [2026-07-03] 문장부호 뒤 닫는 따옴표("외롭다.'")는 문장에 붙들어 따옴표가 다음 줄로
  //   고립되지 않게 한다(dangling quote 재발 방지).
  const matches = protectedCompact.match(/[^.!?。！？\n]+[.!?。！？]?['"‘’“”]?/g);
  const raw = (matches && matches.length > 0 ? matches : [protectedCompact])
    .map(restoreDomainDots)
    .map(sentence => sentence.trim())
    .filter(Boolean);
  // [2026-07-03] 번호목록 마커("1." / "2)")가 마침표 때문에 한 문장으로 오인돼 홀로 분리되면,
  //   모바일 변환에서 "1." 다음에 빈 줄이 생기고 내용이 아래로 떨어진다. 마커만 남은 조각은
  //   다음 조각에 붙여 "1. 글문단"을 한 줄로 유지한다(목록 blocks로 안 묶인 blank-분리 항목 대비).
  const merged: string[] = [];
  for (const sentence of raw) {
    const prev = merged[merged.length - 1];
    if (prev && /^\d{1,2}[.)]$/.test(prev)) {
      merged[merged.length - 1] = `${prev} ${sentence}`.trim();
    } else {
      merged.push(sentence);
    }
  }
  return merged;
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
    cut = moveCutOutsideDomainToken(rest, cut, minCut, windowText.length);
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
  // [Phase 7.2 / R13] The theme set is resolved ONCE per post by the flow
  // entry (__richPasteThemes) and passed via options. The lazy pick below is
  // a warned fallback for un-migrated callers only — an eager per-call pick
  // could mix theme sets within one post when pasting in multiple chunks.
  let lazyThemes: RichArticleThemes | null = null;
  const fallbackThemes = (): RichArticleThemes => {
    if (!lazyThemes) {
      lazyThemes = pickRichArticleThemes();
      console.warn('[buildMobileRichHtml] ⚠️ 테마 미전달 — per-call 랜덤 폴백 (R13: 호출자가 pickRichArticleThemes 1회 해석 후 전달)');
    }
    return lazyThemes;
  };
  const tableTheme = options.tableTheme ?? fallbackThemes().tableTheme;
  const highlightTheme = options.highlightTheme ?? fallbackThemes().highlightTheme;
  const headingTheme = options.headingTheme ?? fallbackThemes().headingTheme;
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
    const rawLines = block.split('\n').map(line => line.trim()).filter(Boolean);

    if (isMarkdownTableBlock(rawLines)) {
      const table = markdownTableToHtml(rawLines, tableTheme);
      if (table.html) {
        nodes.push({ type: 'table', html: table.html, plain: table.plain });
        tableCount += 1;
        continue;
      }
    }

    // Not a valid table — neutralize any leftover pipe fragments per line
    // (orphan header rows, rows with trailing prose, stray dividers).
    // [2026-07-03] 텍스트 없는 빈 마크다운 헤딩 마커(예: 챗봇이 흘린 "##" 단독 줄)는 제거한다.
    //   헤딩 인식 정규식은 "#{1,4} 텍스트"만 잡아 마커를 벗기므로, 텍스트 없는 "##"는 평문으로
    //   새어 발행물에 리터럴 "##"로 나온다(사용자 실측). 공백 필수라 해시태그(#단어)는 보존.
    const lines = rawLines
      .map((line) => normalizeOrphanPipeLine(line))
      .filter((line): line is string => line !== null && line.length > 0 && !/^#{1,6}\s*$/.test(line));
    if (lines.length === 0) continue;

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

      // [2026-07-02] 마크다운 헤딩 접두(#{1,4} + 공백)는 스타일 헤딩으로 변환하며 마커를 제거한다
      //   → 타이핑 결과에 '##' 리터럴이 절대 남지 않는다. `#{1,3}` → `#{1,4}`로 확장해
      //   추출기(semiAutoHeadingExtractor의 `#{1,4}`)와 정렬 — `#### `가 평문으로 새던 갭 차단.
      //   공백 필수라 해시태그(`#단어`)는 건드리지 않는다.
      const headingMatch = lineWithoutAnswerPrefix.match(/^(#{1,4})\s+(.+)$/);
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

  let renderNodes = nodes;
  if (tableCount === 0 && hasTableReferenceCue(normalized)) {
    const fallbackTable = buildFallbackTableFromTableReference(nodes, tableTheme);
    if (fallbackTable) {
      renderNodes = insertFallbackTableAfterReference(nodes, fallbackTable);
      tableCount += 1;
    }
  }

  const selectedHighlights = enableHighlight ? selectImportantParagraphs(renderNodes, maxHighlights) : new Set<number>();
  const htmlParts: string[] = [];
  const plainParts: string[] = [];
  let paragraphCount = 0;

  if (enableToc && headings.length >= 2) {
    const toc = buildTocHtml(headings, headingTheme);
    htmlParts.push(toc.html);
    plainParts.push(toc.plain);
  }

  renderNodes.forEach((node, index) => {
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
  return await frame.evaluate(({ rootSelectors, panelSelector }) => {
    function getSmartEditorDocumentRoot(): HTMLElement | null {
      const candidates = Array.from(document.querySelectorAll(rootSelectors.join(','))) as HTMLElement[];
      let best: HTMLElement | null = null;
      let bestScore = -1;
      for (const candidate of candidates) {
        if (!(candidate instanceof HTMLElement)) continue;
        if (candidate.closest(panelSelector)) continue;
        const rect = candidate.getBoundingClientRect();
        const style = window.getComputedStyle(candidate);
        if (rect.width <= 0 || rect.height <= 0 || style.visibility === 'hidden' || style.display === 'none') continue;
        const componentCount = candidate.querySelectorAll('.se-component').length;
        const paragraphCount = candidate.querySelectorAll('.se-text-paragraph, p').length;
        const textLength = (candidate.innerText || candidate.textContent || '').trim().length;
        const roleScore = candidate.matches('article.se-components-wrap')
          ? 1000000
          : candidate.matches('.se-components-wrap')
            ? 900000
            : candidate.matches('.se-main-container')
              ? 100000
              : 0;
        const score = roleScore + componentCount * 1000 + paragraphCount * 100 + Math.min(textLength, 2000);
        if (score > bestScore) {
          bestScore = score;
          best = candidate;
        }
      }
      return best;
    }

    const root = getSmartEditorDocumentRoot();
    const scope = root || document.body;
    // [v2.11.135] Placeholder text (caption "사진 설명을 입력하세요", empty-
    // paragraph hints) appears and disappears with focus. Including it made
    // the before/after texts diverge mid-paste, so `afterText.startsWith(
    // beforeText)` false-negatived into EDITOR_PARTIAL_INSERT_UNRECOVERED on
    // blogs whose editor shows captions (live report: beforeChars=48,
    // afterChars=206, growth ≈ full 161-char section, needle absent).
    // Measure on a clone with placeholders and hidden helper labels removed.
    const clone = scope.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('.se-placeholder, .se-blind, .blind').forEach((el) => el.remove());
    const text = (clone.textContent || '').replace(/\s+/g, ' ').trim();
    return {
      chars: text.length,
      tables: scope.querySelectorAll('table, .se-component.se-table, .se-component-table').length,
      text,
    };
  }, {
    rootSelectors: [...SMART_EDITOR_ROOT_SELECTORS],
    panelSelector: SMART_EDITOR_PANEL_SELECTOR,
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

// [2026-06-22] Refund-crisis fix: this guard used to declare a paste "visible"
// whenever the FIRST 12 chars of the content appeared (or any 21+ chars landed).
// On slower client machines a long article often pastes only its first paragraph
// before the snapshot is read, so a 171/1528-char partial paste passed as success.
// The publish then proceeded with a truncated body and was blocked downstream by
// the pre-publish guard, surfacing to users as a mysterious "발행 실패" loop.
// Now substantial content must actually land most of itself (coverage), not just
// a fragment. Short content keeps the presence heuristic (counts are noisy small).
export function isPasteVisible(
  before: { chars: number; tables: number; text: string },
  after: { chars: number; tables: number; text: string },
  trimmedPlain: string,
  expectedTableDelta = 0,
): boolean {
  const normalize = (value: string): string => String(value || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const expectedText = normalize(trimmedPlain);
  const beforeText = normalize(before.text);
  const afterText = normalize(after.text);
  const expected = expectedText.length;
  if (expected === 0 || afterText.length === 0) return false;
  if (expectedTableDelta > 0 && after.tables - before.tables < expectedTableDelta) return false;

  // A section paste is append-only. The anti-shuffle guard must reject a block
  // inserted at an old caret in the MIDDLE of the post, but the old strict
  // `!afterText.startsWith(beforeText)` false-failed whenever the editor's
  // document-root selection shifted between the before/after snapshots (an
  // image tips the root score) or a placeholder vanished — the section had
  // fully landed, yet publishing was blocked (live homefeed report:
  // beforeChars=70, afterChars=444, ~374 chars actually inserted).
  //
  // Misplacement is now detected by two survivors instead: (1) if the old
  // content survived intact but the section landed BEFORE it, that is a true
  // reorder; (2) the tail-position gate below (trailingChars <= 8) rejects any
  // section that is not the document tail — which covers mid-insertion, since
  // the pushed-down old content leaves >8 trailing chars.
  // [v2.11.140b] all-or-nothing startsWith는 이미지 삽입 직후 스냅샷 루트가 흔들리며
  // 생기는 몇 글자 프리픽스(캡션/장식 텍스트)에도 발행을 차단했다(실측: 이미지 2장 삽입
  // 직후 섹션 붙여넣기가 cov=0.97·정확한 append인데 실패). 실제 reorder는 옛 내용 앞에
  // "섹션 분량"(수십~수백자)이 통째로 삽입되므로 프리픽스 32자까지는 아티팩트로 허용한다.
  const beforeIdxInAfter = beforeText ? afterText.indexOf(beforeText) : -1;
  if (beforeText && beforeIdxInAfter > 32) {
    return false;
  }

  const rawDelta = Math.max(0, after.chars - before.chars);
  const normalizedDelta = Math.max(0, afterText.length - beforeText.length);
  const coverage = Math.max(rawDelta, normalizedDelta) / expected;
  const minimumCoverage = expected <= 60 ? 0.6 : (after.tables > before.tables ? 0.72 : 0.82);
  if (coverage < minimumCoverage) return false;

  const anchorSize = Math.min(24, Math.max(8, Math.floor(expected / 8)));
  const anchorAt = (start: number): string => expectedText
    .slice(Math.max(0, Math.min(start, expected - anchorSize)), Math.max(0, Math.min(start, expected - anchorSize)) + anchorSize)
    .trim();
  const anchorCandidates = expected <= anchorSize * 2
    ? [expectedText]
    : [
        anchorAt(0),
        anchorAt(Math.floor((expected - anchorSize) / 2)),
        anchorAt(expected - anchorSize),
      ];
  const anchors = Array.from(new Set(
    anchorCandidates.filter((anchor) => anchor.length >= Math.min(6, expected)),
  ));

  // [v2.11.140] 앵커 탐색 시작 위치 보정 — 붙여넣기 전 내용(caption/placeholder)이
  // afterText에 남지 않고 사라진 경우, cursor=beforeText.length-2에서 탐색하면 실제로
  // afterText 앞쪽(0 근처)에 안착한 본문 시작 앵커를 놓쳐 near-complete(97%) 붙여넣기가
  // EDITOR_PARTIAL_INSERT_UNRECOVERED로 오탐됐다. before가 실제로 살아남았을 때만
  // append 지점(beforeText.length-2)에서 시작하고, 사라졌으면 0부터 찾는다.
  // 안전성: 커버리지 게이트(위)를 이미 통과한 케이스만 여기 도달하므로 본문 누락은 걸러진 뒤다.
  const beforePersistsInAfter = beforeIdxInAfter >= 0;
  // [v2.11.140b] 프리픽스 허용에 맞춰 append 지점도 beforeText의 실제 위치 기준으로 계산.
  const searchStart = beforePersistsInAfter
    ? Math.max(0, beforeIdxInAfter + beforeText.length - 2)
    : 0;

  // [v2.11.140] 시작+끝 앵커로 섹션을 브라킷 검증. 이전엔 시작·중간·끝 앵커를 전부
  // verbatim 일치해야 통과시켜, 에디터가 본문을 "모바일 단락 여러 개 + 하이라이트"로
  // 렌더하며 중간 글자가 미세하게 달라지면(=콘텐츠는 정상) near-complete(cov 0.97)
  // 붙여넣기를 EDITOR_PARTIAL_INSERT_UNRECOVERED로 오탐했다(실측: headAt=47, tailAt=192,
  // cov=0.97, beforePersists=Y — 시작·끝 다 맞는데 실패). 중간 앵커는 보강용으로만 쓴다.
  // 안전성(환불위기 회귀 차단): 아래 4중 게이트를 모두 유지 —
  //   (1) 커버리지 gate(위, 0.82) → 본문 누락 차단
  //   (2) reorder gate(위 branch, beforeText 유지+non-startsWith) → 앞/중간 삽입 차단
  //   (3) 시작 앵커가 append 지점 이후 존재 → head 누락/오배치 차단
  //   (4) 끝 앵커가 시작 뒤 + trailing<=8 → tail 누락/mid-insertion 차단
  const firstAnchor = anchors[0];
  if (!firstAnchor) return false;
  const firstAnchorAt = afterText.indexOf(firstAnchor, searchStart);
  if (firstAnchorAt < 0) return false;

  const lastAnchor = anchors[anchors.length - 1];
  const lastAnchorAt = afterText.lastIndexOf(lastAnchor);
  // [v2.11.140b] 실측(beforeChars=286/aftLen=543/cov=0.97): append 위치 정확, 진단용
  // 20자 tail은 문서 끝에 정착했는데 trailing<=8 고정 한도가 스페이서/장식 잔여 몇
  // 글자에 발행을 차단했다. near-complete(cov>=0.95)면 잔여 한도를 32자로 완화하고,
  // 24자 앵커 창이 미세 정규화로 어긋나면 진단과 동일한 20자 tail 프로브로 재확인한다.
  // 실제 mid-insertion/reorder는 잔여가 섹션·옛본문 분량(수십~수백자)이라 여전히
  // 차단되며, PrePublish section-order 게이트가 문서 전체 순서의 최종 방어선이다.
  // 잔여 판정: 8자 이하는 무조건 허용(기존). 9~32자는 near-complete(cov>=0.95)이면서
  // "밀려난 옛 본문"이 아닐 때만 허용 — mid-insertion으로 뒤로 밀린 옛 꼬리는 beforeText에
  // 그대로 존재하므로 구별 가능하고(→ 차단 유지), 스페이서/장식 아티팩트는 새 텍스트다.
  const trailingAllowed = (endIdx: number): boolean => {
    const trailingChars = afterText.length - endIdx;
    if (trailingChars <= 8) return true;
    if (trailingChars > 32 || coverage < 0.95) return false;
    const trailingText = afterText.slice(endIdx).trim();
    return !(trailingText && beforeText && beforeText.includes(trailingText));
  };
  const tailProbe = expectedText.slice(-Math.min(20, expected));
  const tailProbeAt = tailProbe ? afterText.lastIndexOf(tailProbe) : -1;
  const tailProbeOk = tailProbeAt >= firstAnchorAt
    && trailingAllowed(tailProbeAt + tailProbe.length);
  if (lastAnchorAt >= firstAnchorAt) {
    // 끝 앵커가 시작 뒤에서 발견 — 정상 브라킷. 뒤에 밀려난 잔여(mid-insertion)만 차단.
    return trailingAllowed(lastAnchorAt + lastAnchor.length) || tailProbeOk;
  }
  if (lastAnchorAt >= 0) {
    // 끝 앵커가 시작 앵커보다 "앞"에서 발견 = 순서 뒤바뀜(reorder) 의심. 단 20자
    // tail이 시작 앵커 뒤에서 문서를 정상 마감하면 24자 창의 앞쪽 중복 매칭 오탐 → 통과.
    return tailProbeOk;
  }
  // [v2.11.140] 끝 앵커가 아예 없음(tailAt=-1): 섹션 마지막 몇 글자가 안 들어왔거나(끝 미세
  // truncation) 끝부분 렌더 정규화 차이. 시작이 append 지점에 정확히 안착했고(위 firstAnchorAt)
  // 커버리지가 near-complete(>=0.95)면 통과 — 라이브 발행에서 끝 몇 글자 차이는 무해하고
  // 사용자가 보며 수정 가능하다. 본문 누락(cov < minimumCoverage 0.82)은 위에서 이미 차단됐고,
  // reorder(끝 내용이 앞에 존재)는 바로 위 분기에서 차단된다.
  //   실측 근거: headAt=1261(정상 append), tailAt=-1, cov=0.97 (260자 중 252자 안착 = 끝 8자 차이).
  return coverage >= 0.95 || tailProbeOk;
}

function buildPasteFailureReason(
  reason: string,
  before: { chars: number; tables: number; text?: string },
  after: { chars: number; tables: number; text?: string },
  trimmedPlain: string
): string {
  const exp = normalizeEditorSnapshotText(trimmedPlain);
  const needle = exp.slice(0, 24);
  // [v2.11.140] 재발 시 정확한 분기(placeholder 사라짐 / 시작·끝 앵커 누락 / trailing)를
  // 드러내는 진단 신호. accept/reject 로직과 무관한 순수 진단 문자열.
  const aft = normalizeEditorSnapshotText(after.text || '');
  const bef = normalizeEditorSnapshotText(before.text || '');
  const rawDelta = Math.max(0, after.chars - before.chars);
  const coverage = exp.length
    ? Math.max(rawDelta, Math.max(0, aft.length - bef.length)) / exp.length
    : 0;
  const head = exp.slice(0, Math.min(20, exp.length));
  const tail = exp.slice(Math.max(0, exp.length - 20));
  const beforePersists = !!bef && aft.includes(bef);
  const headAt = head ? aft.indexOf(head) : -1;
  const tailAt = tail ? aft.lastIndexOf(tail) : -1;
  const diag = `cov=${coverage.toFixed(2)} beforePersists=${beforePersists ? 'Y' : 'N'} headAt=${headAt} tailAt=${tailAt} aftLen=${aft.length} expLen=${exp.length}`;
  return `${reason} (beforeChars=${before.chars}, afterChars=${after.chars}, beforeTables=${before.tables}, afterTables=${after.tables}, needle="${needle}", ${diag})`;
}

function normalizeEditorSnapshotText(value: string): string {
  return String(value || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function pressControlShortcut(page: Page, key: KeyInput): Promise<void> {
  await page.keyboard.down('Control');
  try {
    await page.keyboard.press(key);
  } finally {
    await page.keyboard.up('Control').catch(() => undefined);
  }
}

async function rollbackPartialPaste(
  page: Page,
  frame: Frame,
  before: { chars: number; tables: number; text: string },
  current: { chars: number; tables: number; text: string },
): Promise<PasteRollbackState> {
  const matchesBefore = (snapshot: { chars: number; tables: number; text: string }): boolean =>
    normalizeEditorSnapshotText(snapshot.text) === normalizeEditorSnapshotText(before.text)
    && snapshot.tables === before.tables;

  if (matchesBefore(current)) {
    const tailReady = await ensureTailTypingReady(page, frame).catch(() => false);
    return { restored: true, tailReady };
  }

  await page.bringToFront().catch(() => undefined);
  await page.evaluate(() => window.focus()).catch(() => undefined);
  await pressControlShortcut(page, 'Z').catch(() => undefined);

  for (let attempt = 0; attempt < 12; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 250));
    const restored = await readEditorStats(frame);
    if (!matchesBefore(restored)) continue;
    const tailReady = await ensureTailTypingReady(page, frame).catch(() => false);
    return { restored: true, tailReady };
  }

  return { restored: false, tailReady: false };
}

async function dispatchRichPasteEventAtCursor(
  frame: Frame,
  html: string,
  plainText: string
): Promise<{ ok: boolean; reason?: string }> {
  return await frame.evaluate(({ richHtml, fallbackText, rootSelectors, panelSelector }) => {
    function getSmartEditorDocumentRoot(): HTMLElement | null {
      const candidates = Array.from(document.querySelectorAll(rootSelectors.join(','))) as HTMLElement[];
      let best: HTMLElement | null = null;
      let bestScore = -1;
      for (const candidate of candidates) {
        if (!(candidate instanceof HTMLElement)) continue;
        if (candidate.closest(panelSelector)) continue;
        const rect = candidate.getBoundingClientRect();
        const style = window.getComputedStyle(candidate);
        if (rect.width <= 0 || rect.height <= 0 || style.visibility === 'hidden' || style.display === 'none') continue;
        const componentCount = candidate.querySelectorAll('.se-component').length;
        const paragraphCount = candidate.querySelectorAll('.se-text-paragraph, p').length;
        const textLength = (candidate.innerText || candidate.textContent || '').trim().length;
        const roleScore = candidate.matches('article.se-components-wrap')
          ? 1000000
          : candidate.matches('.se-components-wrap')
            ? 900000
            : candidate.matches('.se-main-container')
              ? 100000
              : 0;
        const score = roleScore + componentCount * 1000 + paragraphCount * 100 + Math.min(textLength, 2000);
        if (score > bestScore) {
          bestScore = score;
          best = candidate;
        }
      }
      return best;
    }

    const root = getSmartEditorDocumentRoot();
    if (!root) return { ok: false, reason: 'editor root not found' };

    const paragraphs = Array.from(root.querySelectorAll(
      '.se-component:not(.se-documentTitle) p.se-text-paragraph, .se-component:not(.se-documentTitle) .se-text-paragraph, p.se-text-paragraph, .se-text-paragraph'
    )) as HTMLElement[];
    const target = [...paragraphs].reverse().find((paragraph) => {
      if (paragraph.closest(panelSelector) || paragraph.closest('.se-documentTitle')) return false;
      const rect = paragraph.getBoundingClientRect();
      const style = window.getComputedStyle(paragraph);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    }) || root;

    target.scrollIntoView({ block: 'center', inline: 'nearest' });
    target.focus?.();
    const range = document.createRange();
    range.selectNodeContents(target);
    range.collapse(false);
    const selection = window.getSelection();
    if (!selection) return { ok: false, reason: 'selection unavailable' };
    selection.removeAllRanges();
    selection.addRange(range);

    try {
      const dataTransfer = new DataTransfer();
      dataTransfer.setData('text/html', richHtml);
      dataTransfer.setData('text/plain', fallbackText);
      const event = new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: dataTransfer,
      } as ClipboardEventInit);
      target.dispatchEvent(event);
      return event.defaultPrevented
        ? { ok: true }
        : { ok: false, reason: 'paste event was not consumed by editor' };
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      };
    }
  }, {
    richHtml: html,
    fallbackText: plainText,
    rootSelectors: [...SMART_EDITOR_ROOT_SELECTORS],
    panelSelector: SMART_EDITOR_PANEL_SELECTOR,
  }).catch(error => ({
    ok: false,
    reason: error instanceof Error ? error.message : String(error),
  }));
}

async function pastePlainTextAtCursor(page: Page, frame: Frame, plainText: string): Promise<{ ok: boolean; reason?: string }> {
  const writeResult = await page.evaluate(async (text) => {
    if (!navigator.clipboard?.writeText) return { ok: false, reason: 'clipboard.writeText unavailable' };
    try {
      await navigator.clipboard.writeText(text);
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? `${error.name}: ${error.message}` : String(error) };
    }
  }, plainText).catch(error => ({
    ok: false,
    reason: error instanceof Error ? error.message : String(error),
  }));

  if (!writeResult.ok) return writeResult;

  const tailReady = await ensureTailTypingReady(page, frame).catch(() => false);
  if (!tailReady) return { ok: false, reason: 'editor tail caret unavailable before plain paste' };
  await new Promise(resolve => setTimeout(resolve, 120));
  await pressControlShortcut(page, 'V');
  return { ok: true };
}

async function resetInlineFormattingState(page: Page, frame: Frame): Promise<void> {
  const resetCommands = async (target: Page | Frame): Promise<void> => {
    await target.evaluate(({ commands, rootSelectors, panelSelector }) => {
      try {
        function getSmartEditorDocumentRoot(): HTMLElement | null {
          const candidates = Array.from(document.querySelectorAll(rootSelectors.join(','))) as HTMLElement[];
          let best: HTMLElement | null = null;
          let bestScore = -1;
          for (const candidate of candidates) {
            if (!(candidate instanceof HTMLElement)) continue;
            if (candidate.closest(panelSelector)) continue;
            const rect = candidate.getBoundingClientRect();
            const style = window.getComputedStyle(candidate);
            if (rect.width <= 0 || rect.height <= 0 || style.visibility === 'hidden' || style.display === 'none') continue;
            const componentCount = candidate.querySelectorAll('.se-component').length;
            const paragraphCount = candidate.querySelectorAll('.se-text-paragraph, p').length;
            const textLength = (candidate.innerText || candidate.textContent || '').trim().length;
            const roleScore = candidate.matches('article.se-components-wrap')
              ? 1000000
              : candidate.matches('.se-components-wrap')
                ? 900000
                : candidate.matches('.se-main-container')
                  ? 100000
                  : 0;
            const score = roleScore + componentCount * 1000 + paragraphCount * 100 + Math.min(textLength, 2000);
            if (score > bestScore) {
              bestScore = score;
              best = candidate;
            }
          }
          return best;
        }

        const editable =
          (getSmartEditorDocumentRoot()?.querySelector('.se-text-paragraph') as HTMLElement | null) ||
          getSmartEditorDocumentRoot() ||
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
    }, {
      commands: INLINE_FORMAT_COMMANDS,
      rootSelectors: [...SMART_EDITOR_ROOT_SELECTORS],
      panelSelector: SMART_EDITOR_PANEL_SELECTOR,
    }).catch(() => undefined);
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
  const focusedBySelection = await frame.evaluate(({ rootSelectors, panelSelector }) => {
    function getSmartEditorDocumentRoot(): HTMLElement | null {
      const candidates = Array.from(document.querySelectorAll(rootSelectors.join(','))) as HTMLElement[];
      let best: HTMLElement | null = null;
      let bestScore = -1;
      for (const candidate of candidates) {
        if (!(candidate instanceof HTMLElement)) continue;
        if (candidate.closest(panelSelector)) continue;
        const rect = candidate.getBoundingClientRect();
        const style = window.getComputedStyle(candidate);
        if (rect.width <= 0 || rect.height <= 0 || style.visibility === 'hidden' || style.display === 'none') continue;
        const componentCount = candidate.querySelectorAll('.se-component').length;
        const paragraphCount = candidate.querySelectorAll('.se-text-paragraph, p').length;
        const textLength = (candidate.innerText || candidate.textContent || '').trim().length;
        const roleScore = candidate.matches('article.se-components-wrap')
          ? 1000000
          : candidate.matches('.se-components-wrap')
            ? 900000
            : candidate.matches('.se-main-container')
              ? 100000
              : 0;
        const score = roleScore + componentCount * 1000 + paragraphCount * 100 + Math.min(textLength, 2000);
        if (score > bestScore) {
          bestScore = score;
          best = candidate;
        }
      }
      return best;
    }

    const root = getSmartEditorDocumentRoot();
    if (!root) return false;
    const candidates = Array.from(root.querySelectorAll('.se-component:not(.se-documentTitle) p.se-text-paragraph, .se-component:not(.se-documentTitle) .se-text-paragraph, p.se-text-paragraph, .se-text-paragraph')) as HTMLElement[];
    for (let i = candidates.length - 1; i >= 0; i -= 1) {
      const target = candidates[i];
      if (target.closest('.se-documentTitle')) continue;
      if (target.closest(panelSelector)) continue;
      const rect = target.getBoundingClientRect();
      const style = window.getComputedStyle(target);
      if (rect.width <= 0 || rect.height <= 0 || style.visibility === 'hidden' || style.display === 'none') continue;
      target.scrollIntoView({ block: 'center', inline: 'nearest' });
      root.focus();
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
  }, {
    rootSelectors: [...SMART_EDITOR_ROOT_SELECTORS],
    panelSelector: SMART_EDITOR_PANEL_SELECTOR,
  }).catch(() => false);

  if (focusedBySelection) return;

  const handles = await frame.$$('.se-main-container .se-text-paragraph, article.se-components-wrap .se-text-paragraph, .se-canvas > article.se-components-wrap .se-text-paragraph');
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
    .evaluate(({ rootSelectors, panelSelector }) => {
      function getSmartEditorDocumentRoot(): HTMLElement | null {
        const candidates = Array.from(document.querySelectorAll(rootSelectors.join(','))) as HTMLElement[];
        let best: HTMLElement | null = null;
        let bestScore = -1;
        for (const candidate of candidates) {
          if (!(candidate instanceof HTMLElement)) continue;
          if (candidate.closest(panelSelector)) continue;
          const rect = candidate.getBoundingClientRect();
          const style = window.getComputedStyle(candidate);
          if (rect.width <= 0 || rect.height <= 0 || style.visibility === 'hidden' || style.display === 'none') continue;
          const componentCount = candidate.querySelectorAll('.se-component').length;
          const paragraphCount = candidate.querySelectorAll('.se-text-paragraph, p').length;
          const textLength = (candidate.innerText || candidate.textContent || '').trim().length;
          const roleScore = candidate.matches('article.se-components-wrap')
            ? 1000000
            : candidate.matches('.se-components-wrap')
              ? 900000
              : candidate.matches('.se-main-container')
                ? 100000
                : 0;
          const score = roleScore + componentCount * 1000 + paragraphCount * 100 + Math.min(textLength, 2000);
          if (score > bestScore) {
            bestScore = score;
            best = candidate;
          }
        }
        return best;
      }

      const scope = getSmartEditorDocumentRoot();
      return (scope?.innerText || scope?.textContent || '').replace(/\s+$/g, '');
    }, {
      rootSelectors: [...SMART_EDITOR_ROOT_SELECTORS],
      panelSelector: SMART_EDITOR_PANEL_SELECTOR,
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
export type TailTypingReadyOptions = {
  readonly allowEmptyParagraph?: boolean;
};

export async function ensureTailTypingReady(
  page: Page,
  frame: Frame,
  log?: (message: string) => void,
  options: TailTypingReadyOptions = {},
): Promise<boolean> {
  const allowEmptyParagraph = options.allowEmptyParagraph !== false;
  // panelSelector includes se-popup/se-panel/se-layer/se-modal, which must
  // never be used as the document tail.
  const documentRootPayload = {
    rootSelectors: [...SMART_EDITOR_ROOT_SELECTORS],
    panelSelector: SMART_EDITOR_PANEL_SELECTOR,
  };

  // 1) Wait until the editor stops mutating (paste digestion complete).
  let previousLength = -1;
  for (let i = 0; i < 12; i += 1) {
    const length = await frame
      .evaluate(({ rootSelectors, panelSelector }) => {
        function getSmartEditorDocumentRoot(): HTMLElement | null {
          const candidates = Array.from(document.querySelectorAll(rootSelectors.join(','))) as HTMLElement[];
          let best: HTMLElement | null = null;
          let bestScore = -1;
          for (const candidate of candidates) {
            if (!(candidate instanceof HTMLElement)) continue;
            if (candidate.closest(panelSelector)) continue;
            const rect = candidate.getBoundingClientRect();
            const style = window.getComputedStyle(candidate);
            if (rect.width <= 0 || rect.height <= 0 || style.visibility === 'hidden' || style.display === 'none') continue;
            const componentCount = candidate.querySelectorAll('.se-component').length;
            const paragraphCount = candidate.querySelectorAll('.se-text-paragraph, p').length;
            const textLength = (candidate.innerText || candidate.textContent || '').trim().length;
            const roleScore = candidate.matches('article.se-components-wrap')
              ? 1000000
              : candidate.matches('.se-components-wrap')
                ? 900000
                : candidate.matches('.se-main-container')
                  ? 100000
                  : 0;
            const score = roleScore + componentCount * 1000 + paragraphCount * 100 + Math.min(textLength, 2000);
            if (score > bestScore) {
              bestScore = score;
              best = candidate;
            }
          }
          return best;
        }
        const root = getSmartEditorDocumentRoot();
        return (root?.innerText || root?.textContent || '').length;
      }, documentRootPayload)
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
    const handle = await frame.evaluateHandle(({ onlyText, rootSelectors, panelSelector }) => {
      function getSmartEditorDocumentRoot(): HTMLElement | null {
        const candidates = Array.from(document.querySelectorAll(rootSelectors.join(','))) as HTMLElement[];
        let best: HTMLElement | null = null;
        let bestScore = -1;
        for (const candidate of candidates) {
          if (!(candidate instanceof HTMLElement)) continue;
          if (candidate.closest(panelSelector)) continue;
          const rect = candidate.getBoundingClientRect();
          const style = window.getComputedStyle(candidate);
          if (rect.width <= 0 || rect.height <= 0 || style.visibility === 'hidden' || style.display === 'none') continue;
          const componentCount = candidate.querySelectorAll('.se-component').length;
          const paragraphCount = candidate.querySelectorAll('.se-text-paragraph, p').length;
          const textLength = (candidate.innerText || candidate.textContent || '').trim().length;
          const roleScore = candidate.matches('article.se-components-wrap')
            ? 1000000
            : candidate.matches('.se-components-wrap')
              ? 900000
              : candidate.matches('.se-main-container')
                ? 100000
                : 0;
          const score = roleScore + componentCount * 1000 + paragraphCount * 100 + Math.min(textLength, 2000);
          if (score > bestScore) {
            bestScore = score;
            best = candidate;
          }
        }
        return best;
      }

      const wrap = getSmartEditorDocumentRoot();
      if (!wrap) return null;
      const paras = Array.from(wrap.querySelectorAll('.se-component:not(.se-documentTitle) p.se-text-paragraph, .se-component:not(.se-documentTitle) .se-text-paragraph, p.se-text-paragraph, .se-text-paragraph')) as HTMLElement[];
      for (let i = paras.length - 1; i >= 0; i -= 1) {
        const paragraphText = (paras[i].innerText || paras[i].textContent || '').replace(/\s+/g, ' ').trim();
        if (onlyText && paragraphText.length === 0) continue;
        if (/^(내용을 입력하세요|삭제)$/u.test(paragraphText)) continue;
        if (paras[i].closest('.se-documentTitle')) continue;
        if (paras[i].closest(panelSelector)) continue;
        const rect = paras[i].getBoundingClientRect();
        const style = window.getComputedStyle(paras[i]);
        if (rect.width <= 0 || rect.height <= 0 || style.visibility === 'hidden' || style.display === 'none') continue;
        paras[i].scrollIntoView({ block: 'center', inline: 'nearest' });
        return paras[i];
      }
      return null;
    }, { onlyText: textBearingOnly, ...documentRootPayload }).catch(() => null);
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
    const rect = await frame.evaluate(({ rootSelectors, panelSelector }) => {
      function getSmartEditorDocumentRoot(): HTMLElement | null {
        const candidates = Array.from(document.querySelectorAll(rootSelectors.join(','))) as HTMLElement[];
        let best: HTMLElement | null = null;
        let bestScore = -1;
        for (const candidate of candidates) {
          if (!(candidate instanceof HTMLElement)) continue;
          if (candidate.closest(panelSelector)) continue;
          const rect = candidate.getBoundingClientRect();
          const style = window.getComputedStyle(candidate);
          if (rect.width <= 0 || rect.height <= 0 || style.visibility === 'hidden' || style.display === 'none') continue;
          const componentCount = candidate.querySelectorAll('.se-component').length;
          const paragraphCount = candidate.querySelectorAll('.se-text-paragraph, p').length;
          const textLength = (candidate.innerText || candidate.textContent || '').trim().length;
          const roleScore = candidate.matches('article.se-components-wrap')
            ? 1000000
            : candidate.matches('.se-components-wrap')
              ? 900000
              : candidate.matches('.se-main-container')
                ? 100000
                : 0;
          const score = roleScore + componentCount * 1000 + paragraphCount * 100 + Math.min(textLength, 2000);
          if (score > bestScore) {
            bestScore = score;
            best = candidate;
          }
        }
        return best;
      }

      // Target the editable ROOT's last visible child — by definition the
      // final block, immune to editor-internal class changes (class-based
      // "last paragraph" lookups landed one block short on the redesign).
      const root = getSmartEditorDocumentRoot();
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
    }, documentRootPayload).catch(() => null);
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
    await frame.evaluate(({ rootSelectors, panelSelector }) => {
      function getSmartEditorDocumentRoot(): HTMLElement | null {
        const candidates = Array.from(document.querySelectorAll(rootSelectors.join(','))) as HTMLElement[];
        let best: HTMLElement | null = null;
        let bestScore = -1;
        for (const candidate of candidates) {
          if (!(candidate instanceof HTMLElement)) continue;
          if (candidate.closest(panelSelector)) continue;
          const rect = candidate.getBoundingClientRect();
          const style = window.getComputedStyle(candidate);
          if (rect.width <= 0 || rect.height <= 0 || style.visibility === 'hidden' || style.display === 'none') continue;
          const componentCount = candidate.querySelectorAll('.se-component').length;
          const paragraphCount = candidate.querySelectorAll('.se-text-paragraph, p').length;
          const textLength = (candidate.innerText || candidate.textContent || '').trim().length;
          const roleScore = candidate.matches('article.se-components-wrap')
            ? 1000000
            : candidate.matches('.se-components-wrap')
              ? 900000
              : candidate.matches('.se-main-container')
                ? 100000
                : 0;
          const score = roleScore + componentCount * 1000 + paragraphCount * 100 + Math.min(textLength, 2000);
          if (score > bestScore) {
            bestScore = score;
            best = candidate;
          }
        }
        return best;
      }

      const root = getSmartEditorDocumentRoot();
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
    }, documentRootPayload).catch(() => undefined);
  };

  // [2026-06-23] input_buffer 트랩 탈출 (라이브 진단 suma0404: active=IFRAME#input_buffer, hasFocus·
  //   overlay 정상인데 클릭/타이핑이 IME 입력버퍼에 갇혀 한글이 본문에 커밋 안 됨). SmartEditor의
  //   입력버퍼 iframe이 직전 캐럿 위치에 떠서 본문 클릭을 가로채므로, ① IME 조합 Escape ② 활성요소
  //   blur ③ 본문 컨테이너의 '빈 좌하단 영역'(input_buffer가 덮지 않는 곳)을 실제 클릭 → 모델 캐럿을
  //   문서 끝에 강제로 재설정한다.
  const escapeInputBufferTrap = async (): Promise<void> => {
    await page.keyboard.press('Escape').catch(() => undefined);
    const pt = await frame.evaluate(({ rootSelectors, panelSelector }) => {
      function getRoot(): HTMLElement | null {
        const cands = Array.from(document.querySelectorAll(rootSelectors.join(','))) as HTMLElement[];
        let best: HTMLElement | null = null; let bs = -1;
        for (const c of cands) {
          if (!(c instanceof HTMLElement) || c.closest(panelSelector)) continue;
          const r = c.getBoundingClientRect(); const s = getComputedStyle(c);
          if (r.width <= 0 || r.height <= 0 || s.visibility === 'hidden' || s.display === 'none') continue;
          const score = (c.matches('article.se-components-wrap') ? 1e6 : c.matches('.se-components-wrap') ? 9e5 : c.matches('.se-main-container') ? 1e5 : 0)
            + c.querySelectorAll('.se-component').length * 1000 + c.querySelectorAll('.se-text-paragraph, p').length * 100;
          if (score > bs) { bs = score; best = c; }
        }
        return best;
      }
      try { (document.activeElement as HTMLElement | null)?.blur?.(); } catch { /* ignore */ }
      const root = getRoot();
      if (!root) return null;
      root.scrollIntoView({ block: 'end', inline: 'nearest' });
      const r = root.getBoundingClientRect();
      return { x: Math.round(r.left + Math.min(60, r.width / 3)), y: Math.round(r.bottom - 6), vh: window.innerHeight };
    }, documentRootPayload).catch(() => null);
    if (pt) {
      const y = Math.max(8, Math.min(pt.y, pt.vh - 8));
      await page.mouse.click(pt.x, y).catch(() => undefined);
      await page.keyboard.press('End').catch(() => undefined);
    }
  };

  const strategies: Array<{ name: string; run: () => Promise<void> }> = [
    // [2026-06-23] FIRST: escape the input_buffer (IME proxy) trap that swallows
    // clicks/keys at the caret — must run before the paragraph clicks below, since
    // those land ON the input_buffer iframe when it overlays the caret.
    { name: 'escape-inputbuffer-trap', run: escapeInputBufferTrap },
    // A REAL paragraph click FIRST — the redesigned editor only moves its
    // model caret on clicks; Selection tricks land in the hidden input proxy
    // (2026-06-11 structure dump: document tree has no contenteditable).
    ...(allowEmptyParagraph ? [{ name: 'paragraph-end-click', run: clickLastParagraphEnd }] : []),
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
        const editableHandle = await frame.evaluateHandle(({ rootSelectors, panelSelector }) => {
          function getSmartEditorDocumentRoot(): HTMLElement | null {
            const candidates = Array.from(document.querySelectorAll(rootSelectors.join(','))) as HTMLElement[];
            let best: HTMLElement | null = null;
            let bestScore = -1;
            for (const candidate of candidates) {
              if (!(candidate instanceof HTMLElement)) continue;
              if (candidate.closest(panelSelector)) continue;
              const rect = candidate.getBoundingClientRect();
              const style = window.getComputedStyle(candidate);
              if (rect.width <= 0 || rect.height <= 0 || style.visibility === 'hidden' || style.display === 'none') continue;
              const componentCount = candidate.querySelectorAll('.se-component').length;
              const paragraphCount = candidate.querySelectorAll('.se-text-paragraph, p').length;
              const textLength = (candidate.innerText || candidate.textContent || '').trim().length;
              const roleScore = candidate.matches('article.se-components-wrap')
                ? 1000000
                : candidate.matches('.se-components-wrap')
                  ? 900000
                  : candidate.matches('.se-main-container')
                    ? 100000
                    : 0;
              const score = roleScore + componentCount * 1000 + paragraphCount * 100 + Math.min(textLength, 2000);
              if (score > bestScore) {
                bestScore = score;
                best = candidate;
              }
            }
            return best;
          }

          return getSmartEditorDocumentRoot();
        }, documentRootPayload).catch(() => null);
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
      inModel = await frame.evaluate(({ sentinel, rootSelectors, panelSelector }) => {
        function getSmartEditorDocumentRoot(): HTMLElement | null {
          const candidates = Array.from(document.querySelectorAll(rootSelectors.join(','))) as HTMLElement[];
          let best: HTMLElement | null = null;
          let bestScore = -1;
          for (const candidate of candidates) {
            if (!(candidate instanceof HTMLElement)) continue;
            if (candidate.closest(panelSelector)) continue;
            const rect = candidate.getBoundingClientRect();
            const style = window.getComputedStyle(candidate);
            if (rect.width <= 0 || rect.height <= 0 || style.visibility === 'hidden' || style.display === 'none') continue;
            const componentCount = candidate.querySelectorAll('.se-component').length;
            const paragraphCount = candidate.querySelectorAll('.se-text-paragraph, p').length;
            const textLength = (candidate.innerText || candidate.textContent || '').trim().length;
            const roleScore = candidate.matches('article.se-components-wrap')
              ? 1000000
              : candidate.matches('.se-components-wrap')
                ? 900000
                : candidate.matches('.se-main-container')
                  ? 100000
                  : 0;
            const score = roleScore + componentCount * 1000 + paragraphCount * 100 + Math.min(textLength, 2000);
            if (score > bestScore) {
              bestScore = score;
              best = candidate;
            }
          }
          return best;
        }

        const root = getSmartEditorDocumentRoot();
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
        if (sentinelEl.closest(panelSelector)) return false;
        if (sentinelEl.closest('.se-component')) return true;
        const sentinelDepth = depthOf(sentinelEl);
        // As deep as the real body text (−1 tolerance for span nesting) =
        // same structural layer the serializer keeps.
        return bodyDepthMax > 0
          ? sentinelDepth >= Math.max(1, bodyDepthMax - 1)
          : sentinelDepth >= 3;
      }, { sentinel: SENTINEL, ...documentRootPayload }).catch(() => false);
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
        await frame.evaluate(({ sentinel, rootSelectors, panelSelector }) => {
          function getSmartEditorDocumentRoot(): HTMLElement | null {
            const candidates = Array.from(document.querySelectorAll(rootSelectors.join(','))) as HTMLElement[];
            let best: HTMLElement | null = null;
            let bestScore = -1;
            for (const candidate of candidates) {
              if (!(candidate instanceof HTMLElement)) continue;
              if (candidate.closest(panelSelector)) continue;
              const rect = candidate.getBoundingClientRect();
              const style = window.getComputedStyle(candidate);
              if (rect.width <= 0 || rect.height <= 0 || style.visibility === 'hidden' || style.display === 'none') continue;
              const componentCount = candidate.querySelectorAll('.se-component').length;
              const paragraphCount = candidate.querySelectorAll('.se-text-paragraph, p').length;
              const textLength = (candidate.innerText || candidate.textContent || '').trim().length;
              const roleScore = candidate.matches('article.se-components-wrap')
                ? 1000000
                : candidate.matches('.se-components-wrap')
                  ? 900000
                  : candidate.matches('.se-main-container')
                    ? 100000
                    : 0;
              const score = roleScore + componentCount * 1000 + paragraphCount * 100 + Math.min(textLength, 2000);
              if (score > bestScore) {
                bestScore = score;
                best = candidate;
              }
            }
            return best;
          }

          const root = getSmartEditorDocumentRoot();
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
        }, { sentinel: SENTINEL, ...documentRootPayload }).catch(() => undefined);
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
  // [2026-06-23] 진단 스냅샷 — 모든 캐럿 전략 실패 시 에디터 실제 상태를 찍는다(로그만, 동작변경 없음).
  //   focus emulation을 켜도 입력이 완전히 무시되는(붙여넣기/타이핑 +0) 원인을 추측이 아니라
  //   데이터로 확정하기 위함: 어떤 요소가 focus인지, contenteditable이 있는지, 가리는 오버레이/팝업이
  //   있는지, designMode·문단수·URL 등. 다음 진단 리포트에 그대로 남아 정확한 원인을 짚게 한다.
  try {
    const snap = await frame.evaluate(({ rootSelectors }) => {
      const ae = document.activeElement as HTMLElement | null;
      const visible = (el: Element) => {
        const r = (el as HTMLElement).getBoundingClientRect();
        const s = getComputedStyle(el as HTMLElement);
        return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
      };
      const overlays = Array.from(document.querySelectorAll('.se-popup, .se-layer, .se-modal, [class*="popup"], [class*="dimmed"], [class*="overlay"], [class*="loading"]'))
        .filter(visible).map((el) => String((el as HTMLElement).className).slice(0, 50)).slice(0, 6);
      const root = document.querySelector(rootSelectors.join(',')) as HTMLElement | null;
      return {
        url: location.href.slice(0, 80),
        active: ae ? `${ae.tagName}.${String(ae.className || '').slice(0, 40)}#${ae.id || ''} ce=${ae.isContentEditable}` : 'null',
        designMode: document.designMode,
        paraCount: document.querySelectorAll('.se-text-paragraph, p').length,
        compCount: document.querySelectorAll('.se-component').length,
        rootEditable: root ? root.isContentEditable : null,
        bodyChars: (root?.innerText || '').trim().length,
        visibleW: window.innerWidth, visibleH: window.innerHeight,
        hasFocus: document.hasFocus(),
        overlays,
      };
    }, documentRootPayload).catch((e) => ({ error: String((e as Error)?.message ?? e) }));
    log?.(`   🔬 [캐럿진단] ${JSON.stringify(snap)}`);
  } catch { /* diagnostic best-effort */ }
  // Ladder exhausted (callers proceed best-effort): leave the caret at the
  // structurally BEST position, not wherever the last fallback dropped it —
  // live 2026-06-11: the final fallback's orphan caret ate the whole tail.
  if (allowEmptyParagraph) {
    await clickLastParagraphEnd();
  } else {
    await clickLastTextParagraphEnd();
  }
  return false;
}

export async function pasteRichHtmlAtCursor(
  page: Page,
  frame: Frame,
  html: string,
  plainText: string,
  expectedTableCount = 0,
): Promise<RichPasteResult> {
  const before = await readEditorStats(frame);
  const trimmedHtml = String(html || '').trim();
  const trimmedPlain = String(plainText || '').trim();

  if (!trimmedHtml || !trimmedPlain) {
    return {
      ok: false,
      method: 'none',
      reason: 'empty rich payload',
      safeToFallback: true,
      beforeChars: before.chars,
      afterChars: before.chars,
      beforeTables: before.tables,
      afterTables: before.tables,
    };
  }

  try {
    await page.bringToFront().catch(() => undefined);
    await page.evaluate(() => window.focus()).catch(() => undefined);
    await resetInlineFormattingState(page, frame).catch(() => undefined);
    const pasteCaretReady = await ensureTailTypingReady(page, frame).catch(() => false);
    if (!pasteCaretReady) {
      return {
        ok: false,
        method: 'none',
        reason: 'editor tail caret unavailable before rich paste',
        safeToFallback: true,
        beforeChars: before.chars,
        afterChars: before.chars,
        beforeTables: before.tables,
        afterTables: before.tables,
      };
    }
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
        safeToFallback: true,
        beforeChars: before.chars,
        afterChars: after.chars,
        beforeTables: before.tables,
        afterTables: after.tables,
      };
    }

    const postClipboardCaretReady = await ensureTailTypingReady(page, frame).catch(() => false);
    if (!postClipboardCaretReady) {
      return {
        ok: false,
        method: 'none',
        reason: 'editor tail caret unavailable after clipboard write',
        safeToFallback: true,
        beforeChars: before.chars,
        afterChars: before.chars,
        beforeTables: before.tables,
        afterTables: before.tables,
      };
    }
    await new Promise(resolve => setTimeout(resolve, 150));
    await pressControlShortcut(page, 'V');

    // [2026-06-22] Slow-client fix: a long article can take several seconds to
    // finish rendering after Ctrl+V on slower machines. The old single fixed-wait
    // snapshot caught the paste mid-insertion, so only the first fragment was seen.
    // Poll until the body covers the expected content, or the char count stops
    // growing (paste settled / genuinely incomplete), up to ~6s.
    let after = await readEditorStats(frame);
    {
      const pollStart = Date.now();
      let lastChars = -1;
      let stableReads = 0;
      while (Date.now() - pollStart < 6000) {
        if (isPasteVisible(before, after, trimmedPlain, expectedTableCount)) break;
        if (after.chars === lastChars) {
          stableReads += 1;
          if (stableReads >= 3) break; // count stalled → paste won't grow further
        } else {
          stableReads = 0;
        }
        lastChars = after.chars;
        await new Promise(resolve => setTimeout(resolve, 400));
        after = await readEditorStats(frame);
      }
    }
    const inserted = isPasteVisible(before, after, trimmedPlain, expectedTableCount);

    if (inserted) {
      return {
        ok: true,
        method: 'clipboard-html',
        beforeChars: before.chars,
        afterChars: after.chars,
        beforeTables: before.tables,
        afterTables: after.tables,
      };
    }

    const nativeRollback = resolvePasteRollbackPolicy(
      await rollbackPartialPaste(page, frame, before, after),
    );
    if (!nativeRollback.safeToFallback) {
      return {
        ok: false,
        method: 'none',
        reason: buildPasteFailureReason('native paste was partial or misplaced and rollback could not be verified', before, after, trimmedPlain),
        safeToFallback: false,
        beforeChars: before.chars,
        afterChars: after.chars,
        beforeTables: before.tables,
        afterTables: after.tables,
      };
    }
    if (!nativeRollback.canContinuePasteFallback) {
      return {
        ok: false,
        method: 'none',
        reason: buildPasteFailureReason('native paste rollback succeeded but rich-paste tail re-anchor was unavailable', before, after, trimmedPlain),
        safeToFallback: true,
        beforeChars: before.chars,
        afterChars: before.chars,
        beforeTables: before.tables,
        afterTables: before.tables,
      };
    }

    const eventResult = await dispatchRichPasteEventAtCursor(frame, trimmedHtml, trimmedPlain);
    let afterEvent = await readEditorStats(frame);
    if (eventResult.ok) {
      await new Promise(resolve => setTimeout(resolve, 900));
      afterEvent = await readEditorStats(frame);
      if (isPasteVisible(before, afterEvent, trimmedPlain, expectedTableCount)) {
        return {
          ok: true,
          method: 'paste-event-html',
          beforeChars: before.chars,
          afterChars: afterEvent.chars,
          beforeTables: before.tables,
          afterTables: afterEvent.tables,
        };
      }
    }

    const eventRollback = resolvePasteRollbackPolicy(
      await rollbackPartialPaste(page, frame, before, afterEvent),
    );
    if (!eventRollback.safeToFallback) {
      return {
        ok: false,
        method: 'none',
        reason: buildPasteFailureReason('paste-event fallback was partial or misplaced and rollback could not be verified', before, afterEvent, trimmedPlain),
        safeToFallback: false,
        beforeChars: before.chars,
        afterChars: afterEvent.chars,
        beforeTables: before.tables,
        afterTables: afterEvent.tables,
      };
    }
    if (!eventRollback.canContinuePasteFallback) {
      return {
        ok: false,
        method: 'none',
        reason: buildPasteFailureReason('paste-event rollback succeeded but plain-paste tail re-anchor was unavailable', before, afterEvent, trimmedPlain),
        safeToFallback: true,
        beforeChars: before.chars,
        afterChars: before.chars,
        beforeTables: before.tables,
        afterTables: before.tables,
      };
    }

    if (expectedTableCount > 0) {
      return {
        ok: false,
        method: 'none',
        reason: buildPasteFailureReason(
          `SmartEditor flattened ${expectedTableCount} expected table(s); plain-text fallback is blocked`,
          before,
          afterEvent,
          trimmedPlain,
        ),
        safeToFallback: false,
        beforeChars: before.chars,
        afterChars: before.chars,
        beforeTables: before.tables,
        afterTables: before.tables,
      };
    }

    const plainResult = await pastePlainTextAtCursor(page, frame, trimmedPlain);
    if (plainResult.ok) {
      await new Promise(resolve => setTimeout(resolve, 900));
      const afterPlain = await readEditorStats(frame);
      if (isPasteVisible(before, afterPlain, trimmedPlain, expectedTableCount)) {
        return {
          ok: true,
          method: 'clipboard-plain',
          reason: 'rich html paste failed; plain clipboard paste succeeded',
          beforeChars: before.chars,
          afterChars: afterPlain.chars,
          beforeTables: before.tables,
          afterTables: afterPlain.tables,
        };
      }
      const plainRollback = resolvePasteRollbackPolicy(
        await rollbackPartialPaste(page, frame, before, afterPlain),
      );
      return {
        ok: false,
        method: 'none',
        reason: buildPasteFailureReason('plain paste verification failed', before, afterPlain, trimmedPlain),
        safeToFallback: plainRollback.safeToFallback,
        beforeChars: before.chars,
        afterChars: afterPlain.chars,
        beforeTables: before.tables,
        afterTables: afterPlain.tables,
      };
    }

    const finalStats = await readEditorStats(frame);
    const fallbackReason = [
      'paste verification failed',
      eventResult.reason ? `event=${eventResult.reason}` : '',
      plainResult.reason ? `plain=${plainResult.reason}` : '',
    ].filter(Boolean).join('; ');
    return {
      ok: false,
      method: 'none',
      reason: buildPasteFailureReason(fallbackReason, before, finalStats, trimmedPlain),
      safeToFallback: true,
      beforeChars: before.chars,
      afterChars: finalStats.chars,
      beforeTables: before.tables,
      afterTables: finalStats.tables,
    };
  } catch (error) {
    const after = await readEditorStats(frame);
    const rollback = await rollbackPartialPaste(page, frame, before, after)
      .catch((): PasteRollbackState => ({ restored: false, tailReady: false }));
    return {
      ok: false,
      method: 'none',
      reason: error instanceof Error ? error.message : String(error),
      safeToFallback: resolvePasteRollbackPolicy(rollback).safeToFallback,
      beforeChars: before.chars,
      afterChars: after.chars,
      beforeTables: before.tables,
      afterTables: after.tables,
    };
  }
}
