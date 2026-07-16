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
