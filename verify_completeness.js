/**
 * verify_completeness.js
 * 
 * Compares original method bodies from git HEAD with helper file implementations
 * to detect ANY missing/changed code during the refactoring migration.
 * 
 * Approach:
 * 1. Get the ORIGINAL naverBlogAutomation.ts from git (before refactoring)
 * 2. Extract each method body that was moved to helpers
 * 3. Extract the corresponding function body from the helper file
 * 4. Normalize and compare them line-by-line
 * 5. Report any differences
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Get original file from git
let originalContent;
try {
    originalContent = execSync('git show HEAD:src/naverBlogAutomation.ts', {
        encoding: 'utf-8',
        maxBuffer: 50 * 1024 * 1024,
        cwd: __dirname
    });
} catch (e) {
    // If HEAD doesn't have the original, try HEAD~1
    try {
        originalContent = execSync('git show HEAD~1:src/naverBlogAutomation.ts', {
            encoding: 'utf-8',
            maxBuffer: 50 * 1024 * 1024,
            cwd: __dirname
        });
    } catch (e2) {
        console.log('Cannot get original from git, using stash or other methods...');
        process.exit(1);
    }
}

originalContent = originalContent.replace(/\r\n/g, '\n');
const origLines = originalContent.split('\n');
console.log(`Original file from git: ${origLines.length} lines`);

// Load helper files
const imageHelpersContent = fs.readFileSync(path.join(__dirname, 'src/automation/imageHelpers.ts'), 'utf-8').replace(/\r\n/g, '\n');
const publishHelpersContent = fs.readFileSync(path.join(__dirname, 'src/automation/publishHelpers.ts'), 'utf-8').replace(/\r\n/g, '\n');
const editorHelpersContent = fs.readFileSync(path.join(__dirname, 'src/automation/editorHelpers.ts'), 'utf-8').replace(/\r\n/g, '\n');

const helperFiles = {
    imageHelpers: imageHelpersContent,
    publishHelpers: publishHelpersContent,
    editorHelpers: editorHelpersContent,
};

// All methods that were extracted
const methods = [
    // imageHelpers
    { name: 'insertImageViaUploadButton', helper: 'imageHelpers' },
    { name: 'insertBase64ImageAtCursor', helper: 'imageHelpers' },
    { name: 'insertImageViaBase64', helper: 'imageHelpers' },
    { name: 'setImageSizeToDocumentWidth', helper: 'imageHelpers' },
    { name: 'insertSingleImage', helper: 'imageHelpers' },
    { name: 'verifyImagePlacement', helper: 'imageHelpers' },
    { name: 'insertImagesAtCurrentCursor', helper: 'imageHelpers' },
    { name: 'setImageSizeAndAttachLink', helper: 'imageHelpers' },
    { name: 'attachLinkToLastImage', helper: 'imageHelpers' },
    { name: 'insertImages', helper: 'imageHelpers' },
    { name: 'generateAltWithSource', helper: 'imageHelpers' },
    { name: 'applyCaption', helper: 'imageHelpers' },
    { name: 'insertImagesAtHeadings', helper: 'imageHelpers' },

    // publishHelpers
    { name: 'selectCategoryInPublishModal', helper: 'publishHelpers' },
    { name: 'debugCategoryElements', helper: 'publishHelpers' },
    { name: 'setScheduleDateTime', helper: 'publishHelpers' },
    { name: 'debugPublishModal', helper: 'publishHelpers' },
    { name: 'publishScheduled', helper: 'publishHelpers' },
    { name: 'publishBlogPost', helper: 'publishHelpers' },

    // editorHelpers
    { name: 'insertQuotation', helper: 'editorHelpers' },
    { name: 'typeBodyWithRetry', helper: 'editorHelpers' },
    { name: 'applyStructuredContent', helper: 'editorHelpers' },
    { name: 'setFontSize', helper: 'editorHelpers' },
    { name: 'extractBodyForHeading', helper: 'editorHelpers' },
];

/**
 * Extract method body from class source (original file)
 * Returns the body lines (inside the braces), excluding the method signature
 */
