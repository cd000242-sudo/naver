import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// [2026-09-22 P1] One source pipeline for every publish path. SmartScheduler and multi-account
// used to call the generator with `{ type: 'keyword', value }` and no rawText — dead paths.

const collectMock = vi.fn();
const assembleMock = vi.fn();
vi.mock('../sourceAssembler.js', () => ({
  collectContentFromPlatforms: (...args: unknown[]) => collectMock(...args),
  assembleContentSource: (...args: unknown[]) => assembleMock(...args),
}));

import {
  buildKeywordGenerationSource,
  collectKeywordMaterials,
  resolveSourceStatus,
  SourceEmptyError,
} from '../content/generationSourceBuilder';

const doc = (id: string) => ({ id, title: `t-${id}`, sourceType: 'news', sourceName: 'x', url: `https://e.com/${id}`, dateStatus: 'KNOWN', body: '본문 '.repeat(200), sourceTier: 'NEWS' });

beforeEach(() => {
  collectMock.mockReset();
  assembleMock.mockReset();
  assembleMock.mockImplementation(async (input: Record<string, unknown>) => ({
    source: { rawText: String(input.baseText || ''), title: input.title, contentMode: 'seo', metadata: { sourceDocuments: input.sourceDocuments, searchStatus: input.searchStatus, realtimeCrawlRequested: input.realtimeCrawlRequested, useRealTimeInfo: input.useRealTimeInfo } },
    warnings: [],
  }));
});

describe('resolveSourceStatus', () => {
  it('distinguishes EMPTY / PARTIAL / PIPELINE_FAILED / OK', () => {
    expect(resolveSourceStatus({ success: true, collectedText: 'x'.repeat(100), sourceDocuments: [doc('a')], searchStatus: { overall: 'SEARCH_OK', summary: '', perSource: [] } } as any)).toBe('SOURCE_OK');
    expect(resolveSourceStatus({ success: true, collectedText: 'x'.repeat(100), sourceDocuments: [doc('a')], searchStatus: { overall: 'SEARCH_PARTIAL', summary: '', perSource: [] } } as any)).toBe('SOURCE_PARTIAL');
    expect(resolveSourceStatus({ success: false, collectedText: '', sourceDocuments: [], searchStatus: { overall: 'SEARCH_EMPTY', summary: '', perSource: [] } } as any)).toBe('SOURCE_EMPTY');
    expect(resolveSourceStatus({ success: false, collectedText: '', message: 'boom', sourceDocuments: [] } as any)).toBe('SOURCE_PIPELINE_FAILED');
    expect(resolveSourceStatus({ success: true, collectedText: 'x', sourceDocuments: [doc('a')], searchStatus: { overall: 'SEARCH_RATE_LIMITED', summary: '', perSource: [] } } as any)).toBe('SOURCE_PIPELINE_FAILED');
    expect(resolveSourceStatus(null)).toBe('SOURCE_PIPELINE_FAILED');
  });
});

