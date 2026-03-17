/**
 * Fix remaining 13 errors in editorHelpers.ts
 * 1. Replace ghostCursorHelper import for safeKeyboardType/smartTypeWithAutoHighlight with local defs
 * 2. Fix remaining inline import paths (./image/... → ../image/...)
 * 3. Fix remaining implicit any types
 */
const fs = require('fs');
const path = require('path');

const helperPath = path.join(__dirname, 'src', 'automation', 'editorHelpers.ts');
let content = fs.readFileSync(helperPath, 'utf-8');
let fixes = 0;

// ── Fix 1: Replace wrong import with local function definitions ──
const wrongImport = "import { safeKeyboardType, smartTypeWithAutoHighlight } from '../ghostCursorHelper.js';";
const localDefs = `// ── Local utility: safeKeyboardType (copied from naverBlogAutomation.ts) ──
async function safeKeyboardType(
  page: Page,
  text: string,
  options?: { delay?: number }
): Promise<void> {
  await page.keyboard.type(text, options);
  await page.keyboard.press('Escape').catch(() => { });
}`;

if (content.includes(wrongImport)) {
    content = content.replace(wrongImport, localDefs);
    fixes++;
    console.log('Replaced wrong import with local safeKeyboardType definition');
}

// smartTypeWithAutoHighlight is more complex, let's make it call self method
// Actually, check if it's used - editorHelpers already uses self.smartTypeWithAutoHighlight? No, it uses it directly.
// We need to add a local definition that delegates to self or is inline
// Check if extractCoreKeywords is needed too
const mainContent = fs.readFileSync(path.join(__dirname, 'src', 'naverBlogAutomation.ts'), 'utf-8');
const mainLines = mainContent.split('\n');

// Find extractCoreKeywords function
let extractCoreStart = -1, extractCoreEnd = -1;
for (let i = 0; i < mainLines.length; i++) {
    if (mainLines[i].includes('function extractCoreKeywords(')) {
        extractCoreStart = i;
        let braceCount = 0, found = false;
        for (let j = i; j < mainLines.length; j++) {
            for (const ch of mainLines[j]) {
                if (ch === '{') { braceCount++; found = true; }
                if (ch === '}') { braceCount--; if (found && braceCount === 0) { extractCoreEnd = j; break; } }
            }
            if (extractCoreEnd >= 0) break;
        }
        break;
    }
}

if (extractCoreStart >= 0) {
    console.log(`Found extractCoreKeywords: L${extractCoreStart + 1}-L${extractCoreEnd + 1}`);
}

// Find smartTypeWithAutoHighlight function
let smartTypeStart = -1, smartTypeEnd = -1;
for (let i = 0; i < mainLines.length; i++) {
    if (mainLines[i].includes('function smartTypeWithAutoHighlight(')) {
        smartTypeStart = i;
        let braceCount = 0, found = false;
        for (let j = i; j < mainLines.length; j++) {
            for (const ch of mainLines[j]) {
                if (ch === '{') { braceCount++; found = true; }
                if (ch === '}') { braceCount--; if (found && braceCount === 0) { smartTypeEnd = j; break; } }
            }
            if (smartTypeEnd >= 0) break;
        }
        break;
    }
}

if (smartTypeStart >= 0) {
    console.log(`Found smartTypeWithAutoHighlight: L${smartTypeStart + 1}-L${smartTypeEnd + 1}`);

    // Copy both extractCoreKeywords and smartTypeWithAutoHighlight into editorHelpers
    let smartTypeFn = mainLines.slice(smartTypeStart, smartTypeEnd + 1).join('\n');
    let extractCoreFn = '';
    if (extractCoreStart >= 0) {
        extractCoreFn = mainLines.slice(extractCoreStart, extractCoreEnd + 1).join('\n');
    }

    // Insert after the safeKeyboardType local definition
    const insertAfter = 'await page.keyboard.press(\'Escape\').catch(() => { });\n}';
    if (content.includes(insertAfter)) {
        let insertion = '\n\n';
        if (extractCoreFn) {
            insertion += '// ── Local utility: extractCoreKeywords ──\n' + extractCoreFn + '\n\n';
        }
        insertion += '// ── Local utility: smartTypeWithAutoHighlight ──\n' + smartTypeFn;
        content = content.replace(insertAfter, insertAfter + insertion);
        fixes++;
        console.log('Added smartTypeWithAutoHighlight & extractCoreKeywords local copies');
    }
}

// ── Fix 2: Fix remaining inline dynamic import paths ──
// These are require() or import() calls within function bodies, not top-level imports
// ./image/tableImageGenerator.js → ../image/tableImageGenerator.js
content = content.replace(/['"]\.\/image\/tableImageGenerator\.js['"]/g, "'../image/tableImageGenerator.js'");
content = content.replace(/['"]\.\/image\/nanoBananaProGenerator\.js['"]/g, "'../image/nanoBananaProGenerator.js'");
content = content.replace(/['"]\.\/naverSearchApi\.js['"]/g, "'../naverSearchApi.js'");
content = content.replace(/['"]\.\/contentGenerator\.js['"]/g, "'../contentGenerator.js'");
fixes++;
console.log('Fixed inline import paths');

// ── Fix 3: Fix remaining implicit any types ──
// Parameter 'img' at L1086
// Parameter 's' at L1270
// Parameter 'c' at L1837 and L1968
const lines = content.split('\n');
for (let i = 0; i < lines.length; i++) {
    const l = lines[i];

    // .filter((img) => or .map((img) => without type
    if ((l.includes('(img)') || l.includes('.map(img =>') || l.includes('.filter(img =>')) && !l.includes('img:') && !l.includes('img :')) {
        lines[i] = l.replace(/\(img\)/g, '(img: any)').replace(/\bimg =>/g, '(img: any) =>');
        if (lines[i] !== l) { fixes++; console.log(`  L${i + 1}: Fixed img implicit any`); }
    }

    // .filter((s) => or .map((s) =>
    if ((l.includes('(s)') && (l.includes('.filter') || l.includes('.map'))) && !l.includes('s:') && !l.includes('s :')) {
        lines[i] = l.replace(/\(s\)/g, '(s: any)');
        if (lines[i] !== l) { fixes++; console.log(`  L${i + 1}: Fixed s implicit any`); }
    }

    // .split(...).filter(c => or .map(c =>
    if (l.includes('c =>') && !l.includes('c:') && (l.includes('.filter(') || l.includes('.map('))) {
        lines[i] = l.replace(/\bc =>/g, '(c: any) =>');
        if (lines[i] !== l) { fixes++; console.log(`  L${i + 1}: Fixed c implicit any`); }
    }
}

content = lines.join('\n');

fs.writeFileSync(helperPath, content, 'utf-8');
console.log(`\nTotal fixes: ${fixes}`);
console.log(`New line count: ${content.split('\n').length}`);
