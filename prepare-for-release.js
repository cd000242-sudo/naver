const fs = require('fs');
const path = require('path');

console.log('🚀 배포 준비 스크립트 시작...\n');

// 1. renderer.ts에서 하드코딩된 API 키 제거
console.log('📝 1단계: renderer.ts에서 하드코딩된 API 키 제거...');

const rendererPath = path.join(__dirname, 'src', 'renderer', 'renderer.ts');
let rendererContent = fs.readFileSync(rendererPath, 'utf8');

// API 키 제거
const apiKeyPattern = /const apiKeys = \{[\s\S]*?'pexels-api-key': '[^']*'[\s\S]*?\};/;
const cleanedApiKeys = `const apiKeys = {
      'openai-api-key': '',
      'gemini-api-key': '',
      'claude-api-key': '',
      'pexels-api-key': ''
    };`;

if (apiKeyPattern.test(rendererContent)) {
  rendererContent = rendererContent.replace(apiKeyPattern, cleanedApiKeys);
  fs.writeFileSync(rendererPath, rendererContent, 'utf8');
  console.log('✅ renderer.ts의 API 키가 초기화되었습니다.');
} else {
  console.log('⚠️ API 키 패턴을 찾을 수 없습니다.');
}

// 2. test-apis.js에서 API 키 제거
console.log('\n📝 2단계: test-apis.js에서 API 키 제거...');

const testApisPath = path.join(__dirname, 'test-apis.js');
if (fs.existsSync(testApisPath)) {
  let testApisContent = fs.readFileSync(testApisPath, 'utf8');

  const testApiKeyPattern = /const API_KEYS = \{[\s\S]*?pexels: '[^']*'[\s\S]*?\};/;
  const cleanedTestApiKeys = `const API_KEYS = {
  gemini: '',
  openai: '',
  claude: '',
  pexels: ''
};`;

  if (testApiKeyPattern.test(testApisContent)) {
    testApisContent = testApisContent.replace(testApiKeyPattern, cleanedTestApiKeys);
    fs.writeFileSync(testApisPath, testApisContent, 'utf8');
    console.log('✅ test-apis.js의 API 키가 초기화되었습니다.');
  }
} else {
  console.log('ℹ️ test-apis.js 파일이 없습니다.');
}

// 3. 설정 파일 초기화 (있는 경우)
console.log('\n📝 3단계: 저장된 설정 파일 확인...');

const configPaths = [
  path.join(__dirname, 'config.json'),
  path.join(process.env.APPDATA || '', 'better-life-naver', 'config.json'),
  path.join(process.env.USERPROFILE || '', '.better-life-naver', 'config.json')
];

let configFound = false;
for (const configPath of configPaths) {
  if (fs.existsSync(configPath)) {
    console.log(`⚠️ 설정 파일 발견: ${configPath}`);
    console.log('   배포 전에 이 파일을 삭제하거나 초기화하세요.');
    configFound = true;
  }
}

if (!configFound) {
  console.log('✅ 저장된 설정 파일이 없습니다.');
}

// 4. 테스트 파일 목록 확인
console.log('\n📝 4단계: 테스트 파일 확인...');

const testFiles = [
  'test-apis.js',
  'test-api-keys.html',
  'unified-tab-new.html'
];

console.log('⚠️ 다음 테스트 파일들을 배포에서 제외하세요:');
testFiles.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (fs.existsSync(filePath)) {
    console.log(`   - ${file} (존재함)`);
  }
});

// 5. 백업 파일 확인
console.log('\n📝 5단계: 백업 파일 확인...');

const backupFiles = fs.readdirSync(__dirname).filter(f => 
  f.includes('.backup') || f.includes('.bak')
);

if (backupFiles.length > 0) {
  console.log('⚠️ 다음 백업 파일들을 배포에서 제외하세요:');
  backupFiles.forEach(file => console.log(`   - ${file}`));
} else {
  console.log('✅ 백업 파일이 없습니다.');
}

// 완료 메시지
console.log('\n' + '='.repeat(60));
console.log('✅ 배포 준비 완료!');
console.log('='.repeat(60));
console.log('\n📋 배포 전 체크리스트:');
console.log('  ☑️ API 키 초기화 완료');
console.log('  ⚠️ 저장된 설정 파일 확인 필요');
console.log('  ⚠️ 테스트 파일 제외 필요');
console.log('  ⚠️ 백업 파일 제외 필요');
console.log('\n🚀 이제 npm run pack 또는 npm run dist를 실행하세요!');
console.log('\n⚠️ 주의: 배포 후에는 git에서 renderer.ts를 복원하세요:');
console.log('   git checkout src/renderer/renderer.ts\n');

