const { execSync } = require('child_process');
const fs = require('fs');
try {
    execSync('npx tsc --noEmit 2>&1', { cwd: __dirname, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
    fs.writeFileSync('errors.txt', 'BUILD SUCCESS!', 'utf-8');
} catch (e) {
    const allLines = e.stdout.split('\n');
    const errors = allLines.filter(l => l.includes('error TS'));
    const output = errors.map(l => {
        const m = l.match(/([^/\\]+\.ts)\((\d+),(\d+)\):\s*(error\s+\w+):\s*(.*)/);
        if (m) return `${m[1]} L${m[2]}:${m[3]} ${m[4]} - ${m[5]}`;
        return l;
    }).join('\n') + `\n\nTotal: ${errors.length}`;
    fs.writeFileSync('errors.txt', output, 'utf-8');
}
console.log('Done, check errors.txt');
