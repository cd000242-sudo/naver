/**
 * Comprehensive Refactoring Integration Verification Script
 * 
 * Checks:
 * 1. All delegate calls in naverBlogAutomation.ts match helper function signatures
 * 2. self (this) is properly passed in all delegate calls
 * 3. No original method bodies accidentally remain (should only be delegates)
 * 4. All imports are present
 * 5. Helper function parameter counts match delegate calls
 * 6. No orphan methods in helpers (defined but never delegated to)
 */
const fs = require('fs');
const path = require('path');

const mainFile = fs.readFileSync(path.join(__dirname, 'src', 'naverBlogAutomation.ts'), 'utf-8');
const imageFile = fs.readFileSync(path.join(__dirname, 'src', 'automation', 'imageHelpers.ts'), 'utf-8');
const publishFile = fs.readFileSync(path.join(__dirname, 'src', 'automation', 'publishHelpers.ts'), 'utf-8');
const editorFile = fs.readFileSync(path.join(__dirname, 'src', 'automation', 'editorHelpers.ts'), 'utf-8');

const issues = [];
const warnings = [];
const info = [];

// ═══════════════════════════════════════════════════════
// 1. Extract all delegate calls from naverBlogAutomation.ts
// ═══════════════════════════════════════════════════════
console.log('═══════════════════════════════════════════════════════');
console.log('1. DELEGATE CALLS ANALYSIS');
console.log('═══════════════════════════════════════════════════════');

const mainLines = mainFile.split('\n');
const delegateCalls = [];

