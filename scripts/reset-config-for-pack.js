#!/usr/bin/env node

/**
 * 배포용 설정 초기화 스크립트
 * pack 명령 실행 시 민감한 정보를 클리어하여 배포
 */

const fs = require('fs');
const path = require('path');

console.log('🔧 배포용 설정 초기화 시작...');

// config 파일 경로들 (개발 환경의 config 및 사용자 데이터 경로)
const distConfigPath = path.join(__dirname, '..', 'dist', 'settings.json');
const userDataPath = process.env.APPDATA || (process.platform === 'darwin'
  ? path.join(process.env.HOME || '', 'Library', 'Application Support')
  : path.join(process.env.HOME || '', '.config'));
const appUserDataPath = path.join(userDataPath, 'better-life-naver', 'settings.json');
const packagedAppUserDataPath = path.join(userDataPath, 'Better Life Naver', 'settings.json');

const packagedAppUserDataDir = path.join(userDataPath, 'Better Life Naver');

const envPath = path.join(__dirname, '..', '.env');
const envBackupPath = envPath + '.pre-pack-backup';
const envCreatedMarkerPath = envPath + '.pre-pack-created';

console.log('📂 초기화 대상 경로:');
console.log('  - dist:', distConfigPath);
console.log('  - ⚠️ dev userData (초기화 안함):', appUserDataPath);
console.log('  - packaged userData:', packagedAppUserDataPath);
console.log('  - packaged userData dir (wipe):', packagedAppUserDataDir);
console.log('  - packaged .env (sanitize):', envPath);

