/**
 * SPEC-CONVERSION-001 L4-2.4 — 프롬프트 개선 리포트 CLI
 *
 * 실행: npx ts-node scripts/rlhf/prompt-review.ts \
 *        --patterns data/rlhf/patterns-<date>.json \
 *        --baseline-chars 2400 --baseline-headings 5 --baseline-images 5 \
 *        --baseline-keywords "카페,인테리어,메뉴" \
 *        --out data/rlhf/review-<date>.md
 *
 * extract-patterns.ts 결과를 받아 reviewPrompt → markdown 리포트.
 */

/* eslint-disable @typescript-eslint/no-require-imports */
import * as fs from 'fs';
import * as path from 'path';
import { reviewPrompt, renderReportMarkdown } from '../../src/monitor/promptReviewer';
import type { PatternExtractorResult } from '../../src/monitor/rlhfPatternExtractor';

interface CliOptions {
  patternsPath: string;
  baselineChars?: number;
  baselineHeadings?: number;
  baselineImages?: number;
  baselineKeywords?: string[];
  outPath: string;
}

function parseCli(): CliOptions {
  const argv = process.argv.slice(2);
  const opts: CliOptions = {
    patternsPath: '',
    outPath: `data/rlhf/review-${new Date().toISOString().slice(0, 10)}.md`,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--patterns') opts.patternsPath = argv[++i];
    else if (a === '--baseline-chars') opts.baselineChars = parseInt(argv[++i], 10);
    else if (a === '--baseline-headings') opts.baselineHeadings = parseInt(argv[++i], 10);
    else if (a === '--baseline-images') opts.baselineImages = parseInt(argv[++i], 10);
    else if (a === '--baseline-keywords') {
      opts.baselineKeywords = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    } else if (a === '--out') opts.outPath = argv[++i];
  }
  return opts;
}

async function main(): Promise<void> {
  const opts = parseCli();
  console.log('🐙 SPEC-CONVERSION-001 L4-2.4: 프롬프트 개선 리포트');

  if (!opts.patternsPath || !fs.existsSync(opts.patternsPath)) {
    console.error(`❌ patterns 파일 없음: ${opts.patternsPath}`);
    console.error('   먼저 scripts/rlhf/extract-patterns.ts 실행 필요');
    process.exit(1);
  }

  let extractorResult: PatternExtractorResult;
  try {
    const raw = fs.readFileSync(opts.patternsPath, 'utf-8');
    extractorResult = JSON.parse(raw) as PatternExtractorResult;
  } catch (err) {
    console.error(`❌ patterns 파일 파싱 실패: ${(err as Error).message}`);
    process.exit(2);
  }

  console.log(`   metric: ${extractorResult.metric}, topPosts: ${extractorResult.topPosts?.length ?? 0}\n`);

  const report = reviewPrompt({
    extractorResult,
    currentBaseline: {
      targetCharCount: opts.baselineChars,
      targetHeadingCount: opts.baselineHeadings,
      targetImageCount: opts.baselineImages,
      currentTopKeywords: opts.baselineKeywords,
    },
  });

  console.log(`📊 ${report.summary}\n`);
  for (const s of report.suggestions) {
    console.log(`  [${s.severity.toUpperCase()}] ${s.category}: ${s.observation}`);
    console.log(`    → ${s.suggestion}\n`);
  }

  const md = renderReportMarkdown(report);
  fs.mkdirSync(path.dirname(opts.outPath), { recursive: true });
  fs.writeFileSync(opts.outPath, md, 'utf-8');
  console.log(`💾 마크다운 리포트 저장: ${opts.outPath}`);

  if (report.fallbackReason) process.exit(3);
}

main().catch((err) => {
  console.error('❌ 리포트 생성 실패:', err);
  process.exit(99);
});
