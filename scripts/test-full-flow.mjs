import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

console.log('='.repeat(80));
console.log('🧪 전체 플로우 테스트 준비');
console.log('='.repeat(80));
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

const settingsPath = join(userDataPath, 'settings.json');

console.log(`📂 설정 디렉토리: ${userDataPath}`);
console.log('');

// 설정 파일 읽기
let naverId = '';
let naverPassword = '';
let geminiApiKey = '';
let openaiApiKey = '';
let pexelsApiKey = '';

try {
  if (fs.existsSync(settingsPath)) {
    console.log('📄 settings.json 읽는 중...');
    const settingsData = fs.readFileSync(settingsPath, 'utf-8');
    const settings = JSON.parse(settingsData);
    
    naverId = settings.savedNaverId || '';
    naverPassword = settings.savedNaverPassword || '';
    geminiApiKey = settings.geminiApiKey || '';
    openaiApiKey = settings.openaiApiKey || '';
    pexelsApiKey = settings.pexelsApiKey || '';
    
    console.log('✅ 설정 로드 완료');
    console.log(`   네이버 ID: ${naverId ? naverId.substring(0, 3) + '***' : '없음'}`);
    console.log(`   Gemini API: ${geminiApiKey ? geminiApiKey.substring(0, 10) + '...' : '없음'}`);
    console.log(`   OpenAI API: ${openaiApiKey ? openaiApiKey.substring(0, 10) + '...' : '없음'}`);
    console.log(`   Pexels API: ${pexelsApiKey ? pexelsApiKey.substring(0, 10) + '...' : '없음'}`);
    console.log('');
  } else {
    console.log('⚠️ settings.json 파일이 없습니다.');
  }
} catch (error) {
  console.error('❌ settings.json 읽기 실패:', error.message);
}

// 필수 설정 확인
if (!naverId || !naverPassword) {
  console.error('❌ 네이버 자격증명이 필요합니다.');
  console.error('   앱에서 네이버 아이디/비밀번호를 저장해주세요.');
  process.exit(1);
}

if (!geminiApiKey) {
  console.error('❌ Gemini API Key가 필요합니다.');
  console.error('   앱 설정에서 Gemini API Key를 입력해주세요.');
  process.exit(1);
}

// 이미지 생성 API 확인
if (!openaiApiKey && !pexelsApiKey) {
  console.log('⚠️ OpenAI 또는 Pexels API Key가 없습니다.');
  console.log('   이미지 없이 테스트를 진행합니다.');
  console.log('');
}

// 테스트 실행
console.log('🚀 전체 플로우 테스트 시작...');
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
    'dist/tests/testFullFlow.js'
  ], {
    cwd: projectRoot,
    env: {
      ...process.env,
      TEST_NAVER_ID: naverId,
      TEST_NAVER_PASSWORD: naverPassword,
      GEMINI_API_KEY: geminiApiKey,
      OPENAI_API_KEY: openaiApiKey || '',
      PEXELS_API_KEY: pexelsApiKey || '',
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





