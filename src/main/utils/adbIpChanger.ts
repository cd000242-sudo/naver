// ============================================
// ADB 비행기모드 IP 변경 유틸리티
// USB 테더링 + ADB를 통한 IP 자동 변경
// ✅ [2026-03-11] ADB 미설치 시 자동 다운로드 지원
// ============================================

import { exec } from 'child_process';
import { promisify } from 'util';
import https from 'https';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';

const execAsync = promisify(exec);

// ✅ ADB 다운로드 URL (Google 공식 Android Platform Tools)
const ADB_DOWNLOAD_URL = 'https://dl.google.com/android/repository/platform-tools-latest-windows.zip';

/**
 * 로컬에 다운로드된 ADB 경로 반환 (userData/platform-tools/adb.exe)
 */
function getLocalAdbDir(): string {
  return path.join(app.getPath('userData'), 'platform-tools');
}

function getLocalAdbPath(): string {
  return path.join(getLocalAdbDir(), 'adb.exe');
}

/**
 * ADB 실행 경로 결정: 시스템 PATH → 로컬 다운로드
 */
async function resolveAdbPath(): Promise<string> {
  // 1. 시스템 PATH에 adb가 있으면 그대로 사용
  try {
    await execAsync('adb version', { timeout: 5000 });
    return 'adb';
  } catch {
    // PATH에 없음
  }

  // 2. 로컬 다운로드된 adb.exe 확인
  const localAdb = getLocalAdbPath();
  if (fs.existsSync(localAdb)) {
    return `"${localAdb}"`;
  }

  // 3. 아직 다운로드 안 됨 → 빈 문자열 (caller가 다운로드 트리거)
  return '';
}

/**
 * ADB Platform Tools 자동 다운로드 및 압축 해제
 * @returns 성공 시 adb 실행 경로, 실패 시 에러
 */
export async function downloadAdb(
  onProgress?: (percent: number, message: string) => void
): Promise<{ success: boolean; adbPath?: string; message: string }> {
  const targetDir = getLocalAdbDir();
  const zipPath = path.join(app.getPath('userData'), 'platform-tools.zip');

  try {
    onProgress?.(0, 'ADB 다운로드 시작...');
    console.log(`[ADB Download] 다운로드 시작: ${ADB_DOWNLOAD_URL}`);

    // 1. ZIP 파일 다운로드 (리다이렉트 처리 포함)
    await new Promise<void>((resolve, reject) => {
      const downloadWithRedirect = (url: string, redirectCount = 0) => {
        if (redirectCount > 5) {
          reject(new Error('너무 많은 리다이렉트'));
          return;
        }

        const protocol = url.startsWith('https') ? https : http;
        const req = protocol.get(url, (res) => {
          // 리다이렉트 처리
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            downloadWithRedirect(res.headers.location, redirectCount + 1);
            return;
          }

          if (res.statusCode !== 200) {
            reject(new Error(`다운로드 실패: HTTP ${res.statusCode}`));
            return;
          }

          const totalSize = parseInt(res.headers['content-length'] || '0', 10);
          let downloaded = 0;
          const fileStream = fs.createWriteStream(zipPath);

          res.on('data', (chunk: Buffer) => {
            downloaded += chunk.length;
            if (totalSize > 0) {
              const pct = Math.round((downloaded / totalSize) * 80); // 80%까지 다운로드
              onProgress?.(pct, `다운로드 중... ${Math.round(downloaded / 1024 / 1024)}MB`);
            }
          });

          res.pipe(fileStream);
          fileStream.on('finish', () => { fileStream.close(); resolve(); });
          fileStream.on('error', reject);
        });

        req.on('error', reject);
        req.setTimeout(60000, () => { req.destroy(); reject(new Error('다운로드 타임아웃 (60초)')); });
      };

      downloadWithRedirect(ADB_DOWNLOAD_URL);
    });

    onProgress?.(80, 'ZIP 압축 해제 중...');

    // 2. 기존 폴더 삭제 (adb.exe 잠금 방지를 위해 프로세스 먼저 종료)
    if (fs.existsSync(targetDir)) {
      // ADB 서버 종료 시도 (adb.exe 잠금 해제)
      try {
        const localAdb = getLocalAdbPath();
        if (fs.existsSync(localAdb)) {
          await execAsync(`"${localAdb}" kill-server`, { timeout: 5000 });
        }
      } catch { /* 무시 — adb가 없거나 실행 불가 */ }

      // Windows: taskkill로 adb.exe 강제 종료
      try {
        await execAsync('taskkill /F /IM adb.exe', { timeout: 5000 });
      } catch { /* adb.exe 프로세스가 없으면 무시 */ }

      // 잠금 해제 대기
      await new Promise(r => setTimeout(r, 1000));

      // 삭제 시도 (재시도 포함)
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          fs.rmSync(targetDir, { recursive: true, force: true });
          break;
        } catch (rmErr) {
          if (attempt < 2) {
            console.warn(`[ADB Download] 폴더 삭제 재시도 ${attempt + 1}/3...`);
            await new Promise(r => setTimeout(r, 2000));
          } else {
            throw new Error(`기존 ADB 폴더 삭제 실패 (adb.exe가 사용 중). 앱을 재시작 후 다시 시도해주세요: ${(rmErr as Error).message}`);
          }
        }
      }
    }

    // 3. ZIP 해제 (PowerShell 사용)
    await execAsync(
      `powershell -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${app.getPath('userData')}' -Force"`,
      { timeout: 60000 }
    );

    onProgress?.(95, 'ADB 설치 확인 중...');

    // 4. 설치 확인
    const adbExe = getLocalAdbPath();
    if (!fs.existsSync(adbExe)) {
      throw new Error('ZIP 해제 후 adb.exe를 찾을 수 없습니다.');
    }

    // 5. ZIP 삭제
    try { fs.unlinkSync(zipPath); } catch { /* 무시 */ }

    // 6. 버전 확인
    const { stdout } = await execAsync(`"${adbExe}" version`, { timeout: 10000 });
    const versionMatch = stdout.match(/Android Debug Bridge version ([\d.]+)/);
    const version = versionMatch ? versionMatch[1] : 'unknown';

    onProgress?.(100, `ADB ${version} 설치 완료!`);
    console.log(`[ADB Download] 설치 완료: ${adbExe} (v${version})`);

    return {
      success: true,
      adbPath: adbExe,
      message: `ADB ${version} 자동 설치 완료!`,
    };
  } catch (error) {
    const errMsg = (error as Error).message || '알 수 없는 오류';
    console.error('[ADB Download] 다운로드 실패:', errMsg);

    // 실패 시 ZIP 정리
    try { fs.unlinkSync(zipPath); } catch { /* 무시 */ }

    return {
      success: false,
      message: `ADB 다운로드 실패: ${errMsg}`,
    };
  }
}

