/**
 * fix_pub_ed.js — Replace publishHelpers & editorHelpers remnant method bodies with delegate calls
 * Uses same brace-counting approach as fix_image_v2.js
 */
const fs = require('fs');
const path = require('path');

const mainPath = path.join(__dirname, 'src', 'naverBlogAutomation.ts');
let content = fs.readFileSync(mainPath, 'utf-8');
content = content.replace(/\r\n/g, '\n');
let lines = content.split('\n');

console.log(`Original: ${lines.length} lines`);

// ═══════════════════════════════════════════════════════
// Target methods and their delegate calls
// ═══════════════════════════════════════════════════════

// publishHelpers methods:
// selectCategoryInPublishModal(self, frame, page) — original sig: (frame: Frame, page: Page)
// debugCategoryElements(self, frame, page) — original sig: (frame: Frame, page: Page)
// setScheduleDateTime(self, frame, scheduleDate) — original sig: (frame: Frame, scheduleDate: string)
// debugPublishModal(self) — original sig: ()
// publishScheduled(self, scheduleDate) — original sig: (scheduleDate: string)
// publishBlogPost — NOT in remnant list (may already be delegated or not exist as class method)

// editorHelpers methods:
// insertQuotation(self, frame, page, style) — original sig: (frame: Frame, page: Page, style: string)
// typeBodyWithRetry(self, ...) — original sig: needs check
// applyStructuredContent(self, resolved) — original sig: (resolved: ResolvedRunOptions)
// setFontSize(self, size, force) — original sig: (size: number, force?: boolean)
// extractBodyForHeading — NOT in remnant list

const targets = [
    // publishHelpers
    { name: 'selectCategoryInPublishModal', module: 'publishHelpers', delegate: 'return await publishHelpers.selectCategoryInPublishModal(this, frame, page);' },
    { name: 'debugCategoryElements', module: 'publishHelpers', delegate: 'return await publishHelpers.debugCategoryElements(this, frame, page);' },
    { name: 'setScheduleDateTime', module: 'publishHelpers', delegate: 'return await publishHelpers.setScheduleDateTime(this, frame, scheduleDate);' },
    { name: 'debugPublishModal', module: 'publishHelpers', delegate: 'return await publishHelpers.debugPublishModal(this);' },
    { name: 'publishScheduled', module: 'publishHelpers', delegate: 'return await publishHelpers.publishScheduled(this, scheduleDate);' },

    // editorHelpers
    { name: 'insertQuotation', module: 'editorHelpers', delegate: "return await editorHelpers.insertQuotation(this, frame, page, style);" },
    { name: 'applyStructuredContent', module: 'editorHelpers', delegate: 'return await editorHelpers.applyStructuredContent(this, resolved);' },
    { name: 'setFontSize', module: 'editorHelpers', delegate: 'return await editorHelpers.setFontSize(this, size, force);' },
];

// typeBodyWithRetry needs special handling — check its original signature first
// We'll add it after verifying

// ═══════════════════════════════════════════════════════
// Find class methods (same logic as fix_image_v2.js)
// ═══════════════════════════════════════════════════════

function findClassMethod(lines, methodName) {
    const results = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        const isMethodDef = (
            (trimmed.startsWith('private ') || trimmed.startsWith('public ') || trimmed.startsWith('protected ')) &&
            trimmed.includes(methodName + '(')
        );

        if (!isMethodDef) continue;
        if (trimmed.includes('imageHelpers.') || trimmed.includes('publishHelpers.') || trimmed.includes('editorHelpers.')) continue;

        const methodPattern = new RegExp(`(?:private|public|protected)\\s+(?:async\\s+)?${methodName}\\s*\\(`);
        if (!methodPattern.test(trimmed)) continue;

        const indent = line.length - line.trimStart().length;
        if (indent > 4) continue;

        let sigEndLine = -1;
        for (let j = i; j < Math.min(i + 10, lines.length); j++) {
            if (lines[j].includes('{')) {
                sigEndLine = j;
                break;
            }
        }

        if (sigEndLine < 0) continue;

        let braceCount = 0;
        let startFound = false;
        let endLine = -1;

        for (let j = i; j < lines.length; j++) {
            for (const ch of lines[j]) {
                if (ch === '{') { braceCount++; startFound = true; }
                if (ch === '}') {
                    braceCount--;
                    if (startFound && braceCount === 0) {
                        endLine = j;
                        break;
                    }
                }
            }
            if (endLine >= 0) break;
        }

        if (endLine >= 0) {
            results.push({ startLine: i, endLine, sigEndLine, bodySize: endLine - i + 1 });
        }
    }

    if (results.length === 0) return null;
    if (results.length === 1) return results[0];

    let best = results[0];
    for (const r of results) {
        const bodyText = lines.slice(r.startLine, r.endLine + 1).join('\n');
        const hasDelegate = bodyText.includes('Helpers.');
        const bestBodyText = lines.slice(best.startLine, best.endLine + 1).join('\n');
        const bestHasDelegate = bestBodyText.includes('Helpers.');

        if (hasDelegate && !bestHasDelegate) continue;
        if (!hasDelegate && bestHasDelegate) { best = r; continue; }
        if (r.bodySize > best.bodySize) best = r;
    }
    return best;
}

