import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

// The same browser-safe helper is loaded by admin/index.html.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const tools = require('../../admin/keyword-briefing-tools.js') as {
  parseKeywordTableText(text: string): Array<{
    keyword: string;
    searchVolume: number;
    documentCount: number;
    opportunity: number;
  }>;
  mergeKeywordRows(rows: unknown[]): Array<{
    keyword: string;
    searchVolume: number;
    documentCount: number;
    opportunity: number;
  }>;
  mergeKeywordRowGroups(groups: unknown[][]): Array<{
    keyword: string;
    searchVolume: number;
    documentCount: number;
    opportunity: number;
  }>;
  parseTesseractResult(result: unknown, imageWidth: number): Array<{
    keyword: string;
    searchVolume: number | string;
    documentCount: number | string;
    opportunity: number | null;
    issues?: string[];
  }>;
  prepareKeywordDraftRows(rows: unknown[]): Array<{
    id: string;
    keyword: string;
    searchVolume: number | string;
    documentCount: number | string;
    opportunity: number | null;
    issues: string[];
  }>;
  collectPublishableKeywordRows(rows: unknown[]): {
    rows: Array<{
      keyword: string;
      searchVolume: number;
      documentCount: number;
      opportunity: number;
    }>;
    invalidCount: number;
  };
};

