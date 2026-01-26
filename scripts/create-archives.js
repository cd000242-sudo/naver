const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const releaseDir = path.join(__dirname, '..', 'release_final');
const version = require('../package.json').version;
const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');

console.log('📦 압축 파일 생성 중...');

// release 디렉토리 확인
if (!fs.existsSync(releaseDir)) {
  console.error('❌ release 디렉토리가 없습니다. 먼저 빌드를 실행해주세요.');
  process.exit(1);
}

const files = fs.readdirSync(releaseDir);
const exeFile = files.find(f => f.endsWith('.exe') && (f.includes('Setup') || f.includes('setup')));
// Portable 파일 찾기: Setup이 아닌 .exe 파일 (예: "Better Life Naver 1.0.1.exe")
const portableFile = files.find(f =>
  f.endsWith('.exe') &&
  !f.includes('Setup') &&
  !f.includes('setup') &&
  !f.includes('__uninstaller') &&
  !f.includes('elevate')
);
const unpackedDir = path.join(releaseDir, 'win-unpacked');

// 1. Setup 파일 압축
if (exeFile) {
  const setupPath = path.join(releaseDir, exeFile);
  const zipName = `Better-Life-Naver-Setup-${version}_${dateStr}.zip`;
  const zipPath = path.join(releaseDir, zipName);

  try {
    console.log(`📦 Setup 파일 압축 중: ${exeFile} → ${zipName}`);

    // PowerShell을 사용하여 압축 (Windows)
    if (process.platform === 'win32') {
      // 경로를 제대로 이스케이프하기 위해 -LiteralPath 사용
      const powershellCmd = `Compress-Archive -LiteralPath '${setupPath.replace(/'/g, "''")}' -DestinationPath '${zipPath.replace(/'/g, "''")}' -Force`;
      execSync(`powershell -Command "${powershellCmd}"`, { stdio: 'inherit', shell: true });
      console.log(`✅ Setup 압축 완료: ${zipName}`);
    } else {
      // Linux/Mac에서는 zip 명령어 사용
      execSync(`zip -j "${zipPath}" "${setupPath}"`, { stdio: 'inherit' });
      console.log(`✅ Setup 압축 완료: ${zipName}`);
    }
  } catch (error) {
    console.error(`⚠️ Setup 압축 실패: ${error.message}`);
  }
}

// 2. Portable 파일 압축
if (portableFile) {
  const portablePath = path.join(releaseDir, portableFile);
  const zipName = `Better-Life-Naver-Portable-${version}_${dateStr}.zip`;
  const zipPath = path.join(releaseDir, zipName);

  try {
    console.log(`📦 Portable 파일 압축 중: ${portableFile} → ${zipName}`);

    if (process.platform === 'win32') {
      // 경로를 제대로 이스케이프하기 위해 -LiteralPath 사용
      const powershellCmd = `Compress-Archive -LiteralPath '${portablePath.replace(/'/g, "''")}' -DestinationPath '${zipPath.replace(/'/g, "''")}' -Force`;
      execSync(`powershell -Command "${powershellCmd}"`, { stdio: 'inherit', shell: true });
      console.log(`✅ Portable 압축 완료: ${zipName}`);
    } else {
      execSync(`zip -j "${zipPath}" "${portablePath}"`, { stdio: 'inherit' });
      console.log(`✅ Portable 압축 완료: ${zipName}`);
    }
  } catch (error) {
    console.error(`⚠️ Portable 압축 실패: ${error.message}`);
  }
}

// 3. win-unpacked 디렉토리 압축 (포터블 버전)
if (fs.existsSync(unpackedDir)) {
  const zipName = `Better-Life-Naver-Portable-Folder-${version}_${dateStr}.zip`;
  const zipPath = path.join(releaseDir, zipName);

  try {
    console.log(`📦 Portable 폴더 압축 중: win-unpacked → ${zipName}`);

    if (process.platform === 'win32') {
      // PowerShell로 폴더 압축 - 경로를 제대로 이스케이프
      const unpackedPath = path.join(unpackedDir, '*');
      const powershellCmd = `Compress-Archive -LiteralPath '${unpackedPath.replace(/'/g, "''")}' -DestinationPath '${zipPath.replace(/'/g, "''")}' -Force`;
      execSync(`powershell -Command "${powershellCmd}"`, { stdio: 'inherit', shell: true });
      console.log(`✅ Portable 폴더 압축 완료: ${zipName}`);
    } else {
      // Linux/Mac에서는 zip 명령어 사용
      const cwd = path.dirname(unpackedDir);
      const dirName = path.basename(unpackedDir);
      execSync(`cd "${cwd}" && zip -r "${zipPath}" "${dirName}"`, { stdio: 'inherit' });
      console.log(`✅ Portable 폴더 압축 완료: ${zipName}`);
    }
  } catch (error) {
    console.error(`⚠️ Portable 폴더 압축 실패: ${error.message}`);
  }
}

console.log('\n✅ 모든 압축 파일 생성 완료!');
console.log(`📁 위치: ${releaseDir}`);