function extractClassMethodBody(lines, methodName) {
    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();

        if (!(trimmed.startsWith('private ') || trimmed.startsWith('public ') || trimmed.startsWith('protected '))) continue;

        const methodPattern = new RegExp(`(?:private|public|protected)\\s+(?:async\\s+)?${methodName}\\s*[(<]`);
        if (!methodPattern.test(trimmed)) continue;

        // Skip if it's already a delegate
        if (trimmed.includes('imageHelpers.') || trimmed.includes('publishHelpers.') || trimmed.includes('editorHelpers.')) continue;

        // Find opening brace
        let sigEndLine = -1;
        let braceCount = 0;
        for (let j = i; j < Math.min(i + 15, lines.length); j++) {
            if (lines[j].includes('{')) {
                sigEndLine = j;
                break;
            }
        }
        if (sigEndLine < 0) continue;

        // Count braces to find end
        braceCount = 0;
        let startFound = false;
        let endLine = -1;

        for (let j = i; j < lines.length; j++) {
            for (const ch of lines[j]) {
                if (ch === '{') { braceCount++; startFound = true; }
                if (ch === '}') {
                    braceCount--;
                    if (startFound && braceCount === 0) { endLine = j; break; }
                }
            }
            if (endLine >= 0) break;
        }

        if (endLine >= 0) {
            // Return body lines (between opening brace line and closing brace)
            const bodyLines = lines.slice(sigEndLine + 1, endLine);
            return {
                startLine: i + 1,
                endLine: endLine + 1,
                lineCount: endLine - i + 1,
                bodyLines,
                signature: lines[i].trim(),
            };
        }
    }
    return null;
}

/**
 * Extract exported function body from helper file
 */
function extractHelperFunctionBody(content, funcName) {
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();

        if (!trimmed.startsWith('export')) continue;

        const funcPattern = new RegExp(`export\\s+(?:async\\s+)?function\\s+${funcName}\\s*\\(`);
        if (!funcPattern.test(trimmed)) continue;

        // Find opening brace
        let sigEndLine = -1;
        for (let j = i; j < Math.min(i + 15, lines.length); j++) {
            if (lines[j].includes('{')) {
                sigEndLine = j;
                break;
            }
        }
        if (sigEndLine < 0) continue;

        // Count braces to find end
        let braceCount = 0;
        let startFound = false;
        let endLine = -1;

        for (let j = i; j < lines.length; j++) {
            for (const ch of lines[j]) {
                if (ch === '{') { braceCount++; startFound = true; }
                if (ch === '}') {
                    braceCount--;
                    if (startFound && braceCount === 0) { endLine = j; break; }
                }
            }
            if (endLine >= 0) break;
        }

        if (endLine >= 0) {
            const bodyLines = lines.slice(sigEndLine + 1, endLine);
            return {
                startLine: i + 1,
                endLine: endLine + 1,
                lineCount: endLine - i + 1,
                bodyLines,
                signature: lines[i].trim().substring(0, 120),
            };
        }
    }
    return null;
}

/**
 * Normalize code for comparison:
 * - Remove leading/trailing whitespace from each line
 * - Replace this. with self. (expected transform)
 * - Remove empty lines
 * - Normalize string whitespace
 */
function normalizeForComparison(lines) {
    return lines
        .map(l => l.trim())
        .filter(l => l.length > 0)
        .map(l => l.replace(/this\./g, 'self.'))  // Expected: this. → self.
        .map(l => l.replace(/this,/g, 'self,'))   // this, → self, (in function calls)
        .map(l => l.replace(/\s+/g, ' '))         // Normalize whitespace
        .join('\n');
}

// ═══════════════════════════════════════════════════════
// Run comparison
// ═══════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════');
console.log('  CODE COMPLETENESS VERIFICATION');
console.log('═══════════════════════════════════════════════════\n');

const results = [];
let totalIssues = 0;
let totalChecked = 0;

