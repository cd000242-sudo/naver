/**
 * Extract publishing/category methods from naverBlogAutomation.ts into publishHelpers.ts
 * 
 * Methods to extract:
 * 1. selectCategoryInPublishModal (L653-L1019, 367 lines)
 * 2. debugCategoryElements (L1022-L1068, 47 lines)
 * 3. setScheduleDateTime (L3484-L3957, 474 lines)
 * 4. debugPublishModal (L3962-L4038, 77 lines)
 * 5. publishScheduled (L4043-L4269, 227 lines)
 * 6. publishBlogPost (L4271-L4962, 692 lines)
 * 
 * Strategy:
 * 1. Extract each method body from naverBlogAutomation.ts
 * 2. Convert to standalone functions with 'self: any' pattern
 * 3. Write all to publishHelpers.ts
 * 4. Replace originals with delegate calls
 */
const fs = require('fs');
const path = require('path');

const mainPath = path.join(__dirname, 'src', 'naverBlogAutomation.ts');
const helperPath = path.join(__dirname, 'src', 'automation', 'publishHelpers.ts');

let mainContent = fs.readFileSync(mainPath, 'utf-8');
let mainLines = mainContent.split('\n');

console.log(`Original: ${mainLines.length} lines`);

// Methods to extract with their approximate start lines
const methodDefs = [
    { name: 'selectCategoryInPublishModal', approxStart: 653 },
    { name: 'debugCategoryElements', approxStart: 1022 },
    { name: 'setScheduleDateTime', approxStart: 3484 },
    { name: 'debugPublishModal', approxStart: 3962 },
    { name: 'publishScheduled', approxStart: 4043 },
    { name: 'publishBlogPost', approxStart: 4271 },
];

// Helper: find method start (exact line)
function findMethodStart(lines, name, approxStart) {
    // Search in a range around the approximate start
    for (let delta = -10; delta <= 10; delta++) {
        const idx = approxStart - 1 + delta;
        if (idx >= 0 && idx < lines.length) {
            const l = lines[idx].trim();
            const pattern = new RegExp(`^(private\\s+)?(async\\s+)?${name}\\s*\\(`);
            if (pattern.test(l)) {
                return idx;
            }
        }
    }
    return -1;
}

// Helper: find method end by brace matching
function findMethodEnd(lines, startIdx) {
    let braceCount = 0;
    let foundFirst = false;
    for (let i = startIdx; i < lines.length; i++) {
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

// Helper: find JSDoc above a method
function findJSDocStart(lines, methodIdx) {
    let start = methodIdx;
    for (let i = methodIdx - 1; i >= Math.max(0, methodIdx - 30); i--) {
        const trimmed = lines[i].trim();
        if (trimmed === '/**' || trimmed.startsWith('* ') || trimmed === '*/' || trimmed === '*' || trimmed.startsWith('//')) {
            start = i;
        } else if (trimmed === '') {
            start = i;
        } else {
            break;
        }
    }
    return start;
}

// Step 1: Extract methods and build publishHelpers.ts content
const extractedMethods = [];

for (const def of methodDefs) {
    const startIdx = findMethodStart(mainLines, def.name, def.approxStart);
    if (startIdx === -1) {
        console.log(`ERROR: ${def.name} not found near L${def.approxStart}`);
        continue;
    }

    const endIdx = findMethodEnd(mainLines, startIdx);
    if (endIdx === -1) {
        console.log(`ERROR: No closing brace for ${def.name}`);
        continue;
    }

    const jsDocStart = findJSDocStart(mainLines, startIdx);

    // Extract the full method (JSDoc + signature + body)
    const methodLines = mainLines.slice(jsDocStart, endIdx + 1);
    const bodyLines = mainLines.slice(startIdx + 1, endIdx); // body excluding first { and last }

    // Get the method signature
    const sigLine = mainLines[startIdx].trim();

    // Parse params from signature
    // Remove "private " and "async " prefixes
    let cleanSig = sigLine.replace(/^private\s+/, '').replace(/^async\s+/, '');
    // Extract params part
    const paramMatch = sigLine.match(/\(([^)]*(?:\([^)]*\))*[^)]*)\)/s);

    console.log(`  ${def.name}: L${jsDocStart + 1}-L${endIdx + 1} (${endIdx - jsDocStart + 1} lines)`);

    extractedMethods.push({
        name: def.name,
        jsDocStart,
        startIdx,
        endIdx,
        methodLines,
        sigLine,
        isAsync: sigLine.includes('async'),
    });
}

// Step 2: Build publishHelpers.ts
const helperLines = [];
helperLines.push("/**");
helperLines.push(" * publishHelpers.ts - 발행/카테고리/예약 관련 함수");
helperLines.push(" * naverBlogAutomation.ts에서 추출됨");
helperLines.push(" */");
helperLines.push("import { Page, Frame, ElementHandle } from 'puppeteer';");
helperLines.push("");