/**
 * ADB 실행 래퍼 (시스템 PATH 또는 로컬 다운로드 adb 자동 선택)
 */
async function runAdb(args: string, timeout = 10000): Promise<string> {
  const adbPath = await resolveAdbPath();
  
  if (!adbPath) {
    throw new Error('ADB_NOT_INSTALLED');
  }

  const { stdout } = await execAsync(`${adbPath} ${args}`, { timeout });
  return stdout;
}

/**
 * ADB 연결된 디바이스 확인
 */
export async function checkAdbDevice(): Promise<{
  connected: boolean;
  deviceId?: string;
  message: string;
  needsDownload?: boolean;
}> {
  try {
    const stdout = await runAdb('devices');
    const lines = stdout.trim().split('\n').filter(line => line.includes('\tdevice'));
    
    if (lines.length === 0) {
      return {
        connected: false,
        message: 'ADB 디바이스가 연결되어 있지 않습니다. USB 디버깅을 확인해주세요.',
      };
    }
    
    const deviceId = lines[0].split('\t')[0].trim();
    return {
      connected: true,
      deviceId,
      message: `ADB 디바이스 연결됨: ${deviceId}`,
    };
  } catch (error) {
    const errMsg = (error as Error).message || '';
    
    // ADB가 설치되어 있지 않은 경우 → 자동 다운로드 안내
    if (errMsg === 'ADB_NOT_INSTALLED' || errMsg.includes('not recognized') || errMsg.includes('not found') || errMsg.includes('ENOENT')) {
      return {
        connected: false,
        needsDownload: true,
        message: 'ADB가 설치되어 있지 않습니다. "ADB 설치" 버튼을 클릭하세요.',
      };
    }
    
    return {
      connected: false,
      message: `ADB 확인 실패: ${errMsg.substring(0, 100)}`,
    };
  }
}

/**
 * ✅ [2026-04-10] 멀티 엔드포인트 IP 조회 — 단일 엔드포인트 장애 내성
 * 4개 IP 체크 서비스를 순차 시도. 첫 번째 유효한 IPv4 응답 채택.
 */
const IP_CHECK_ENDPOINTS = [
  'https://api.ipify.org',
  'https://icanhazip.com',
  'https://ifconfig.me/ip',
  'https://checkip.amazonaws.com',
];

