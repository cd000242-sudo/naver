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

    // 2. 기존 폴더 삭제
    if (fs.existsSync(targetDir)) {
      fs.rmSync(targetDir, { recursive: true, force: true });
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
 * 현재 공인 IP 조회 (ipify API)
 */
export async function getCurrentIp(): Promise<string> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve('unknown'), 8000);
    
    // https 먼저 시도
    const req = https.get('https://api.ipify.org', (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        clearTimeout(timeout);
        resolve(data.trim() || 'unknown');
      });
    });
    
    req.on('error', () => {
      // http 폴백
      const req2 = http.get('http://api.ipify.org', (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          clearTimeout(timeout);
          resolve(data.trim() || 'unknown');
        });
      });
      req2.on('error', () => {
        clearTimeout(timeout);
        resolve('unknown');
      });
      req2.setTimeout(5000, () => { req2.destroy(); });
    });
    
    req.setTimeout(5000, () => { req.destroy(); });
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
 * ADB 비행기모드 ON/OFF로 IP 변경
 * ✅ [2026-03-11 FIX] Android 버전별 3단계 폴백으로 호환성 극대화
 * @param waitSeconds 비행기모드 ON 후 대기 시간 (기본 5초)
 */
export async function changeIpViaAirplaneMode(waitSeconds: number = 5): Promise<{
  success: boolean;
  oldIp?: string;
  newIp?: string;
  message: string;
}> {
  try {
    // 1. 디바이스 확인
    const deviceCheck = await checkAdbDevice();
    if (!deviceCheck.connected) {
      return { success: false, message: deviceCheck.message };
    }
    
    // 2. 현재 IP 확인
    const oldIp = await getCurrentIp();
    console.log(`[ADB IP] 현재 IP: ${oldIp}`);
    
    // 3. 비행기모드 ON (3단계 폴백)
    console.log('[ADB IP] 비행기모드 ON...');
    await toggleAirplaneMode(true);
    
    // 4. 대기
    const safeWait = Math.max(3, Math.min(30, waitSeconds));
    console.log(`[ADB IP] ${safeWait}초 대기...`);
    await new Promise(resolve => setTimeout(resolve, safeWait * 1000));
    
    // 5. 비행기모드 OFF (3단계 폴백)
    console.log('[ADB IP] 비행기모드 OFF...');
    await toggleAirplaneMode(false);
    
    // 6. 네트워크 안정화 대기 (LTE/5G 재연결 시간)
    console.log('[ADB IP] 네트워크 안정화 대기 (8초)...');
    await new Promise(resolve => setTimeout(resolve, 8000));
    
    // 7. USB 테더링 재확인 대기
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // 8. 새 IP 확인
    const newIp = await getCurrentIp();
    console.log(`[ADB IP] 새 IP: ${newIp}`);
    
    const changed = oldIp !== newIp && newIp !== 'unknown';
    
    return {
      success: changed,
      oldIp,
      newIp,
      message: changed
        ? `IP 변경 성공: ${oldIp} → ${newIp}`
        : newIp === 'unknown'
          ? 'IP 변경 후 네트워크 연결을 확인할 수 없습니다. USB 테더링 상태를 확인해주세요.'
          : `IP가 동일합니다 (${oldIp}). 통신사에 따라 IP가 바로 바뀌지 않을 수 있습니다.`,
    };
  } catch (error) {
    const errMsg = (error as Error).message || '알 수 없는 오류';
    console.error('[ADB IP] IP 변경 실패:', errMsg);
    
    // 비행기모드가 켜진 상태로 남지 않도록 안전 해제 시도
    try {
      await toggleAirplaneMode(false);
    } catch {
      // 안전 해제 실패는 무시
    }
    
    return {
      success: false,
      message: `IP 변경 실패: ${errMsg.substring(0, 100)}`,
    };
  }
}