for (const method of extractedMethods) {
    // Add separator comment
    helperLines.push(`// ── ${method.name} ──`);

    // Build the new function signature
    // Original: "private async funcName(params): ReturnType {"
    // New:      "export async function funcName(self: any, params): ReturnType {"
    let newSig = method.sigLine;

    // Remove leading whitespace  
    newSig = newSig.trim();

    // Remove "private "
    newSig = newSig.replace(/^private\s+/, '');

    // Add "export " prefix and "function " keyword
    if (newSig.startsWith('async')) {
        newSig = 'export ' + newSig.replace(/^async\s+/, 'async function ');
    } else {
        newSig = 'export function ' + newSig;
    }

    // Add "self: any" as first parameter
    newSig = newSig.replace(/\(/, '(self: any, ');

    // Fix case where there are no params: "(self: any, )" -> "(self: any)"
    newSig = newSig.replace('(self: any, )', '(self: any)');

    // Add JSDoc if present
    const jsDocLines = [];
    for (let i = method.jsDocStart; i < method.startIdx; i++) {
        // Remove leading 2-space indent (class method indent)
        let line = mainLines[i];
        if (line.startsWith('  ')) line = line.substring(2);
        else if (line.startsWith('\t')) line = line.substring(1);
        jsDocLines.push(line);
    }

    if (jsDocLines.length > 0) {
        helperLines.push(...jsDocLines);
    }

    helperLines.push(newSig);

    // Add body lines, replacing "this." with "self."
    const bodyLines = mainLines.slice(method.startIdx + 1, method.endIdx + 1);
    for (const line of bodyLines) {
        // Remove 2-space class indent
        let newLine = line;
        if (newLine.startsWith('  ')) newLine = newLine.substring(2);

        // Replace this. with self.
        newLine = newLine.replace(/this\./g, 'self.');
        // Replace this[ with self[
        newLine = newLine.replace(/this\[/g, 'self[');

        helperLines.push(newLine);
    }

    helperLines.push('');
}

// Write publishHelpers.ts
fs.writeFileSync(helperPath, helperLines.join('\n'), 'utf-8');
console.log(`\nCreated publishHelpers.ts: ${helperLines.length} lines`);

// Step 3: Replace original methods with delegates (in REVERSE order)
const sortedMethods = [...extractedMethods].sort((a, b) => b.jsDocStart - a.jsDocStart);

for (const method of sortedMethods) {
    const { name, jsDocStart, startIdx, endIdx, sigLine, isAsync } = method;

    // Parse parameter names from original signature for delegate call
    const paramStr = sigLine.match(/\(([^)]*(?:\{[^}]*\}[^)]*)*)\)/s);
    let paramNames = '';

    if (paramStr) {
        // Extract parameter names (before : or ?)
        const params = paramStr[1].split(',').map(p => {
            const trimmed = p.trim();
            const nameMatch = trimmed.match(/^(\w+)/);
            return nameMatch ? nameMatch[1] : '';
        }).filter(n => n);
        paramNames = params.join(', ');
    }

    // Build delegate call
    const delegateParams = paramNames ? `this, ${paramNames}` : 'this';
    const returnType = sigLine.includes('Promise<void>') ? '' : 'return ';
    const awaitStr = isAsync ? 'await ' : '';

    // Build replacement lines
    const newLines = [];
    // Keep JSDoc
    for (let i = jsDocStart; i < startIdx; i++) {
        newLines.push(mainLines[i]);
    }
    // Keep original signature
    newLines.push(mainLines[startIdx]);
    // Add delegate call
    newLines.push(`    ${returnType}${awaitStr}publishHelpers.${name}(${delegateParams});`);
    // Closing brace
    newLines.push('  }');

    // Replace in mainLines
    const removeCount = endIdx - jsDocStart + 1;
    mainLines.splice(jsDocStart, removeCount, ...newLines);

    console.log(`  ${name}: L${jsDocStart + 1}-L${endIdx + 1} (${removeCount} → ${newLines.length} lines, saved ${removeCount - newLines.length})`);
}

// Step 4: Add import for publishHelpers
let lastImportLine = 0;
for (let i = 0; i < Math.min(100, mainLines.length); i++) {
    if (mainLines[i].trim().startsWith('import ')) {
        lastImportLine = i;
    }
}

// Check if already imported
if (!mainLines.some(l => l.includes('publishHelpers'))) {
    mainLines.splice(lastImportLine + 1, 0, "import * as publishHelpers from './automation/publishHelpers';");
    console.log(`\nAdded publishHelpers import at L${lastImportLine + 2}`);
}

// Save
fs.writeFileSync(mainPath, mainLines.join('\n'), 'utf-8');
console.log(`\nResult: ${mainLines.length} lines`);
