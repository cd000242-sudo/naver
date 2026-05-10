/**
 * SPEC-CONVERSION-001 L2-4.6 — 벤치마크 raw 본문 TTL 7일 만료
 *
 * data/benchmarks/raw/ 폴더의 원문 HTML 파일을 mtime 기준으로 만료한다.
 * - analyses/, aggregate.json은 *영구 보관*. 만료 X.
 * - 본 모듈은 fs 단순 호출만. 외부 의존성 X.
 *
 * 저작권 정책 (data/benchmarks/schema.md 참조):
 *   - 분석은 메타데이터·구조·통계만 영구 보관
 *   - 원문 그대로의 재생산 금지
 *   - raw 본문 7일 후 자동 만료
 *
 * 메모리 [silent 폴백 금지]: 만료 실패는 명시 reason. 강제 삭제 X.
 *
 * 파일 한도 150줄 준수.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface RetentionInput {
  readonly rawDir: string;
  readonly ttlDays?: number;
  readonly now?: number;        // 테스트용 — Date.now() 주입
  readonly dryRun?: boolean;     // true면 삭제 X, 결과만 반환
}

export interface RetentionDeletedEntry {
  readonly file: string;
  readonly ageDays: number;
}

export interface RetentionResult {
  readonly scannedFiles: number;
  readonly expiredFiles: number;
  readonly deletedFiles: readonly RetentionDeletedEntry[];
  readonly errors: readonly string[];
  readonly dryRun: boolean;
  readonly ttlDays: number;
}

const DEFAULT_TTL_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * raw 폴더 재귀 스캔 → mtime 기준 ttlDays 초과 파일 삭제 (또는 dry-run).
 *
 * rawDir이 존재하지 않으면 scannedFiles=0, errors에 명시 메시지.
 */
export function expireRawBenchmarks(input: RetentionInput): RetentionResult {
  const ttlDays = input.ttlDays ?? DEFAULT_TTL_DAYS;
  const now = input.now ?? Date.now();
  const dryRun = input.dryRun === true;
  const errors: string[] = [];
  const deleted: RetentionDeletedEntry[] = [];
  let scanned = 0;

  if (!fs.existsSync(input.rawDir)) {
    return {
      scannedFiles: 0,
      expiredFiles: 0,
      deletedFiles: [],
      errors: [`RAW_DIR_NOT_FOUND: ${input.rawDir}`],
      dryRun,
      ttlDays,
    };
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(input.rawDir);
  } catch (err) {
    return {
      scannedFiles: 0,
      expiredFiles: 0,
      deletedFiles: [],
      errors: [`RAW_DIR_STAT_FAILED: ${(err as Error).message}`],
      dryRun,
      ttlDays,
    };
  }
  if (!stat.isDirectory()) {
    return {
      scannedFiles: 0,
      expiredFiles: 0,
      deletedFiles: [],
      errors: [`RAW_DIR_NOT_A_DIRECTORY: ${input.rawDir}`],
      dryRun,
      ttlDays,
    };
  }

  const walk = (dir: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      errors.push(`READDIR_FAILED: ${dir} — ${(err as Error).message}`);
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      scanned++;
      let mtimeMs = 0;
      try {
        mtimeMs = fs.statSync(full).mtimeMs;
      } catch (err) {
        errors.push(`STAT_FAILED: ${full} — ${(err as Error).message}`);
        continue;
      }
      const ageDays = (now - mtimeMs) / MS_PER_DAY;
      if (ageDays <= ttlDays) continue;
      if (dryRun) {
        deleted.push({ file: full, ageDays: Math.round(ageDays * 10) / 10 });
        continue;
      }
      try {
        fs.unlinkSync(full);
        deleted.push({ file: full, ageDays: Math.round(ageDays * 10) / 10 });
      } catch (err) {
        errors.push(`UNLINK_FAILED: ${full} — ${(err as Error).message}`);
      }
    }
  };

  walk(input.rawDir);

  return {
    scannedFiles: scanned,
    expiredFiles: deleted.length,
    deletedFiles: deleted,
    errors,
    dryRun,
    ttlDays,
  };
}
