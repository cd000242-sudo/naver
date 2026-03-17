/**
 * Detailed check: imageHelpers delegate status
 */
const fs = require('fs');
const c = fs.readFileSync('src/naverBlogAutomation.ts', 'utf-8');
const ll = c.split('\n');

// 1. Check imports
console.log('=== IMPORTS ===');
for (let i = 0; i < 30; i++) {
    if (ll[i].includes('import') && (ll[i].includes('Helper') || ll[i].includes('helper'))) {
        console.log(`L${i + 1}: ${ll[i].trim()}`);
    }
}

// 2. Check each imageHelpers method
const methods = [
    'applyCaption', 'setImageSizeToDocumentWidth', 'verifyImagePlacement',
    'insertImageViaUploadButton', 'insertBase64ImageAtCursor', 'insertImageViaBase64',
    'insertSingleImage', 'insertImagesAtCurrentCursor', 'setImageSizeAndAttachLink',
    'attachLinkToLastImage', 'insertImages', 'insertImagesAtHeadings', 'generateAltWithSource'
];

console.log('\n=== IMAGE HELPER DELEGATES ===');
methods.forEach(m => {
    const delegateLines = [];
    const methodDefLines = [];

    for (let i = 0; i < ll.length; i++) {
        if (ll[i].includes('imageHelpers.' + m)) {
            delegateLines.push(i + 1);
        }
        // Method definition with private/public
        if (ll[i].includes(m + '(') && (ll[i].includes('private') || ll[i].includes('public') || ll[i].includes('protected') || ll[i].includes('async ' + m))) {
            // Count body size
            let braceCount = 0, started = false, endLine = -1;
            for (let j = i; j < ll.length; j++) {
                for (const ch of ll[j]) {
                    if (ch === '{') { braceCount++; started = true; }
                    if (ch === '}') { braceCount--; if (started && braceCount === 0) { endLine = j; break; } }
                }
                if (endLine >= 0) break;
            }
            const bodySize = endLine >= 0 ? endLine - i + 1 : '?';
            methodDefLines.push({ line: i + 1, bodySize });
        }
    }

    const status = delegateLines.length > 0 ? '✅ DELEGATED' : '❌ NO DELEGATE';
    const defInfo = methodDefLines.map(d => `L${d.line}(${d.bodySize}lines)`).join(', ') || 'not found as class method';
    console.log(`${status} ${m}: delegates at [${delegateLines.join(',')}], defs at [${defInfo}]`);
});

// 3. Count total lines of remnant methods
console.log('\n=== LINE COUNT ANALYSIS ===');
let totalRemnantLines = 0;
const remnants = [
    { name: 'applyCaption', start: 8384, size: 19 },
    { name: 'setImageSizeToDocumentWidth', start: 5019, size: 87 },
    { name: 'verifyImagePlacement', start: 5349, size: 117 },
    { name: 'insertImageViaUploadButton', start: 4326, size: 263 },
    { name: 'insertBase64ImageAtCursor', start: 4593, size: 298 },
    { name: 'insertImageViaBase64', start: 4895, size: 120 },
    { name: 'insertSingleImage', start: 5107, size: 127 },
    { name: 'insertImagesAtCurrentCursor', start: 6334, size: 121 },
    { name: 'setImageSizeAndAttachLink', start: 6459, size: 212 },
    { name: 'attachLinkToLastImage', start: 6673, size: 395 },
    { name: 'insertImages', start: 7069, size: 1264 },
];
remnants.forEach(r => {
    totalRemnantLines += r.size;
    console.log(`  ${r.name}: ${r.size} lines (L${r.start})`);
});
console.log(`Total remnant lines: ${totalRemnantLines}`);
console.log(`Current file: ${ll.length} lines`);
console.log(`After cleanup: ~${ll.length - totalRemnantLines} lines`);
