// Remove guide modals + tutorials tab blocks from renderer.ts
// Block: L25519-26974 (1456 lines) — apiGuideModal + allApiKeysModal + userGuideModal + tutorialsTab
const fs = require('fs');
const filePath = 'src/renderer/renderer.ts';

const content = fs.readFileSync(filePath, 'utf-8');
const lines = content.split('\n');

console.log('Before: ' + lines.length + ' lines');

// Find the start marker: "// ============================================" followed by "// API 키 발급 가이드 모달"
let startLine = -1;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('// API 키 발급 가이드 모달') &&
        i > 0 && lines[i - 1].includes('// ============================================')) {
        startLine = i - 1; // include the separator comment
        break;
    }
}

// Find the end marker: "initTutorialsTab();" followed by "});" (the DOMContentLoaded block)
let endLine = -1;
for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim() === 'initTutorialsTab();' &&
        i + 1 < lines.length && lines[i + 1].trim() === '});') {
        endLine = i + 1; // include the closing });
        break;
    }
}

if (startLine === -1 || endLine === -1) {
    console.error('Could not find block boundaries!');
    console.log('startLine:', startLine, 'endLine:', endLine);
    process.exit(1);
}

console.log('Removing lines ' + (startLine + 1) + ' to ' + (endLine + 1) + ' (' + (endLine - startLine + 1) + ' lines)');

// Replace with a comment
const replacement = [
    '// ═══════════════════════════════════════════════════════════════════',
    '// ✅ [2026-02-26 모듈화] API 가이드 모달 → ./modules/apiGuideModals.ts',
    '// ✅ [2026-02-26 모듈화] 통합 API 키 모달 → ./modules/apiGuideModals.ts',
    '// ✅ [2026-02-26 모듈화] 사용 가이드 모달 → ./modules/guideModals.ts',
    '// ✅ [2026-02-26 모듈화] 사용법 영상 탭 → ./modules/tutorialsTab.ts',
    '// ═══════════════════════════════════════════════════════════════════',
];

lines.splice(startLine, endLine - startLine + 1, ...replacement);

console.log('After: ' + lines.length + ' lines');
console.log('Removed: ' + ((endLine - startLine + 1) - replacement.length) + ' net lines');

fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
console.log('✅ renderer.ts updated');
