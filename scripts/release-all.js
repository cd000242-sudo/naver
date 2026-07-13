#!/usr/bin/env node

/**
 * ✅ [2026-03-18] 릴리즈 통합 오케스트레이터 v1.0
 * 
 * 기존 문제: `npm run release:full`이 && 체인으로 6개 명령을 연결하여
 * cmd.exe 환경에서 에러 전파, 출력 인코딩, 프로세스 격리 문제로 매번 실패.
 * 
 * 해결: 단일 Node.js 프로세스에서 모든 단계를 순차 실행하며
 * - 각 단계의 stdout/stderr를 Buffer로 완전 캡처 (인코딩 무관)
 * - 실패 시 정확한 단계, 에러 메시지, stderr 리포트
 * - 어디서 실패하든 restore-after-pack.js 자동 호출 (finally 패턴)
 * - 실패 로그를 release_final/release-error.log에 보존
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const RELEASE_DIR = path.join(ROOT, 'release_final');

// ─── 유틸리티 ──────────────────────────────────────────────

const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

function banner(text) {
  console.log(`\n${BOLD}${CYAN}${'═'.repeat(60)}${RESET}`);
  console.log(`${BOLD}${CYAN}  ${text}${RESET}`);
  console.log(`${BOLD}${CYAN}${'═'.repeat(60)}${RESET}`);
}

function stepHeader(num, total, name) {
  console.log(`\n${BOLD}[${num}/${total}] ${name}${RESET}`);
  console.log(`${DIM}${'─'.repeat(50)}${RESET}`);
}

function success(msg) { console.log(`  ${GREEN}✅ ${msg}${RESET}`); }
function warn(msg)    { console.log(`  ${YELLOW}⚠️  ${msg}${RESET}`); }
function fail(msg)    { console.log(`  ${RED}❌ ${msg}${RESET}`); }
function info(msg)    { console.log(`  ${DIM}${msg}${RESET}`); }

/**
 * 명령 실행 + 전체 출력 캡처
 * @returns {{ exitCode: number, stdout: string, stderr: string, duration: number }}
 */
function runStep(command, options = {}) {
  const start = Date.now();
  const opts = {
    cwd: ROOT,
    encoding: 'buffer', // ✅ Buffer로 받아 인코딩 문제 회피
    maxBuffer: 100 * 1024 * 1024, // 100MB (electron-builder 출력이 큼)
    timeout: options.timeout || 600000, // 기본 10분
    windowsHide: true,
    ...options,
  };

  try {
    const result = execSync(command, { ...opts, stdio: 'pipe' });
    const duration = Date.now() - start;
    const stdout = result ? result.toString('utf-8') : '';
    return { exitCode: 0, stdout, stderr: '', duration };
  } catch (err) {
    const duration = Date.now() - start;
    const stdout = err.stdout ? err.stdout.toString('utf-8') : '';
    const stderr = err.stderr ? err.stderr.toString('utf-8') : '';
    return { exitCode: err.status || 1, stdout, stderr, duration };
  }
}

/**
 * 단계 실행 + 결과 리포트
 * @param {string} name 단계 이름
 * @param {string} command 실행할 명령
 * @param {object} options { critical, timeout, showOutput }
 * @returns {boolean} 성공 여부
 */
function executeStep(stepNum, totalSteps, name, command, options = {}) {
  const { critical = true, timeout = 600000, showOutput = false } = options;

  stepHeader(stepNum, totalSteps, name);
  info(`> ${command}`);

  const result = runStep(command, { timeout });
  const durSec = (result.duration / 1000).toFixed(1);

  if (result.exitCode === 0) {
    success(`완료 (${durSec}s)`);
    if (showOutput && result.stdout.trim()) {
      // 마지막 5줄만 표시
      const lines = result.stdout.trim().split('\n');
      const tail = lines.slice(-5).join('\n');
      info(tail);
    }
    return true;
  }

  // ─── 실패 처리 ───
  const label = critical ? '🔴 CRITICAL' : '🟡 WARNING';
  fail(`${label} — exit code ${result.exitCode} (${durSec}s)`);

  // stderr 출력 (에러 진단의 핵심)
  if (result.stderr.trim()) {
    console.log(`\n  ${RED}── stderr ──────────────────────────${RESET}`);
    const stderrLines = result.stderr.trim().split('\n').slice(-20);
    stderrLines.forEach(l => console.log(`  ${RED}${l}${RESET}`));
    console.log(`  ${RED}────────────────────────────────────${RESET}`);
  }

  // stdout에서 에러 패턴 검색
  if (result.stdout.trim()) {
    const errorPatterns = ['Error #', 'ERR!', 'FATAL', 'Cannot find', 'ENOENT', 'EPERM', 'promise.ts'];
    const stdoutLines = result.stdout.trim().split('\n');
    const errorLines = stdoutLines.filter(l => errorPatterns.some(p => l.includes(p)));
    if (errorLines.length > 0) {
      console.log(`\n  ${RED}── stdout 에러 패턴 ────────────────${RESET}`);
      errorLines.slice(-10).forEach(l => console.log(`  ${RED}${l}${RESET}`));
      console.log(`  ${RED}────────────────────────────────────${RESET}`);
    }
  }

  // 에러 로그 파일 저장
  saveErrorLog(name, command, result);

  if (critical) {
    return false; // 호출자가 중단 결정
  }
  warn('비핵심 단계 — 계속 진행');
  return true; // 비핵심이면 계속
}

