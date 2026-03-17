/**
 * Fix editorHelpers.ts: Replace incomplete smartTypeWithAutoHighlight stub
 * with full function definition
 */
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src', 'automation', 'editorHelpers.ts');
let content = fs.readFileSync(file, 'utf-8');
const lines = content.split('\n');

// Find L42 "// ── Local utility: smartTypeWithAutoHighlight ──"
// and the import lines that follow, replace up to L57
let startIdx = -1;
let endIdx = -1;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('Local utility: smartTypeWithAutoHighlight')) {
        startIdx = i;
    }
    if (startIdx >= 0 && lines[i].includes("from '../image/geminiTableExtractor.js'")) {
        endIdx = i;
        break;
    }
}

if (startIdx < 0 || endIdx < 0) {
    console.error('Could not find the target range');
    process.exit(1);
}

console.log(`Found range: L${startIdx + 1} - L${endIdx + 1}`);

// Read the complete smartTypeWithAutoHighlight from naverBlogAutomation.ts
const mainFile = path.join(__dirname, 'src', 'naverBlogAutomation.ts');
const mainContent = fs.readFileSync(mainFile, 'utf-8');
const mainLines = mainContent.split('\n');

let fnStart = -1, fnEnd = -1;
for (let i = 0; i < mainLines.length; i++) {
    if (mainLines[i].includes('function smartTypeWithAutoHighlight(')) {
        fnStart = i;
        break;
    }
}

if (fnStart >= 0) {
    let braceCount = 0, found = false;
    for (let j = fnStart; j < mainLines.length; j++) {
        for (const ch of mainLines[j]) {
            if (ch === '{') { braceCount++; found = true; }
            if (ch === '}') { braceCount--; if (found && braceCount === 0) { fnEnd = j; break; } }
        }
        if (fnEnd >= 0) break;
    }
}

console.log(`smartTypeWithAutoHighlight in main: L${fnStart + 1} - L${fnEnd + 1}`);

const smartTypeFn = mainLines.slice(fnStart, fnEnd + 1).join('\n');

// Build replacement block
const replacement = [
    '// ── Local utility: smartTypeWithAutoHighlight ──',
    smartTypeFn,
    '',
    "import {",
    "  generateProductSpecTableImage,",
    "  generateProsConsTableImage,",
    "  extractSpecsFromContent,",
    "  generateCtaBannerImage,",
    "  generateTableFromUrl",
    "} from '../image/tableImageGenerator.js';",
    "import { extractProsConsWithGemini } from '../image/geminiTableExtractor.js';",
].join('\n');

// Replace lines
const newLines = [
    ...lines.slice(0, startIdx),
    replacement,
    ...lines.slice(endIdx + 1)
];

content = newLines.join('\n');

// Also fix remaining inline import paths that weren't caught before
// Check for any './image/' that should be '../image/'
let inlineFixCount = 0;

// Fix dynamic imports inside function bodies: './image/...' → '../image/...'
const beforeCount = (content.match(/from '\.\/image\//g) || []).length;
content = content.replace(/from '\.\/image\//g, "from '../image/");
const afterCount = (content.match(/from '\.\/image\//g) || []).length;
inlineFixCount += beforeCount - afterCount;

// Fix dynamic imports: import('./image/...' → import('../image/...
const beforeDynamic = (content.match(/import\('\.\/image\//g) || []).length;
content = content.replace(/import\('\.\/image\//g, "import('../image/");
inlineFixCount += beforeDynamic;

// Fix './naverSearchApi.js' → '../naverSearchApi.js'
content = content.replace(/from '\.\/naverSearchApi\.js'/g, "from '../naverSearchApi.js'");
content = content.replace(/import\('\.\/naverSearchApi\.js'\)/g, "import('../naverSearchApi.js')");

// Fix './contentGenerator.js' → '../contentGenerator.js'
content = content.replace(/from '\.\/contentGenerator\.js'/g, "from '../contentGenerator.js'");
content = content.replace(/import\('\.\/contentGenerator\.js'\)/g, "import('../contentGenerator.js')");

// Fix remaining implicit any: 's' parameter
const finalLines = content.split('\n');
for (let i = 0; i < finalLines.length; i++) {
    const l = finalLines[i];
    // .map(s => s.trim()) patterns
    if (/\.map\(s\s*=>/.test(l) && !l.includes('s:') && !l.includes('(s:')) {
        finalLines[i] = l.replace(/\.map\(s\s*=>/g, '.map((s: any) =>');
        if (finalLines[i] !== l) console.log(`Fixed implicit any 's' at L${i + 1}`);
    }
    if (/\.filter\(s\s*=>/.test(l) && !l.includes('s:') && !l.includes('(s:')) {
        finalLines[i] = l.replace(/\.filter\(s\s*=>/g, '.filter((s: any) =>');
        if (finalLines[i] !== l) console.log(`Fixed implicit any 's' at L${i + 1}`);
    }
}
content = finalLines.join('\n');

fs.writeFileSync(file, content, 'utf-8');
console.log(`Done. Inline import fixes: ${inlineFixCount}`);
console.log(`New line count: ${content.split('\n').length}`);