describe('buildKeywordGenerationSource', () => {
  const config = { naverClientId: 'id', naverClientSecret: 'secret' } as any;

  it('collects, then assembles with structured documents, search status and realtimeCrawlRequested', async () => {
    collectMock.mockResolvedValue({ success: true, collectedText: '자료 본문 '.repeat(50), sourceCount: 2, urls: [], sourceDocuments: [doc('a'), doc('b')], searchStatus: { overall: 'SEARCH_OK', summary: 'ok', perSource: [] } });
    const built = await buildKeywordGenerationSource({ keyword: '테스트 키워드', config, generator: 'openai', contentMode: 'seo', minChars: 2500 });
    expect(built.sourceStatus).toBe('SOURCE_OK');
    expect(collectMock).toHaveBeenCalledTimes(1);
    const assembly = assembleMock.mock.calls[0][0];
    expect(assembly.keywords).toEqual(['테스트 키워드']);
    expect(assembly.sourceDocuments).toHaveLength(2);
    expect(assembly.searchStatus.overall).toBe('SEARCH_OK');
    expect(assembly.realtimeCrawlRequested).toBe(true);
    expect(assembly.useRealTimeInfo).toBe(true);
    expect(assembly.baseText).toContain('자료 본문');
    expect(assembly.draftText).toContain('[최신성 규칙]');
    expect(built.source.rawText.length).toBeGreaterThan(100);
    expect(built.source.metadata?.sourceStatus).toBe('SOURCE_OK');
    expect(built.source.contentMode).toBe('seo');
  });

  it('re-searches once with forced expansion when the first pass is empty, then throws SourceEmptyError', async () => {
    collectMock.mockResolvedValue({ success: false, collectedText: '', sourceCount: 0, urls: [], sourceDocuments: [], searchStatus: { overall: 'SEARCH_EMPTY', summary: '0건', perSource: [] } });
    await expect(buildKeywordGenerationSource({ keyword: '없는 키워드', config, generator: 'openai', retryWhenEmpty: true }))
      .rejects.toBeInstanceOf(SourceEmptyError);
    expect(collectMock).toHaveBeenCalledTimes(2);
    expect(assembleMock).not.toHaveBeenCalled();
  });

  it('never assembles a writer source from nothing (SOURCE_PIPELINE_FAILED also throws)', async () => {
    collectMock.mockResolvedValue({ success: false, collectedText: '', sourceCount: 0, urls: [], message: 'HTTP 429', sourceDocuments: [], searchStatus: { overall: 'SEARCH_RATE_LIMITED', summary: '429', perSource: [] } });
    const err = await buildKeywordGenerationSource({ keyword: 'k', config, generator: 'openai', retryWhenEmpty: false }).catch((e) => e);
    expect(err).toBeInstanceOf(SourceEmptyError);
    expect((err as SourceEmptyError).code).toBe('SOURCE_PIPELINE_FAILED');
  });
});

describe('collectKeywordMaterials', () => {
  it('passes search credentials and does not throw when expansion is off', async () => {
    collectMock.mockResolvedValue({ success: true, collectedText: 'x'.repeat(3000), sourceCount: 3, urls: [], sourceDocuments: [doc('a')], searchStatus: { overall: 'SEARCH_OK', summary: '', perSource: [] } });
    const out = await collectKeywordMaterials('k', { naverDatalabClientId: 'dl-id', naverDatalabClientSecret: 'dl-secret' } as any, { logger: () => undefined });
    expect(out.success).toBe(true);
    expect(collectMock.mock.calls[0][1]).toMatchObject({ clientId: 'dl-id', clientSecret: 'dl-secret', allowGroundingFallback: false });
  });
});

describe('wiring pins — every keyword publish path uses the shared builder', () => {
  const main = readFileSync(resolve(__dirname, '../main.ts'), 'utf8');
  const generator = readFileSync(resolve(__dirname, '../contentGenerator.ts'), 'utf8');

  it('SmartScheduler and multi-account call buildKeywordGenerationSource and no longer build { type: "keyword", value }', () => {
    expect((main.match(/buildKeywordGenerationSource|buildMultiKeywordSource\(/g) || []).length).toBeGreaterThanOrEqual(3);
    expect(main).not.toMatch(/type:\s*'keyword',\s*\n\s*value:\s*keyword/);
    expect(main).not.toMatch(/type:\s*contentSource\.type === 'keyword' \? 'keyword' : 'url',\s*\n\s*value:/);
  });

  it('SOURCE_EMPTY / SOURCE_PIPELINE_FAILED are held for manual review on both paths', () => {
    expect((main.match(/sourceCode === 'SOURCE_EMPTY' \|\| sourceCode === 'SOURCE_PIPELINE_FAILED'/g) || []).length).toBe(2);
  });

  it('the generator refuses to write a search-based article with zero accepted sources', () => {
    expect(generator).toMatch(/realtimeCrawlRequested === true && pipeline\.metrics\.acceptedSources === 0 && !pipeline\.rawText\.trim\(\)/);
    expect(generator).toMatch(/throw new Error\(`SOURCE_EMPTY:/);
  });
});
