// Script to create module files from temp extracted blocks
const fs = require('fs');
const path = require('path');

const modulesDir = path.join(__dirname, 'src', 'renderer', 'modules');

// 1. apiGuideModals.ts
const apiGuide = fs.readFileSync('_tmp_apiGuide.txt', 'utf-8');
const allKeys = fs.readFileSync('_tmp_allKeys.txt', 'utf-8');

const apiHeader = [
    '// ═══════════════════════════════════════════════════════════════════',
    '// ✅ [2026-02-26 모듈화] API 가이드 모달 모듈',
    '// renderer.ts에서 추출 — API 키 발급 가이드 + 통합 API 키 모달',
    '// ═══════════════════════════════════════════════════════════════════',
    '',
    'declare const window: Window & { api: any };',
    '',
].join('\n');

fs.writeFileSync(
    path.join(modulesDir, 'apiGuideModals.ts'),
    apiHeader + apiGuide + '\n\n' + allKeys + '\n',
    'utf-8'
);
console.log('✅ apiGuideModals.ts created (' + (apiGuide.split('\n').length + allKeys.split('\n').length) + ' lines)');

// 2. guideModals.ts
const guide = fs.readFileSync('_tmp_guide.txt', 'utf-8');

const guideHeader = [
    '// ═══════════════════════════════════════════════════════════════════',
    '// ✅ [2026-02-26 모듈화] 사용 가이드 모달 모듈',
    '// renderer.ts에서 추출 — 사용 가이드 모달 (대용량 HTML 컨텐츠 포함)',
    '// ═══════════════════════════════════════════════════════════════════',
    '',
    'declare const window: Window & { api: any };',
    'const appendLog = (window as any).appendLog || ((...args: any[]) => console.log("[guideModals]", ...args));',
    '',
].join('\n');

fs.writeFileSync(
    path.join(modulesDir, 'guideModals.ts'),
    guideHeader + guide + '\n',
    'utf-8'
);
console.log('✅ guideModals.ts created (' + guide.split('\n').length + ' lines)');

// Cleanup temp files
fs.unlinkSync('_tmp_apiGuide.txt');
fs.unlinkSync('_tmp_allKeys.txt');
fs.unlinkSync('_tmp_guide.txt');
console.log('✅ Temp files cleaned up');