const path = require('path');

console.log('🚀 배포 준비 스크립트 시작...\n');

// 1. renderer.ts에서 하드코딩된 API 키 제거
console.log('📝 1단계: renderer.ts에서 하드코딩된 API 키 제거...');

const rendererPath = path.join(__dirname, 'src', 'renderer', 'renderer.ts');
let rendererContent = fs.readFileSync(rendererPath, 'utf8');

// API 키 제거
const apiKeyPattern = /const apiKeys = \{[\s\S]*?'pexels-api-key': '[^']*'[\s\S]*?\};/;
const cleanedApiKeys = `const apiKeys = {
      'openai-api-key': '',
      'gemini-api-key': '',
      'claude-api-key': '',
      'pexels-api-key': ''
    };`;

if (apiKeyPattern.test(rendererContent)) {
  rendererContent = rendererContent.replace(apiKeyPattern, cleanedApiKeys);
  fs.writeFileSync(rendererPath, rendererContent, 'utf8');
  console.log('✅ renderer.ts의 API 키가 초기화되었습니다.');
} else {
  console.log('⚠️ API 키 패턴을 찾을 수 없습니다.');
}

// 2. test-apis.js에서 API 키 제거
console.log('\n📝 2단계: test-apis.js에서 API 키 제거...');

const testApisPath = path.join(__dirname, 'test-apis.js');
if (fs.existsSync(testApisPath)) {
  let testApisContent = fs.readFileSync(testApisPath, 'utf8');

  const testApiKeyPattern = /const API_KEYS = \{[\s\S]*?pexels: '[^']*'[\s\S]*?\};/;
  const cleanedTestApiKeys = `const API_KEYS = {
  gemini: '',
  openai: '',
  claude: '',
  pexels: ''
};`;

  if (testApiKeyPattern.test(testApisContent)) {
    testApisContent = testApisContent.replace(testApiKeyPattern, cleanedTestApiKeys);
    fs.writeFileSync(testApisPath, testApisContent, 'utf8');
    console.log('✅ test-apis.js의 API 키가 초기화되었습니다.');
  }
} else {
  console.log('ℹ️ test-apis.js 파일이 없습니다.');
}

// 3. 설정 파일 초기화 (있는 경우)
console.log('\n📝 3단계: 저장된 설정 파일 확인...');

const configPaths = [
  path.join(__dirname, 'config.json'),
  path.join(process.env.APPDATA || '', 'better-life-naver', 'config.json'),
  path.join(process.env.USERPROFILE || '', '.better-life-naver', 'config.json')
];

let configFound = false;
for (const configPath of configPaths) {
  if (fs.existsSync(configPath)) {
    console.log(`⚠️ 설정 파일 발견: ${configPath}`);
    console.log('   배포 전에 이 파일을 삭제하거나 초기화하세요.');
    configFound = true;
  }
}

if (!configFound) {
  console.log('✅ 저장된 설정 파일이 없습니다.');
}

// 4. 테스트 파일 목록 확인
console.log('\n📝 4단계: 테스트 파일 확인...');

const testFiles = [
  'test-apis.js',
  'test-api-keys.html',
  'unified-tab-new.html'
];

console.log('⚠️ 다음 테스트 파일들을 배포에서 제외하세요:');
testFiles.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (fs.existsSync(filePath)) {
    console.log(`   - ${file} (존재함)`);
  }
});

// 5. 백업 파일 확인
console.log('\n📝 5단계: 백업 파일 확인...');

const backupFiles = fs.readdirSync(__dirname).filter(f => 
  f.includes('.backup') || f.includes('.bak')
);

if (backupFiles.length > 0) {
  console.log('⚠️ 다음 백업 파일들을 배포에서 제외하세요:');
  backupFiles.forEach(file => console.log(`   - ${file}`));
} else {
  console.log('✅ 백업 파일이 없습니다.');
}

// 완료 메시지
console.log('\n' + '='.repeat(60));
console.log('✅ 배포 준비 완료!');
console.log('='.repeat(60));
console.log('\n📋 배포 전 체크리스트:');
console.log('  ☑️ API 키 초기화 완료');
console.log('  ⚠️ 저장된 설정 파일 확인 필요');
console.log('  ⚠️ 테스트 파일 제외 필요');
console.log('  ⚠️ 백업 파일 제외 필요');
console.log('\n🚀 이제 npm run pack 또는 npm run dist를 실행하세요!');
console.log('\n⚠️ 주의: 배포 후에는 git에서 renderer.ts를 복원하세요:');
console.log('   git checkout src/renderer/renderer.ts\n');

