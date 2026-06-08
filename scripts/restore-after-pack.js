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
console.log('\n📝 .env 복원 스킵...');
console.log('ℹ️ v2.11.18부터 패키징 과정은 로컬 .env를 백업/초기화/복원하지 않습니다.');
if (fs.existsSync(envBackupPath) || fs.existsSync(envCreatedMarkerPath)) {
  console.log('⚠️ 이전 빌드에서 만든 .env 백업/마커 파일이 남아 있습니다. 현재 .env는 덮어쓰지 않습니다.');
}

console.log('\n' + '='.repeat(60));
console.log('✅ 개발 환경 복원 완료!');
console.log('='.repeat(60));
console.log('\n💡 이제 다시 개발을 시작할 수 있습니다:');
console.log('   npm start\n');