/**
 * 실패 로그를 파일로 저장
 */
function saveErrorLog(stepName, command, result) {
  try {
    if (!fs.existsSync(RELEASE_DIR)) fs.mkdirSync(RELEASE_DIR, { recursive: true });

    const logPath = path.join(RELEASE_DIR, 'release-error.log');
    const timestamp = new Date().toISOString();
    const content = [
      `═══ Release Error Log ═══`,
      `Timestamp: ${timestamp}`,
      `Step: ${stepName}`,
      `Command: ${command}`,
      `Exit Code: ${result.exitCode}`,
      `Duration: ${(result.duration / 1000).toFixed(1)}s`,
      ``,
      `── STDERR ──`,
      result.stderr || '(empty)',
      ``,
      `── STDOUT (last 50 lines) ──`,
      (result.stdout || '(empty)').split('\n').slice(-50).join('\n'),
      ``,
    ].join('\n');

    fs.writeFileSync(logPath, content, 'utf-8');
    info(`에러 로그 저장됨: ${logPath}`);
  } catch { /* 로그 저장 실패는 무시 */ }
}

/**
 * Fresh-fetch the GitHub release and check that auto-update artifacts exist.
 * Uses anonymous API (no token required for public releases on this repo).
 * Required: latest.yml (electron-updater entrypoint) + the installer .exe.
 * Optional but recommended: .exe.blockmap (enables differential download).
 */
function verifyReleaseAssets(version) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.github.com',
      path: `/repos/cd000242-sudo/naver/releases/tags/v${version}`,
      method: 'GET',
      headers: {
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'BetterLifeNaver-ReleaseVerifier',
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          return reject(new Error(`GitHub API ${res.statusCode}: ${data.substring(0, 200)}`));
        }
        try {
          const release = JSON.parse(data);
          const names = (release.assets || []).map(a => a.name);
          const exeName = `Better-Life-Naver-Setup-${version}.exe`;
          const required = ['latest.yml', exeName];
          const missing = required.filter(r => !names.includes(r));
          resolve({ ok: missing.length === 0, assets: names, missing });
        } catch (e) {
          reject(new Error(`응답 파싱 실패: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('timeout (15s)')));
    req.end();
  });
}

function verifyLatestReleasePointer(version) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.github.com',
      path: '/repos/cd000242-sudo/naver/releases/latest',
      method: 'GET',
      headers: {
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'BetterLifeNaver-ReleaseVerifier',
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          return reject(new Error(`GitHub latest API ${res.statusCode}: ${data.substring(0, 200)}`));
        }
        try {
          const release = JSON.parse(data);
          resolve({ ok: release.tag_name === `v${version}`, tagName: release.tag_name });
        } catch (e) {
          reject(new Error(`latest 응답 파싱 실패: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('timeout (15s)')));
    req.end();
  });
}

// ─── 메인 오케스트레이션 ────────────────────────────────────

