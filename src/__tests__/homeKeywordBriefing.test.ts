import { describe, expect, it } from 'vitest';
import {
  buildKeywordBriefingSnapshot,
  normalizeKeywordBriefing,
  parseKeywordTableText,
  selectKeywordChartRows,
} from '../../spa/src/lib/homeKeywordBriefing';

describe('home keyword briefing', () => {
  it('parses Korean spreadsheet rows without losing comma-formatted numbers', () => {
    const rows = parseKeywordTableText([
      '키워드\t월 검색량\t블로그 문서수\t기회지수',
      '결혼의 완성 기본정보\t539,760\t657\t820.3',
      '김혜수가 아끼는 반전 가방은?\t10,410\t12\t800.77',
      '깨진 행\t검색량 없음',
    ].join('\n'));

    expect(rows).toEqual([
      { keyword: '결혼의 완성 기본정보', searchVolume: 539760, documentCount: 657, opportunity: 820.3 },
      { keyword: '김혜수가 아끼는 반전 가방은?', searchVolume: 10410, documentCount: 12, opportunity: 800.77 },
    ]);
  });

  it('builds a stable snapshot that changes only when saved content changes', () => {
    const first = buildKeywordBriefingSnapshot({
      title: '부방장 황금키워드 브리핑',
      author: '부방장',
      publishedAt: '2026-07-16T00:00:00.000Z',
      revision: 1,
      sourceImages: [
        { name: 'keyword-1.png', sha256: 'abc', width: 633, height: 760 },
      ],
      rows: [
        { keyword: '결혼의 완성 기본정보', searchVolume: 539760, documentCount: 657, opportunity: 820.3 },
      ],
    });
    const same = buildKeywordBriefingSnapshot({
      title: '부방장 황금키워드 브리핑',
      author: '부방장',
      publishedAt: '2026-07-16T00:00:00.000Z',
      revision: 1,
      sourceImages: [
        { name: 'keyword-1.png', sha256: 'abc', width: 633, height: 760 },
      ],
      rows: [
        { keyword: '결혼의 완성 기본정보', searchVolume: 539760, documentCount: 657, opportunity: 820.3 },
      ],
    });
    const edited = buildKeywordBriefingSnapshot({ ...same, revision: 2, title: '수정 브리핑' });

    expect(first.snapshotId).toBe(same.snapshotId);
    expect(edited.snapshotId).not.toBe(first.snapshotId);
    expect(first.rows[0]?.opportunity).toBe(820.3);
  });

  it('normalizes untrusted persisted data and never mutates it while deriving the chart', () => {
    const persisted = {
      title: '<script>alert(1)</script> 부방장 브리핑',
      author: '부방장',
      publishedAt: '2026-07-16T00:00:00.000Z',
      revision: 3,
      sourceImages: [{ name: 'a.png', sha256: 'def', width: 633, height: 760 }],
      rows: [
        { keyword: '낮은 기회', searchVolume: 1000, documentCount: 100, opportunity: 10 },
        { keyword: '높은 기회', searchVolume: 5000, documentCount: 10, opportunity: 500 },
        { keyword: '', searchVolume: -1, documentCount: 0, opportunity: Number.NaN },
      ],
    };
    const normalized = normalizeKeywordBriefing(persisted);
    expect(normalized).not.toBeNull();
    expect(normalized?.title).not.toContain('<script>');
    expect(normalized?.rows).toHaveLength(2);

    const originalOrder = normalized?.rows.map((row) => row.keyword);
    const chart = selectKeywordChartRows(normalized!, 1);
    expect(chart.map((row) => row.keyword)).toEqual(['높은 기회']);
    expect(normalized?.rows.map((row) => row.keyword)).toEqual(originalOrder);
  });

  it('preserves source duplicate rows while deduplicating only the chart view', () => {
    const snapshot = buildKeywordBriefingSnapshot({
      title: '원본 보존',
      author: '부방장',
      publishedAt: '2026-07-16T00:00:00.000Z',
      revision: 1,
      sourceImages: [],
      rows: [
        { keyword: '트로이 왓슨', searchVolume: 32770, documentCount: 1156, opportunity: 28.32 },
        { keyword: '트로이 왓슨', searchVolume: 32770, documentCount: 1156, opportunity: 28.32 },
      ],
    });

    expect(snapshot.rows).toHaveLength(2);
    expect(selectKeywordChartRows(snapshot, 12)).toHaveLength(1);
  });

  it('recomputes the displayed opportunity from the two measured columns', () => {
    const snapshot = buildKeywordBriefingSnapshot({
      title: '공식 검증',
      author: '부방장',
      publishedAt: '2026-07-16T00:00:00.000Z',
      revision: 1,
      sourceImages: [],
      rows: [
        { keyword: '김혜수 가방', searchVolume: 10410, documentCount: 12, opportunity: 99999 },
      ],
    });
    expect(snapshot.rows[0]?.opportunity).toBe(800.77);
  });

  it('keeps a measured keyword when the document count is zero', () => {
    const snapshot = buildKeywordBriefingSnapshot({
      title: '문서수 0 검증',
      author: '부방장',
      publishedAt: '2026-07-16T00:00:00.000Z',
      revision: 1,
      sourceImages: [],
      rows: [
        { keyword: '신규 검색어', searchVolume: 120, documentCount: 0, opportunity: 0 },
      ],
    });
    expect(snapshot.rows).toEqual([
      { keyword: '신규 검색어', searchVolume: 120, documentCount: 0, opportunity: 120 },
    ]);
  });
});
