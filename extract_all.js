/**
 * Replace methods in naverBlogAutomation.ts with delegates to helper files.
 * Approach: Find method, keep signature line(s), replace body with single delegate call
 */
const fs = require('fs');
const path = require('path');

const mainPath = path.join(__dirname, 'src', 'naverBlogAutomation.ts');
let lines = fs.readFileSync(mainPath, 'utf-8').split('\n');
console.log(`Original: ${lines.length} lines`);

// ── Define all methods to extract ──

// Group 1: imageHelpers
const imageMethodNames = [
    'insertImageByFileChooser',
    'insertSingleImageDirectly',
    'insertMultipleImagesDirectly',
    'insertImagesForHeading',
    'handleWatermark',
    'attemptImageInsertionViaModal',
    'insertImageViaSmartEditorModal',
    'processModalImageUpload',
    'waitForImageUploadComplete',
    'verifyImageInsertion',
    'insertAllImages',
    'insertImageToEditor',
    'insertOGLinkCard'
];

// Group 2: publishHelpers
const publishMethodNames = [
    'selectCategoryInPublishModal',
    'debugCategoryElements',
    'setScheduleDateTime',
    'debugPublishModal',
    'publishScheduled',
    'publishBlogPost'
];

// Group 3: editorHelpers
const editorMethodNames = [
    'insertQuotation',
    'typeBodyWithRetry',
    'applyStructuredContent',
    'setFontSize',
    'extractBodyForHeading'
];

function findMethodStart(lines, name) {
    for (let i = 0; i < lines.length; i++) {
        const l = lines[i].trimStart();
        // Match class methods only (indented with 2+ spaces)
        if (lines[i].match(/^\s{2,}/) && new RegExp(`^(private\\s+)?(async\\s+)?${name}\\s*\\(`).test(l)) {
            return i;
        }
    }
    return -1;
}

function findOpenBrace(lines, startIdx) {
    // Find the line with the opening { for the method body
    for (let i = startIdx; i < Math.min(lines.length, startIdx + 15); i++) {
        if (lines[i].includes('{')) return i;
    }
    return -1;
}

function findMethodEnd(lines, openBraceIdx) {
    let braceCount = 0;
    let foundFirst = false;
    for (let i = openBraceIdx; i < lines.length; i++) {
        for (const ch of lines[i]) {
            if (ch === '{') { braceCount++; foundFirst = true; }
            if (ch === '}') {
                braceCount--;
                if (foundFirst && braceCount === 0) return i;
            }
        }
    }
    return -1;
}

function findJSDocStart(lines, methodIdx) {
    let start = methodIdx;
    for (let i = methodIdx - 1; i >= Math.max(0, methodIdx - 30); i--) {
        const t = lines[i].trim();
        if (t === '/**' || t.startsWith('* ') || t === '*/' || t === '*' || t.startsWith('//') || t === '') {
            start = i;
        } else break;
    }
    return start;
}

