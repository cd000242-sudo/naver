// 스냅샷 두 개를 비교해 시각 차이를 사람이 읽는 형태로 뽑는다.
//   node scripts/style-snapshot-diff.mjs before.json after.json
import { readFileSync } from 'node:fs';

const [beforePath, afterPath] = process.argv.slice(2);
const before = JSON.parse(readFileSync(beforePath, 'utf8'));
const after = JSON.parse(readFileSync(afterPath, 'utf8'));

let diffs = 0;
const report = [];

const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
for (const key of [...keys].sort()) {
    const a = before[key];
    const b = after[key];
    if (!a || !b) { report.push(`[route missing] ${key}: ${a ? 'after' : 'before'} 없음`); diffs++; continue; }
    if (a.length !== b.length) {
        report.push(`[node count] ${key}: ${a.length} → ${b.length}`);
        diffs++;
    }
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) {
        if (a[i].path !== b[i].path) {
            report.push(`[path drift] ${key} #${i}: ${a[i].path} → ${b[i].path}`);
            diffs++;
            break; // 구조가 어긋나면 이후 비교는 의미 없음
        }
        for (const prop of Object.keys(a[i].style)) {
            if (a[i].style[prop] !== b[i].style[prop]) {
                report.push(`[${prop}] ${key} ${a[i].path} (${a[i].tag}.${a[i].cls}): "${a[i].style[prop]}" → "${b[i].style[prop]}"`);
                diffs++;
            }
        }
    }
}

if (diffs === 0) {
    console.log('IDENTICAL — 렌더 차이 0건');
} else {
    console.log(`DIFFERENCES: ${diffs}건\n`);
    console.log(report.slice(0, 400).join('\n'));
    if (report.length > 400) console.log(`\n… 그 외 ${report.length - 400}건`);
}
process.exit(diffs === 0 ? 0 : 1);
