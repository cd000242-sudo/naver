/**
 * fix_image_delegates.js
 * 
 * 11개 imageHelpers remnant 메서드를 delegate 호출로 교체하고
 * import 구문을 추가하는 스크립트
 * 
 * 접근: 각 메서드의 시작줄(signature)과 끝줄(closing brace)을 찾아
 * 전체 본문을 delegate 호출로 교체
 */
const fs = require('fs');
const path = require('path');

const mainPath = path.join(__dirname, 'src', 'naverBlogAutomation.ts');
let content = fs.readFileSync(mainPath, 'utf-8');
// Normalize line endings
content = content.replace(/\r\n/g, '\n');
let lines = content.split('\n');

console.log(`Original: ${lines.length} lines`);

// ═══════════════════════════════════════════════════════
// STEP 1: Add imageHelpers import
// ═══════════════════════════════════════════════════════
console.log('\n=== STEP 1: Add imageHelpers import ===');

// Check if already imported
const hasImageImport = lines.some(l => l.includes('imageHelpers') && l.includes('import'));
if (!hasImageImport) {
    // Find the line with editorHelpers import and add after it
    const editorImportIdx = lines.findIndex(l => l.includes("import * as editorHelpers"));
    if (editorImportIdx >= 0) {
        lines.splice(editorImportIdx + 1, 0, "import * as imageHelpers from './automation/imageHelpers';");
        console.log(`✅ Added imageHelpers import after L${editorImportIdx + 1}`);
    } else {
        // Fallback: add after publishHelpers
        const pubImportIdx = lines.findIndex(l => l.includes("import * as publishHelpers"));
        if (pubImportIdx >= 0) {
            lines.splice(pubImportIdx + 1, 0, "import * as imageHelpers from './automation/imageHelpers';");
            console.log(`✅ Added imageHelpers import after L${pubImportIdx + 1}`);
        }
    }
} else {
    console.log('ℹ️ imageHelpers import already exists');
}

// ═══════════════════════════════════════════════════════
// STEP 2: Replace each remnant method with delegate
// ═══════════════════════════════════════════════════════
console.log('\n=== STEP 2: Replace remnant methods ===');

/**
 * Find a class method by name and replace its body with a delegate call.
 * Works bottom-up to preserve line numbers.
 */
