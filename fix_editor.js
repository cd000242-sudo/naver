/**
 * Fix editorHelpers.ts: add missing imports, fix paths, fix implicit any
 */
const fs = require('fs');
const path = require('path');

const helperPath = path.join(__dirname, 'src', 'automation', 'editorHelpers.ts');
let content = fs.readFileSync(helperPath, 'utf-8');
let lines = content.split('\n');
let fixes = 0;

// ── Fix 1: Add missing imports at the top ──
const additionalImports = [
    "import { safeKeyboardType, smartTypeWithAutoHighlight } from '../ghostCursorHelper.js';",
    "import {",
    "  generateProductSpecTableImage,",
    "  generateProsConsTableImage,",
    "  extractSpecsFromContent,",
    "  generateCtaBannerImage,",
    "  generateTableFromUrl",
    "} from '../image/tableImageGenerator.js';",
    "import { extractProsConsWithGemini } from '../image/geminiTableExtractor.js';",
];

// Find insertion point (after existing imports)
let lastImportIdx = 0;
for (let i = 0; i < Math.min(lines.length, 20); i++) {
    if (lines[i].startsWith('import ')) lastImportIdx = i;
}
// Insert after last import
lines.splice(lastImportIdx + 1, 0, ...additionalImports);
fixes += additionalImports.length;
console.log(`Added ${additionalImports.length} import lines after L${lastImportIdx + 1}`);

// Rejoin
content = lines.join('\n');

// ── Fix 2: Fix relative import paths (from automation/ subdir) ──
// ./contentGenerator.js → ../contentGenerator.js
content = content.replace(/from\s+'\.\/contentGenerator\.js'/g, "from '../contentGenerator.js'");
// ./image/tableImageGenerator.js → ../image/tableImageGenerator.js 
content = content.replace(/from\s+'\.\/image\/tableImageGenerator\.js'/g, "from '../image/tableImageGenerator.js'");
// ./image/nanoBananaProGenerator.js → ../image/nanoBananaProGenerator.js
content = content.replace(/from\s+'\.\/image\/nanoBananaProGenerator\.js'/g, "from '../image/nanoBananaProGenerator.js'");
// ./naverSearchApi.js → ../naverSearchApi.js
content = content.replace(/from\s+'\.\/naverSearchApi\.js'/g, "from '../naverSearchApi.js'");
console.log('Fixed relative import paths');
fixes++;

// ── Fix 3: Fix ResolvedRunOptions ──
// This is likely a local type alias — we define it or use any
if (content.includes('ResolvedRunOptions') && !content.includes("type ResolvedRunOptions")) {
    content = content.replace(
        "import { Page, Frame, ElementHandle } from 'puppeteer';",
        "import { Page, Frame, ElementHandle } from 'puppeteer';\n\n// Type alias for resolved run options\ntype ResolvedRunOptions = any;"
    );
    fixes++;
    console.log('Added ResolvedRunOptions type alias');
}

// ── Fix 4: Fix implicit any types ──
// (img) => → (img: any) =>
content = content.replace(/\(img\)\s*=>/g, '(img: any) =>');
content = content.replace(/\(img,\s*idx\)\s*=>/g, '(img: any, idx: number) =>');
// (s) => → (s: any) =>  but only in .filter/.map contexts
content = content.replace(/\.filter\(\(s\)\s*=>/g, '.filter((s: any) =>');
content = content.replace(/\.map\(\(s\)\s*=>/g, '.map((s: any) =>');
// (c) => → (c: any) =>
content = content.replace(/\.filter\(\(c\)\s*=>/g, '.filter((c: any) =>');
content = content.replace(/\.map\(\(c\)\s*=>/g, '.map((c: any) =>');
// (fontSize) => → (fontSize: any) =>
content = content.replace(/\(fontSize\)\s*=>/g, '(fontSize: any) =>');
// Fix .then((c) => and .forEach((c) =>
content = content.replace(/\.then\(\(c\)\s*=>/g, '.then((c: any) =>');
content = content.replace(/\.forEach\(\(c\)\s*=>/g, '.forEach((c: any) =>');
console.log('Fixed implicit any types');
fixes++;

fs.writeFileSync(helperPath, content, 'utf-8');
console.log(`\nTotal fixes applied: ${fixes}`);
console.log(`New line count: ${content.split('\n').length}`);