const IPV4_REGEX = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

/**
 * 단일 URL에서 IP 텍스트 가져오기 (실패 시 빈 문자열)
 */
async function fetchIpFromUrl(url: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve) => {
    let resolved = false;
    const finish = (val: string) => {
      if (!resolved) { resolved = true; resolve(val); }
    };
    const protocol = url.startsWith('https') ? https : http;
    const req = protocol.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => finish(data.trim()));
    });
    req.on('error', () => finish(''));
    req.setTimeout(timeoutMs, () => { try { req.destroy(); } catch { /* 무시 */ } finish(''); });
  });
}

/**
 * 현재 공인 IP 조회 (멀티 엔드포인트 폴백 + IPv4 검증)
 */
export async function getCurrentIp(): Promise<string> {
  for (const url of IP_CHECK_ENDPOINTS) {
    const ip = await fetchIpFromUrl(url, 5000);
    if (IPV4_REGEX.test(ip)) {
      return ip;
    }
  }
  return 'unknown';
}

/**
 * ✅ [2026-04-10] 네이버 실제 도달성 확인
 * IP 조회 성공 ≠ 발행 가능. 진짜로 naver.com에 HTTPS 접속이 되는지 확인.
 */
async function verifyNaverReachable(): Promise<boolean> {
  return new Promise((resolve) => {
    let resolved = false;
    const finish = (ok: boolean) => {
      if (!resolved) { resolved = true; resolve(ok); }
    };
    const req = https.get('https://www.naver.com', (res) => {
      // 200~399면 도달 OK
      finish(res.statusCode !== undefined && res.statusCode < 400);
      res.resume(); // 데이터 소비 (소켓 해제)
    });
    req.on('error', () => finish(false));
    req.setTimeout(8000, () => { try { req.destroy(); } catch { /* 무시 */ } finish(false); });
  });
}

/**
 * ✅ [2026-03-11 FIX] 비행기모드 토글 — Android 버전별 3단계 폴백
 * 
 * Android 7+ (API 24+)에서는 am broadcast AIRPLANE_MODE가 보호된 브로드캐스트로 차단됨.
 * 해결: 3가지 방식 순차 시도
 *   1단계: cmd connectivity airplane-mode (Android 11+, API 30+) — 가장 안정적
 *   2단계: settings put + svc data/wifi 토글 (Android 7-10) — 네트워크 끊고 재연결
 *   3단계: settings put + am broadcast (레거시 Android 6 이하) — 기존 방식
 */
async function toggleAirplaneMode(state: boolean): Promise<void> {
  const onOff = state ? 'enable' : 'disable';
  const value = state ? '1' : '0';
  const boolStr = state ? 'true' : 'false';
  
  // 1단계: cmd connectivity (Android 11+) — 가장 안정적
  try {
    await runAdb(`shell cmd connectivity airplane-mode ${onOff}`, 10000);
    console.log(`[ADB IP] ✅ cmd connectivity airplane-mode ${onOff} 성공 (Android 11+)`);
    return;
  } catch (e1) {
    console.log(`[ADB IP] cmd connectivity 실패, 2단계 시도... (${(e1 as Error).message?.substring(0, 60)})`);
  }
  
  // 2단계: settings put + svc data/wifi 토글 (Android 7-10)
  try {
    await runAdb(`shell settings put global airplane_mode_on ${value}`, 10000);
    
    if (state) {
      // 비행기모드 ON: 모바일 데이터 & WiFi 끄기
      try { await runAdb('shell svc data disable', 5000); } catch { /* 무시 */ }
      try { await runAdb('shell svc wifi disable', 5000); } catch { /* 무시 */ }
    } else {
      // 비행기모드 OFF: 모바일 데이터 & WiFi 켜기
      try { await runAdb('shell svc data enable', 5000); } catch { /* 무시 */ }
      try { await runAdb('shell svc wifi enable', 5000); } catch { /* 무시 */ }
    }
    
    console.log(`[ADB IP] ✅ settings put + svc 토글 성공 (airplane_mode_on=${value})`);
    return;
  } catch (e2) {
    console.log(`[ADB IP] svc 토글 실패, 3단계 시도... (${(e2 as Error).message?.substring(0, 60)})`);
  }
  
  // 3단계: 레거시 — settings put + am broadcast (Android 6 이하)
  await runAdb(`shell settings put global airplane_mode_on ${value}`, 10000);
  try {
    await runAdb(`shell am broadcast -a android.intent.action.AIRPLANE_MODE --ez state ${boolStr}`, 10000);
    console.log(`[ADB IP] ✅ am broadcast 성공 (레거시)`);
  } catch (e3) {
    // am broadcast 실패해도 settings put은 적용됨 — 계속 진행
    console.warn(`[ADB IP] ⚠️ am broadcast 실패 (무시): ${(e3 as Error).message?.substring(0, 60)}`);
  }
}