for (const method of methods) {
    const original = extractClassMethodBody(origLines, method.name);
    const helper = extractHelperFunctionBody(helperFiles[method.helper], method.name);

    if (!original) {
        console.log(`⚠️ ${method.name}: Not found in original — may not have been a class method`);
        continue;
    }

    if (!helper) {
        console.log(`❌ ${method.name}: NOT FOUND in ${method.helper}! MISSING MIGRATION!`);
        totalIssues++;
        results.push({ name: method.name, status: 'MISSING', detail: `Not found in ${method.helper}` });
        continue;
    }

    totalChecked++;

    const origNorm = normalizeForComparison(original.bodyLines);
    const helperNorm = normalizeForComparison(helper.bodyLines);

    if (origNorm === helperNorm) {
        console.log(`✅ ${method.name}: MATCH (${original.lineCount} lines)`);
        results.push({ name: method.name, status: 'MATCH', lines: original.lineCount });
        continue;
    }

    // Find differences
    const origNormLines = origNorm.split('\n');
    const helperNormLines = helperNorm.split('\n');

    const lenDiff = Math.abs(origNormLines.length - helperNormLines.length);

    // Count matching lines
    let matchCount = 0;
    const minLen = Math.min(origNormLines.length, helperNormLines.length);
    for (let i = 0; i < minLen; i++) {
        if (origNormLines[i] === helperNormLines[i]) matchCount++;
    }

    const matchPct = ((matchCount / Math.max(origNormLines.length, helperNormLines.length)) * 100).toFixed(1);

    if (parseFloat(matchPct) >= 95) {
        console.log(`✅ ${method.name}: ~MATCH (${matchPct}% identical, orig ${origNormLines.length}L, helper ${helperNormLines.length}L)`);

        // Show differences
        if (lenDiff > 0 || parseFloat(matchPct) < 100) {
            let diffCount = 0;
            for (let i = 0; i < minLen && diffCount < 3; i++) {
                if (origNormLines[i] !== helperNormLines[i]) {
                    console.log(`   diff@${i}: orig: ${origNormLines[i].substring(0, 80)}`);
                    console.log(`           helper: ${helperNormLines[i].substring(0, 80)}`);
                    diffCount++;
                }
            }
        }
        results.push({ name: method.name, status: 'NEAR_MATCH', matchPct, origLines: origNormLines.length, helperLines: helperNormLines.length });
    } else {
        console.log(`⚠️ ${method.name}: DIVERGENT (${matchPct}% match, orig ${origNormLines.length}L, helper ${helperNormLines.length}L)`);

        // Show first 5 differences
        let diffCount = 0;
        for (let i = 0; i < minLen && diffCount < 5; i++) {
            if (origNormLines[i] !== helperNormLines[i]) {
                console.log(`   diff@${i}: orig:   ${origNormLines[i].substring(0, 80)}`);
                console.log(`             helper: ${helperNormLines[i].substring(0, 80)}`);
                diffCount++;
            }
        }

        if (origNormLines.length !== helperNormLines.length) {
            console.log(`   Line count: original=${origNormLines.length} vs helper=${helperNormLines.length} (diff=${lenDiff})`);
        }

        totalIssues++;
        results.push({ name: method.name, status: 'DIVERGENT', matchPct, origLines: origNormLines.length, helperLines: helperNormLines.length });
    }
}

// ═══════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════════════════');
console.log('  SUMMARY');
console.log('═══════════════════════════════════════════════════');

const matches = results.filter(r => r.status === 'MATCH').length;
const nearMatches = results.filter(r => r.status === 'NEAR_MATCH').length;
const divergent = results.filter(r => r.status === 'DIVERGENT').length;
const missing = results.filter(r => r.status === 'MISSING').length;

console.log(`Total checked: ${totalChecked}`);
console.log(`✅ Exact match: ${matches}`);
console.log(`✅ Near match (>95%): ${nearMatches}`);
console.log(`⚠️ Divergent: ${divergent}`);
console.log(`❌ Missing: ${missing}`);

if (totalIssues === 0) {
    console.log('\n🎉 ALL METHODS VERIFIED — NO MISSING CODE!');
} else {
    console.log(`\n⚠️ ${totalIssues} ISSUES NEED REVIEW`);
}

// Save detailed report
const report = {
    date: new Date().toISOString(),
    originalLines: origLines.length,
    totalChecked,
    matches,
    nearMatches,
    divergent,
    missing,
    details: results
};
fs.writeFileSync('completeness_report.json', JSON.stringify(report, null, 2), 'utf-8');
console.log('\nDetailed report saved to completeness_report.json');
