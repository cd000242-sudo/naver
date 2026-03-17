/**
 * Extract editor/content methods from naverBlogAutomation.ts into editorHelpers.ts
 */
const fs = require('fs');
const path = require('path');

const mainPath = path.join(__dirname, 'src', 'naverBlogAutomation.ts');
const helperPath = path.join(__dirname, 'src', 'automation', 'editorHelpers.ts');

let mainLines = fs.readFileSync(mainPath, 'utf-8').split('\n');
console.log(`Original: ${mainLines.length} lines`);

const methodNames = ['insertQuotation', 'typeBodyWithRetry', 'applyStructuredContent', 'setFontSize', 'extractBodyForHeading'];

function findMethodStart(lines, name) {
    for (let i = 0; i < lines.length; i++) {
        if (new RegExp(`^\\s*(private\\s+)?(async\\s+)?${name}\\s*\\(`).test(lines[i])) return i;
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

function findJSDocStart(lines, methodIdx) {
    let start = methodIdx;
    for (let i = methodIdx - 1; i >= Math.max(0, methodIdx - 30); i--) {
        const t = lines[i].trim();
        if (t === '/**' || t.startsWith('* ') || t === '*/' || t === '*' || t.startsWith('//') || t === '') start = i;
        else break;
    }
    return start;
}

// Step 1: Extract methods
const extracted = [];
for (const name of methodNames) {
    const startIdx = findMethodStart(mainLines, name);
    if (startIdx === -1) { console.log(`ERROR: ${name} NOT FOUND`); continue; }
    const endIdx = findMethodEnd(mainLines, startIdx);
    if (endIdx === -1) { console.log(`ERROR: No close brace for ${name}`); continue; }
    const jsDocStart = findJSDocStart(mainLines, startIdx);

    console.log(`  ${name}: L${jsDocStart + 1}-L${endIdx + 1} (${endIdx - jsDocStart + 1} lines)`);
    extracted.push({ name, jsDocStart, startIdx, endIdx, isAsync: mainLines[startIdx].includes('async') });
}

// Step 2: Build editorHelpers.ts
const helperOut = [];
helperOut.push("/**");
helperOut.push(" * editorHelpers.ts - 에디터 조작/컨텐츠 적용 관련 함수");
helperOut.push(" * naverBlogAutomation.ts에서 추출됨");
helperOut.push(" */");
helperOut.push("import { Page, Frame, ElementHandle } from 'puppeteer';");
helperOut.push("import type { StructuredContent, ImagePlan } from '../contentGenerator.js';");
helperOut.push("import type { GhostCursor } from '../ghostCursorHelper.js';");
helperOut.push("");

for (const method of extracted) {
    helperOut.push(`// ── ${method.name} ──`);

    // JSDoc
    for (let i = method.jsDocStart; i < method.startIdx; i++) {
        let l = mainLines[i];
        if (l.startsWith('  ')) l = l.substring(2);
        else if (l.startsWith('\t')) l = l.substring(1);
        helperOut.push(l);
    }

    // Signature transformation
    let sig = mainLines[method.startIdx].trim();
    sig = sig.replace(/^private\s+/, '');
    if (sig.startsWith('async')) {
        sig = 'export ' + sig.replace(/^async\s+/, 'async function ');
    } else {
        sig = 'export function ' + sig;
    }
    sig = sig.replace(/\(/, '(self: any, ');
    sig = sig.replace('(self: any, )', '(self: any)');
    helperOut.push(sig);

    // Body lines (remove 2-space class indent, replace this. → self.)
    for (let i = method.startIdx + 1; i <= method.endIdx; i++) {
        let l = mainLines[i];
        if (l.startsWith('  ')) l = l.substring(2);
        l = l.replace(/this\./g, 'self.');
        l = l.replace(/this\[/g, 'self[');
        helperOut.push(l);
    }
    helperOut.push('');
}

fs.writeFileSync(helperPath, helperOut.join('\n'), 'utf-8');
console.log(`\nCreated editorHelpers.ts: ${helperOut.length} lines`);

// Step 3: Replace originals with delegates (REVERSE order by jsDocStart)
const sorted = [...extracted].sort((a, b) => b.jsDocStart - a.jsDocStart);
for (const method of sorted) {
    // Parse params
    const sigLine = mainLines[method.startIdx].trim();
    const paramStr = sigLine.match(/\(([^)]*(?:\{[^}]*\}[^)]*)*)\)/s);
    let paramNames = '';
    if (paramStr) {
        paramNames = paramStr[1].split(',').map(p => {
            const m = p.trim().match(/^(\w+)/);
            return m ? m[1] : '';
        }).filter(n => n).join(', ');
    }

    const delegateParams = paramNames ? `this, ${paramNames}` : 'this';
    const returnType = sigLine.includes('Promise<void>') ? '' : 'return ';
    const awaitStr = method.isAsync ? 'await ' : '';

    const newLines = [];
    for (let i = method.jsDocStart; i < method.startIdx; i++) {
        newLines.push(mainLines[i]);
    }
    newLines.push(mainLines[method.startIdx]);
    newLines.push(`    ${returnType}${awaitStr}editorHelpers.${method.name}(${delegateParams});`);
    newLines.push('  }');

    const removeCount = method.endIdx - method.jsDocStart + 1;
    mainLines.splice(method.jsDocStart, removeCount, ...newLines);
    console.log(`  ${method.name}: L${method.jsDocStart + 1}-L${method.endIdx + 1} (${removeCount} → ${newLines.length} lines, saved ${removeCount - newLines.length})`);
}

// Step 4: Add import
if (!mainLines.some(l => l.includes('editorHelpers'))) {
    const lastImportIdx = mainLines.findIndex(l => l.includes('publishHelpers'));
    if (lastImportIdx >= 0) {
        mainLines.splice(lastImportIdx + 1, 0, "import * as editorHelpers from './automation/editorHelpers';");
        console.log(`\nAdded editorHelpers import at L${lastImportIdx + 2}`);
    }
}

fs.writeFileSync(mainPath, mainLines.join('\n'), 'utf-8');
console.log(`\nResult: ${mainLines.length} lines`);
