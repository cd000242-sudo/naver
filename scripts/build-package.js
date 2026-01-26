/**
 * 한글 경로에서 cross-spawn 문제를 우회하는 빌드 스크립트
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('🔧 Better Life Naver 배포 패키지 빌드 시작...');
console.log('📂 작업 디렉토리:', process.cwd());

try {
    // 1. TypeScript 빌드
    console.log('\n📦 1단계: TypeScript 컴파일...');
    execSync('npx tsc', { stdio: 'inherit', shell: true });

    // 2. 정적 파일 복사
    console.log('\n📦 2단계: 정적 파일 복사...');
    execSync('node scripts/copy-static.mjs', { stdio: 'inherit', shell: true });

    // 3. 배포용 설정 초기화
    console.log('\n📦 3단계: 배포용 설정 초기화...');
    execSync('node scripts/reset-config-for-pack.js', { stdio: 'inherit', shell: true });

    // 4. Electron Builder 실행 (직접 node로 호출)
    console.log('\n📦 4단계: Electron Builder 실행...');

    // electron-builder를 직접 require하여 실행
    const builder = require('electron-builder');

    builder.build({
        targets: builder.Platform.WINDOWS.createTarget(['nsis', 'portable'], builder.Arch.x64),
        config: {
            // package.json의 build 설정 사용
        }
    }).then(() => {
        console.log('\n✅ 빌드 성공!');

        // 5. 설정 복원
        console.log('\n📦 5단계: 설정 복원...');
        execSync('node scripts/restore-after-pack.js', { stdio: 'inherit', shell: true });

        console.log('\n🎉 배포 패키지 생성 완료!');
        console.log('📂 출력 폴더: release_final/');

    }).catch(err => {
        console.error('❌ Electron Builder 실패:', err.message);
        process.exit(1);
    });

} catch (error) {
    console.error('❌ 빌드 실패:', error.message);
    process.exit(1);
}