// First, find typeBodyWithRetry's original signature to construct proper delegate
const tbrRange = findClassMethod(lines, 'typeBodyWithRetry');
if (tbrRange) {
    const sigLine = lines[tbrRange.startLine].trim();
    console.log(`typeBodyWithRetry original sig: ${sigLine.substring(0, 120)}`);
    // Now check what params the original has
}

// Find all target methods
const methodRanges = [];
for (const t of targets) {
    const range = findClassMethod(lines, t.name);
    if (!range) {
        console.log(`⚠️ ${t.name}: NOT FOUND`);
        continue;
    }

    const bodyText = lines.slice(range.startLine, range.endLine + 1).join('\n');
    if (bodyText.includes('publishHelpers.') || bodyText.includes('editorHelpers.')) {
        console.log(`ℹ️ ${t.name}: Already delegated (skipping)`);
        continue;
    }

    // Print original sig for verification 
    console.log(`✅ ${t.name}: L${range.startLine + 1} - L${range.endLine + 1} (${range.bodySize} lines)`);
    console.log(`   sig: ${lines[range.startLine].trim().substring(0, 100)}`);

    methodRanges.push({ ...t, ...range });
}

// Handle typeBodyWithRetry separately — need to check exact parameter names
if (tbrRange) {
    const sigLine = lines[tbrRange.startLine].trim();
    const bodyText = lines.slice(tbrRange.startLine, tbrRange.endLine + 1).join('\n');
    if (!bodyText.includes('editorHelpers.')) {
        // editorHelpers.typeBodyWithRetry(self, ...) - need to determine params passed from original sig
        // Original should have parameters matching what editorHelpers expects
        // Let's read the original param names from the signature
        const sigBlock = lines.slice(tbrRange.startLine, tbrRange.sigEndLine + 1).join(' ').trim();
        console.log(`\ntypeBodyWithRetry full sig: ${sigBlock.substring(0, 200)}`);

        // The editorHelpers version: typeBodyWithRetry(self, ...)
        // We need to pass all original params + this as self
        // Based on the typical sig: private async typeBodyWithRetry(body, headingTitle, headingIndex, totalHeadings, ...)
        // We'll construct a generic delegate that matches

        methodRanges.push({
            name: 'typeBodyWithRetry',
            module: 'editorHelpers',
            delegate: null, // Will construct below
            ...tbrRange,
            needsCustomDelegate: true,
        });
        console.log(`✅ typeBodyWithRetry: L${tbrRange.startLine + 1} - L${tbrRange.endLine + 1} (${tbrRange.bodySize} lines)`);
    } else {
        console.log(`ℹ️ typeBodyWithRetry: Already delegated (skipping)`);
    }
}

// Sort descending by startLine
methodRanges.sort((a, b) => b.startLine - a.startLine);

// ═══════════════════════════════════════════════════════
// Build delegates
// ═══════════════════════════════════════════════════════

