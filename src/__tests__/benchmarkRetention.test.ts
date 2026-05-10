/**
 * SPEC-CONVERSION-001 L2-4.6 — benchmarkRetention TTL 단위 테스트.
 * 임시 디렉토리에서 mtime 조작으로 결정론 검증.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { expireRawBenchmarks } from '../content/benchmarkRetention';

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-retention-'));
});

afterEach(() => {
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch { /* ignore */ }
});

function writeFileWithMtime(rel: string, content: string, ageDays: number): string {
  const full = path.join(tmpRoot, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf-8');
  const mtime = Date.now() - ageDays * 24 * 60 * 60 * 1000;
  fs.utimesSync(full, new Date(mtime), new Date(mtime));
  return full;
}

describe('expireRawBenchmarks — 정상 만료', () => {
  it('TTL 7일 초과 파일만 삭제, 미만은 보존', () => {
    writeFileWithMtime('food/old1.txt', 'old', 10);
    writeFileWithMtime('food/old2.txt', 'old', 8);
    writeFileWithMtime('food/recent.txt', 'recent', 3);
    writeFileWithMtime('tech/border.txt', 'border', 6.5);

    const r = expireRawBenchmarks({ rawDir: tmpRoot });
    expect(r.scannedFiles).toBe(4);
    expect(r.expiredFiles).toBe(2);
    expect(r.deletedFiles.map((d) => path.basename(d.file)).sort()).toEqual(['old1.txt', 'old2.txt']);
    expect(fs.existsSync(path.join(tmpRoot, 'food/recent.txt'))).toBe(true);
    expect(fs.existsSync(path.join(tmpRoot, 'tech/border.txt'))).toBe(true);
    expect(fs.existsSync(path.join(tmpRoot, 'food/old1.txt'))).toBe(false);
  });

  it('TTL 1일 옵션', () => {
    writeFileWithMtime('a.txt', 'x', 2);
    writeFileWithMtime('b.txt', 'x', 0.5);
    const r = expireRawBenchmarks({ rawDir: tmpRoot, ttlDays: 1 });
    expect(r.expiredFiles).toBe(1);
    expect(r.deletedFiles[0].file).toMatch(/a\.txt$/);
  });

  it('재귀 디렉토리 탐색', () => {
    writeFileWithMtime('cat/deep/old.txt', 'x', 10);
    writeFileWithMtime('cat/recent.txt', 'x', 1);
    const r = expireRawBenchmarks({ rawDir: tmpRoot });
    expect(r.scannedFiles).toBe(2);
    expect(r.expiredFiles).toBe(1);
  });

  it('dryRun=true는 삭제 안 하고 결과만 반환', () => {
    const target = writeFileWithMtime('old.txt', 'x', 10);
    const r = expireRawBenchmarks({ rawDir: tmpRoot, dryRun: true });
    expect(r.dryRun).toBe(true);
    expect(r.expiredFiles).toBe(1);
    expect(fs.existsSync(target)).toBe(true);
  });

  it('현재 시각 주입 (테스트 결정론)', () => {
    writeFileWithMtime('mid.txt', 'x', 5);
    const fixedNow = Date.now() + 3 * 24 * 60 * 60 * 1000; // 3일 후
    const r = expireRawBenchmarks({ rawDir: tmpRoot, now: fixedNow });
    // mtime 5일 전 + 3일 후 시점 → 8일 age → TTL 7 초과 → 만료
    expect(r.expiredFiles).toBe(1);
  });
});

describe('expireRawBenchmarks — 명시 fallback', () => {
  it('rawDir 없으면 errors에 명시', () => {
    const r = expireRawBenchmarks({ rawDir: path.join(tmpRoot, 'nonexistent') });
    expect(r.errors[0]).toMatch(/RAW_DIR_NOT_FOUND/);
    expect(r.expiredFiles).toBe(0);
  });

  it('rawDir이 파일이면 errors에 명시', () => {
    const filePath = path.join(tmpRoot, 'notdir.txt');
    fs.writeFileSync(filePath, 'x');
    const r = expireRawBenchmarks({ rawDir: filePath });
    expect(r.errors[0]).toMatch(/RAW_DIR_NOT_A_DIRECTORY/);
  });

  it('빈 디렉토리는 scanned=0, errors 없음', () => {
    const r = expireRawBenchmarks({ rawDir: tmpRoot });
    expect(r.scannedFiles).toBe(0);
    expect(r.expiredFiles).toBe(0);
    expect(r.errors).toEqual([]);
  });
});

describe('SPEC 메모리 원칙', () => {
  it('결과 객체에 dryRun · ttlDays 명시 (silent 추정 X)', () => {
    const r = expireRawBenchmarks({ rawDir: tmpRoot, ttlDays: 30, dryRun: true });
    expect(r.ttlDays).toBe(30);
    expect(r.dryRun).toBe(true);
  });
});
