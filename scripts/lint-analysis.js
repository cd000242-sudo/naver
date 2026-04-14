// v1.4.56 — 린트 경고를 파일별로 집계 + god-file 분리
const fs = require('fs');
const path = require('path');

const d = JSON.parse(fs.readFileSync('scripts/tmp-lint.json', 'utf8'));
const files = d
  .filter(f => f.warningCount > 0)
  .map(f => {
    const rel = f.filePath.replace(/\\/g, '/').split('/').slice(-4).join('/');
    let lines = -1;
    try {
      lines = fs.readFileSync(f.filePath, 'utf8').split('\n').length;
    } catch (e) {}
    return { path: rel, full: f.filePath, count: f.warningCount, lines };
  });

files.sort((a, b) => b.count - a.count);

console.log('=== Top 25 warning files ===');
console.log('Warns  Lines  File');
for (const f of files.slice(0, 25)) {
  const godFlag = f.lines > 2000 ? ' 🔴 GOD' : f.lines > 1000 ? ' 🟡 large' : '';
  console.log(String(f.count).padStart(5) + '  ' + String(f.lines).padStart(5) + '  ' + f.path + godFlag);
}

const godTotal = files.filter(f => f.lines >= 2000).reduce((s, f) => s + f.count, 0);
const largeTotal = files.filter(f => f.lines >= 1000 && f.lines < 2000).reduce((s, f) => s + f.count, 0);
const smallTotal = files.filter(f => f.lines < 1000 && f.lines > 0).reduce((s, f) => s + f.count, 0);

console.log('');
console.log('=== Summary ===');
console.log('Files with warnings:', files.length);
console.log('God-files (2000+ lines):', files.filter(f => f.lines >= 2000).length, 'files,', godTotal, 'warnings');
console.log('Large (1000-2000):', files.filter(f => f.lines >= 1000 && f.lines < 2000).length, 'files,', largeTotal, 'warnings');
console.log('Small (<1000):', files.filter(f => f.lines < 1000 && f.lines > 0).length, 'files,', smallTotal, 'warnings');