// For typeBodyWithRetry, extract param names from original signature and build delegate
for (const m of methodRanges) {
    if (m.needsCustomDelegate) {
        const sigBlock = lines.slice(m.startLine, m.sigEndLine + 1).join(' ');
        // Extract param names from between ( and )
        const paramMatch = sigBlock.match(/typeBodyWithRetry\s*\(([^{]*)\)/);
        if (paramMatch) {
            const params = paramMatch[1].split(',').map(p => p.trim().split(/[\s:?]/)[0]).filter(Boolean);
            console.log(`  Extracted params: ${params.join(', ')}`);
            m.delegate = `return await editorHelpers.typeBodyWithRetry(this, ${params.join(', ')});`;
        } else {
            // Fallback: read the editorHelpers signature to determine expected args
            // editorHelpers.typeBodyWithRetry(self: any, ...)
            const ehContent = fs.readFileSync(path.join(__dirname, 'src', 'automation', 'editorHelpers.ts'), 'utf-8');
            const ehLines = ehContent.split('\n');
            let ehSig = '';
            for (let i = 0; i < ehLines.length; i++) {
                if (ehLines[i].includes('export') && ehLines[i].includes('typeBodyWithRetry')) {
                    // Grab full sig
                    let j = i;
                    while (j < ehLines.length && !ehLines[j].includes('{')) j++;
                    ehSig = ehLines.slice(i, j + 1).join(' ');
                    break;
                }
            }
            console.log(`  editorHelpers sig: ${ehSig.substring(0, 200)}`);

            // Extract params after self
            const ehParamMatch = ehSig.match(/typeBodyWithRetry\s*\(self:\s*any\s*,\s*([^{]*)\)/);
            if (ehParamMatch) {
                const ehParams = ehParamMatch[1].split(',').map(p => p.trim().split(/[\s:?]/)[0]).filter(Boolean);
                console.log(`  Expected params: ${ehParams.join(', ')}`);
                m.delegate = `return await editorHelpers.typeBodyWithRetry(this, ${ehParams.join(', ')});`;
            } else {
                console.log('  ❌ Could not extract params for typeBodyWithRetry');
                m.delegate = null;
            }
        }
    }
}

// ═══════════════════════════════════════════════════════
// Replace methods
// ═══════════════════════════════════════════════════════
console.log(`\n=== Replacing ${methodRanges.length} methods ===`);

for (const m of methodRanges) {
    if (!m.delegate) {
        console.log(`⚠️ ${m.name}: Skipped (no delegate constructed)`);
        continue;
    }

    const sigLines = lines.slice(m.startLine, m.sigEndLine + 1);
    const replacement = [...sigLines, `    ${m.delegate}`, `  }`];
    const oldCount = m.endLine - m.startLine + 1;

    lines.splice(m.startLine, oldCount, ...replacement);
    console.log(`✅ ${m.name}: ${oldCount} lines → ${replacement.length} lines (saved ${oldCount - replacement.length})`);
}

// ═══════════════════════════════════════════════════════
// Add imports if missing
// ═══════════════════════════════════════════════════════
console.log('\n=== Checking imports ===');

const needsPublishHelpers = methodRanges.some(m => m.module === 'publishHelpers');
const needsEditorHelpers = methodRanges.some(m => m.module === 'editorHelpers');

const hasPublishImport = lines.some(l => l.includes('publishHelpers') && l.includes('import'));
const hasEditorImport = lines.some(l => l.includes('editorHelpers') && l.includes('import'));

// Find imageHelpers import line to add after it
const imageHelpersIdx = lines.findIndex(l => l.includes("import * as imageHelpers"));

if (needsPublishHelpers && !hasPublishImport && imageHelpersIdx >= 0) {
    lines.splice(imageHelpersIdx + 1, 0, "import * as publishHelpers from './automation/publishHelpers';");
    console.log(`✅ Added publishHelpers import`);
}

const imageHelpersIdx2 = lines.findIndex(l => l.includes("import * as imageHelpers"));
if (needsEditorHelpers && !hasEditorImport && imageHelpersIdx2 >= 0) {
    const publishIdx = lines.findIndex(l => l.includes("import * as publishHelpers"));
    const insertAfter = publishIdx >= 0 ? publishIdx : imageHelpersIdx2;
    lines.splice(insertAfter + 1, 0, "import * as editorHelpers from './automation/editorHelpers';");
    console.log(`✅ Added editorHelpers import`);
}

// ═══════════════════════════════════════════════════════
// Write result
// ═══════════════════════════════════════════════════════
const result = lines.join('\n');
fs.writeFileSync(mainPath, result, 'utf-8');
const newLineCount = result.split('\n').length;
console.log(`\n✅ Done! ${lines.length} → ${newLineCount} lines`);