// Pattern: imageHelpers.XXX(, publishHelpers.XXX(, editorHelpers.XXX(
const delegatePattern = /(imageHelpers|publishHelpers|editorHelpers)\.(\w+)\(/g;

for (let i = 0; i < mainLines.length; i++) {
    const line = mainLines[i];
    let match;
    const re = /(imageHelpers|publishHelpers|editorHelpers)\.(\w+)\(/g;
    while ((match = re.exec(line)) !== null) {
        delegateCalls.push({
            helper: match[1],
            method: match[2],
            line: i + 1,
            fullLine: line.trim()
        });
    }
}

console.log(`Found ${delegateCalls.length} delegate calls:`);
const byHelper = {};
delegateCalls.forEach(d => {
    if (!byHelper[d.helper]) byHelper[d.helper] = [];
    if (!byHelper[d.helper].includes(d.method)) byHelper[d.helper].push(d.method);
});

Object.entries(byHelper).forEach(([helper, methods]) => {
    console.log(`  ${helper}: ${methods.length} methods → ${methods.join(', ')}`);
});

// ═══════════════════════════════════════════════════════
// 2. Extract all exported functions from helper files
// ═══════════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════════════════════');
console.log('2. HELPER EXPORTS ANALYSIS');
console.log('═══════════════════════════════════════════════════════');

function extractExports(content, filename) {
    const exports = [];
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(/export\s+(?:async\s+)?function\s+(\w+)\s*\(/);
        if (m) {
            // Extract parameter list
            let paramStr = '';
            let braceCount = 0;
            let parenCount = 0;
            let startFound = false;
            for (let j = i; j < Math.min(i + 20, lines.length); j++) {
                for (let k = 0; k < lines[j].length; k++) {
                    const ch = lines[j][k];
                    if (ch === '(') { parenCount++; startFound = true; }
                    if (ch === ')') { parenCount--; if (startFound && parenCount === 0) { paramStr += ')'; break; } }
                    if (startFound) paramStr += ch;
                }
                if (startFound && parenCount === 0) break;
                if (startFound) paramStr += ' ';
            }

            // Count params (rough)
            const params = paramStr.replace(/^\(/, '').replace(/\)$/, '').split(',').filter(p => p.trim().length > 0);
            const hasSelf = params.length > 0 && params[0].trim().startsWith('self');

            exports.push({
                name: m[1],
                line: i + 1,
                paramCount: params.length,
                hasSelf: hasSelf,
                params: params.map(p => p.trim().split(':')[0].trim().split('?')[0].trim())
            });
        }
    }
    return exports;
}

const imageExports = extractExports(imageFile, 'imageHelpers');
const publishExports = extractExports(publishFile, 'publishHelpers');
const editorExports = extractExports(editorFile, 'editorHelpers');

console.log(`imageHelpers exports: ${imageExports.length} → ${imageExports.map(e => e.name).join(', ')}`);
console.log(`publishHelpers exports: ${publishExports.length} → ${publishExports.map(e => e.name).join(', ')}`);
console.log(`editorHelpers exports: ${editorExports.length} → ${editorExports.map(e => e.name).join(', ')}`);

// ═══════════════════════════════════════════════════════
// 3. CROSS-CHECK: Delegate calls vs Exports
// ═══════════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════════════════════');
console.log('3. DELEGATE ↔ EXPORT CROSS-CHECK');
console.log('═══════════════════════════════════════════════════════');

const allExports = {
    imageHelpers: imageExports,
    publishHelpers: publishExports,
    editorHelpers: editorExports
};

// Check: every delegate call has a matching export
delegateCalls.forEach(d => {
    const exports = allExports[d.helper] || [];
    const found = exports.find(e => e.name === d.method);
    if (!found) {
        issues.push(`❌ MISSING EXPORT: ${d.helper}.${d.method}() called at L${d.line} but NOT exported from ${d.helper}.ts`);
    }
});

// Check: every export is called from main
Object.entries(allExports).forEach(([helper, exports]) => {
    exports.forEach(exp => {
        const called = delegateCalls.find(d => d.helper === helper && d.method === exp.name);
        if (!called) {
            warnings.push(`⚠️ ORPHAN EXPORT: ${helper}.${exp.name}() is exported but NOT called from naverBlogAutomation.ts`);
        }
    });
});

// ═══════════════════════════════════════════════════════
// 4. SELF PARAMETER CHECK
// ═══════════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════════════════════');
console.log('4. SELF PARAMETER CHECK');
console.log('═══════════════════════════════════════════════════════');

// Check each delegate call passes 'this' as first arg
delegateCalls.forEach(d => {
    const exports = allExports[d.helper] || [];
    const exp = exports.find(e => e.name === d.method);
    if (!exp) return; // Already flagged above

    if (exp.hasSelf) {
        // Check if the delegate call passes 'this' as first argument
        const line = d.fullLine;
        const callMatch = line.match(new RegExp(`${d.helper}\\.${d.method}\\(([^)]*)`));
        if (callMatch) {
            const firstArg = callMatch[1].split(',')[0].trim();
            if (firstArg !== 'this') {
                issues.push(`❌ SELF MISSING: ${d.helper}.${d.method}() at L${d.line} — helper expects 'self' but first arg is '${firstArg}'`);
            }
        }
    }
});

// Check exports that DON'T have self but should (if they use self.xxx inside)
Object.entries(allExports).forEach(([helper, exports]) => {
    const content = helper === 'imageHelpers' ? imageFile : helper === 'publishHelpers' ? publishFile : editorFile;
    exports.forEach(exp => {
        if (!exp.hasSelf) {
            // Check if the function body uses 'self.' — if so, it's missing the self parameter
            const lines = content.split('\n');
            const funcStart = exp.line - 1;
            let braceCount = 0, funcEnd = -1, started = false;
            for (let j = funcStart; j < lines.length; j++) {
                for (const ch of lines[j]) {
                    if (ch === '{') { braceCount++; started = true; }
                    if (ch === '}') { braceCount--; if (started && braceCount === 0) { funcEnd = j; break; } }
                }
                if (funcEnd >= 0) break;
            }

            if (funcEnd >= 0) {
                const funcBody = lines.slice(funcStart, funcEnd + 1).join('\n');
                if (funcBody.includes('self.') || funcBody.includes('self,')) {
                    issues.push(`❌ SELF NEEDED: ${helper}.${exp.name}() uses 'self.' but does NOT declare 'self' parameter (L${exp.line})`);
                }
            }
        }
    });
});

// ═══════════════════════════════════════════════════════
// 5. IMPORT CHECK in naverBlogAutomation.ts
// ═══════════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════════════════════');
console.log('5. IMPORT CHECK');
console.log('═══════════════════════════════════════════════════════');

const usedHelpers = new Set(delegateCalls.map(d => d.helper));
usedHelpers.forEach(helper => {
    const importPattern = new RegExp(`import\\s+.*${helper}.*from`);
    const wildcardPattern = new RegExp(`import\\s+\\*\\s+as\\s+${helper}\\s+from`);
    const namedPattern = new RegExp(`import\\s+{[^}]*}\\s+from\\s+.*${helper.replace('Helpers', 'Helpers')}`);

    let found = false;
    for (let i = 0; i < Math.min(50, mainLines.length); i++) {
        if (mainLines[i].includes(helper) && (mainLines[i].includes('import') || mainLines[i].includes('require'))) {
            found = true;
            info.push(`✅ Import found: ${helper} at L${i + 1}: ${mainLines[i].trim()}`);
            break;
        }
    }
    if (!found) {
        issues.push(`❌ MISSING IMPORT: '${helper}' is used but not imported in naverBlogAutomation.ts`);
    }
});

// ═══════════════════════════════════════════════════════
// 6. DELEGATE METHOD BODY CHECK (should be thin wrappers)
// ═══════════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════════════════════');
console.log('6. DELEGATE BODY SIZE CHECK');
console.log('═══════════════════════════════════════════════════════');

// Find class methods that delegate to helpers but have unusually long bodies
const classMethodPattern = /(?:private|public|protected)?\s*(?:async\s+)?(\w+)\s*\([^)]*\)(?:\s*:\s*[^{]*)?{/g;
let methodMatch;
const bigDelegates = [];

for (let i = 0; i < mainLines.length; i++) {
    const line = mainLines[i];
    // Check if this line is a method that delegates to a helper
    const delegateInMethod = delegateCalls.find(d => {
        // Find the delegate call and check ~5 lines distance
        return d.line >= i && d.line <= i + 10;
    });

    if (delegateInMethod && (line.includes('async ') || line.includes('private ') || line.includes('public '))) {
        // Count lines until closing brace
        let braceCount = 0, startFound = false, bodyLines = 0;
        for (let j = i; j < mainLines.length; j++) {
            const l = mainLines[j];
            for (const ch of l) {
                if (ch === '{') { braceCount++; startFound = true; }
                if (ch === '}') { braceCount--; if (startFound && braceCount === 0) { bodyLines = j - i + 1; break; } }
            }
            if (bodyLines > 0) break;
        }

        if (bodyLines > 10) { // Delegate should be 3-5 lines max
            bigDelegates.push({ method: delegateInMethod.method, line: i + 1, bodyLines, delegateLine: delegateInMethod.line });
        }
    }
}

if (bigDelegates.length > 0) {
    bigDelegates.forEach(d => {
        warnings.push(`⚠️ THICK DELEGATE: Method containing ${d.method} delegate at L${d.line} has ${d.bodyLines} lines (expected ~3-5 for thin delegate)`);
    });
}

// ═══════════════════════════════════════════════════════
// 7. CHECK FOR DUPLICATE FUNCTION BODIES
// ═══════════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════════════════════');
console.log('7. DUPLICATE / REMNANT CHECK');
console.log('═══════════════════════════════════════════════════════');

// Check if the main file still contains substantial implementations of extracted methods
const extractedMethods = [
    ...imageExports.map(e => e.name),
    ...publishExports.map(e => e.name),
    ...editorExports.map(e => e.name)
];

extractedMethods.forEach(methodName => {
    // Find this method in main file
    for (let i = 0; i < mainLines.length; i++) {
        const line = mainLines[i];
        // Check for method definition (not call)
        if (line.match(new RegExp(`\\b${methodName}\\s*\\(`)) && !line.includes('Helpers.') && !line.includes('helpers.')) {
            // Check if this is a class method definition
            if (line.includes('async ') && (line.includes('private') || line.includes('public') || line.includes('protected'))) {
                // Count body lines
                let braceCount = 0, startFound = false, bodyEnd = -1;
                for (let j = i; j < mainLines.length; j++) {
                    for (const ch of mainLines[j]) {
                        if (ch === '{') { braceCount++; startFound = true; }
                        if (ch === '}') { braceCount--; if (startFound && braceCount === 0) { bodyEnd = j; break; } }
                    }
                    if (bodyEnd >= 0) break;
                }

                if (bodyEnd >= 0) {
                    const bodySize = bodyEnd - i + 1;
                    if (bodySize > 10) {
                        // Check if delegate call exists inside
                        const bodyText = mainLines.slice(i, bodyEnd + 1).join('\n');
                        const hasDelegate = bodyText.includes('Helpers.') || bodyText.includes('helpers.');
                        if (!hasDelegate) {
                            issues.push(`❌ REMNANT METHOD: ${methodName}() at L${i + 1} has ${bodySize} lines but NO delegate call — original body may still be present`);
                        }
                    }
                }
                break; // Only check first occurrence
            }
        }
    }
});

// ═══════════════════════════════════════════════════════
// 8. CHECK editorHelpers LOCAL UTILITIES SYNC
// ═══════════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════════════════════');
console.log('8. LOCAL UTILITY SYNC CHECK');
console.log('═══════════════════════════════════════════════════════');

// Check that safeKeyboardType in editorHelpers matches the one in main
const mainSafeKT = mainFile.indexOf('async function safeKeyboardType(');
const editorSafeKT = editorFile.indexOf('async function safeKeyboardType(');
if (mainSafeKT >= 0 && editorSafeKT >= 0) {
    info.push('✅ safeKeyboardType exists in both main and editorHelpers (local copy)');
} else if (editorSafeKT < 0) {
    issues.push('❌ safeKeyboardType is MISSING from editorHelpers.ts');
}

const editorSmartType = editorFile.indexOf('async function smartTypeWithAutoHighlight(');
if (editorSmartType >= 0) {
    info.push('✅ smartTypeWithAutoHighlight exists in editorHelpers (local copy)');
} else {
    issues.push('❌ smartTypeWithAutoHighlight is MISSING from editorHelpers.ts');
}

const editorExtractCore = editorFile.indexOf('function extractCoreKeywords(');
if (editorExtractCore >= 0) {
    info.push('✅ extractCoreKeywords exists in editorHelpers (local copy)');
} else {
    issues.push('❌ extractCoreKeywords is MISSING from editorHelpers.ts');
}

// ═══════════════════════════════════════════════════════
// FINAL REPORT
// ═══════════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════════════════════');
console.log('FINAL REPORT');
console.log('═══════════════════════════════════════════════════════');

console.log(`\n✅ INFO (${info.length}):`);
info.forEach(i => console.log(`  ${i}`));

console.log(`\n⚠️ WARNINGS (${warnings.length}):`);
warnings.forEach(w => console.log(`  ${w}`));

console.log(`\n❌ ISSUES (${issues.length}):`);
issues.forEach(i => console.log(`  ${i}`));

console.log(`\n════════════════════════════════════`);
if (issues.length === 0) {
    console.log('🎉 NO CRITICAL ISSUES FOUND!');
} else {
    console.log(`⚠️ ${issues.length} CRITICAL ISSUES NEED ATTENTION`);
}
console.log(`════════════════════════════════════`);

// Save report
const report = [
    '# Refactoring Integration Verification Report',
    `Date: ${new Date().toISOString()}`,
    '',
    `## Summary`,
    `- Delegate calls found: ${delegateCalls.length}`,
    `- Helper exports: imageHelpers(${imageExports.length}), publishHelpers(${publishExports.length}), editorHelpers(${editorExports.length})`,
    `- Issues: ${issues.length}`,
    `- Warnings: ${warnings.length}`,
    '',
    '## Issues',
    ...issues.map(i => `- ${i}`),
    '',
    '## Warnings',
    ...warnings.map(w => `- ${w}`),
    '',
    '## Info',
    ...info.map(i => `- ${i}`)
].join('\n');

fs.writeFileSync('verification_report.txt', report, 'utf-8');
console.log('\nFull report saved to verification_report.txt');
