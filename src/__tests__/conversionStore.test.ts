/**
 * SPEC-CONVERSION-001 L4-2.2 — conversionStore 단위 테스트.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  InMemoryConversionStore,
  FileConversionStore,
  type ConversionEvent,
} from '../monitor/conversionStore';

function ev(overrides: Partial<ConversionEvent>): ConversionEvent {
  return {
    postId: 'p1',
    eventType: 'click',
    timestamp: new Date('2026-05-10T10:00:00Z').toISOString(),
    ...overrides,
  };
}

describe('InMemoryConversionStore — 기본 동작', () => {
  let s: InMemoryConversionStore;
  beforeEach(() => { s = new InMemoryConversionStore(); });

  it('record + size + query', async () => {
    await s.record(ev({ eventType: 'impression' }));
    await s.record(ev({ eventType: 'click' }));
    expect(await s.size()).toBe(2);
    const all = await s.query({});
    expect(all).toHaveLength(2);
  });

  it('recordBatch', async () => {
    await s.recordBatch([
      ev({ eventType: 'impression' }),
      ev({ eventType: 'click' }),
      ev({ eventType: 'purchase', value: 12500 }),
    ]);
    expect(await s.size()).toBe(3);
  });

  it('query 필터 (postId·accountId·eventType·기간)', async () => {
    await s.recordBatch([
      ev({ postId: 'p1', accountId: 'a1', eventType: 'click', timestamp: '2026-05-10T00:00:00Z' }),
      ev({ postId: 'p2', accountId: 'a2', eventType: 'click', timestamp: '2026-05-11T00:00:00Z' }),
      ev({ postId: 'p1', accountId: 'a1', eventType: 'purchase', timestamp: '2026-05-12T00:00:00Z', value: 10000 }),
    ]);
    expect(await s.query({ postId: 'p1' })).toHaveLength(2);
    expect(await s.query({ accountId: 'a2' })).toHaveLength(1);
    expect(await s.query({ eventType: 'purchase' })).toHaveLength(1);
    expect(await s.query({ fromIso: '2026-05-11T00:00:00Z' })).toHaveLength(2);
  });

  it('query limit', async () => {
    await s.recordBatch([
      ev({ eventType: 'impression' }),
      ev({ eventType: 'impression' }),
      ev({ eventType: 'impression' }),
    ]);
    expect(await s.query({ limit: 2 })).toHaveLength(2);
  });

  it('aggregateByPost — click rate · conversion rate', async () => {
    await s.recordBatch([
      ev({ postId: 'p1', eventType: 'impression' }),
      ev({ postId: 'p1', eventType: 'impression' }),
      ev({ postId: 'p1', eventType: 'impression' }),
      ev({ postId: 'p1', eventType: 'impression' }),
      ev({ postId: 'p1', eventType: 'click' }),
      ev({ postId: 'p1', eventType: 'click' }),
      ev({ postId: 'p1', eventType: 'purchase', value: 12500 }),
    ]);
    const ag = await s.aggregateByPost('p1');
    expect(ag).not.toBeNull();
    expect(ag!.impressionCount).toBe(4);
    expect(ag!.clickCount).toBe(2);
    expect(ag!.purchaseCount).toBe(1);
    expect(ag!.totalValue).toBe(12500);
    expect(ag!.clickRate).toBeCloseTo(0.5, 5);
    expect(ag!.conversionRate).toBeCloseTo(0.5, 5);
  });

  it('미존재 postId aggregate는 null', async () => {
    expect(await s.aggregateByPost('none')).toBeNull();
  });
});

describe('InMemoryConversionStore — 검증 (silent 폴백 X)', () => {
  let s: InMemoryConversionStore;
  beforeEach(() => { s = new InMemoryConversionStore(); });

  it('postId 누락은 throw', async () => {
    await expect(s.record({ postId: '', eventType: 'click', timestamp: new Date().toISOString() }))
      .rejects.toThrow(/POSTID_INVALID/);
  });

  it('잘못된 timestamp는 throw', async () => {
    await expect(s.record({ postId: 'p1', eventType: 'click', timestamp: 'not-a-date' }))
      .rejects.toThrow(/TIMESTAMP_INVALID/);
  });

  it('음수 value는 throw', async () => {
    await expect(s.record(ev({ eventType: 'purchase', value: -100 })))
      .rejects.toThrow(/VALUE_INVALID/);
  });

  it('clear', async () => {
    await s.record(ev({}));
    await s.clear();
    expect(await s.size()).toBe(0);
  });
});

describe('FileConversionStore — 영속', () => {
  let tmpDir: string;
  let filePath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'conv-store-'));
    filePath = path.join(tmpDir, 'events.json');
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('record 후 새 인스턴스에서 load', async () => {
    const s1 = new FileConversionStore(filePath);
    await s1.record(ev({ eventType: 'click' }));
    expect(await s1.size()).toBe(1);

    const s2 = new FileConversionStore(filePath);
    expect(await s2.size()).toBe(1);
    const ag = await s2.aggregateByPost('p1');
    expect(ag?.clickCount).toBe(1);
  });

  it('recordBatch 후 즉시 flush', async () => {
    const s = new FileConversionStore(filePath);
    await s.recordBatch([ev({ eventType: 'click' }), ev({ eventType: 'purchase', value: 5000 })]);
    expect(fs.existsSync(filePath)).toBe(true);
    const raw = fs.readFileSync(filePath, 'utf-8');
    const arr = JSON.parse(raw);
    expect(arr).toHaveLength(2);
  });

  it('clear 후 빈 배열로 flush', async () => {
    const s = new FileConversionStore(filePath);
    await s.record(ev({}));
    await s.clear();
    const arr = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(arr).toEqual([]);
  });

  it('손상된 JSON 파일은 명시 throw', () => {
    fs.writeFileSync(filePath, 'not valid json');
    expect(() => new FileConversionStore(filePath)).toThrow(/LOAD_FAILED/);
  });
});