const path = require('path');

console.log('🚀 배포 준비 스크립트 시작...\n');

// 1. renderer.ts에서 하드코딩된 API 키 제거
console.log('📝 1단계: renderer.ts에서 하드코딩된 API 키 제거...');

const rendererPath = path.join(__dirname, 'src', 'renderer', 'renderer.ts');
let rendererContent = fs.readFileSync(rendererPath, 'utf8');

// API 키 제거
const apiKeyPattern = /const apiKeys = \{[\s\S]*?'pexels-api-key': '[^']*'[\s\S]*?\};/;
const cleanedApiKeys = `const apiKeys = {
      'openai-api-key': '',
      'gemini-api-key': '',
      'claude-api-key': '',
      'pexels-api-key': ''
    };`;

if (apiKeyPattern.test(rendererContent)) {
  rendererContent = rendererContent.replace(apiKeyPattern, cleanedApiKeys);
  fs.writeFileSync(rendererPath, rendererContent, 'utf8');
  console.log('✅ renderer.ts의 API 키가 초기화되었습니다.');
} else {
  console.log('⚠️ API 키 패턴을 찾을 수 없습니다.');
}

// 2. test-apis.js에서 API 키 제거
console.log('\n📝 2단계: test-apis.js에서 API 키 제거...');

const testApisPath = path.join(__dirname, 'test-apis.js');
if (fs.existsSync(testApisPath)) {
  let testApisContent = fs.readFileSync(testApisPath, 'utf8');

  const testApiKeyPattern = /const API_KEYS = \{[\s\S]*?pexels: '[^']*'[\s\S]*?\};/;
  const cleanedTestApiKeys = `const API_KEYS = {
  gemini: '',
  openai: '',
  claude: '',
  pexels: ''
};`;

  if (testApiKeyPattern.test(testApisContent)) {
    testApisContent = testApisContent.replace(testApiKeyPattern, cleanedTestApiKeys);
    fs.writeFileSync(testApisPath, testApisContent, 'utf8');
    console.log('✅ test-apis.js의 API 키가 초기화되었습니다.');
  }
} else {
  console.log('ℹ️ test-apis.js 파일이 없습니다.');
}

// 3. 설정 파일 초기화 (있는 경우)
console.log('\n📝 3단계: 저장된 설정 파일 확인...');

const configPaths = [
  path.join(__dirname, 'config.json'),
  path.join(process.env.APPDATA || '', 'better-life-naver', 'config.json'),
  path.join(process.env.USERPROFILE || '', '.better-life-naver', 'config.json')
];

let configFound = false;
for (const configPath of configPaths) {
  if (fs.existsSync(configPath)) {
    console.log(`⚠️ 설정 파일 발견: ${configPath}`);
    console.log('   배포 전에 이 파일을 삭제하거나 초기화하세요.');
    configFound = true;
  }
}

if (!configFound) {
  console.log('✅ 저장된 설정 파일이 없습니다.');
}

// 4. 테스트 파일 목록 확인
console.log('\n📝 4단계: 테스트 파일 확인...');

const testFiles = [
  'test-apis.js',
  'test-api-keys.html',
  'unified-tab-new.html'
];

console.log('⚠️ 다음 테스트 파일들을 배포에서 제외하세요:');
testFiles.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (fs.existsSync(filePath)) {
    console.log(`   - ${file} (존재함)`);
  }
});

// 5. 백업 파일 확인
console.log('\n📝 5단계: 백업 파일 확인...');

const backupFiles = fs.readdirSync(__dirname).filter(f => 
  f.includes('.backup') || f.includes('.bak')
);

if (backupFiles.length > 0) {
  console.log('⚠️ 다음 백업 파일들을 배포에서 제외하세요:');
  backupFiles.forEach(file => console.log(`   - ${file}`));
} else {
  console.log('✅ 백업 파일이 없습니다.');
}

// 완료 메시지
console.log('\n' + '='.repeat(60));
console.log('✅ 배포 준비 완료!');
console.log('='.repeat(60));
console.log('\n📋 배포 전 체크리스트:');
console.log('  ☑️ API 키 초기화 완료');
console.log('  ⚠️ 저장된 설정 파일 확인 필요');
console.log('  ⚠️ 테스트 파일 제외 필요');
console.log('  ⚠️ 백업 파일 제외 필요');
console.log('\n🚀 이제 npm run pack 또는 npm run dist를 실행하세요!');
console.log('\n⚠️ 주의: 배포 후에는 git에서 renderer.ts를 복원하세요:');
console.log('   git checkout src/renderer/renderer.ts\n');












