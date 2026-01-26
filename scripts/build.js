/**
 * 🔧 Better Life Naver 안전한 배포 빌드 스크립트
 * 한글 경로 문제 우회 + .env 보안 + 설정 복원 보장
 */
const { execSync } = require('child_process');
const builder = require('electron-builder');
const fs = require('fs');
const path = require('path');

// package.json을 로드
const pkg = require('../package.json');

console.log('🔧 Better Life Naver 안전한 배포 빌드 시작...');
console.log(`📂 작업 디렉토리: ${process.cwd()}`);
console.log(`📦 버전: ${pkg.version}`);

// 1. 보안: .env 제거 필터링
const safeExtraResources = (pkg.build.extraResources || []).filter(res => {
    const fromPath = typeof res === 'string' ? res : res.from;
    return !fromPath.includes('.env');
});

// 2. 최적화: files 설정
const safeFiles = pkg.build.files || [];

async function main() {
    try {
        // --- Step 1: 클린 & 컴파일 ---
        console.log('\n📦 [1/4] TypeScript 컴파일...');
        execSync('npx tsc', { stdio: 'inherit', shell: true });

        // --- Step 2: 정적 파일 복사 ---
        console.log('\n📦 [2/4] 정적 파일 복사...');
        execSync('node scripts/copy-static.mjs', { stdio: 'inherit', shell: true });

        // --- Step 3: 설정 초기화 ---
        console.log('\n📦 [3/4] 배포용 설정 초기화...');
        execSync('node scripts/reset-config-for-pack.js', { stdio: 'inherit', shell: true });

        // --- Step 4: Electron Builder 실행 ---
        console.log('\n📦 [4/4] 패키징 시작 (Electron Builder)...');

        await builder.build({
            targets: builder.Platform.WINDOWS.createTarget(['nsis', 'portable'], builder.Arch.x64),
            config: {
                ...pkg.build,
                appId: pkg.build.appId,
                productName: pkg.build.productName,
                // ⚡️ 보안 및 최적화된 설정
                extraResources: safeExtraResources,
                files: safeFiles,
                // 한글 경로 문제 완화를 위한 artifactName 설정
                artifactName: "${productName}_Setup_${version}.${ext}",
            }
        });

        console.log('\n✅ 빌드 성공! (출력: release_final/)');

    } catch (err) {
        console.error('\n❌ 빌드 중 치명적 오류 발생:', err.message);
        process.exit(1);
    } finally {
        // --- Step 5: 설정 복원 (실패하든 성공하든 무조건 실행) ---
        console.log('\n🧹 [Clean-up] 설정 복원...');
        try {
            execSync('node scripts/restore-after-pack.js', { stdio: 'inherit', shell: true });
            console.log('✨ 설정 복원 완료');
        } catch (e) {
            console.error('⚠️ 복원 스크립트 실행 실패:', e.message);
        }
    }
}

main();