async function main() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
  const VERSION = pkg.version;

  banner(`Better Life Naver v${VERSION} — 릴리즈 파이프라인`);
  console.log(`  ${DIM}시작: ${new Date().toLocaleString('ko-KR')}${RESET}`);

  const totalSteps = 8;
  let needsRestore = false; // reset-config-for-pack 이후 true → 실패 시 자동 복구
  let allSuccess = true;
  const startTime = Date.now();

  try {
    // ═══ Step 1: 회귀 방지 게이트 (lint + full tests + build) ═══
    if (!executeStep(1, totalSteps, '회귀 방지 게이트 (lint + tests + build)', 'node scripts/release-gate.js', {
      timeout: 900000,
      showOutput: true,
    })) {
      fail('회귀 방지 게이트 실패 — 릴리즈 중단');
      allSuccess = false;
      return;
    }

    // ═══ Step 2: 민감정보 제거 ═══
    if (!executeStep(2, totalSteps, '민감정보 제거', 'node scripts/reset-config-for-pack.js', { showOutput: true })) {
      fail('민감정보 제거 실패 — 릴리즈 중단');
      allSuccess = false;
      return;
    }
    needsRestore = true; // ✅ 이 시점부터 실패 시 반드시 복구 필요

    // ═══ Step 3: Electron Builder (Setup.exe 생성) ═══
    // ✅ --config.win.target=nsis로 명시적 단일 타겟 지정
    if (!executeStep(3, totalSteps, 'Electron Builder (Setup.exe)', 'npx electron-builder --win --config.win.target=nsis', {
      timeout: 600000, // 10분
    })) {
      fail('Electron Builder 실패 — 릴리즈 중단');
      allSuccess = false;
      return;
    }

    // ═══ Step 4: 패키지 앱 클린 프로필 스모크 ═══
    if (!executeStep(4, totalSteps, '패키지 앱 클린 프로필 스모크', 'node scripts/packaged-app-smoke.mjs', {
      timeout: 180000,
      showOutput: true,
    })) {
      fail('패키지 앱 스모크 실패 — 릴리즈 중단');
      allSuccess = false;
      return;
    }

    // ═══ Step 5: 민감정보 복원 ═══
    if (!executeStep(5, totalSteps, '민감정보 복원', 'node scripts/restore-after-pack.js', { showOutput: true })) {
      // 복원 실패는 WARNING (수동 복원 가능)
      warn('복원 실패 — git checkout src/renderer/renderer.ts 로 수동 복원하세요');
      // 복원은 이미 시도했으므로 needsRestore = false
    }
    needsRestore = false; // 복원 완료 (또는 시도 완료)

    // ═══ Step 6: latest.yml SHA512 동기화 ═══
    if (!executeStep(6, totalSteps, 'latest.yml SHA512 동기화', 'node scripts/fix-latest-yml.js', { showOutput: true })) {
      fail('latest.yml 생성 실패 — 릴리즈 중단');
      allSuccess = false;
      return;
    }

    // ═══ Step 7: GitHub 릴리즈 업로드 ═══
    if (!executeStep(7, totalSteps, 'GitHub 릴리즈 업로드', 'node scripts/upload-release.js', {
      timeout: 600000, // 10분 (385MB 업로드)
      showOutput: true,
    })) {
      fail('GitHub 업로드 실패');
      allSuccess = false;
      return;
    }

    // ═══ Step 8: GitHub fresh-fetch 검증 (auto-update 안전망) ═══
    // upload-release.js의 verify가 이미 자체 검증하지만, 별도 fresh-fetch로
    // 부분 업로드 / 파이프라인 우회 케이스를 한 번 더 차단한다.
    stepHeader(8, totalSteps, 'GitHub 자산 fresh-fetch 검증');
    try {
      const verifyResult = await verifyReleaseAssets(VERSION);
      if (verifyResult.ok) {
        success(`자산 검증 통과: ${verifyResult.assets.join(', ')}`);
      } else {
        fail(`자산 누락 — auto-update 동작 불가: ${verifyResult.missing.join(', ')}`);
        info('수동 복구: gh release upload v' + VERSION + ' release_final/latest.yml --repo cd000242-sudo/naver');
        allSuccess = false;
      }

      const latestResult = await verifyLatestReleasePointer(VERSION);
      if (latestResult.ok) {
        success(`Latest 포인터 검증 통과: ${latestResult.tagName}`);
      } else {
        fail(`Latest 포인터 불일치: expected v${VERSION}, actual ${latestResult.tagName}`);
        allSuccess = false;
      }
    } catch (e) {
      fail(`fresh-fetch 검증 실패 (네트워크?): ${e.message}`);
      warn('GitHub 응답 지연 가능 — 수동으로 release 페이지 확인 필요');
      // 네트워크 실패는 warning만, allSuccess 유지
    }

  } catch (unexpectedErr) {
    fail(`예상치 못한 오류: ${unexpectedErr.message}`);
    allSuccess = false;
  } finally {
    // ✅ 어디서 실패하든 민감정보 복원 보장
    if (needsRestore) {
      console.log(`\n${YELLOW}⚠️  민감정보 자동 복구 중...${RESET}`);
      try {
        execSync('node scripts/restore-after-pack.js', { cwd: ROOT, stdio: 'pipe' });
        success('민감정보 자동 복구 완료');
      } catch {
        fail('자동 복구 실패 — git checkout src/renderer/renderer.ts 로 수동 복원하세요');
      }
    }
  }

  // ─── 최종 리포트 ───
  const totalDur = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

  if (allSuccess) {
    banner(`🎉 v${VERSION} 릴리즈 성공! (${totalDur}분)`);
    console.log(`  📎 https://github.com/cd000242-sudo/naver/releases/tag/v${VERSION}\n`);
    process.exit(0);
  } else {
    banner(`❌ v${VERSION} 릴리즈 실패 (${totalDur}분)`);
    const errorLogPath = path.join(RELEASE_DIR, 'release-error.log');
    if (fs.existsSync(errorLogPath)) {
      console.log(`  📋 에러 로그: ${errorLogPath}`);
    }
    console.log(`  💡 위의 에러 메시지를 확인하세요.\n`);
    process.exit(1);
  }
}

main();