/**
 * ✅ [2026-04-10] 모바일 데이터 토글 — PDN 세션만 끊었다 재생성
 * 비행기모드보다 빠르고 통화/문자 끊김 없음. 대부분의 통신사에서 새 IP 부여.
 */
async function toggleMobileData(): Promise<void> {
  await runAdb('shell svc data disable', 5000);
  await new Promise(resolve => setTimeout(resolve, 3000)); // PDN 해제
  await runAdb('shell svc data enable', 5000);
  console.log('[ADB IP] ✅ 모바일 데이터 토글 완료');
}

/**
 * 비행기모드 풀 사이클 — 강한 리셋 (라디오 재접속)
 */
async function fullAirplaneCycle(waitSeconds: number): Promise<void> {
  await toggleAirplaneMode(true);
  const safeWait = Math.max(3, Math.min(30, waitSeconds));
  console.log(`[ADB IP] ${safeWait}초 대기...`);
  await new Promise(resolve => setTimeout(resolve, safeWait * 1000));
  await toggleAirplaneMode(false);
}

/**
 * ✅ [2026-04-10] IP 변경 적극 검증 — 폴링으로 새 IP 잡힐 때까지 대기
 *
 * 단순 한 번 조회는 네트워크가 아직 안 붙은 시점일 수 있어 신뢰 불가.
 * 2초마다 폴링하여 (a) IP가 oldIp와 다르고 unknown이 아닌 값이 잡히거나
 * (b) maxSeconds 초과까지 대기.
 *
 * @returns 변경된 IP 또는 마지막 조회값 (실패 판정은 caller가)
 */