function extractParams(lines, startIdx, openBraceIdx) {
    // Get all lines from start to open brace and extract param names
    let sigText = '';
    for (let i = startIdx; i <= openBraceIdx; i++) {
        sigText += lines[i];
    }
    // Extract content between first ( and last ) before {
    const m = sigText.match(/\(([^]*?)\)\s*(?::\s*[^{]*?)?\s*\{/);
    if (!m) return [];
    const paramStr = m[1];
    // Parse param names from TypeScript function params
    const params = [];
    let depth = 0;
    let current = '';
    for (const ch of paramStr) {
        if (ch === '{' || ch === '<' || ch === '(') depth++;
        if (ch === '}' || ch === '>' || ch === ')') depth--;
        if (ch === ',' && depth === 0) {
            const name = current.trim().match(/^(\w+)/);
            if (name) params.push(name[1]);
            current = '';
        } else {
            current += ch;
        }
    }
    if (current.trim()) {
        const name = current.trim().match(/^(\w+)/);
        if (name) params.push(name[1]);
    }
    return params;
}

// Process all methods (collect positions first, then replace in reverse order)
const allMethods = [];

function collectMethods(methodNames, helperName) {
    for (const name of methodNames) {
        const startIdx = findMethodStart(lines, name);
        if (startIdx === -1) { console.log(`  WARNING: ${name} NOT FOUND`); continue; }
        const openBraceIdx = findOpenBrace(lines, startIdx);
        if (openBraceIdx === -1) { console.log(`  WARNING: ${name} no open brace`); continue; }
        const endIdx = findMethodEnd(lines, openBraceIdx);
        if (endIdx === -1) { console.log(`  WARNING: ${name} no close brace`); continue; }
        const jsDocStart = findJSDocStart(lines, startIdx);
        const isAsync = lines[startIdx].includes('async');
        const params = extractParams(lines, startIdx, openBraceIdx);

        allMethods.push({
            name,
            helperName,
            jsDocStart,
            startIdx,
            openBraceIdx,
            endIdx,
            isAsync,
            params
        });
        console.log(`  ${name}: L${jsDocStart + 1}-L${endIdx + 1} (${endIdx - jsDocStart + 1} lines, params: [${params.join(', ')}])`);
    }
}

console.log('\n── Image Methods ──');
collectMethods(imageMethodNames, 'imageHelpers');

console.log('\n── Publish Methods ──');
collectMethods(publishMethodNames, 'publishHelpers');

console.log('\n── Editor Methods ──');
collectMethods(editorMethodNames, 'editorHelpers');

// Sort by position (descending) to replace from bottom up
allMethods.sort((a, b) => b.jsDocStart - a.jsDocStart);

let totalSaved = 0;

for (const method of allMethods) {
    const { name, helperName, jsDocStart, startIdx, openBraceIdx, endIdx, isAsync, params } = method;

    // Build replacement: keep JSDoc + signature lines, but replace body
    const newLines = [];

    // Keep JSDoc and comments
    for (let i = jsDocStart; i < startIdx; i++) {
        newLines.push(lines[i]);
    }

    // Keep all signature lines (from method start to opening brace)
    for (let i = startIdx; i <= openBraceIdx; i++) {
        newLines.push(lines[i]);
    }

    // Add delegate call
    const paramList = params.length > 0 ? `this, ${params.join(', ')}` : 'this';
    const hasReturn = !lines[startIdx].includes('Promise<void>') && !lines[startIdx].includes(': void');
    // Check sig across multiple lines
    let sigText = '';
    for (let i = startIdx; i <= openBraceIdx; i++) sigText += lines[i];
    const isVoid = sigText.includes('Promise<void>') || sigText.includes(': void');

    const returnStr = isVoid ? '' : 'return ';
    const awaitStr = isAsync ? 'await ' : '';

    newLines.push(`    ${returnStr}${awaitStr}${helperName}.${name}(${paramList});`);
    newLines.push('  }');

    const removeCount = endIdx - jsDocStart + 1;
    lines.splice(jsDocStart, removeCount, ...newLines);

    const saved = removeCount - newLines.length;
    totalSaved += saved;
    console.log(`  Replaced ${name}: ${removeCount} → ${newLines.length} lines (saved ${saved})`);
}

// Add imports if not present
const importLines = [];
if (!lines.some(l => l.includes("import * as imageHelpers"))) {
    importLines.push("import * as imageHelpers from './automation/imageHelpers';");
}
if (!lines.some(l => l.includes("import * as publishHelpers"))) {
    importLines.push("import * as publishHelpers from './automation/publishHelpers';");
}
if (!lines.some(l => l.includes("import * as editorHelpers"))) {
    importLines.push("import * as editorHelpers from './automation/editorHelpers';");
}

if (importLines.length > 0) {
    // Find good insertion point (after last import)
    let lastImportIdx = 0;
    for (let i = 0; i < Math.min(lines.length, 50); i++) {
        if (lines[i].startsWith('import ')) lastImportIdx = i;
    }
    lines.splice(lastImportIdx + 1, 0, ...importLines);
    console.log(`\nAdded ${importLines.length} imports after L${lastImportIdx + 1}`);
}

fs.writeFileSync(mainPath, lines.join('\n'), 'utf-8');
console.log(`\nFinal: ${lines.length} lines (saved ${totalSaved} lines total)`);
