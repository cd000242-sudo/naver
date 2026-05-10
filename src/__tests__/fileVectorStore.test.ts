/**
 * SPEC-CONVERSION-001 L3-1.2 확장 — FileVectorStore 단위 테스트.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { FileVectorStore } from '../rag/fileVectorStore';

let tmpDir: string;
let filePath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fvs-'));
  filePath = path.join(tmpDir, 'vectors.json');
});

afterEach(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

describe('FileVectorStore — 기본 영속', () => {
  it('upsert 후 새 인스턴스에서 hydrate', async () => {
    const s1 = new FileVectorStore(filePath);
    await s1.ready();
    await s1.upsert([
      { id: 'a', vector: [1, 0, 0], metadata: { cat: 'food' } },
      { id: 'b', vector: [0, 1, 0] },
    ]);
    expect(s1.size()).toBe(2);

    const s2 = new FileVectorStore(filePath);
    await s2.ready();
    expect(s2.size()).toBe(2);
    const hits = await s2.search([1, 0, 0]);
    expect(hits[0].id).toBe('a');
    expect(hits[0].metadata?.cat).toBe('food');
  });

  it('동일 id 재upsert는 교체 (중복 X)', async () => {
    const s = new FileVectorStore(filePath);
    await s.ready();
    await s.upsert([{ id: 'a', vector: [1, 0] }]);
    await s.upsert([{ id: 'a', vector: [0, 1] }]);
    expect(s.size()).toBe(1);
    const hits = await s.search([0, 1]);
    expect(hits[0].id).toBe('a');
    expect(hits[0].score).toBeCloseTo(1, 5);
  });

  it('delete 영속', async () => {
    const s1 = new FileVectorStore(filePath);
    await s1.ready();
    await s1.upsert([
      { id: 'a', vector: [1, 0] },
      { id: 'b', vector: [0, 1] },
    ]);
    await s1.delete(['a']);
    expect(s1.size()).toBe(1);

    const s2 = new FileVectorStore(filePath);
    await s2.ready();
    expect(s2.size()).toBe(1);
    const hits = await s2.search([0, 1]);
    expect(hits[0].id).toBe('b');
  });

  it('clear 후 빈 파일', async () => {
    const s = new FileVectorStore(filePath);
    await s.ready();
    await s.upsert([{ id: 'a', vector: [1, 0] }]);
    await s.clear();
    expect(s.size()).toBe(0);
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(raw.records).toEqual([]);
  });
});

describe('FileVectorStore — 손상·버전 (silent 폴백 X)', () => {
  it('잘못된 JSON은 명시 throw', () => {
    fs.writeFileSync(filePath, 'not valid json');
    expect(() => new FileVectorStore(filePath)).toThrow(/LOAD_FAILED/);
  });

  it('version mismatch는 명시 throw', () => {
    fs.writeFileSync(filePath, JSON.stringify({ version: 99, dim: null, records: [] }));
    expect(() => new FileVectorStore(filePath)).toThrow(/VERSION_MISMATCH/);
  });

  it('records 배열 아니면 throw', () => {
    fs.writeFileSync(filePath, JSON.stringify({ version: 1, dim: null, records: 'oops' }));
    expect(() => new FileVectorStore(filePath)).toThrow(/RECORDS_NOT_ARRAY/);
  });
});

describe('FileVectorStore — 검색 동작 (InMemory 동등)', () => {
  it('cosine 정렬 + topK', async () => {
    const s = new FileVectorStore(filePath);
    await s.ready();
    await s.upsert([
      { id: 'a', vector: [1, 0, 0] },
      { id: 'b', vector: [0.95, 0.05, 0] },
      { id: 'c', vector: [0, 1, 0] },
    ]);
    const hits = await s.search([1, 0, 0], { topK: 2 });
    expect(hits).toHaveLength(2);
    expect(hits[0].id).toBe('a');
    expect(hits[1].id).toBe('b');
  });

  it('metadata filter 영속 후에도 동작', async () => {
    const s1 = new FileVectorStore(filePath);
    await s1.ready();
    await s1.upsert([
      { id: 'a', vector: [1, 0], metadata: { cat: 'food' } },
      { id: 'b', vector: [1, 0], metadata: { cat: 'tech' } },
    ]);
    const s2 = new FileVectorStore(filePath);
    await s2.ready();
    const hits = await s2.search([1, 0], {
      metadataFilter: (md) => md?.cat === 'food',
    });
    expect(hits).toHaveLength(1);
    expect(hits[0].id).toBe('a');
  });
});
