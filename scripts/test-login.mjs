import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

console.log('='.repeat(60));
console.log('🧪 네이버 로그인 테스트 준비');
console.log('='.repeat(60));
console.log('');

// Electron userData 경로에서 설정 읽기
const appName = 'better-life-naver';
let userDataPath;

if (process.platform === 'win32') {
  userDataPath = join(os.homedir(), 'AppData', 'Roaming', appName);
} else if (process.platform === 'darwin') {
  userDataPath = join(os.homedir(), 'Library', 'Application Support', appName);
} else {
  userDataPath = join(os.homedir(), '.config', appName);
}

// config.json과 settings.json 모두 확인
const configPath = join(userDataPath, 'config.json');
const settingsPath = join(userDataPath, 'settings.json');

console.log(`📂 설정 디렉토리: ${userDataPath}`);
console.log('');

// 설정 파일 읽기
let naverId = '';
let naverPassword = '';

// 1. config.json 확인
try {
  if (fs.existsSync(configPath)) {
    console.log('📄 config.json 확인 중...');
    const configData = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(configData);
    
    naverId = config.naverId || '';
    naverPassword = config.naverPassword || '';
    
    if (naverId && naverPassword) {
      console.log(`✅ config.json에서 자격증명 발견: ${naverId.substring(0, 3)}***`);
    }
  }
} catch (error) {
  console.error('⚠️ config.json 읽기 실패:', error.message);
}

// 2. settings.json 확인 (config.json에 없으면)
if (!naverId || !naverPassword) {
  try {
    if (fs.existsSync(settingsPath)) {
      console.log('📄 settings.json 확인 중...');
      const settingsData = fs.readFileSync(settingsPath, 'utf-8');
      const settings = JSON.parse(settingsData);
      
      naverId = settings.savedNaverId || naverId;
      naverPassword = settings.savedNaverPassword || naverPassword;
      
      if (naverId && naverPassword) {
        console.log(`✅ settings.json에서 자격증명 발견: ${naverId.substring(0, 3)}***`);
      } else {
        console.log('⚠️ 저장된 자격증명이 없습니다.');
      }
    } else {
      console.log('⚠️ settings.json 파일이 없습니다.');
    }
  } catch (error) {
    console.error('❌ settings.json 읽기 실패:', error.message);
  }
}

console.log('');

// 환경변수 또는 직접 입력 안내
if (!naverId || !naverPassword) {
  console.log('📝 테스트를 실행하려면 다음 중 하나를 선택하세요:');
  console.log('');
  console.log('1️⃣ 앱에서 네이버 아이디/비밀번호를 저장하고 다시 실행');
  console.log('   (공통 섹션 → 네이버 아이디/비밀번호 입력 → 저장)');
  console.log('');
  console.log('2️⃣ 환경변수로 직접 설정:');
  console.log('   $env:TEST_NAVER_ID="your_id"');
  console.log('   $env:TEST_NAVER_PASSWORD="your_password"');
  console.log('   npm run test:login');
  console.log('');
  
  // 환경변수 확인
  naverId = process.env.TEST_NAVER_ID || '';
  naverPassword = process.env.TEST_NAVER_PASSWORD || '';
  
  if (!naverId || !naverPassword) {
    console.error('❌ 자격증명을 찾을 수 없습니다. 테스트를 종료합니다.');
    process.exit(1);
  }
  
  console.log(`✅ 환경변수에서 자격증명 발견: ${naverId.substring(0, 3)}***`);
  console.log('');
}

// 테스트 실행
console.log('🚀 로그인 테스트 시작...');
console.log('');

// 먼저 빌드
console.log('📦 빌드 중...');
const buildProcess = spawn('npm', ['run', 'build'], {
  cwd: projectRoot,
  stdio: 'inherit',
  shell: true
});

buildProcess.on('close', (buildCode) => {
  if (buildCode !== 0) {
    console.error('❌ 빌드 실패');
    process.exit(buildCode);
  }
  
  console.log('✅ 빌드 완료');
  console.log('');
  
  // 빌드된 파일 실행
  const testProcess = spawn('node', [
    'dist/tests/testLogin.js'
  ], {
    cwd: projectRoot,
    env: {
      ...process.env,
      TEST_NAVER_ID: naverId,
      TEST_NAVER_PASSWORD: naverPassword,
    },
    stdio: 'inherit',
    shell: true
  });

  testProcess.on('close', (code) => {
    console.log('');
    if (code === 0) {
      console.log('✅ 테스트 완료');
    } else {
      console.log(`❌ 테스트 실패 (종료 코드: ${code})`);
    }
    process.exit(code);
  });

  testProcess.on('error', (error) => {
    console.error('');
    console.error('❌ 테스트 실행 오류:', error.message);
    process.exit(1);
  });
});


