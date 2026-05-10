/**
 * SPEC-CONVERSION-001 L4-2.3 — RLHF 패턴 추출 CLI
 *
 * 실행: npm run build && npx ts-node scripts/rlhf/extract-patterns.ts \
 *        --store data/conversion/events.json \
 *        --analyses data/benchmarks/analyses \
 *        --metric conversionRate --topPercent 0.2 \
 *        --out data/rlhf/patterns-<date>.json
 *
 * 흐름:
 *   1. FileConversionStore 로드
 *   2. data/benchmarks/analyses/<cat>/<hash>.json 재귀 로드 → postId 추출
 *   3. extractPatterns 실행
 *   4. 결과를 JSON으로 저장 + 콘솔 요약
 *
 * 메모리 [silent 폴백 금지]: 데이터 부족·로드 실패는 콘솔 명시 + exit code.
 */

/* eslint-disable @typescript-eslint/no-require-imports */
import * as fs from 'fs';
import * as path from 'path';
import { FileConversionStore } from '../../src/monitor/conversionStore';
import { extractPatterns, summarizePatternResult } from '../../src/monitor/rlhfPatternExtractor';
import type { BenchmarkAnalysis } from '../../src/content/benchmarkAnalyzer';

interface CliOptions {
  storePath: string;
  analysesDir: string;
  metric: 'clickRate' | 'conversionRate';
  topPercent: number;
  outPath: string;
  minSampleSize: number;
}

function parseCli(): CliOptions {
  const argv = process.argv.slice(2);
  const opts: CliOptions = {
    storePath: 'data/conversion/events.json',
    analysesDir: 'data/benchmarks/analyses',
    metric: 'conversionRate',
    topPercent: 0.2,
    outPath: `data/rlhf/patterns-${new Date().toISOString().slice(0, 10)}.json`,
    minSampleSize: 5,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--store') opts.storePath = argv[++i];
    else if (a === '--analyses') opts.analysesDir = argv[++i];
    else if (a === '--metric') opts.metric = argv[++i] as 'clickRate' | 'conversionRate';
    else if (a === '--topPercent') opts.topPercent = parseFloat(argv[++i]);
    else if (a === '--out') opts.outPath = argv[++i];
    else if (a === '--minSample') opts.minSampleSize = parseInt(argv[++i], 10);
  }
  return opts;
}

function loadAnalyses(rootDir: string): { byPostId: Record<string, BenchmarkAnalysis>; postIds: string[] } {
  const byPostId: Record<string, BenchmarkAnalysis> = {};
  const postIds: string[] = [];
  if (!fs.existsSync(rootDir)) return { byPostId, postIds };

  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith('.json')) {
        try {
          const raw = fs.readFileSync(full, 'utf-8');
          const a = JSON.parse(raw) as BenchmarkAnalysis;
          if (a && a.url) {
            // postId는 url hash 또는 파일명 기반
            const fileBase = path.basename(entry.name, '.json');
            const postId = fileBase || a.url;
            byPostId[postId] = a;
            postIds.push(postId);
          }
        } catch (err) {
          console.warn(`[extract-patterns] 분석 파일 로드 실패: ${full} — ${(err as Error).message}`);
        }
      }
    }
  };
  walk(rootDir);
  return { byPostId, postIds };
}

async function main(): Promise<void> {
  const opts = parseCli();
  console.log('🐙 SPEC-CONVERSION-001 L4-2.3: RLHF 패턴 추출');
  console.log(`   store: ${opts.storePath}`);
  console.log(`   analyses: ${opts.analysesDir}`);
  console.log(`   metric: ${opts.metric}, topPercent: ${opts.topPercent}, minSample: ${opts.minSampleSize}\n`);

  // 1. conversion store 로드
  if (!fs.existsSync(opts.storePath)) {
    console.error(`❌ conversion store 파일 없음: ${opts.storePath}`);
    console.error('   먼저 conversionStore.record()로 이벤트 적재 필요');
    process.exit(1);
  }
  const store = new FileConversionStore(opts.storePath);
  const size = await store.size();
  console.log(`📊 conversion 이벤트 ${size}건 로드`);

  // 2. analyses 로드
  const { byPostId, postIds } = loadAnalyses(opts.analysesDir);
  console.log(`📊 benchmark 분석 ${postIds.length}건 로드`);

  if (postIds.length < opts.minSampleSize) {
    console.error(`❌ 분석 샘플 부족: ${postIds.length} < ${opts.minSampleSize}`);
    process.exit(2);
  }

  // 3. 패턴 추출
  const result = await extractPatterns({
    store,
    postIds,
    analyses: byPostId,
    metric: opts.metric,
    topPercent: opts.topPercent,
    minSampleSize: opts.minSampleSize,
  });

  console.log(`\n${summarizePatternResult(result)}\n`);

  // 4. 결과 저장
  fs.mkdirSync(path.dirname(opts.outPath), { recursive: true });
  fs.writeFileSync(opts.outPath, JSON.stringify(result, null, 2), 'utf-8');
  console.log(`💾 결과 저장: ${opts.outPath}`);

  if (result.fallbackReason && result.topPosts.length === 0) {
    console.error(`⚠️ ${result.fallbackReason}`);
    process.exit(3);
  }
}

main().catch((err) => {
  console.error('❌ 패턴 추출 실패:', err);
  process.exit(99);
});
