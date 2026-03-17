/**
 * fix_image_v2.js
 * 
 * SAFE approach: Find each target class method using strict indentation-based matching.
 * Class methods in this file start at 2-space indent (within the class body).
 * Only match lines where the method definition is at the class level (indent = 2 spaces).
 * 
 * For each method found:
 *   1. Keep the JSDoc + signature line(s) up to and including the opening brace
 *   2. Replace body with single delegate call
 *   3. Close with properly-indented closing brace
 * 
 * Process bottom-up (highest line numbers first) to preserve line numbers.
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
const targets = [
    // name: method name to find
    // delegate: the delegate call line (will be indented 4 spaces for class method body)
    { name: 'insertImages', delegate: 'return await imageHelpers.insertImages(this, images, plans);' },
    { name: 'attachLinkToLastImage', delegate: 'return await imageHelpers.attachLinkToLastImage(this, url);' },
    { name: 'setImageSizeAndAttachLink', delegate: 'return await imageHelpers.setImageSizeAndAttachLink(this, affiliateLink);' },
    { name: 'insertImagesAtCurrentCursor', delegate: 'return await imageHelpers.insertImagesAtCurrentCursor(this, images, affiliateLink);' },
    { name: 'insertSingleImage', delegate: 'return await imageHelpers.insertSingleImage(this, image);' },
    { name: 'verifyImagePlacement', delegate: 'return await imageHelpers.verifyImagePlacement(this, images);' },
    { name: 'insertImagesAtHeadings', delegate: 'return await imageHelpers.insertImagesAtHeadings(this, placements);' },
    { name: 'setImageSizeToDocumentWidth', delegate: 'return await imageHelpers.setImageSizeToDocumentWidth(this);' },
    { name: 'insertImageViaBase64', delegate: 'return await imageHelpers.insertImageViaBase64(this, filePath, frame, page);' },
    { name: 'insertBase64ImageAtCursor', delegate: 'return await imageHelpers.insertBase64ImageAtCursor(this, filePath);' },
    { name: 'insertImageViaUploadButton', delegate: 'return await imageHelpers.insertImageViaUploadButton(this, filePath);' },
    { name: 'applyCaption', delegate: 'return await imageHelpers.applyCaption(this, caption);' },
    { name: 'generateAltWithSource', delegate: 'return imageHelpers.generateAltWithSource(this, image);' },
];

// ═══════════════════════════════════════════════════════
// Step 1: Find each method's EXACT range
// ═══════════════════════════════════════════════════════

/**
 * Find a class-level method by name.
 * Class methods are recognized by:
 *   - Being preceded by 0+ comment/JSDoc lines
 *   - Having `private|public|protected` optionally followed by `async`, then the method name
 *   - Being at roughly 2-space indent (within class body)
 * 
 * Returns { startLine, endLine, sigEndLine } or null
 *   startLine: first line of the method signature (0-indexed)
 *   endLine: last line of the method (closing brace, 0-indexed)
 *   sigEndLine: line where the opening `{` is (0-indexed)
 */
