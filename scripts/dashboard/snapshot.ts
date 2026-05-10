/**
 * SPEC-CONVERSION-001 — operationsDashboard snapshot CLI
 *
 * 실행: npx ts-node scripts/dashboard/snapshot.ts [--out path] [--summary]
 *
 * 현재 프로세스의 operationsDashboard.getDashboardSnapshot()을 JSON으로 출력.
 * 운영 모니터링·헬스체크 cron에 사용.
 *
 * 주의: 본 CLI는 *현재 프로세스* 메트릭만 캡처. Electron 앱 내부 메트릭은 별도
 *      IPC 또는 main 프로세스에서 추출 필요. 단독 사용 시 의미 있는 데이터 없음.
 */

/* eslint-disable @typescript-eslint/no-require-imports */
import * as fs from 'fs';
import * as path from 'path';
import {
  getDashboardSnapshot,
  getDashboardSummary,
} from '../../src/monitor/operationsDashboard';

interface CliOptions {
  outPath?: string;
  summaryOnly: boolean;
  pretty: boolean;
}

function parseCli(): CliOptions {
  const argv = process.argv.slice(2);
  const opts: CliOptions = { summaryOnly: false, pretty: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') opts.outPath = argv[++i];
    else if (a === '--summary') opts.summaryOnly = true;
    else if (a === '--compact') opts.pretty = false;
  }
  return opts;
}

function main(): void {
  const opts = parseCli();

  if (opts.summaryOnly) {
    const summary = getDashboardSummary();
    if (opts.outPath) {
      fs.mkdirSync(path.dirname(opts.outPath), { recursive: true });
      fs.writeFileSync(opts.outPath, summary, 'utf-8');
      console.log(`💾 summary 저장: ${opts.outPath}`);
    }
    console.log(summary);
    return;
  }

  const snapshot = getDashboardSnapshot();
  const json = opts.pretty ? JSON.stringify(snapshot, null, 2) : JSON.stringify(snapshot);

  if (opts.outPath) {
    fs.mkdirSync(path.dirname(opts.outPath), { recursive: true });
    fs.writeFileSync(opts.outPath, json, 'utf-8');
    console.log(`💾 snapshot 저장: ${opts.outPath}`);
  } else {
    console.log(json);
  }
}

main();