function findMethodRange(lines, methodName) {
    // We may find multiple matches, collect all
    const results = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Match class method definitions: private/public/protected async methodName(
        const patterns = [
            new RegExp(`^\\s*(?:private|public|protected)\\s+async\\s+${methodName}\\s*\\(`),
            new RegExp(`^\\s*async\\s+${methodName}\\s*\\(`),
            new RegExp(`^\\s*(?:private|public|protected)\\s+${methodName}\\s*\\(`)
        ];

        let matched = false;
        for (const p of patterns) {
            if (p.test(line)) {
                matched = true;
                break;
            }
        }

        if (!matched) continue;

        // Avoid matching delegate calls like imageHelpers.methodName(
        if (line.includes('imageHelpers.') || line.includes('publishHelpers.') || line.includes('editorHelpers.')) continue;

        // Find opening brace
        let braceCount = 0;
        let startFound = false;
        let endLine = -1;
        let openingBraceLine = -1;

        for (let j = i; j < lines.length; j++) {
            for (const ch of lines[j]) {
                if (ch === '{') {
                    if (!startFound) openingBraceLine = j;
                    braceCount++;
                    startFound = true;
                }
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
            results.push({ startLine: i, endLine: endLine, openingBraceLine });
        }
    }
    return results;
}

// Define the replacements - method name, delegate call, and whether to look for specific occurrence
const replacements = [
    // Process from largest line number to smallest (bottom-up) to preserve line numbers
    {
        name: 'insertImages',
        delegate: '    return await imageHelpers.insertImages(this, images, plans);',
        // Specific: private async insertImages(images: any[], plans?: any[])
    },
    {
        name: 'attachLinkToLastImage',
        delegate: '    return await imageHelpers.attachLinkToLastImage(this, url);',
        // Multiple occurrences possible, match the one that's a class method (private)
    },
    {
        name: 'setImageSizeAndAttachLink',
        delegate: '    return await imageHelpers.setImageSizeAndAttachLink(this, affiliateLink);',
    },
    {
        name: 'insertImagesAtCurrentCursor',
        delegate: '    return await imageHelpers.insertImagesAtCurrentCursor(this, images, affiliateLink);',
    },
    {
        name: 'insertSingleImage',
        delegate: '    return await imageHelpers.insertSingleImage(this, image);',
    },
    {
        name: 'insertImageViaBase64',
        delegate: '    return await imageHelpers.insertImageViaBase64(this, filePath, frame, page);',
    },
    {
        name: 'insertBase64ImageAtCursor',
        delegate: '    return await imageHelpers.insertBase64ImageAtCursor(this, filePath);',
    },
    {
        name: 'insertImageViaUploadButton',
        delegate: '    return await imageHelpers.insertImageViaUploadButton(this, filePath);',
    },
    {
        name: 'verifyImagePlacement',
        delegate: '    return await imageHelpers.verifyImagePlacement(this, expectedCount);',
    },
    {
        name: 'setImageSizeToDocumentWidth',
        delegate: '    return await imageHelpers.setImageSizeToDocumentWidth(this);',
    },
    {
        name: 'applyCaption',
        delegate: '    return await imageHelpers.applyCaption(this, caption);',
    },
    {
        name: 'generateAltWithSource',
        delegate: '    return imageHelpers.generateAltWithSource(this, image);',
    },
    {
        name: 'insertImagesAtHeadings',
        delegate: '    return await imageHelpers.insertImagesAtHeadings(this, placements);',
    },
];

// First, find all methods and their ranges
const methodRanges = [];
for (const r of replacements) {
    const ranges = findMethodRange(lines, r.name);
    if (ranges.length === 0) {
        console.log(`⚠️ ${r.name}: NOT FOUND as class method`);
        continue;
    }

    // For methods with multiple matches, pick the one with the largest body (likely the real one, not a thin existing delegate)
    let bestRange = ranges[0];
    if (ranges.length > 1) {
        // Pick the version with the biggest body that doesn't already have a delegate call
        for (const range of ranges) {
            const bodySize = range.endLine - range.startLine + 1;
            const bodyText = lines.slice(range.startLine, range.endLine + 1).join('\n');
            const hasDelegate = bodyText.includes('imageHelpers.');

            if (!hasDelegate && bodySize > (bestRange.endLine - bestRange.startLine + 1)) {
                bestRange = range;
            }
        }
        console.log(`ℹ️ ${r.name}: ${ranges.length} occurrences found, using L${bestRange.startLine + 1}-L${bestRange.endLine + 1} (${bestRange.endLine - bestRange.startLine + 1} lines)`);
    }

    // Check if already delegated
    const bodyText = lines.slice(bestRange.startLine, bestRange.endLine + 1).join('\n');
    if (bodyText.includes('imageHelpers.')) {
        console.log(`ℹ️ ${r.name}: Already delegated (skipping)`);
        continue;
    }

    methodRanges.push({
        ...r,
        startLine: bestRange.startLine,
        endLine: bestRange.endLine,
        openingBraceLine: bestRange.openingBraceLine,
        bodySize: bestRange.endLine - bestRange.startLine + 1
    });
}

// Sort by startLine descending (bottom-up replacement)
methodRanges.sort((a, b) => b.startLine - a.startLine);

console.log(`\nMethods to replace (${methodRanges.length}):`);
methodRanges.forEach(m => {
    console.log(`  ${m.name}: L${m.startLine + 1}-L${m.endLine + 1} (${m.bodySize} lines)`);
});

// ═══════════════════════════════════════════════════════
// STEP 3: Execute replacements (bottom-up)
// ═══════════════════════════════════════════════════════
console.log('\n=== STEP 3: Execute replacements ===');

for (const m of methodRanges) {
    // Keep the method signature (from startLine to openingBraceLine, inclusive of opening brace)
    // Replace body with delegate call

    // Get the signature part
    const sigLines = [];
    for (let i = m.startLine; i <= m.openingBraceLine; i++) {
        sigLines.push(lines[i]);
    }

    // Build the replacement
    const replacement = [
        ...sigLines,
        m.delegate,
        '  }'
    ];

    // Also include any JSDoc comment above the method
    let commentStart = m.startLine;
    for (let i = m.startLine - 1; i >= 0; i--) {
        const trimmed = lines[i].trim();
        if (trimmed.startsWith('*') || trimmed.startsWith('/**') || trimmed === '*/') {
            commentStart = i;
        } else if (trimmed === '') {
            // Keep blank line before comment
            commentStart = i;
            break;
        } else {
            break;
        }
    }

    // Replace from startLine to endLine with the delegate version
    const linesBefore = m.endLine - m.startLine + 1;
    lines.splice(m.startLine, linesBefore, ...replacement);

    console.log(`✅ ${m.name}: L${m.startLine + 1} — ${linesBefore} lines → ${replacement.length} lines (saved ${linesBefore - replacement.length})`);
}

// ═══════════════════════════════════════════════════════
// STEP 4: Fix parameter name mismatches
// ═══════════════════════════════════════════════════════
console.log('\n=== STEP 4: Fix parameter mismatches ===');

// Fix insertImagesAtCurrentCursor - main has (images, page, frame, affiliateLink) but helper has (self, images, linkUrl)
// The delegate should pass only the params that the helper expects
// Let's check the actual signatures after replacement
let joined = lines.join('\n');

// Check if there are any parameter name issues in delegate calls
// insertImagesAtCurrentCursor: main passes (images, page, frame, affiliateLink) but helper only takes (self, images, linkUrl)
// We need to check the actual imageHelpers function to see what params it expects

// Read imageHelpers to verify
const imageContent = fs.readFileSync(path.join(__dirname, 'src', 'automation', 'imageHelpers.ts'), 'utf-8');
const imageLines2 = imageContent.split('\n');

// Find insertImagesAtCurrentCursor params in helper
for (let i = 0; i < imageLines2.length; i++) {
    if (imageLines2[i].includes('export') && imageLines2[i].includes('insertImagesAtCurrentCursor')) {
        let sig = '';
        let pc = 0;
        let started = false;
        for (let j = i; j < i + 10; j++) {
            for (const ch of imageLines2[j]) {
                if (ch === '(') { pc++; started = true; }
                if (ch === ')') { pc--; if (started && pc === 0) break; }
            }
            sig += imageLines2[j] + ' ';
            if (started && pc === 0) break;
        }
        console.log(`  imageHelpers.insertImagesAtCurrentCursor signature: ${sig.trim().substring(0, 150)}`);
        break;
    }
}

// Find setImageSizeAndAttachLink params in helper
for (let i = 0; i < imageLines2.length; i++) {
    if (imageLines2[i].includes('export') && imageLines2[i].includes('setImageSizeAndAttachLink')) {
        let sig = '';
        let pc = 0;
        let started = false;
        for (let j = i; j < i + 10; j++) {
            for (const ch of imageLines2[j]) {
                if (ch === '(') { pc++; started = true; }
                if (ch === ')') { pc--; if (started && pc === 0) break; }
            }
            sig += imageLines2[j] + ' ';
            if (started && pc === 0) break;
        }
        console.log(`  imageHelpers.setImageSizeAndAttachLink signature: ${sig.trim().substring(0, 150)}`);
        break;
    }
}

// Find attachLinkToLastImage params
for (let i = 0; i < imageLines2.length; i++) {
    if (imageLines2[i].includes('export') && imageLines2[i].includes('attachLinkToLastImage')) {
        let sig = '';
        let pc = 0;
        let started = false;
        for (let j = i; j < i + 10; j++) {
            for (const ch of imageLines2[j]) {
                if (ch === '(') { pc++; started = true; }
                if (ch === ')') { pc--; if (started && pc === 0) break; }
            }
            sig += imageLines2[j] + ' ';
            if (started && pc === 0) break;
        }
        console.log(`  imageHelpers.attachLinkToLastImage signature: ${sig.trim().substring(0, 150)}`);
        break;
    }
}

// Find verifyImagePlacement params
for (let i = 0; i < imageLines2.length; i++) {
    if (imageLines2[i].includes('export') && imageLines2[i].includes('verifyImagePlacement')) {
        let sig = '';
        let pc = 0;
        let started = false;
        for (let j = i; j < i + 10; j++) {
            for (const ch of imageLines2[j]) {
                if (ch === '(') { pc++; started = true; }
                if (ch === ')') { pc--; if (started && pc === 0) break; }
            }
            sig += imageLines2[j] + ' ';
            if (started && pc === 0) break;
        }
        console.log(`  imageHelpers.verifyImagePlacement signature: ${sig.trim().substring(0, 150)}`);
        break;
    }
}

// ═══════════════════════════════════════════════════════
// STEP 5: Write result
// ═══════════════════════════════════════════════════════
const finalContent = lines.join('\n');
fs.writeFileSync(mainPath, finalContent, 'utf-8');

const newLines = finalContent.split('\n');
console.log(`\n✅ Done! ${8961} lines → ${newLines.length} lines (removed ${8961 - newLines.length} lines)`);
