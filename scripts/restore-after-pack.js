#!/usr/bin/env node

/**
 * 배포 후 개발 환경 복원 스크립트
 * pack 명령 실행 후 원본 파일들을 복원
 */

const fs = require('fs');
const path = require('path');

console.log('🔄 개발 환경 복원 시작...\n');

// 1. renderer.ts 복원
console.log('📝 renderer.ts 복원 중...');

const rendererSourcePath = path.join(__dirname, '..', 'src', 'renderer', 'renderer.ts');
const backupPath = rendererSourcePath + '.pre-pack-backup';

const envPath = path.join(__dirname, '..', '.env');
const envBackupPath = envPath + '.pre-pack-backup';
const envCreatedMarkerPath = envPath + '.pre-pack-created';

if (fs.existsSync(backupPath)) {
  fs.copyFileSync(backupPath, rendererSourcePath);
  console.log('✅ renderer.ts가 백업에서 복원되었습니다.');
  
  // 백업 파일 삭제
  fs.unlinkSync(backupPath);
  console.log('🗑️ 백업 파일 삭제됨');
} else {
  console.log('⚠️ 백업 파일을 찾을 수 없습니다. Git으로 복원을 시도하세요:');
  console.log('   git checkout src/renderer/renderer.ts');
}

// 2. .env 복원
console.log('\n📝 .env 복원 중...');
try {
  if (fs.existsSync(envBackupPath)) {
    fs.copyFileSync(envBackupPath, envPath);
    fs.unlinkSync(envBackupPath);
    console.log('✅ .env가 백업에서 복원되었습니다.');
  } else if (fs.existsSync(envCreatedMarkerPath)) {
    // pack 과정에서 빈 .env를 새로 만들었던 경우 → 개발 환경에 남기지 않음
    try {
      if (fs.existsSync(envPath)) {
        fs.unlinkSync(envPath);
      }
    } catch {
      // ignore
    }
    fs.unlinkSync(envCreatedMarkerPath);
    console.log('✅ pack 과정에서 생성된 빈 .env를 정리했습니다.');
  } else {
    console.log('ℹ️ 복원할 .env 백업이 없습니다.');
  }
} catch (error) {
  console.log('⚠️ .env 복원 실패(계속 진행):', error.message);
}

console.log('\n' + '='.repeat(60));
console.log('✅ 개발 환경 복원 완료!');
console.log('='.repeat(60));
console.log('\n💡 이제 다시 개발을 시작할 수 있습니다:');
console.log('   npm start\n');