describe('admin keyword briefing OCR helpers', () => {
  it('revalidates OCR opportunity with searchVolume / (documentCount + 1)', () => {
    const rows = tools.parseKeywordTableText('김혜수가 아끼는 반전 가방은?\t10,410\t12\t800.7T');
    expect(rows).toEqual([
      {
        keyword: '김혜수가 아끼는 반전 가방은?',
        searchVolume: 10410,
        documentCount: 12,
        opportunity: 800.77,
      },
    ]);
  });

  it('keeps a spaced keyword with numbers in its own column', () => {
    const rows = tools.parseKeywordTableText(
      '이시영 둘째 출산과 800만원대 샤넬 목걸이  13,250  24  530',
    );

    expect(rows).toEqual([
      {
        keyword: '이시영 둘째 출산과 800만원대 샤넬 목걸이',
        searchVolume: 13250,
        documentCount: 24,
        opportunity: 530,
      },
    ]);
  });

  it('never shifts an empty middle cell into the document-count column', () => {
    expect(
      tools.parseKeywordTableText('김혜수가 아끼는 반전 가방은?\t10,410\t\t800.77'),
    ).toEqual([]);

    const [draft] = tools.prepareKeywordDraftRows([
      {
        keyword: '김혜수가 아끼는 반전 가방은?',
        searchVolume: '10,410',
        documentCount: '',
      },
    ]);

    expect(draft.documentCount).toBe('');
    expect(draft.opportunity).toBeNull();
    expect(draft.issues).toContain('블로그 문서수를 입력하세요.');
    expect(tools.collectPublishableKeywordRows([draft])).toMatchObject({
      rows: [],
      invalidCount: 1,
    });
  });

  it('rejects units and malformed values instead of silently stripping them', () => {
    expect(tools.parseKeywordTableText('잘못된 검색량\t2026년\t12\t155.85')).toEqual([]);
    expect(tools.parseKeywordTableText('잘못된 문서수\t10,410\t12개\t800.77')).toEqual([]);
  });

  it('skips real header rows without dropping search phrases that contain header words', () => {
    const rows = tools.parseKeywordTableText([
      '키워드\t검색량\t블로그 문서수\t기회지수',
      '키워드 검색량 조회\t1,000\t10\t90.91',
      '블로그 검색량 문서수 확인\t2,000\t20\t95.24',
    ].join('\n'));

    expect(rows).toEqual([
      { keyword: '키워드 검색량 조회', searchVolume: 1000, documentCount: 10, opportunity: 90.91 },
      { keyword: '블로그 검색량 문서수 확인', searchVolume: 2000, documentCount: 20, opportunity: 95.24 },
    ]);
  });

  it('rejects fractions and values beyond the server integer limits', () => {
    expect(tools.parseKeywordTableText('소수 검색량\t10.5\t12\t0.81')).toEqual([]);
    expect(tools.parseKeywordTableText('검색량 초과\t1,000,000,001\t12\t1')).toEqual([]);
    expect(tools.parseKeywordTableText('문서수 초과\t10,410\t10,000,000,001\t1')).toEqual([]);

    const drafts = tools.prepareKeywordDraftRows([
      { keyword: '소수 검색량', searchVolume: '10.5', documentCount: '12' },
      { keyword: '검색량 초과', searchVolume: '1,000,000,001', documentCount: '12' },
      { keyword: '문서수 초과', searchVolume: '10,410', documentCount: '10,000,000,001' },
    ]);
    expect(drafts.every((row) => row.opportunity === null && row.issues.length > 0)).toBe(true);
    expect(tools.collectPublishableKeywordRows(drafts).invalidCount).toBe(3);
  });

  it('keeps malformed OCR rows in the editable draft instead of discarding them', () => {
    const word = (text: string, x0: number, x1: number) => ({
      text,
      confidence: 91,
      bbox: { x0, x1 },
    });
    const blocks = [{ paragraphs: [{ lines: [
      { words: [word('정상 키워드', 20, 320), word('10,410', 650, 720), word('12', 810, 840), word('800.77', 930, 990)] },
      { words: [word('문서수 누락 키워드', 20, 350), word('8,200', 650, 720), word('44.5', 930, 990)] },
    ] }] }];

    const rows = tools.parseTesseractResult({ data: { blocks, text: '' } }, 1000);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      keyword: '정상 키워드',
      searchVolume: 10410,
      documentCount: 12,
      opportunity: 800.77,
    });
    expect(rows[1]).toMatchObject({
      keyword: '문서수 누락 키워드',
      searchVolume: 8200,
      documentCount: '',
      opportunity: null,
    });
    expect(rows[1].issues).toContain('블로그 문서수를 입력하세요.');
    expect(tools.mergeKeywordRowGroups([rows])).toHaveLength(2);
  });

  it('adapts OCR column boundaries when a cropped table shifts every numeric column left', () => {
    const word = (text: string, x0: number, x1: number) => ({
      text,
      confidence: 94,
      bbox: { x0, x1 },
    });
    const blocks = [{ paragraphs: [{ lines: [
      { words: [word('첫 번째 키워드', 15, 360), word('10,410', 535, 605), word('12', 700, 740), word('800.77', 865, 925)] },
      { words: [word('두 번째 키워드', 15, 350), word('8,200', 535, 605), word('44', 700, 740), word('186.44', 865, 925)] },
      { words: [word('문서수 누락 키워드', 15, 370), word('3,130', 535, 605), word('149.05', 865, 925)] },
    ] }] }];

    const rows = tools.parseTesseractResult({ data: { blocks, text: '' } }, 1000);

    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      keyword: '첫 번째 키워드',
      searchVolume: 10410,
      documentCount: 12,
      opportunity: 800.77,
      issues: [],
    });
    expect(rows[1]).toMatchObject({
      keyword: '두 번째 키워드',
      searchVolume: 8200,
      documentCount: 44,
      opportunity: 182.22,
      issues: [],
    });
    expect(rows[2]).toMatchObject({
      keyword: '문서수 누락 키워드',
      searchVolume: 3130,
      documentCount: '',
      opportunity: null,
    });
    expect(rows[2].issues).toContain('블로그 문서수를 입력하세요.');
  });

  it('keeps OCR keywords containing header words while removing the actual header row', () => {
    const word = (text: string, x0: number, x1: number) => ({
      text,
      confidence: 95,
      bbox: { x0, x1 },
    });
    const blocks = [{ paragraphs: [{ lines: [
      { words: [word('키워드', 20, 180), word('검색량', 650, 720), word('문서수', 810, 870), word('기회지수', 930, 990)] },
      { words: [word('키워드 검색량 조회', 20, 350), word('1,000', 650, 720), word('10', 810, 850), word('90.91', 930, 990)] },
    ] }] }];

    expect(tools.parseTesseractResult({ data: { blocks, text: '' } }, 1000)).toEqual([
      expect.objectContaining({
        keyword: '키워드 검색량 조회',
        searchVolume: 1000,
        documentCount: 10,
        opportunity: 90.91,
        issues: [],
      }),
    ]);
  });

  it('deduplicates overlapping screenshots and preserves the strongest measured row', () => {
    const rows = tools.mergeKeywordRows([
      { keyword: '파리 EWC 리그 오브 레전드', searchVolume: 22030, documentCount: 266 },
      { keyword: ' 파리 EWC 리그 오브 레전드 ', searchVolume: 22030, documentCount: 300 },
      { keyword: '', searchVolume: 100, documentCount: 2 },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      keyword: '파리 EWC 리그 오브 레전드',
      searchVolume: 22030,
      documentCount: 266,
      opportunity: 82.51,
    });
  });

  it('keeps duplicate source rows when reviewing an already-published table', () => {
    const rows = tools.parseKeywordTableText([
      '트로이 왓슨\t32,770\t1,156\t28.32',
      '트로이 왓슨\t32,770\t1,156\t28.32',
    ].join('\n'));
    expect(rows).toHaveLength(2);
  });

  it('removes only repeated screenshot boundaries while preserving duplicates inside a source image', () => {
    const rows = tools.mergeKeywordRowGroups([
      [
        { keyword: '트로이 왓슨', searchVolume: 32770, documentCount: 1156 },
        { keyword: '트로이 왓슨', searchVolume: 32770, documentCount: 1156 },
        { keyword: '포켓몬 상성표', searchVolume: 34260, documentCount: 1214 },
      ],
      [
        { keyword: '포켓몬 상성표', searchVolume: 34260, documentCount: 1214 },
        { keyword: '최영종 청주시의원', searchVolume: 4720, documentCount: 167 },
      ],
    ]);

    expect(rows.map((row) => row.keyword)).toEqual([
      '트로이 왓슨',
      '트로이 왓슨',
      '포켓몬 상성표',
      '최영종 청주시의원',
    ]);
  });

  it('self-hosts OCR code and publishes only through the authenticated revision API', () => {
    const root = path.resolve(__dirname, '..', '..');
    const html = fs.readFileSync(path.join(root, 'admin', 'index.html'), 'utf8');
    expect(html).toContain("script.src = '/admin/vendor/tesseract/tesseract.min.js'");
    expect(html).toContain("script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'");
    expect(html).not.toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
    expect(html).toContain("workerPath: location.origin + '/admin/vendor/tesseract/worker.min.js'");
    expect(html).toContain("corePath: location.origin + '/admin/vendor/tesseract/core'");
    expect(html).toContain("langPath: location.origin + '/admin/vendor/tesseract/lang'");
    expect(html).not.toContain('cdn.jsdelivr.net/npm/tesseract');
    expect(html).toContain("fetch(lewordApiUrl('/v1/admin/home-keyword-briefing')");
    expect(html).toContain("method: 'PUT'");
    expect(html).toContain('expectedRevision: keywordBriefingEditorState.revision');
    expect(html).toContain('let keywordBriefingLoadGeneration = 0');
    expect(html).toContain('generation !== keywordBriefingLoadGeneration || keywordBriefingEditorState.dirty');
    expect(html).toContain('keywordBriefingEditorState.persisted && !keywordBriefingEditorState.dirty');
    expect(html).toContain("reloadButton.disabled = keywordBriefingEditorState.saving");
    expect(html).toContain("if (keywordBriefingEditorState.saving)");
    expect(html).toContain('window.__leadersproTesseractPromise = null');
    expect(fs.existsSync(path.join(root, 'admin', 'vendor', 'tesseract', 'lang', 'kor.traineddata.gz'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'admin', 'vendor', 'tesseract', 'lang', 'eng.traineddata.gz'))).toBe(true);
  });
});

