#!/usr/bin/env node

/**
 * latest.yml 자동 수정 스크립트
 * electron-builder가 생성하는 latest.yml의 버전/해시가 부정확할 수 있으므로
 * Setup.exe의 SHA512를 직접 계산하여 정확한 latest.yml을 재생성합니다.
 * 
 * ✅ [2026-02-13] 릴리즈 자동화 파이프라인 일부
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8'));
const VERSION = pkg.version;

const releaseDir = path.join(__dirname, '..', 'release_final');
// latest.yml에 기록될 url은 항상 하이픈 표기 (electron-updater 다운로드 키)
const setupUrlName = `Better-Life-Naver-Setup-${VERSION}.exe`;
const latestYmlPath = path.join(releaseDir, 'latest.yml');

/**
 * Resolve installer path resiliently — electron-builder may produce either
 * the spaced productName ("Better Life Naver Setup X.exe") or the hyphenated
 * variant depending on version/locale. Fall back to any *.exe with Setup+version.
 */
function findSetupExe() {
    if (!fs.existsSync(releaseDir)) return null;
    const files = fs.readdirSync(releaseDir);
    const candidates = [
        `Better-Life-Naver-Setup-${VERSION}.exe`,
        `Better Life Naver Setup ${VERSION}.exe`,
    ];
    for (const name of candidates) {
        if (files.includes(name)) return path.join(releaseDir, name);
    }
    const fallback = files.find(f =>
        f.toLowerCase().endsWith('.exe') &&
        /setup/i.test(f) &&
        f.includes(VERSION) &&
        !f.includes('uninstall') &&
        !f.includes('elevate')
    );
    return fallback ? path.join(releaseDir, fallback) : null;
}

function main() {
    console.log(`\n🔧 latest.yml 수정 시작 (v${VERSION})`);
    console.log('─'.repeat(50));

    // 1. Setup.exe 자동 감지
    const setupFile = findSetupExe();
    if (!setupFile) {
        console.error(`❌ Setup 파일을 찾을 수 없습니다 (${releaseDir})`);
        console.error('   먼저 npm run release 로 빌드하세요.');
        process.exit(1);
    }
    console.log(`📍 감지된 설치 파일: ${path.basename(setupFile)}`);

    const stats = fs.statSync(setupFile);
    const fileSize = stats.size;
    console.log(`📦 파일: ${path.basename(setupFile)}`);
    console.log(`📏 크기: ${(fileSize / 1024 / 1024).toFixed(1)}MB (${fileSize} bytes)`);

    // 2. SHA512 계산 (hex → base64, electron-updater 형식)
    console.log('🔐 SHA512 계산 중...');
    const fileBuffer = fs.readFileSync(setupFile);
    const sha512Hex = crypto.createHash('sha512').update(fileBuffer).digest('hex');
    const sha512Base64 = crypto.createHash('sha512').update(fileBuffer).digest('base64');
    console.log(`   hex: ${sha512Hex.substring(0, 32)}...`);
    console.log(`   base64: ${sha512Base64.substring(0, 32)}...`);

    // 3. latest.yml 생성 (BOM 없는 UTF-8, LF 줄바꿈)
    const releaseDate = new Date().toISOString();
    const ymlContent = [
        `version: ${VERSION}`,
        `files:`,
        `  - url: ${setupUrlName}`,
        `    sha512: ${sha512Base64}`,
        `    size: ${fileSize}`,
        `path: ${setupUrlName}`,
        `sha512: ${sha512Base64}`,
        `releaseDate: '${releaseDate}'`,
        '' // trailing newline
    ].join('\n');

    fs.writeFileSync(latestYmlPath, ymlContent, 'utf-8');

    // 4. 검증
    const written = fs.readFileSync(latestYmlPath, 'utf-8');
    const versionMatch = written.includes(`version: ${VERSION}`);
    const hashMatch = written.includes(sha512Base64);
    const sizeMatch = written.includes(`size: ${fileSize}`);

    console.log('\n✅ latest.yml 생성 완료');
    console.log('─'.repeat(50));
    console.log(`   version: ${VERSION} ${versionMatch ? '✅' : '❌'}`);
    console.log(`   sha512:  ${sha512Base64.substring(0, 20)}... ${hashMatch ? '✅' : '❌'}`);
    console.log(`   size:    ${fileSize} ${sizeMatch ? '✅' : '❌'}`);
    console.log(`   url:     ${setupUrlName}`);
    console.log(`   file:    ${latestYmlPath}`);

    if (!versionMatch || !hashMatch || !sizeMatch) {
        console.error('\n❌ latest.yml 검증 실패!');
        process.exit(1);
    }

    console.log('\n🎉 latest.yml 준비 완료!\n');
}

main();
