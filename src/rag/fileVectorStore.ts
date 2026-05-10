/**
 * SPEC-CONVERSION-001 L3-1.2 확장 — JSON 파일 영속 VectorStore
 *
 * InMemoryVectorStore와 동일 인터페이스 + 디스크 영속.
 * 단일 프로세스 환경 가정. 동시 접근 미지원 — 운영은 외부 DB 어댑터 권장.
 *
 * 메모리 [silent 폴백 금지]: 손상 JSON은 명시 throw.
 *
 * 파일 한도 200줄 준수.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  InMemoryVectorStore,
  type VectorRecord,
  type SearchOptions,
  type SearchHit,
  type VectorStore,
} from './vectorStore';

interface PersistedSnapshot {
  readonly version: number;
  readonly dim: number | null;
  readonly records: VectorRecord[];
}

const PERSIST_VERSION = 1;

export class FileVectorStore implements VectorStore {
  private readonly inner = new InMemoryVectorStore();
  private readonly recordCache: VectorRecord[] = [];
  private hydrated = false;
  private hydrationPromise: Promise<void> | null = null;
  private readonly pendingRecords: VectorRecord[] = [];

  constructor(private readonly filePath: string) {
    // 동기 검증 + records 추출 (잘못된 파일은 즉시 throw)
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw) as PersistedSnapshot;
        if (!parsed || typeof parsed !== 'object') throw new Error('PERSIST_NOT_OBJECT');
        if (parsed.version !== PERSIST_VERSION) {
          throw new Error(`PERSIST_VERSION_MISMATCH: ${parsed.version} vs ${PERSIST_VERSION}`);
        }
        if (!Array.isArray(parsed.records)) throw new Error('PERSIST_RECORDS_NOT_ARRAY');
        this.pendingRecords.push(...parsed.records);
      }
    } catch (err) {
      throw new Error(`FILE_VECTOR_STORE_LOAD_FAILED: ${(err as Error).message}`);
    }
  }

  private async hydrate(): Promise<void> {
    if (this.hydrated) return;
    if (this.pendingRecords.length > 0) {
      await this.inner.upsert(this.pendingRecords);
      for (const r of this.pendingRecords) {
        this.recordCache.push({
          id: r.id,
          vector: [...r.vector],
          metadata: r.metadata ? { ...r.metadata } : undefined,
        });
      }
      this.pendingRecords.length = 0;
    }
    this.hydrated = true;
  }

  private async ensureHydrated(): Promise<void> {
    if (this.hydrated) return;
    if (!this.hydrationPromise) this.hydrationPromise = this.hydrate();
    await this.hydrationPromise;
  }

  private async flush(): Promise<void> {
    try {
      const snapshot: PersistedSnapshot = {
        version: PERSIST_VERSION,
        dim: this.recordCache.length > 0 ? this.recordCache[0].vector.length : null,
        records: this.recordCache,
      };
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(snapshot), 'utf-8');
    } catch (err) {
      throw new Error(`FILE_VECTOR_STORE_FLUSH_FAILED: ${(err as Error).message}`);
    }
  }

  async upsert(records: readonly VectorRecord[]): Promise<void> {
    await this.ensureHydrated();
    await this.inner.upsert(records);
    const ids = new Set(records.map((r) => r.id));
    let i = this.recordCache.length;
    while (i--) if (ids.has(this.recordCache[i].id)) this.recordCache.splice(i, 1);
    for (const r of records) {
      this.recordCache.push({
        id: r.id,
        vector: [...r.vector],
        metadata: r.metadata ? { ...r.metadata } : undefined,
      });
    }
    await this.flush();
  }

  async delete(ids: readonly string[]): Promise<void> {
    await this.ensureHydrated();
    await this.inner.delete(ids);
    const idSet = new Set(ids);
    let i = this.recordCache.length;
    while (i--) if (idSet.has(this.recordCache[i].id)) this.recordCache.splice(i, 1);
    await this.flush();
  }

  async search(query: readonly number[], options?: SearchOptions): Promise<SearchHit[]> {
    await this.ensureHydrated();
    return this.inner.search(query, options);
  }

  size(): number {
    return this.inner.size();
  }

  async clear(): Promise<void> {
    await this.ensureHydrated();
    await this.inner.clear();
    this.recordCache.length = 0;
    await this.flush();
  }

  /** 테스트용 — hydration 완료 대기 */
  async ready(): Promise<void> {
    await this.ensureHydrated();
  }
}