try {
  // ✅ [v2.8.0] 사용자 userData 폴더 전체 삭제 로직 제거 — 빌드 머신에서도 위험.
  //   기존 동작: 빌드 시 packagedAppUserDataDir 통째로 rmSync.
  //   문제: 개발 머신에서 실제 사용자 데이터를 삭제. dist/settings.json + .env만
  //         초기화하면 충분 (실제 사용자 데이터는 그대로 보존).
  console.log(`\n⏭️ packagedAppUserDataDir 삭제 단계 스킵 (v2.8.0 안전화): ${packagedAppUserDataDir}`);

  // ✅ .env 민감 정보 제거 (배포본에 키가 포함되지 않도록)
  try {
    if (fs.existsSync(envPath)) {
      fs.copyFileSync(envPath, envBackupPath);
      fs.writeFileSync(envPath, '', 'utf8');
      console.log(`\n✅ .env 백업 후 초기화 완료: ${envBackupPath}`);
    } else {
      fs.writeFileSync(envPath, '', 'utf8');
      fs.writeFileSync(envCreatedMarkerPath, '1', 'utf8');
      console.log(`\n✅ .env 파일이 없어 빈 파일로 생성했습니다: ${envPath}`);
    }
  } catch (envError) {
    console.log('  ⚠️ .env 초기화 실패(계속 진행):', envError.message);
  }

  // ✅ 개발 환경(better-life-naver)은 초기화하지 않음!
  // dist 폴더와 패키지된 앱 폴더만 초기화
  const configPaths = [distConfigPath, packagedAppUserDataPath];
  // 이전: const configPaths = [distConfigPath, appUserDataPath, packagedAppUserDataPath];

  configPaths.forEach(configPath => {
    if (fs.existsSync(configPath)) {
      try {
        console.log(`\n🔍 처리 중: ${configPath}`);
        // 파일 읽기
        const existingConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

        console.log('  - 기존 API 키 존재:', {
          gemini: !!existingConfig.geminiApiKey,
          openai: !!existingConfig.openaiApiKey,
          claude: !!existingConfig.claudeApiKey,
          pexels: !!existingConfig.pexelsApiKey
        });

        // API 키들 초기화 (민감 정보)
        existingConfig.geminiApiKey = '';
        existingConfig.openaiApiKey = '';
        existingConfig.claudeApiKey = '';
        existingConfig.pexelsApiKey = '';
        existingConfig.unsplashApiKey = '';
        existingConfig.pixabayApiKey = '';
        existingConfig.naverDatalabClientId = '';
        existingConfig.naverDatalabClientSecret = '';

        // 네이버 계정 정보 초기화
        existingConfig.rememberCredentials = false;
        existingConfig.savedNaverId = '';
        existingConfig.savedNaverPassword = '';

        // 라이선스 자격증명 정보 초기화
        existingConfig.rememberLicenseCredentials = false;
        existingConfig.savedLicenseUserId = '';
        existingConfig.savedLicensePassword = '';

        // 사용자 프로필 정보 초기화
        existingConfig.userDisplayName = '';
        existingConfig.userEmail = '';

        // ✅ 패키지 마커 추가 (패키지 생성 시점 표시)
        const packageJson = require(path.join(__dirname, '..', 'package.json'));
        existingConfig._packagedVersion = packageJson.version || '1.0.0';
        existingConfig._packagedAt = new Date().toISOString();

        // 초기화된 설정 저장
        fs.writeFileSync(configPath, JSON.stringify(existingConfig, null, 2), 'utf-8');
        console.log('  ✅ 모든 민감 정보 초기화 완료');
      } catch (error) {
        // 파일이 손상되었거나 읽을 수 없으면 삭제
        console.log('  ⚠️ 설정 파일 읽기 실패, 삭제:', error.message);
        try {
          fs.unlinkSync(configPath);
          console.log('  ✅ 파일 삭제 완료');
        } catch (unlinkError) {
          console.log('  ❌ 파일 삭제 실패:', unlinkError.message);
        }
      }
    } else {
      console.log(`\n⏭️ 파일 없음: ${configPath}`);
    }
  });

  // dist/settings.json은 기본값으로 재생성
  const configPath = distConfigPath;

  // 기본 설정 파일 생성 (빈 값들로)
  const packageJson = require(path.join(__dirname, '..', 'package.json'));
  const defaultConfig = {
    // API 키들은 빈 값으로
    geminiApiKey: '',
    openaiApiKey: '',
    claudeApiKey: '',
    pexelsApiKey: '',
    unsplashApiKey: '',
    pixabayApiKey: '',
    naverDatalabClientId: '',
    naverDatalabClientSecret: '',

    // 네이버 계정 정보 초기화
    rememberCredentials: false,
    savedNaverId: '',
    savedNaverPassword: '',

    // 라이선스 정보 초기화
    rememberLicenseCredentials: false,
    savedLicenseUserId: '',
    savedLicensePassword: '',

    // 기본 설정
    dailyPostLimit: 3,
    hideDailyLimitWarning: false,

    // 사용자 프로필
    userDisplayName: '',
    userEmail: '',
    userTimezone: 'Asia/Seoul',

    // 고급 설정
    enableDebugMode: false,
    autoSaveDrafts: true,
    backupFrequency: 'weekly',

    // 이미지 소스 (모두 false)
    imageSourceUnsplash: false,
    imageSourcePexels: false,
    imageSourcePixabay: false,
    imageSourceWikimedia: false,
    imageSourceNasa: false,
    imageSourceOpenverse: false,
    imageSourceKoreaGov: false,
    imageSourceNewsAgency: false,

    // 무료 체험 버튼 표시 설정 (기본값: 표시)
    enableFreeTrialButton: true,

    // ✅ 패키지 마커 (패키지 생성 시점 표시)
    _packagedVersion: packageJson.version || '1.0.0',
    _packagedAt: new Date().toISOString()
  };

  // 설정 파일 생성
  fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
  console.log('✅ 배포용 설정 파일 생성됨 - 모든 민감 정보 초기화');

  console.log('✅ 배포용 설정 파일 생성 완료');

  // 2. renderer.ts의 하드코딩된 API 키 초기화
  console.log('\n📝 renderer.ts의 하드코딩된 API 키 초기화 중...');

  const rendererSourcePath = path.join(__dirname, '..', 'src', 'renderer', 'renderer.ts');
  const rendererDistPath = path.join(__dirname, '..', 'dist', 'renderer', 'renderer.js');

  // 백업 생성
  const backupPath = rendererSourcePath + '.pre-pack-backup';
  if (fs.existsSync(rendererSourcePath)) {
    fs.copyFileSync(rendererSourcePath, backupPath);
    console.log('💾 renderer.ts 백업 생성됨:', backupPath);

    let rendererContent = fs.readFileSync(rendererSourcePath, 'utf8');

    // API 키 패턴 찾기 및 초기화
    const apiKeyPattern = /'openai-api-key': process\.env\.NODE_ENV === 'production' \? '' : '[^']*'/g;
    const geminiKeyPattern = /'gemini-api-key': process\.env\.NODE_ENV === 'production' \? '' : '[^']*'/g;
    const claudeKeyPattern = /'claude-api-key': process\.env\.NODE_ENV === 'production' \? '' : '[^']*'/g;
    const pexelsKeyPattern = /'pexels-api-key': process\.env\.NODE_ENV === 'production' \? '' : '[^']*'/g;

    rendererContent = rendererContent.replace(apiKeyPattern, "'openai-api-key': ''");
    rendererContent = rendererContent.replace(geminiKeyPattern, "'gemini-api-key': ''");
    rendererContent = rendererContent.replace(claudeKeyPattern, "'claude-api-key': ''");
    rendererContent = rendererContent.replace(pexelsKeyPattern, "'pexels-api-key': ''");

    fs.writeFileSync(rendererSourcePath, rendererContent, 'utf8');
    console.log('✅ renderer.ts의 API 키가 초기화되었습니다.');
  }

  // 3. test-apis.js 초기화 (있는 경우)
  console.log('\n📝 test-apis.js 초기화 중...');

  const testApisPath = path.join(__dirname, '..', 'test-apis.js');
  if (fs.existsSync(testApisPath)) {
    let testContent = fs.readFileSync(testApisPath, 'utf8');

    testContent = testContent.replace(/gemini: '[^']*'/g, "gemini: ''");
    testContent = testContent.replace(/openai: '[^']*'/g, "openai: ''");
    testContent = testContent.replace(/claude: '[^']*'/g, "claude: ''");
    testContent = testContent.replace(/pexels: '[^']*'/g, "pexels: ''");

    fs.writeFileSync(testApisPath, testContent, 'utf8');
    console.log('✅ test-apis.js의 API 키가 초기화되었습니다.');
  } else {
    console.log('ℹ️ test-apis.js 파일이 없습니다.');
  }

  console.log('\n' + '='.repeat(60));
  console.log('🎉 배포 준비 완료! 민감한 정보가 모두 초기화되었습니다.');
  console.log('='.repeat(60));
  console.log('\n⚠️ 배포 후 복원 방법:');
  console.log('   1. git checkout src/renderer/renderer.ts');
  console.log('   2. 또는 백업 파일 사용: renderer.ts.pre-pack-backup');
  console.log('');

} catch (error) {
  console.error('❌ 배포용 설정 초기화 실패:', error);
  process.exit(1);
}