function findClassMethod(lines, methodName) {
    const results = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Must be a class method definition
        // Pattern: optional access modifier, optional async, method name, opening paren
        const isMethodDef = (
            (trimmed.startsWith('private ') || trimmed.startsWith('public ') || trimmed.startsWith('protected ')) &&
            trimmed.includes(methodName + '(')
        );

        if (!isMethodDef) continue;

        // It must NOT be a call like `imageHelpers.methodName(`
        if (trimmed.includes('imageHelpers.') || trimmed.includes('publishHelpers.') || trimmed.includes('editorHelpers.')) continue;

        // Verify the method name comes after private/public/protected and optional async
        const methodPattern = new RegExp(`(?:private|public|protected)\\s+(?:async\\s+)?${methodName}\\s*\\(`);
        if (!methodPattern.test(trimmed)) continue;

        // Check indent - should be at class level (2 spaces or similar)
        const indent = line.length - line.trimStart().length;
        if (indent > 4) continue; // Too deeply nested to be a class method

        // Find the opening brace (may be on same or next line)
        let sigEndLine = -1;
        let braceCount = 0;
        for (let j = i; j < Math.min(i + 10, lines.length); j++) {
            if (lines[j].includes('{')) {
                sigEndLine = j;
                break;
            }
        }

        if (sigEndLine < 0) continue;

        // Now count braces from the opening brace line to find the closing
        braceCount = 0;
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
            results.push({
                startLine: i,
                endLine,
                sigEndLine,
                bodySize: endLine - i + 1
            });
        }
    }

    // If multiple matches, return the one with the largest body (the actual implementation, not a thin wrapper)
    if (results.length === 0) return null;
    if (results.length === 1) return results[0];

    // Multiple found - prefer the one without an existing delegate and largest body
    let best = results[0];
    for (const r of results) {
        const bodyText = lines.slice(r.startLine, r.endLine + 1).join('\n');
        const hasDelegate = bodyText.includes('imageHelpers.');
        const bestBodyText = lines.slice(best.startLine, best.endLine + 1).join('\n');
        const bestHasDelegate = bestBodyText.includes('imageHelpers.');

        if (hasDelegate && !bestHasDelegate) continue; // Skip already-delegated
        if (!hasDelegate && bestHasDelegate) { best = r; continue; }
        if (r.bodySize > best.bodySize) best = r;
    }
    return best;
}

// Find all target methods
const methodRanges = [];
for (const t of targets) {
    const range = findClassMethod(lines, t.name);
    if (!range) {
        console.log(`⚠️ ${t.name}: NOT FOUND as class method`);
        continue;
    }

    // Check if already delegated
    const bodyText = lines.slice(range.startLine, range.endLine + 1).join('\n');
    if (bodyText.includes('imageHelpers.')) {
        console.log(`ℹ️ ${t.name}: Already delegated at L${range.startLine + 1} (skipping)`);
        continue;
    }

    methodRanges.push({
        ...t,
        ...range,
    });
    console.log(`✅ ${t.name}: L${range.startLine + 1} - L${range.endLine + 1} (${range.bodySize} lines, sig ends L${range.sigEndLine + 1})`);
}

// Sort by startLine DESCENDING for bottom-up replacement
methodRanges.sort((a, b) => b.startLine - a.startLine);

// ═══════════════════════════════════════════════════════
// Step 2: Replace each method body
// ═══════════════════════════════════════════════════════
console.log(`\n=== Replacing ${methodRanges.length} methods ===`);

for (const m of methodRanges) {
    // Keep lines from startLine to sigEndLine (inclusive) - the signature
    // Replace everything from sigEndLine+1 to endLine with delegate call + closing brace

    const sigLines = lines.slice(m.startLine, m.sigEndLine + 1);

    // Build replacement: signature + delegate + closing brace
    const replacement = [
        ...sigLines,
        `    ${m.delegate}`,
        `  }`
    ];

    // How many lines are we replacing?
    const oldCount = m.endLine - m.startLine + 1;

    // Replace in the lines array
    lines.splice(m.startLine, oldCount, ...replacement);

    console.log(`✅ ${m.name}: ${oldCount} lines → ${replacement.length} lines (saved ${oldCount - replacement.length})`);
}

// ═══════════════════════════════════════════════════════
// Step 3: Add imageHelpers import if missing
// ═══════════════════════════════════════════════════════
console.log('\n=== Checking import ===');
const hasImport = lines.some(l => l.includes('imageHelpers') && l.includes('import'));
if (!hasImport) {
    const editorIdx = lines.findIndex(l => l.includes("import * as editorHelpers"));
    if (editorIdx >= 0) {
        lines.splice(editorIdx + 1, 0, "import * as imageHelpers from './automation/imageHelpers';");
        console.log(`✅ Added imageHelpers import after L${editorIdx + 1}`);
    }
} else {
    console.log('ℹ️ imageHelpers import already exists');
}

// ═══════════════════════════════════════════════════════
// Step 4: Write result
// ═══════════════════════════════════════════════════════
const result = lines.join('\n');
fs.writeFileSync(mainPath, result, 'utf-8');
const newLineCount = result.split('\n').length;
console.log(`\n✅ Done! ${8961} lines → ${newLineCount} lines (removed ${8961 - newLineCount})`);
