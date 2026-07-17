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