const sheetTools = tools as unknown as {
  parseKeywordSheetMatrix(matrix: unknown[][]): Array<{
    keyword: string;
    searchVolume: number;
    documentCount: number;
    opportunity: number;
  }>;
  parseDelimitedText(text: string): string[][];
};

describe('admin keyword briefing spreadsheet import', () => {
  it('imports a standard header + index-column layout (#, 키워드, 검색량, 문서수, 기회지수)', () => {
    const rows = sheetTools.parseKeywordSheetMatrix([
      ['#', '키워드', '검색량', '블로그 문서수', '기회지수'],
      [1, '메가 라이츄 졸업스킬', 420, 123, 3.39],
      [2, '리트 시험 일정', '15,660', '2,641', 5.93],
    ]);
    expect(rows).toEqual([
      { keyword: '메가 라이츄 졸업스킬', searchVolume: 420, documentCount: 123, opportunity: 3.39 },
      { keyword: '리트 시험 일정', searchVolume: 15660, documentCount: 2641, opportunity: 5.93 },
    ]);
  });

  it('maps by header name even when columns are reordered', () => {
    const rows = sheetTools.parseKeywordSheetMatrix([
      ['블로그 문서수', '키워드', '검색량'],
      [9431, '피그미다람쥐', 31140],
    ]);
    expect(rows).toEqual([
      { keyword: '피그미다람쥐', searchVolume: 31140, documentCount: 9431, opportunity: expect.any(Number) },
    ]);
  });

  it('accepts numbers as native cells and as comma-formatted strings', () => {
    const rows = sheetTools.parseKeywordSheetMatrix([
      ['키워드', '검색량', '문서수'],
      ['슬립노모어', '24,790', 7518],
    ]);
    expect(rows[0]).toEqual({ keyword: '슬립노모어', searchVolume: 24790, documentCount: 7518, opportunity: 3.3 });
  });

  it('infers columns positionally when there is no header row', () => {
    const rows = sheetTools.parseKeywordSheetMatrix([
      ['메가 라이츄 졸업스킬', 420, 123],
      ['리트 시험 일정', 15660, 2641],
    ]);
    expect(rows).toEqual([
      { keyword: '메가 라이츄 졸업스킬', searchVolume: 420, documentCount: 123, opportunity: 3.39 },
      { keyword: '리트 시험 일정', searchVolume: 15660, documentCount: 2641, opportunity: 5.93 },
    ]);
  });

  it('drops blank rows and rows whose numbers are missing or malformed', () => {
    const rows = sheetTools.parseKeywordSheetMatrix([
      ['키워드', '검색량', '문서수'],
      ['', '', ''],
      ['정상 키워드', 1000, 10],
      ['문서수 없음', 500, ''],
      ['단위 오염', '2026년', 12],
    ]);
    expect(rows).toEqual([
      { keyword: '정상 키워드', searchVolume: 1000, documentCount: 10, opportunity: 90.91 },
    ]);
  });

  it('parses CSV text (quoted fields, embedded commas) into a matrix', () => {
    const matrix = sheetTools.parseDelimitedText(
      '키워드,검색량,문서수\n"가방, 신상",10410,12\n리트 시험,15660,2641',
    );
    expect(matrix).toEqual([
      ['키워드', '검색량', '문서수'],
      ['가방, 신상', '10410', '12'],
      ['리트 시험', '15660', '2641'],
    ]);
    const rows = sheetTools.parseKeywordSheetMatrix(matrix);
    expect(rows).toEqual([
      { keyword: '가방, 신상', searchVolume: 10410, documentCount: 12, opportunity: 800.77 },
      { keyword: '리트 시험', searchVolume: 15660, documentCount: 2641, opportunity: 5.93 },
    ]);
  });

  it('returns nothing when no keyword-like column exists (never wipes the table with garbage)', () => {
    expect(sheetTools.parseKeywordSheetMatrix([])).toEqual([]);
  });

  it('tolerates units, caps, and 만/천 multipliers on numeric cells', () => {
    const rows = sheetTools.parseKeywordSheetMatrix([
      ['키워드', '검색량', '문서수'],
      ['캠핑', '12,345회', '3,456건'],
      ['백패킹', '10,000+', '3,400'],
      ['차박', '1.2만', '900'],
      ['글램핑', '3천', '120'],
    ]);
    expect(rows).toEqual([
      { keyword: '캠핑', searchVolume: 12345, documentCount: 3456, opportunity: expect.any(Number) },
      { keyword: '백패킹', searchVolume: 10000, documentCount: 3400, opportunity: expect.any(Number) },
      { keyword: '차박', searchVolume: 12000, documentCount: 900, opportunity: expect.any(Number) },
      { keyword: '글램핑', searchVolume: 3000, documentCount: 120, opportunity: expect.any(Number) },
    ]);
  });

  it('rounds decimal numeric cells instead of silently dropping the row', () => {
    const rows = sheetTools.parseKeywordSheetMatrix([
      ['키워드', '검색량', '문서수'],
      ['캠핑', '12,345.6', '3,400'],
    ]);
    expect(rows[0]).toMatchObject({ keyword: '캠핑', searchVolume: 12346, documentCount: 3400 });
  });

  it('rejects a non-numeric core (e.g. a year) rather than reading its leading digits', () => {
    const rows = sheetTools.parseKeywordSheetMatrix([
      ['키워드', '검색량', '문서수'],
      ['정상', 1000, 10],
      ['오염', '2026년', 12],
    ]);
    expect(rows).toEqual([
      { keyword: '정상', searchVolume: 1000, documentCount: 10, opportunity: 90.91 },
    ]);
  });

  it('skips a totals/footer row (합계·총계·평균) instead of importing it as a keyword', () => {
    const rows = sheetTools.parseKeywordSheetMatrix([
      ['키워드', '검색량', '문서수'],
      ['캠핑', 12000, 3400],
      ['합계', 24000, 6800],
      ['평균', 12000, 3400],
    ]);
    expect(rows).toEqual([
      { keyword: '캠핑', searchVolume: 12000, documentCount: 3400, opportunity: expect.any(Number) },
    ]);
  });

  it('sums split PC / 모바일 검색량 columns into one search volume', () => {
    const rows = sheetTools.parseKeywordSheetMatrix([
      ['키워드', 'PC검색량', '모바일검색량', '문서수'],
      ['캠핑', 5000, 7000, 3400],
    ]);
    expect(rows[0]).toMatchObject({ keyword: '캠핑', searchVolume: 12000, documentCount: 3400 });
  });

  it('prefers the more-unique text column as keyword over a repeating category column', () => {
    const rows = sheetTools.parseKeywordSheetMatrix([
      ['여행', '제주도 맛집', 5000, 1200],
      ['여행', '부산 여행', 3000, 900],
      ['패션', '가을 코디', 4000, 1100],
    ]);
    expect(rows.map((row) => row.keyword)).toEqual(['제주도 맛집', '부산 여행', '가을 코디']);
  });

  it('imports a headerless sheet whose keyword column is numeric (years) via positional fallback', () => {
    const rows = sheetTools.parseKeywordSheetMatrix([
      ['2020', 5000, 1200],
      ['2021', 3000, 900],
    ]);
    expect(rows).toEqual([
      { keyword: '2020', searchVolume: 5000, documentCount: 1200, opportunity: expect.any(Number) },
      { keyword: '2021', searchVolume: 3000, documentCount: 900, opportunity: expect.any(Number) },
    ]);
  });

  it('sniffs semicolon and pipe delimiters, and keeps a comma inside a tab-delimited keyword', () => {
    expect(sheetTools.parseKeywordSheetMatrix(
      sheetTools.parseDelimitedText('키워드;검색량;문서수\n캠핑;12000;3400'),
    )).toEqual([
      { keyword: '캠핑', searchVolume: 12000, documentCount: 3400, opportunity: expect.any(Number) },
    ]);
    expect(sheetTools.parseKeywordSheetMatrix(
      sheetTools.parseDelimitedText('키워드\t검색량\t문서수\n가, 나, 다 정리\t5000\t1200'),
    )).toEqual([
      { keyword: '가, 나, 다 정리', searchVolume: 5000, documentCount: 1200, opportunity: expect.any(Number) },
    ]);
  });

  it('strips a stray angle bracket from a keyword (defense-in-depth against stored XSS)', () => {
    const rows = sheetTools.parseKeywordSheetMatrix([
      ['키워드', '검색량', '문서수'],
      ['buy<b now', 1000, 10],
    ]);
    expect(rows[0].keyword).toBe('buy b now');
  });

  it('self-hosts the SheetJS vendor bundle under /admin/vendor/xlsx', () => {
    const root = path.resolve(__dirname, '..', '..');
    const html = fs.readFileSync(path.join(root, 'admin', 'index.html'), 'utf8');
    expect(html).toContain("script.src = '/admin/vendor/xlsx/xlsx.full.min.js'");
    expect(html).not.toContain('cdn.sheetjs.com');
    expect(html).not.toContain('unpkg.com/xlsx');
    expect(fs.existsSync(path.join(root, 'admin', 'vendor', 'xlsx', 'xlsx.full.min.js'))).toBe(true);
  });

  it('collapses the manual save-permission inputs while a session is connected', () => {
    const root = path.resolve(__dirname, '..', '..');
    const html = fs.readFileSync(path.join(root, 'admin', 'index.html'), 'utf8');
    // The connect inputs have stable ids and visibility is driven from the
    // single session choke point so a connected login hides them.
    expect(html).toContain('id="keyword-briefing-api-inputs"');
    expect(html).toContain('id="home-ops-api-inputs"');
    expect(html).toContain('function setApiConnectionUiConnected(connected)');
    expect(html).toContain('setApiConnectionUiConnected(!!session)');
  });
});
