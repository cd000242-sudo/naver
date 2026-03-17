const fs = require('fs');
const path = require('path');

const mainPath = path.join(__dirname, 'src', 'naverBlogAutomation.ts');
const mainLines = fs.readFileSync(mainPath, 'utf-8').split('\n');

// Target methods for editorHelpers.ts
const targets = ['applyStructuredContent', 'extractBodyForHeading', 'typeBodyWithRetry', 'insertQuotation', 'setFontSize'];

function findMethodStart(lines, name) {
    for (let i = 0; i < lines.length; i++) {
        const l = lines[i].trim();
        const p = new RegExp(`^(private\\s+)?(async\\s+)?${name}\\s*\\(`);
        if (p.test(l)) return i;
    }
    return -1;
}

function findMethodEnd(lines, startIdx) {
    let braceCount = 0, foundFirst = false;
    for (let i = startIdx; i < lines.length; i++) {
        for (const ch of lines[i]) {
            if (ch === '{') { braceCount++; foundFirst = true; }
            if (ch === '}') { braceCount--; if (foundFirst && braceCount === 0) return i; }
        }
    }
    return -1;
}

for (const name of targets) {
    const start = findMethodStart(mainLines, name);
    if (start === -1) { console.log(`${name}: NOT FOUND`); continue; }
    const end = findMethodEnd(mainLines, start);
    console.log(`${name}: L${start + 1}-L${end + 1} (${end - start + 1} lines)`);
}

console.log(`\nTotal file: ${mainLines.length} lines`);
