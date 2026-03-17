// 프로젝트 디렉토리에서 실행 시 require.resolve가 node_modules를 정확히 찾음
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

// 방법 1: playwright-core/package.json → cli.js
try {
  const pkgPath = require.resolve('playwright-core/package.json');
  const cliPath = path.join(path.dirname(pkgPath), 'cli.js');
  console.log('[방법1] cli.js:', cliPath);
  console.log('[방법1] exists:', fs.existsSync(cliPath));

  if (fs.existsSync(cliPath)) {
    console.log('[방법1] 설치 실행 중...');
    const out = execSync(`node "${cliPath}" install chromium`, {
      stdio: 'pipe',
      timeout: 120000,
      env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: '0' },
    });
    console.log('[방법1] SUCCESS:', out.toString().trim().substring(0, 300));
    process.exit(0);
  }
} catch (e) {
  console.log('[방법1] FAILED:', e.message.substring(0, 200));
}

// 방법 2: playwright/package.json → cli.js
try {
  const pkgPath = require.resolve('playwright/package.json');
  const cliPath = path.join(path.dirname(pkgPath), 'cli.js');
  console.log('[방법2] cli.js:', cliPath);
  console.log('[방법2] exists:', fs.existsSync(cliPath));

  if (fs.existsSync(cliPath)) {
    console.log('[방법2] 설치 실행 중...');
    const out = execSync(`node "${cliPath}" install chromium`, {
      stdio: 'pipe',
      timeout: 120000,
      env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: '0' },
    });
    console.log('[방법2] SUCCESS:', out.toString().trim().substring(0, 300));
    process.exit(0);
  }
} catch (e) {
  console.log('[방법2] FAILED:', e.message.substring(0, 200));
}

console.log('모든 방법 실패');