async function waitForIpChange(oldIp: string, maxSeconds: number): Promise<string> {
  const startMs = Date.now();
  let lastIp = 'unknown';

  while ((Date.now() - startMs) / 1000 < maxSeconds) {
    lastIp = await getCurrentIp();
    if (lastIp !== 'unknown' && lastIp !== oldIp) {
      const elapsed = Math.round((Date.now() - startMs) / 1000);
      console.log(`[ADB IP] ✅ IP 변경 확인됨 (${elapsed}초 경과): ${lastIp}`);
      return lastIp;
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  console.log(`[ADB IP] ⏱️ ${maxSeconds}초 폴링 종료 — 마지막 IP: ${lastIp}`);
  return lastIp;
}

/**
 * 모바일 IP 로테이션 — 100% 신뢰성 추구
 *
 * ✅ [2026-04-10 REFACTOR v3] 점진적 강화 재시도 (최대 4회)
 *
 *   시도 1: 데이터 토글 (빠름, 보통 성공)
 *   시도 2: 비행기모드 5s 대기
 *   시도 3: 비행기모드 8s 대기 (라디오 더 깊게 끊기)
 *   시도 4: 비행기모드 12s 대기 + 데이터 강제 재토글
 *
 *   각 시도마다:
 *     A. 폴링으로 IP 변경 검증 (최대 15~25초)
 *     B. naver.com 실제 도달성 검증 (실패 시 5초 대기 후 재확인)
 *     C. 둘 다 통과해야 성공 → 즉시 리턴
 *
 * 핵심 보장: success: true ⇒ IP 바뀜 + 네이버 발행 가능 상태
 *
 * 함수명은 IPC/하위 호환 위해 유지.
 *
 * @param waitSeconds 비행기모드 기본 대기 시간 (시도별로 점진적 증가)
 */
export async function changeIpViaAirplaneMode(waitSeconds: number = 5): Promise<{
  success: boolean;
  oldIp?: string;
  newIp?: string;
  message: string;
}> {
  const MAX_ATTEMPTS = 4;
  let oldIp = 'unknown';
  let newIp = 'unknown';
  let lastMethod = '';
  const attemptLog: string[] = [];

  try {
    // 디바이스 확인
    const deviceCheck = await checkAdbDevice();
    if (!deviceCheck.connected) {
      return { success: false, message: deviceCheck.message };
    }

    oldIp = await getCurrentIp();
    console.log(`[ADB IP] ━━━━━━ IP 로테이션 시작 ━━━━━━`);
    console.log(`[ADB IP] 시작 IP: ${oldIp}`);

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      console.log(`[ADB IP] ━━━ 시도 ${attempt}/${MAX_ATTEMPTS} ━━━`);

      // === 1. IP 변경 액션 ===
      try {
        if (attempt === 1) {
          lastMethod = '데이터 토글';
          console.log('[ADB IP] 모바일 데이터 토글 (빠른 경로)...');
          await toggleMobileData();
          newIp = await waitForIpChange(oldIp, 12);
        } else {
          // 점진적 대기 증가: 5s → 8s → 12s
          const wait = waitSeconds + (attempt - 2) * 3 + (attempt === MAX_ATTEMPTS ? 1 : 0);
          lastMethod = `비행기모드 ${wait}s`;
          console.log(`[ADB IP] 비행기모드 풀 사이클 (${wait}s 대기)...`);
          await fullAirplaneCycle(wait);

          // 마지막 시도: 비행기모드 후 데이터까지 한 번 더 토글 (PDN 강제 재생성)
          if (attempt === MAX_ATTEMPTS) {
            console.log('[ADB IP] 최종 시도 — 데이터 재토글로 PDN 강제 갱신...');
            try { await toggleMobileData(); } catch { /* 무시 */ }
          }

          newIp = await waitForIpChange(oldIp, 20 + attempt * 3);
        }
      } catch (cycleErr) {
        const msg = (cycleErr as Error).message?.substring(0, 60) || 'unknown';
        console.warn(`[ADB IP] 시도 ${attempt} 사이클 오류: ${msg}`);
        attemptLog.push(`시도${attempt}(${lastMethod}): 사이클 오류`);
        // 안전 복구 후 다음 시도
        try { await toggleAirplaneMode(false); } catch { /* 무시 */ }
        try { await runAdb('shell svc data enable', 5000); } catch { /* 무시 */ }
        continue;
      }

      // === 2. IP 변경 확인 ===
      if (newIp === 'unknown' || newIp === oldIp) {
        attemptLog.push(`시도${attempt}(${lastMethod}): IP 미변경(${newIp})`);
        console.log(`[ADB IP] ⚠️ IP 미변경 (${newIp}) — 다음 시도로`);
        continue;
      }

      // === 3. 네이버 실제 도달성 확인 ===
      console.log('[ADB IP] 네이버 도달성 확인 중...');
      let reachable = await verifyNaverReachable();
      if (!reachable) {
        console.log('[ADB IP] ⏳ 네이버 도달 실패 — 5초 추가 대기 후 재시도...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        reachable = await verifyNaverReachable();
      }

      if (!reachable) {
        attemptLog.push(`시도${attempt}(${lastMethod}): IP변경(${newIp})OK·naver도달X`);
        console.log('[ADB IP] ⚠️ 네이버 도달 불가 — 다음 시도로');
        continue;
      }

      // === 4. ✅ 성공 — 즉시 리턴 ===
      console.log(`[ADB IP] 🎉 성공 (시도 ${attempt}/${MAX_ATTEMPTS}): ${oldIp} → ${newIp}`);
      console.log(`[ADB IP] ━━━━━━━━━━━━━━━━━━━━━━━━`);
      return {
        success: true,
        oldIp,
        newIp,
        message: `IP 변경 성공: ${oldIp} → ${newIp} [${lastMethod}, ${attempt}/${MAX_ATTEMPTS}]`,
      };
    }

    // === 모든 시도 실패 ===
    console.error(`[ADB IP] ❌ ${MAX_ATTEMPTS}회 모두 실패`);
    console.error(`[ADB IP] 로그: ${attemptLog.join(' | ')}`);

    // 마지막 안전 복구
    try { await toggleAirplaneMode(false); } catch { /* 무시 */ }
    try { await runAdb('shell svc data enable', 5000); } catch { /* 무시 */ }

    return {
      success: false,
      oldIp,
      newIp,
      message: `IP 변경 실패 (${MAX_ATTEMPTS}회 시도): ${attemptLog.join(' | ').substring(0, 250)}`,
    };
  } catch (error) {
    const errMsg = (error as Error).message || '알 수 없는 오류';
    console.error('[ADB IP] 치명적 오류:', errMsg);

    // 안전 복구: 비행기모드 OFF + 데이터 ON 보장
    try { await toggleAirplaneMode(false); } catch { /* 무시 */ }
    try { await runAdb('shell svc data enable', 5000); } catch { /* 무시 */ }

    return {
      success: false,
      oldIp,
      newIp,
      message: `IP 변경 실패: ${errMsg.substring(0, 100)}`,
    };
  }
}
