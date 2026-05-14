#!/usr/bin/env node

/**
 * SERP 프로브 CLI — 끝판왕 Phase 3.1
 *
 * 사용:
 *   node scripts/probe-serp.mjs "키워드"
 *   node scripts/probe-serp.mjs "키워드" --display=20
 *   node scripts/probe-serp.mjs "키워드" --mode=homefeed
 *
 * 결과:
 *   release_final/serp-probe-{keyword}.json
 *   콘솔에 요약 출력
 *
 * 환경설정:
 *   ./config/.config.json 또는 process.env에서
 *   naverSearchClientId, naverSearchClientSecret 자동 로드
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0].startsWith('--')) {
    console.error('사용법: node scripts/probe-serp.mjs "키워드" [--display=10] [--mode=seo]');
    process.exit(1);
  }
  const keyword = args[0];
  const opts = Object.fromEntries(
    args.slice(1)
      .filter(a => a.startsWith('--'))
      .map(a => {
        const [k, v] = a.slice(2).split('=');
        return [k, v ?? true];
      })
  );

  const display = parseInt(opts.display, 10) || 10;
  const mode = opts.mode || 'seo';

  // 빌드된 dist에서 모듈 로드 (TypeScript 직접 실행 회피)
  const distExists = fs.existsSync(path.join(ROOT, 'dist/analytics/serpProbe.js'));
  if (!distExists) {
    console.error('❌ dist/analytics/serpProbe.js 없음. 먼저 `npm run build` 실행하세요.');
    process.exit(1);
  }

  const { probeSerp } = await import(path.join(ROOT, 'dist/analytics/serpProbe.js'));

  // API 키 로드 — config 파일 또는 환경변수
  let clientId = process.env.NAVER_SEARCH_CLIENT_ID || '';
  let clientSecret = process.env.NAVER_SEARCH_CLIENT_SECRET || '';
  const configPath = path.join(ROOT, 'config/.config.json');
  if ((!clientId || !clientSecret) && fs.existsSync(configPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      clientId = clientId || cfg.naverSearchClientId || '';
      clientSecret = clientSecret || cfg.naverSearchClientSecret || '';
    } catch {
      /* ignore */
    }
  }

  if (!clientId || !clientSecret) {
    console.error('❌ 네이버 검색 API 키 없음.');
    console.error('   설정: config/.config.json의 naverSearchClientId/Secret');
    console.error('   또는: NAVER_SEARCH_CLIENT_ID/SECRET 환경변수');
    console.error('   발급: https://developers.naver.com/apps/#/register');
    process.exit(1);
  }

  console.log(`\n🔍 SERP 프로브 시작: "${keyword}" (display=${display}, mode=${mode})\n`);
  const startMs = Date.now();
  const report = await probeSerp(keyword, clientId, clientSecret, { display, mode });
  const elapsedSec = ((Date.now() - startMs) / 1000).toFixed(1);

  // 결과 저장
  const outPath = path.join(ROOT, 'release_final', `serp-probe-${keyword.replace(/[^a-zA-Z0-9가-힣_-]/g, '_')}.json`);
  if (!fs.existsSync(path.dirname(outPath))) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
  }
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf-8');

  // 콘솔 요약
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📊 "${keyword}" 상위 ${report.itemCount}개 중 ${report.successCount}개 분석 완료 (${elapsedSec}s)`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  if (report.baseline) {
    console.log(`📈 baseline:`);
    console.log(`  · 평균 finalScore : ${report.baseline.avgFinalScore} (중앙값 ${report.baseline.medianFinalScore})`);
    console.log(`  · 평균 모드 점수  : ${report.baseline.avgModeScore}`);
    console.log(`  · 평균 안전성     : ${report.baseline.avgSafetyScore}`);
    console.log(`  · 평균 사람다움   : ${report.baseline.avgHumanlikeScore}`);
    console.log(`  · 평균 본문 길이  : ${report.baseline.avgBodyLength}자`);
    console.log(`  · 구체 수치 평균  : ${report.baseline.avgConcreteNumbers}개/글`);
    console.log(`  · 직접 경험 평균  : ${report.baseline.avgDirectExperience}점`);
    console.log(`  · AI 클리셰 평균  : ${report.baseline.avgAiClicheCount}개/글 (낮을수록 ↑)`);
  } else {
    console.log('⚠️ baseline 없음 — 분석 가능한 글 부족 (fetch 실패 등)');
  }
  console.log(`\n💾 상세 결과: ${outPath}\n`);
}

main().catch(err => {
  console.error('\n❌ 프로브 실패:', err.message);
  if (err.response?.status) console.error(`   API 응답: ${err.response.status}`);
  process.exit(1);
});
