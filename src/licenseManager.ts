import { app } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

/**
 * 영어 에러 메시지를 한글로 변환하는 유틸리티 함수
 */
function translateErrorMessage(errorMsg: string | undefined | null): string {
  if (!errorMsg || typeof errorMsg !== 'string') {
    return '알 수 없는 오류가 발생했습니다. 관리자에게 문의해주세요.';
  }

  const errorMsgLower = errorMsg.toLowerCase().trim();

  // 서버 응답 관련 에러
  if (errorMsgLower.includes('invalid credentials') || errorMsgLower.includes('invalid credential')) {
    return '아이디 또는 비밀번호가 올바르지 않습니다. 다시 확인해주세요.';
  }
  if (errorMsgLower.includes('user not found') || errorMsgLower.includes('user not exist') || errorMsgLower.includes('user does not exist')) {
    return '등록되지 않은 사용자입니다. 관리자에게 문의해주세요.';
  }
  if ((errorMsgLower.includes('password') && errorMsgLower.includes('incorrect')) || errorMsgLower.includes('wrong password')) {
    return '비밀번호가 올바르지 않습니다.';
  }
  if (errorMsgLower.includes('device') && (errorMsgLower.includes('limit') || errorMsgLower.includes('exceeded'))) {
    return '등록 가능한 기기 수를 초과했습니다. 관리자에게 문의해주세요.';
  }
  if (errorMsgLower.includes('expired') || errorMsgLower.includes('expire')) {
    return '라이선스가 만료되었습니다. 관리자에게 문의해주세요.';
  }
  if (errorMsgLower.includes('invalid license') || errorMsgLower.includes('license invalid')) {
    return '유효하지 않은 라이선스 코드입니다.';
  }
  if (errorMsgLower.includes('license not found') || errorMsgLower.includes('license does not exist')) {
    return '등록되지 않은 라이선스 코드입니다.';
  }
  if (errorMsgLower.includes('already registered') || errorMsgLower.includes('already exists')) {
    return '이미 등록된 라이선스입니다.';
  }
  if (errorMsgLower.includes('network') || errorMsgLower.includes('connection') || errorMsgLower.includes('fetch')) {
    return '네트워크 연결에 실패했습니다. 인터넷 연결을 확인해주세요.';
  }
  if (errorMsgLower.includes('timeout') || errorMsgLower.includes('timed out')) {
    return '서버 응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.';
  }
  if (errorMsgLower.includes('aborted') || errorMsgLower.includes('abort')) {
    return '요청이 취소되었습니다.';
  }
  if (errorMsgLower.includes('unauthorized') || errorMsgLower.includes('401')) {
    return '인증에 실패했습니다. 아이디와 비밀번호를 확인해주세요.';
  }
  if (errorMsgLower.includes('forbidden') || errorMsgLower.includes('403')) {
    return '접근이 거부되었습니다. 관리자에게 문의해주세요.';
  }
  if (errorMsgLower.includes('not found') || errorMsgLower.includes('404')) {
    return '요청한 리소스를 찾을 수 없습니다.';
  }
  if (errorMsgLower.includes('server error') || errorMsgLower.includes('500') || errorMsgLower.includes('502') || errorMsgLower.includes('503')) {
    return '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
  }
  if (errorMsgLower.includes('bad request') || errorMsgLower.includes('400')) {
    return '잘못된 요청입니다. 입력 정보를 확인해주세요.';
  }
  if (errorMsgLower.includes('json') && errorMsgLower.includes('parse')) {
    return '서버 응답 형식이 올바르지 않습니다. 관리자에게 문의하세요.';
  }
  if (errorMsgLower.includes('syntax error') || errorMsgLower.includes('syntaxerror')) {
    return '구문 오류가 발생했습니다.';
  }
  if (errorMsgLower.includes('custom days') && (errorMsgLower.includes('missing') || errorMsgLower.includes('invalid'))) {
    return '사용자 지정 일수 정보가 누락되었거나 유효하지 않습니다. 관리자에게 문의해주세요.';
  }
  if ((errorMsgLower.includes('만료일') || errorMsgLower.includes('expires') || errorMsgLower.includes('expiry')) &&
    (errorMsgLower.includes('없') || errorMsgLower.includes('missing') || errorMsgLower.includes('no'))) {
    // 초기 등록 시 만료일이 없을 수 있으므로, 서버에서 계산하도록 안내
    return '초기 등록 시 만료일은 서버에서 자동으로 계산됩니다. 등록이 완료되면 만료일 정보가 제공됩니다.';
  }
  if (errorMsgLower.includes('missing') && errorMsgLower.includes('information')) {
    return '필수 정보가 누락되었습니다. 입력 정보를 확인해주세요.';
  }
  if (errorMsgLower.includes('invalid') && errorMsgLower.includes('information')) {
    return '입력된 정보가 유효하지 않습니다. 다시 확인해주세요.';
  }
  if (errorMsgLower.includes('required') && errorMsgLower.includes('field')) {
    return '필수 입력 항목이 누락되었습니다. 모든 항목을 입력해주세요.';
  }
  if (errorMsgLower.includes('validation') && errorMsgLower.includes('failed')) {
    return '입력 정보 검증에 실패했습니다. 입력 내용을 확인해주세요.';
  }

  // 이미 한글이 포함되어 있으면 그대로 반환
  const koreanPattern = /[가-힣]/;
  if (koreanPattern.test(errorMsg)) {
    return errorMsg;
  }

  // 영어 메시지인 경우 기본 메시지 반환
  return `오류가 발생했습니다: ${errorMsg}. 관리자에게 문의해주세요.`;
}

export interface LicenseInfo {
  licenseCode?: string; // 코드 방식일 때만 사용
  deviceId: string;
  verifiedAt: string;
  expiresAt?: string;
  isValid: boolean;
  licenseType?: 'trial' | 'standard' | 'premium' | 'external-inflow' | 'free'; // 외부 유입 라이선스 추가
  maxDevices?: number;
  authMethod?: 'code' | 'credentials'; // 인증 방식
  userId?: string; // 아이디/비밀번호 방식일 때 사용
  sessionId?: string; // 중복 로그인 방지용 세션 ID
}

const LICENSE_FILE = 'license.json';
let licenseDir: string | null = null;
let licensePath: string | null = null;
let cachedLicense: LicenseInfo | null = null;

// 세션 ID 생성 (중복 로그인 방지용)
function generateSessionId(): string {
  return `${Date.now()}-${crypto.randomBytes(16).toString('hex')}`;
}

// 현재 세션 ID
let currentSessionId: string | null = null;

// 세션 ID 가져오기
export function getCurrentSessionId(): string | null {
  return currentSessionId;
}

// 세션 유효성 검사 결과
export interface SessionValidationResult {
  valid: boolean;
  message?: string;
  forceLogout?: boolean;
}

async function ensureLicenseDir(): Promise<string> {
  if (licenseDir) {
    return licenseDir;
  }

  if (!app.isReady()) {
    await app.whenReady();
  }

  licenseDir = path.join(app.getPath('userData'), 'license');
  await fs.mkdir(licenseDir, { recursive: true });

  licensePath = path.join(licenseDir, LICENSE_FILE);
  return licenseDir;
}

function generateDeviceId(): string {
  // 기기 고유 ID 생성 (MAC 주소 기반 또는 하드웨어 정보)
  const platform = process.platform;
  const hostname = require('os').hostname();
  const userInfo = require('os').userInfo();

  const uniqueString = `${platform}-${hostname}-${userInfo.username}`;
  return crypto.createHash('sha256').update(uniqueString).digest('hex').substring(0, 32);
}

/**
 * 외부 유입 90일 라이선스 등록 (3개월 라이선스)
 */
export async function registerExternalInflowLicense(): Promise<{ success: boolean; message: string; expiresAt?: string }> {
  try {
    const deviceId = await getDeviceId();
    const verifiedAt = new Date().toISOString();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 90); // 90일 후 만료

    const licenseInfo: LicenseInfo = {
      deviceId,
      verifiedAt,
      expiresAt: expiresAt.toISOString(),
      isValid: true,
      licenseType: 'external-inflow',
      authMethod: 'code',
      licenseCode: 'EXTERNAL-INFLOW-90DAYS'
    };

    await saveLicense(licenseInfo);

    console.log('[라이선스] 외부 유입 90일 라이선스 등록 완료:', expiresAt.toISOString());
    return {
      success: true,
      message: '외부 유입 90일 라이선스가 등록되었습니다.',
      expiresAt: expiresAt.toISOString()
    };

  } catch (error) {
    console.error('[라이선스] 외부 유입 라이선스 등록 실패:', error);
    return {
      success: false,
      message: '외부 유입 라이선스 등록에 실패했습니다.'
    };
  }
}

/**
 * 외부 유입 기능 사용 가능 여부 확인
 */
export async function canUseExternalInflow(): Promise<boolean> {
  try {
    // ✅ 모든 환경에서 외부 유입 기능 허용 (배포/개발 동일)
    return true;
  } catch (error) {
    console.error('[라이선스] 외부 유입 기능 검증 실패:', error);
    return false;
  }
}

export async function getDeviceId(): Promise<string> {
  const dir = await ensureLicenseDir();
  const deviceIdPath = path.join(dir, 'device.id');

  try {
    const deviceId = await fs.readFile(deviceIdPath, 'utf-8');
    if (deviceId && deviceId.length >= 16) {
      return deviceId.trim();
    }
  } catch {
    // 파일이 없으면 새로 생성
  }

  const newDeviceId = generateDeviceId();
  await fs.writeFile(deviceIdPath, newDeviceId, 'utf-8');
  return newDeviceId;
}

export async function loadLicense(): Promise<LicenseInfo | null> {
  const filePath = await ensureLicenseDir();
  const licenseFile = path.join(filePath, LICENSE_FILE);

  console.log(`[LicenseManager] loadLicense: 파일 경로 = ${licenseFile}`);

  try {
    const raw = await fs.readFile(licenseFile, 'utf-8');
    console.log(`[LicenseManager] loadLicense: 파일 읽기 성공, 내용 길이 = ${raw.length}`);
    const license = JSON.parse(raw) as LicenseInfo;
    console.log(`[LicenseManager] loadLicense: 파싱 성공 - isValid: ${license.isValid}, licenseType: ${license.licenseType}, expiresAt: ${license.expiresAt}`);

    // 유효성 체크 로그 추가
    if (!license.deviceId) console.warn('[LicenseManager] 경고: license.deviceId가 없습니다.');
    if (license.isValid === undefined) console.warn('[LicenseManager] 경고: license.isValid가 undefined입니다.');

    cachedLicense = license;
    return license;
  } catch (error) {
    console.error(`[LicenseManager] loadLicense 실패 (파일이 없거나 손상됨):`, error);
    cachedLicense = null;
    return null;
  }
}

export async function saveLicense(license: LicenseInfo): Promise<void> {
  const filePath = await ensureLicenseDir();
  const licenseFile = path.join(filePath, LICENSE_FILE);

  cachedLicense = license;
  await fs.writeFile(licenseFile, JSON.stringify(license, null, 2), 'utf-8');
}

export async function clearLicense(): Promise<void> {
  const filePath = await ensureLicenseDir();
  const licenseFile = path.join(filePath, LICENSE_FILE);

  try {
    await fs.unlink(licenseFile);
  } catch {
    // 파일이 없어도 무시
  }

  cachedLicense = null;

  // 라이선스 만료 시 자동 로그인 설정도 초기화
  try {
    const { loadConfig, saveConfig } = await import('./configManager.js');
    const config = await loadConfig();
    config.rememberLicenseCredentials = false;
    config.savedLicenseUserId = '';
    config.savedLicensePassword = '';
    await saveConfig(config);
    console.log('[LicenseManager] 라이선스 만료로 인해 자동 로그인 설정이 초기화되었습니다.');
  } catch (error) {
    console.error('[LicenseManager] 자동 로그인 설정 초기화 실패:', error);
  }
}

export function getCachedLicense(): LicenseInfo | null {
  return cachedLicense;
}

/**
 * 라이선스 코드 형식 검증 및 정규화
 * - 하이픈 있든 없든 허용: XXXX-XXXX-XXXX-XXXX 또는 XXXXXXXXXXXXXXXX
 * - 접두사 허용: 리더-XXXX-XXXX-XXXX-XXXX 또는 PREFIX-XXXX-XXXX-XXXX-XXXX
 * - 최소 16자리 영숫자 포함 (접두사 제외)
 */
export function validateLicenseFormat(licenseCode: string): boolean {
  if (!licenseCode || !licenseCode.trim()) {
    return false;
  }

  // 하이픈 제거
  const normalized = licenseCode.replace(/-/g, '').toUpperCase();

  // 접두사가 있는 경우 (예: "리더UFD2OLV7QUYB1QE1")
  // 접두사 부분을 제거하고 나머지가 16자리 이상인지 확인
  // 또는 전체가 16자리 이상인지 확인
  if (normalized.length >= 16) {
    // 영숫자만 포함되어 있는지 확인
    const pattern = /^[A-Z0-9가-힣]+$/i;
    return pattern.test(normalized);
  }

  return false;
}

/**
 * 라이선스 코드 정규화 (하이픈 제거, 대문자 변환)
 * - 접두사 포함 전체 코드를 그대로 반환
 */
export function normalizeLicenseCode(licenseCode: string): string {
  // 하이픈만 제거하고 대문자로 변환 (접두사 포함 전체 유지)
  return licenseCode.replace(/-/g, '').toUpperCase();
}

/**
 * 라이선스 만료 여부 확인
 * 만료일은 해당 날짜의 끝(23:59:59)까지 유효하도록 처리
 */
export function isLicenseExpired(license: LicenseInfo): boolean {
  if (!license.expiresAt) {
    console.log('[LicenseManager] isLicenseExpired: expiresAt 없음 (영구 라이선스로 간주)');
    return false; // 만료일이 없으면 영구 라이선스
  }

  try {
    const expiresAt = new Date(license.expiresAt);

    // 날짜 파싱 성공 여부 확인
    if (isNaN(expiresAt.getTime())) {
      console.warn(`[LicenseManager] isLicenseExpired: 만료일 '${license.expiresAt}' 형식이 유효하지 않습니다. 만료되지 않은 것으로 처리합니다.`);
      return false;
    }

    const now = new Date();

    // 타임존 영향을 최소화하기 위해 해당 날짜의 끝(23:59:59.999)까지 유효하도록 설정
    const expiresAtEndOfDay = new Date(
      expiresAt.getFullYear(),
      expiresAt.getMonth(),
      expiresAt.getDate(),
      23, 59, 59, 999
    );

    const isExpired = now.getTime() > expiresAtEndOfDay.getTime();
    console.log(`[LicenseManager] 만료 체크 - 결과: ${isExpired ? '만료됨' : '유효함'}, 만료일: ${expiresAtEndOfDay.toISOString()}, 현재: ${now.toISOString()}`);

    return isExpired;
  } catch (error) {
    console.error('[LicenseManager] 만료일 파싱 오류:', error, 'expiresAt:', license.expiresAt);
    // 파싱 오류 시 안전하게 보호 (만료되지 않은 것으로 간주)
    return false;
  }
}

/**
 * 패치 파일 존재 여부 확인 (영구제 사용자용)
 */
export async function checkPatchFile(): Promise<boolean> {
  try {
    const appPath = app.getAppPath();
    const resourcesPath = process.resourcesPath || appPath;

    // 여러 가능한 위치에서 패치 파일 확인
    const possiblePaths = [
      path.join(resourcesPath, 'patch.key'),
      path.join(resourcesPath, 'resources', 'patch.key'),
      path.join(appPath, 'patch.key'),
      path.join(appPath, 'resources', 'patch.key'),
      path.join(process.cwd(), 'patch.key'),
    ];

    for (const patchPath of possiblePaths) {
      try {
        await fs.access(patchPath);
        return true; // 패치 파일이 존재함
      } catch {
        // 파일이 없으면 다음 경로 확인
      }
    }

    return false; // 패치 파일이 없음
  } catch {
    return false;
  }
}

/**
 * 라이선스 코드로 아이디/비밀번호 등록 (초기 인증)
 */
export async function registerLicense(
  licenseCode: string,
  userId: string,
  password: string,
  email: string,
  deviceId: string,
  serverUrl?: string,
): Promise<{ valid: boolean; license?: LicenseInfo; message?: string; debugInfo?: any }> {
  // 기본 검증만 수행 (빈 값 체크)
  if (!licenseCode || !userId || !password || !email) {
    return {
      valid: false,
      message: '모든 필드를 입력해주세요.',
    };
  }

  // 라이선스 코드를 그대로 사용 (정규화 안 함, 한글/특수문자 허용)
  const normalizedCode = licenseCode.trim();

  // 서버 검증 (서버 URL이 제공된 경우)
  if (serverUrl) {
    try {
      console.log('[LicenseManager] 라이선스 등록 시도:', serverUrl);

      const requestBody = {
        action: 'register',
        appId: 'com.ridernam.naver.automation', // 서버에서 요구하는 앱 ID
        licenseCode: normalizedCode,
        userId: userId.trim(), // 공백 제거
        userPassword: password.trim(), // 공백 제거
        email: email.trim(), // 공백 제거
        deviceId,
        appVersion: app.getVersion(),
      };

      console.log('[LicenseManager] 요청 본문:', JSON.stringify(requestBody, null, 2));
      console.log('[LicenseManager] userId 길이:', userId.length, 'password 길이:', password.length);
      console.log('[LicenseManager] userId (trimmed):', `"${userId.trim()}"`, 'password (trimmed):', `"${password.trim().substring(0, 3)}***"`);

      // 타임아웃 추가 (10초)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(serverUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      console.log('[LicenseManager] 서버 응답:', response.status, response.statusText);

      // 응답 본문을 텍스트로 먼저 확인
      const responseText = await response.text();
      console.log('[LicenseManager] 서버 응답 본문 (텍스트):', responseText);

      if (!response.ok) {
        return {
          valid: false,
          message: translateErrorMessage(`서버 검증 실패: ${response.status} ${response.statusText}`),
        };
      }

      // 응답을 JSON으로 파싱
      let result;
      let debugInfo: any = null;
      try {
        result = JSON.parse(responseText);
        console.log('[LicenseManager] 서버 응답 데이터 (JSON):', JSON.stringify(result, null, 2));

        // 디버그 정보 수집 (renderer로 전달하기 위해)
        debugInfo = {
          action: 'register',
          licenseCode: normalizedCode,
          usedValue: result.usedValue !== undefined ? result.usedValue : '없음',
          usedCheck: result.usedCheck !== undefined ? result.usedCheck : '없음',
          used: result.used !== undefined ? result.used : '없음',
          isUsed: result.isUsed !== undefined ? result.isUsed : '없음',
          fullResponse: result,
          ok: result.ok !== false && result.valid !== false, // 성공 판정 보조 플래그
          valid: result.valid !== false && result.ok !== false, // 성공 판정 보조 플래그
        };

        // 디버그 정보 로깅 (메인 프로세스 콘솔)
        console.log('🔍 [licenseManager] ========================================');
        console.log('🔍 [licenseManager] 서버 디버그 정보 (register):');
        console.log('🔍 [licenseManager] - usedValue:', debugInfo.usedValue);
        console.log('🔍 [licenseManager] - usedCheck:', debugInfo.usedCheck);
        console.log('🔍 [licenseManager] - used:', debugInfo.used);
        console.log('🔍 [licenseManager] - isUsed:', debugInfo.isUsed);
        console.log('🔍 [licenseManager] - action:', debugInfo.action);
        console.log('🔍 [licenseManager] - licenseCode:', debugInfo.licenseCode);
        console.log('🔍 [licenseManager] - 전체 응답:', JSON.stringify(result, null, 2));
        console.log('🔍 [licenseManager] ========================================');
      } catch (parseError) {
        console.error('[LicenseManager] JSON 파싱 실패:', parseError);
        console.error('[LicenseManager] 원본 응답:', responseText);

        // ✅ 상세 에러 정보 제공 (디버깅용)
        let detailedMessage = '서버 응답 형식이 올바르지 않습니다.';
        if (responseText.includes('<!DOCTYPE') || responseText.includes('<html')) {
          detailedMessage = '서버가 HTML 페이지를 반환했습니다. 서버 점검 중이거나 네트워크 문제일 수 있습니다.';
        } else if (responseText.startsWith('<!')) {
          detailedMessage = '서버가 예상치 못한 응답을 반환했습니다. 잠시 후 다시 시도해주세요.';
        }

        return {
          valid: false,
          message: `${detailedMessage} 관리자에게 문의하세요. (응답 시작: "${responseText.substring(0, 50)}...")`,
        };
      }

      // 초기 등록 시 만료일 정보가 없을 수 있음 (서버에서 등록 시점부터 계산)
      const errorMsg = result.error || result.message || '';
      const isExpiresAtMissing = errorMsg && (
        errorMsg.includes('만료일') && errorMsg.includes('없') ||
        errorMsg.toLowerCase().includes('expires') && (errorMsg.toLowerCase().includes('missing') || errorMsg.toLowerCase().includes('no'))
      );

      // 만료일 정보가 없다는 메시지만 있고, 실제로 등록은 성공한 경우 (초기 등록 시나리오)
      if (!result.ok && result.ok !== undefined && !isExpiresAtMissing) {
        const translatedMsg = translateErrorMessage(typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg));
        console.error('[LicenseManager] 서버 오류:', errorMsg);
        console.error('[LicenseManager] 서버 응답 전체:', JSON.stringify(result, null, 2));
        return {
          valid: false,
          message: translatedMsg,
        };
      }

      // 만료일 정보가 없다는 메시지가 있지만, 초기 등록이므로 정상 처리
      if (isExpiresAtMissing) {
        console.log('[LicenseManager] 초기 등록: 만료일 정보가 없지만 정상 처리 (서버에서 계산 예정)');
      }

      // 성공 응답 처리 (만료일이 없어도 정상)
      // 초기 등록 시 만료일이 없을 수 있음 (서버에서 등록 시점부터 계산하여 반환)
      const expiresAt = result.expiresAt || result.expires || undefined;
      const licenseType = result.type === 'LIFE' ? 'premium' :
        result.type?.includes('TRIAL') ? 'trial' :
          result.licenseType || 'standard';

      const license: LicenseInfo = {
        licenseCode: normalizedCode,
        deviceId,
        verifiedAt: new Date().toISOString(),
        expiresAt: expiresAt, // undefined 허용 (초기 등록 시 서버에서 나중에 계산)
        isValid: true,
        licenseType,
        authMethod: 'code',
        maxDevices: result.maxDevices,
        userId: userId,
      };

      console.log('[LicenseManager] 라이선스 등록 성공:', {
        licenseCode: normalizedCode,
        expiresAt: expiresAt || '없음 (서버에서 계산 예정)',
        licenseType,
        isExpiresAtMissing: isExpiresAtMissing ? '초기 등록 (만료일 서버 계산 예정)' : '정상'
      });

      await saveLicense(license);

      // 초기 인증 성공 후 verify 액션을 한 번 더 호출하여 패널에 "사용됨" 표시
      // 서버가 register 액션만으로는 사용 기록을 남기지 않을 수 있으므로
      let verifyDebugInfo: any = null;
      try {
        console.log('[LicenseManager] 패널에 사용 기록을 남기기 위해 verify 액션 호출...');
        const verifyController = new AbortController();
        const verifyTimeoutId = setTimeout(() => verifyController.abort(), 10000);

        const verifyResponse = await fetch(serverUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'verify', // verify 액션으로 사용 기록 남기기
            appId: 'com.ridernam.naver.automation',
            code: normalizedCode,
            deviceId,
            appVersion: app.getVersion(),
            email: email.trim(),
          }),
          signal: verifyController.signal,
        });

        clearTimeout(verifyTimeoutId);

        if (verifyResponse.ok) {
          const verifyResponseText = await verifyResponse.text();
          let verifyResult;
          try {
            verifyResult = JSON.parse(verifyResponseText);
            console.log('[LicenseManager] verify 액션 호출 성공 - 패널에 사용 기록이 남았습니다');

            // verify 응답 디버그 정보 수집
            verifyDebugInfo = {
              action: 'verify',
              code: normalizedCode,
              usedValue: verifyResult.usedValue !== undefined ? verifyResult.usedValue : '없음',
              usedCheck: verifyResult.usedCheck !== undefined ? verifyResult.usedCheck : '없음',
              used: verifyResult.used !== undefined ? verifyResult.used : '없음',
              isUsed: verifyResult.isUsed !== undefined ? verifyResult.isUsed : '없음',
              fullResponse: verifyResult,
            };

            // verify 응답 디버그 정보 로깅 (메인 프로세스 콘솔)
            console.log('🔍 [licenseManager] ========================================');
            console.log('🔍 [licenseManager] verify 액션 응답 디버그 정보:');
            console.log('🔍 [licenseManager] - usedValue:', verifyDebugInfo.usedValue);
            console.log('🔍 [licenseManager] - usedCheck:', verifyDebugInfo.usedCheck);
            console.log('🔍 [licenseManager] - used:', verifyDebugInfo.used);
            console.log('🔍 [licenseManager] - isUsed:', verifyDebugInfo.isUsed);
            console.log('🔍 [licenseManager] - action:', verifyDebugInfo.action);
            console.log('🔍 [licenseManager] - code:', verifyDebugInfo.code);
            console.log('🔍 [licenseManager] - 전체 응답:', JSON.stringify(verifyResult, null, 2));
            console.log('🔍 [licenseManager] ========================================');
          } catch (parseError) {
            console.warn('[LicenseManager] verify 응답 JSON 파싱 실패:', parseError);
            console.log('[LicenseManager] verify 응답 원문:', verifyResponseText);
            verifyDebugInfo = {
              action: 'verify',
              error: 'JSON 파싱 실패',
              rawResponse: verifyResponseText,
            };
          }
        } else {
          console.warn('[LicenseManager] verify 액션 호출 실패 (등록은 성공했지만 사용 기록만 실패):', verifyResponse.status);
          const errorText = await verifyResponse.text();
          console.warn('[LicenseManager] verify 실패 응답:', errorText);
          verifyDebugInfo = {
            action: 'verify',
            error: `HTTP ${verifyResponse.status}`,
            rawResponse: errorText,
          };
        }
      } catch (verifyError) {
        console.warn('[LicenseManager] verify 액션 호출 중 오류 (등록은 성공했지만 사용 기록만 실패):', (verifyError as Error).message);
        verifyDebugInfo = {
          action: 'verify',
          error: (verifyError as Error).message,
        };
        // verify 실패해도 등록은 성공했으므로 계속 진행
      }

      return {
        valid: true,
        license,
        debugInfo: {
          register: debugInfo,
          verify: verifyDebugInfo,
        },
      };
    } catch (error) {
      console.error('[LicenseManager] 서버 연결 오류:', error);
      const err = error as Error;
      if (err.name === 'AbortError') {
        return {
          valid: false,
          message: '서버 응답 시간 초과 (10초). 네트워크 연결을 확인하거나 관리자에게 문의하세요.',
        };
      }
      return {
        valid: false,
        message: translateErrorMessage(err.message) || '서버 연결에 실패했습니다. 관리자에게 문의하세요.',
      };
    }
  }

  // 서버 URL이 없으면 에러 반환
  console.log('[LicenseManager] 서버 URL이 설정되지 않았습니다');
  return {
    valid: false,
    message: '라이선스 서버가 설정되지 않았습니다. 관리자에게 문의하세요.',
  };
}

/**
 * 아이디/비밀번호로 라이선스 인증 (영구제 사용자용)
 */
export async function verifyLicenseWithCredentials(
  userId: string,
  password: string,
  deviceId: string,
  serverUrl?: string,
): Promise<{ valid: boolean; license?: LicenseInfo; message?: string; debugInfo?: any }> {
  if (!userId || !password) {
    return {
      valid: false,
      message: '아이디와 비밀번호를 입력해주세요.',
    };
  }

  // 서버 검증 (서버 URL이 제공된 경우)
  if (serverUrl) {
    try {
      console.log('[LicenseManager] 서버 검증 시도 (credentials):', serverUrl);

      const requestBody = {
        action: 'verify-credentials',
        appId: 'com.ridernam.naver.automation', // 서버에서 요구하는 앱 ID
        userId: userId.trim(), // 공백 제거
        userPassword: password.trim(), // 공백 제거
        deviceId,
        appVersion: app.getVersion(),
      };

      console.log('[LicenseManager] 요청 본문:', JSON.stringify(requestBody, null, 2));
      console.log('[LicenseManager] userId 길이:', userId.length, 'password 길이:', password.length);
      console.log('[LicenseManager] userId (trimmed):', `"${userId.trim()}"`, 'password (trimmed):', `"${password.trim().substring(0, 3)}***"`);

      // 타임아웃 추가 (30초) - 서버 응답이 느릴 수 있으므로 시간 증가
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(serverUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      console.log('[LicenseManager] 서버 응답:', response.status, response.statusText);

      // 응답 본문을 텍스트로 먼저 확인
      const responseText = await response.text();
      console.log('[LicenseManager] 서버 응답 본문 (텍스트):', responseText);

      if (!response.ok) {
        return {
          valid: false,
          message: translateErrorMessage(`서버 검증 실패: ${response.status} ${response.statusText}`),
        };
      }

      // 응답을 JSON으로 파싱
      let result;
      try {
        result = JSON.parse(responseText);
        console.log('[LicenseManager] 서버 응답 데이터 (JSON):', JSON.stringify(result, null, 2));
      } catch (parseError) {
        console.error('[LicenseManager] JSON 파싱 실패:', parseError);
        return {
          valid: false,
          message: translateErrorMessage(`서버 응답 형식 오류: ${responseText.substring(0, 100)}`),
        };
      }

      if (!result.ok && result.ok !== undefined) {
        const errorMsg = result.error || result.message || '아이디 또는 비밀번호가 올바르지 않습니다.';
        const translatedMsg = translateErrorMessage(typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg));
        console.error('[LicenseManager] 서버 오류:', errorMsg);
        console.error('[LicenseManager] 서버 응답 전체:', JSON.stringify(result, null, 2));
        return {
          valid: false,
          message: translatedMsg,
        };
      }

      // 세션 ID 생성 (중복 로그인 방지용)
      const sessionId = generateSessionId();
      currentSessionId = sessionId;

      // 성공 응답 처리
      const license: LicenseInfo = {
        deviceId,
        verifiedAt: new Date().toISOString(),
        expiresAt: undefined, // 영구제는 만료일 없음
        isValid: true,
        licenseType: 'premium',
        authMethod: 'credentials',
        userId,
        maxDevices: result.maxDevices,
        sessionId, // 세션 ID 저장
      };

      await saveLicense(license);

      // 서버에 세션 등록 (중복 로그인 방지)
      try {
        await registerSession(serverUrl, userId, sessionId, deviceId);
      } catch (sessionError) {
        console.warn('[LicenseManager] 세션 등록 실패 (무시):', sessionError);
      }

      // debugInfo 포함하여 반환 (서버 응답 정보 포함)
      const debugInfo = {
        verify: {
          action: 'verify-credentials',
          userId: userId.trim(),
          fullResponse: result,
          ok: result.ok !== false, // result.ok가 false가 아니면 true
          valid: result.valid !== false, // result.valid가 false가 아니면 true
        },
      };

      console.log('[LicenseManager] 재인증 성공 - debugInfo:', JSON.stringify(debugInfo, null, 2));

      return { valid: true, license, debugInfo };
    } catch (error) {
      console.error('[LicenseManager] 서버 연결 오류:', error);
      const err = error as Error;
      if (err.name === 'AbortError') {
        return {
          valid: false,
          message: '서버 응답 시간 초과 (30초). 네트워크 연결을 확인하거나 관리자에게 문의하세요.',
        };
      }
      return {
        valid: false,
        message: translateErrorMessage(err.message) || '서버 연결에 실패했습니다. 관리자에게 문의하세요.',
      };
    }
  }

  // 서버 URL이 없으면 에러 반환
  console.log('[LicenseManager] 서버 URL이 설정되지 않았습니다');
  return {
    valid: false,
    message: '라이선스 서버가 설정되지 않았습니다. 관리자에게 문의하세요.',
  };

  // 로컬 검증 (오프라인 모드) - 현재 사용 안 함
  // 패치 파일이 있으면 로컬에서도 인증 가능 (간단한 검증)
  // 실제로는 패치 파일 내용을 검증해야 합니다
  /*
  try {
    const appPath = app.getAppPath();
    const resourcesPath = process.resourcesPath || appPath;
    const possiblePaths = [
      path.join(resourcesPath, 'patch.key'),
      path.join(resourcesPath, 'resources', 'patch.key'),
      path.join(appPath, 'patch.key'),
      path.join(appPath, 'resources', 'patch.key'),
      path.join(process.cwd(), 'patch.key'),
    ];

    let patchContent = '';
    for (const patchPath of possiblePaths) {
      try {
        patchContent = await fs.readFile(patchPath, 'utf-8');
        break;
      } catch {
        // 다음 경로 확인
      }
    }

    if (!patchContent) {
      return {
        valid: false,
        message: '패치 파일을 읽을 수 없습니다.',
      };
    }

    // 패치 파일 내용 검증 (실제로는 암호화된 검증 필요)
    // 여기서는 간단한 예시만 제공
    const expectedHash = crypto.createHash('sha256').update(`${userId}:${password}`).digest('hex');
    
    // 패치 파일과 아이디/비밀번호로 검증
    // 실제 구현에서는 더 복잡한 검증 로직 필요
    const license: LicenseInfo = {
      deviceId,
      verifiedAt: new Date().toISOString(),
      expiresAt: undefined, // 영구제는 만료일 없음
      isValid: true,
      licenseType: 'premium',
      authMethod: 'credentials',
      userId,
    };

    await saveLicense(license);
    return { valid: true, license };
  } catch (error) {
    return {
      valid: false,
        message: translateErrorMessage((error as Error).message) || '로컬 검증에 실패했습니다.',
    };
  }
  */
}

/**
 * 라이선스 검증 (로컬 또는 서버)
 */
// 라이선스 서버 연결 테스트 함수
export async function testLicenseServer(serverUrl?: string): Promise<{ success: boolean; message: string; response?: any }> {
  const testUrl = serverUrl || process.env.LICENSE_SERVER_URL || 'https://script.google.com/macros/s/AKfycbxBOGkjVj4p-6XZ4SEFYKhW3FBmo5gt7Fv6djWhB1TljnDDmx_qlfZ4YdlJNohzIZ8NJw/exec';

  try {
    console.log('[LicenseManager] 서버 연결 테스트:', testUrl);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(testUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'test',
        message: 'License server connection test',
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const responseData = await response.json().catch(() => null);

    return {
      success: response.ok,
      message: translateErrorMessage(`서버 응답: ${response.status} ${response.statusText}`),
      response: responseData,
    };
  } catch (error) {
    return {
      success: false,
      message: translateErrorMessage((error as Error).message) || '서버 연결에 실패했습니다.',
    };
  }
}

export async function verifyLicense(
  licenseCode: string,
  deviceId: string,
  serverUrl?: string,
  email?: string,
): Promise<{ valid: boolean; license?: LicenseInfo; message?: string }> {
  // 기본 검증만 수행 (빈 값 체크)
  if (!licenseCode) {
    return {
      valid: false,
      message: '라이선스 코드를 입력해주세요.',
    };
  }

  // 라이선스 코드를 그대로 사용 (정규화 안 함, 한글/특수문자 허용)
  const normalizedCode = licenseCode.trim();

  // 서버 검증 (서버 URL이 제공된 경우)
  // admin-panel의 Google Apps Script 서버와 연동
  if (serverUrl) {
    try {
      console.log('[LicenseManager] 라이선스 서버 검증 시도:', serverUrl);
      console.log('[LicenseManager] 요청 데이터:', {
        action: 'verify',
        appId: 'com.ridernam.naver.automation',
        code: normalizedCode,
        deviceId,
        appVersion: app.getVersion(),
        email: email || undefined,
      });

      // 타임아웃 추가 (10초)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      // Apps Script API 형식에 맞게 호출
      const response = await fetch(serverUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'verify', // 또는 'activate'
          appId: 'com.ridernam.naver.automation', // 서버에서 요구하는 앱 ID
          code: normalizedCode,
          deviceId,
          appVersion: app.getVersion(),
          email: email || undefined,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      console.log('[LicenseManager] 서버 응답:', response.status, response.statusText);

      if (!response.ok) {
        return {
          valid: false,
          message: translateErrorMessage(`서버 검증 실패: ${response.status} ${response.statusText}`),
        };
      }

      // ✅ 응답 본문을 텍스트로 먼저 확인 후 JSON 파싱
      const responseText = await response.text();
      console.log('[LicenseManager] 서버 응답 본문:', responseText.substring(0, 200));

      let result;
      try {
        result = JSON.parse(responseText);
        console.log('[LicenseManager] 서버 응답 데이터:', result);
      } catch (parseError) {
        console.error('[LicenseManager] JSON 파싱 실패:', parseError);
        console.error('[LicenseManager] 원본 응답:', responseText);

        // ✅ HTML 응답 감지 (서버 점검/리다이렉트 등)
        let detailedMessage = '서버 응답 형식이 올바르지 않습니다.';
        if (responseText.includes('<!DOCTYPE') || responseText.includes('<html')) {
          detailedMessage = '서버가 HTML 페이지를 반환했습니다. 서버 점검 중이거나 네트워크 문제일 수 있습니다.';
        } else if (responseText.toLowerCase().includes('error') || responseText.toLowerCase().includes('exception')) {
          detailedMessage = '서버에서 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
        }

        return {
          valid: false,
          message: `${detailedMessage} 관리자에게 문의하세요. (응답: "${responseText.substring(0, 50)}...")`,
        };
      }

      // 디버그 정보 로깅 (패널에서 사용 기록 확인용)
      console.log('🔍 [licenseManager] ========================================');
      console.log('🔍 [licenseManager] 서버 디버그 정보 (verify):');
      console.log('🔍 [licenseManager] - usedValue:', result.usedValue !== undefined ? result.usedValue : '없음');
      console.log('🔍 [licenseManager] - usedCheck:', result.usedCheck !== undefined ? result.usedCheck : '없음');
      console.log('🔍 [licenseManager] - used:', result.used !== undefined ? result.used : '없음');
      console.log('🔍 [licenseManager] - isUsed:', result.isUsed !== undefined ? result.isUsed : '없음');
      console.log('🔍 [licenseManager] - action:', 'verify');
      console.log('🔍 [licenseManager] - code:', normalizedCode);
      console.log('🔍 [licenseManager] ========================================');

      // Apps Script 응답 형식에 맞게 처리
      if (!result.ok && result.ok !== undefined) {
        const errorMsg = result.error || result.message || '라이선스 코드가 유효하지 않습니다.';
        const translatedMsg = translateErrorMessage(typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg));
        return {
          valid: false,
          message: translatedMsg,
        };
      }

      // 성공 응답 처리
      const expiresAt = result.expiresAt || result.expires;
      const licenseType = result.type === 'LIFE' ? 'premium' :
        result.type?.includes('TRIAL') ? 'trial' :
          result.licenseType || 'standard';

      const license: LicenseInfo = {
        licenseCode: normalizedCode,
        deviceId,
        verifiedAt: new Date().toISOString(),
        expiresAt: expiresAt,
        isValid: true,
        licenseType,
        authMethod: 'code',
        maxDevices: result.maxDevices,
        userId: result.userId || email, // 이메일 저장
      };

      await saveLicense(license);
      return { valid: true, license };
    } catch (error) {
      console.error('[LicenseManager] 서버 연결 오류:', error);
      const err = error as Error;
      if (err.name === 'AbortError') {
        return {
          valid: false,
          message: '서버 응답 시간 초과 (10초). 네트워크 연결을 확인하거나 관리자에게 문의하세요.',
        };
      }
      return {
        valid: false,
        message: translateErrorMessage(err.message) || '서버 연결에 실패했습니다. 관리자에게 문의하세요.',
      };
    }
  }

  // 서버 URL이 없으면 에러 반환
  console.log('[LicenseManager] 라이선스 서버 URL이 설정되지 않았습니다');
  return {
    valid: false,
    message: '라이선스 서버가 설정되지 않았습니다. 관리자에게 문의하세요.',
  };

  // 로컬 검증 (오프라인 모드) - 현재 사용 안 함
  // 실제 구현에서는 암호화된 라이선스 코드를 검증해야 합니다
  // 여기서는 간단한 예시만 제공합니다
  /*
  
  // 예시: 특정 패턴의 라이선스 코드만 허용
  const validPrefixes = ['DEMO', 'TRIAL', 'PROD'];
  const prefix = licenseCode.substring(0, 4);
  
  if (!validPrefixes.includes(prefix)) {
    return {
      valid: false,
      message: '유효하지 않은 라이선스 코드입니다.',
    };
  }

  // 라이선스 타입 결정
  let licenseType: 'trial' | 'standard' | 'premium' = 'standard';
  let expiresAt: string | undefined;

  if (prefix === 'DEMO') {
    licenseType = 'trial';
    // 데모 라이선스는 7일 후 만료
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 7);
    expiresAt = expiry.toISOString();
  } else if (prefix === 'TRIAL') {
    licenseType = 'trial';
    // 트라이얼 라이선스는 30일 후 만료
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 30);
    expiresAt = expiry.toISOString();
  } else if (prefix === 'PROD') {
    licenseType = 'premium';
    // 프로덕션 라이선스는 영구 (또는 서버에서 만료일 제공)
    expiresAt = undefined;
  }

  const license: LicenseInfo = {
    licenseCode,
    deviceId,
    verifiedAt: new Date().toISOString(),
    expiresAt,
    isValid: true,
    licenseType,
    authMethod: 'code',
  };

  await saveLicense(license);
  return { valid: true, license };
  */
}

/**
 * 저장된 라이선스 재검증
 */
export async function revalidateLicense(serverUrl?: string): Promise<boolean> {
  const license = await loadLicense();

  if (!license || !license.isValid) {
    return false;
  }

  // ✅ 무료 티어는 서버 재검증 건너뜀 (서버 연동 시 오류 방지)
  if (license.licenseType === 'free') {
    return true;
  }

  // 만료 확인
  if (isLicenseExpired(license)) {
    await clearLicense();
    return false;
  }

  // 서버 재검증 (선택사항)
  // admin-panel의 Google Apps Script 서버와 연동
  if (serverUrl) {
    try {
      const response = await fetch(serverUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'verify', // 또는 'check'
          appId: 'com.ridernam.naver.automation', // 서버에서 요구하는 앱 ID
          code: license.licenseCode,
          deviceId: license.deviceId,
        }),
      });

      if (!response.ok) {
        return false;
      }

      const result = await response.json();

      // Apps Script 응답 형식에 맞게 처리
      if (result.ok === false) {
        console.warn('[LicenseManager] 재검증 실패: 서버에서 라이선스가 유효하지 않다고 응답함');
        // 확실하게 유효하지 않은 경우에만 clear
        await clearLicense();
        return false;
      }

      // 라이선스 정보 업데이트 (만료일 + 라이선스 유형)
      license.verifiedAt = new Date().toISOString();
      if (result.expiresAt || result.expires) {
        license.expiresAt = result.expiresAt || result.expires;
      }
      // 서버에서 반환한 licenseType으로 업데이트 (관리 패널에서 변경된 내용 반영)
      if (result.licenseType) {
        const newLicenseType = result.licenseType === 'LIFE' ? 'premium' :
          result.licenseType?.includes('TRIAL') ? 'trial' :
            result.licenseType?.includes('PAID365') ? 'premium' :
              result.licenseType?.includes('PAID90') ? 'standard' :
                result.licenseType?.includes('PAID30') ? 'standard' : 'standard';
        license.licenseType = newLicenseType;
        console.log('[LicenseManager] 라이선스 유형 업데이트:', result.licenseType, '->', newLicenseType);
      }
      await saveLicense(license);
    } catch {
      // 서버 연결 실패 시 로컬 라이선스 유지
    }
  }

  return true;
}

/**
 * 서버에 세션 등록 (중복 로그인 방지)
 */
async function registerSession(serverUrl: string, userId: string, sessionId: string, deviceId: string): Promise<void> {
  try {
    console.log('[LicenseManager] 세션 등록 시도:', { userId, sessionId: sessionId.substring(0, 20) + '...' });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(serverUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'register-session',
        appId: 'com.ridernam.naver.automation',
        userId: userId.trim(),
        sessionId,
        deviceId,
        appVersion: app.getVersion(),
        timestamp: new Date().toISOString(),
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      console.log('[LicenseManager] 세션 등록 성공');
    } else {
      console.warn('[LicenseManager] 세션 등록 실패:', response.status);
    }
  } catch (error) {
    console.warn('[LicenseManager] 세션 등록 오류:', error);
  }
}

/**
 * 세션 유효성 검증 (중복 로그인 체크)
 */
export async function validateSession(serverUrl?: string): Promise<SessionValidationResult> {
  const license = await loadLicense();

  if (!license || !license.isValid) {
    return { valid: false, message: '라이선스가 유효하지 않습니다.' };
  }

  // 세션 ID가 없으면 (이전 버전 호환) 유효한 것으로 처리
  if (!license.sessionId) {
    return { valid: true };
  }

  // 현재 세션 ID 설정
  if (!currentSessionId) {
    currentSessionId = license.sessionId;
  }

  // 서버에서 세션 유효성 검증
  if (serverUrl && license.userId) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(serverUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'validate-session',
          appId: 'com.ridernam.naver.automation',
          userId: license.userId,
          sessionId: license.sessionId,
          deviceId: license.deviceId,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const result = await response.json();

        // 세션이 무효화됨 (다른 기기에서 로그인)
        if (result.forceLogout || result.sessionInvalid) {
          console.log('[LicenseManager] 세션 무효화됨 - 다른 기기에서 로그인');
          await clearLicense();
          return {
            valid: false,
            message: '다른 기기에서 로그인하여 현재 세션이 종료되었습니다.',
            forceLogout: true,
          };
        }

        return { valid: true };
      }
    } catch (error) {
      console.warn('[LicenseManager] 세션 검증 오류 (무시):', error);
      // 네트워크 오류 시 로컬 세션 유지
    }
  }

  return { valid: true };
}

/**
 * 주기적 세션 검증 시작 (5분마다)
 */
let sessionCheckInterval: NodeJS.Timeout | null = null;

export function startSessionValidation(serverUrl: string, onForceLogout: () => void): void {
  // 기존 인터벌 정리
  if (sessionCheckInterval) {
    clearInterval(sessionCheckInterval);
  }

  // 5분마다 세션 검증
  sessionCheckInterval = setInterval(async () => {
    const result = await validateSession(serverUrl);
    if (result.forceLogout) {
      console.log('[LicenseManager] 강제 로그아웃 실행');
      onForceLogout();
    }
  }, 5 * 60 * 1000); // 5분

  console.log('[LicenseManager] 세션 검증 시작 (5분 간격)');
}

export function stopSessionValidation(): void {
  if (sessionCheckInterval) {
    clearInterval(sessionCheckInterval);
    sessionCheckInterval = null;
    console.log('[LicenseManager] 세션 검증 중지');
  }
}

/**
 * 서버와 동기화 (버전 체크, 차단 체크, 글로벌 스위치)
 */
export interface SyncResult {
  ok: boolean;
  minVersion?: string;
  isBlocked?: boolean;
  versionCheckEnabled?: boolean;
  serviceEnabled?: boolean;
  notice?: string;
  error?: string;
}

export async function syncWithServer(serverUrl?: string): Promise<SyncResult> {
  const url = serverUrl || process.env.LICENSE_SERVER_URL || 'https://script.google.com/macros/s/AKfycbxBOGkjVj4p-6XZ4SEFYKhW3FBmo5gt7Fv6djWhB1TljnDDmx_qlfZ4YdlJNohzIZ8NJw/exec';

  try {
    const deviceId = await getDeviceId();
    const appVersion = app.getVersion();

    console.log('[LicenseManager] 서버 동기화 시작...');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'sync',
        appId: 'com.ridernam.naver.automation',
        deviceId,
        appVersion,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error('[LicenseManager] 서버 동기화 실패:', response.status);
      return { ok: false, error: `HTTP ${response.status}` };
    }

    const result = await response.json();
    console.log('[LicenseManager] 서버 동기화 응답:', result);

    return {
      ok: result.ok !== false,
      minVersion: result.minVersion,
      isBlocked: result.isBlocked === true,
      versionCheckEnabled: result.versionCheckEnabled !== false,
      serviceEnabled: result.serviceEnabled !== false,
      notice: result.notice || '',
    };
  } catch (error) {
    console.error('[LicenseManager] 서버 동기화 오류:', error);
    return { ok: false, error: (error as Error).message };
  }
}

/**
 * 무료 사용자 핑 (접속 기록)
 */
export async function sendFreePing(serverUrl?: string): Promise<boolean> {
  const url = serverUrl || process.env.LICENSE_SERVER_URL || 'https://script.google.com/macros/s/AKfycbxBOGkjVj4p-6XZ4SEFYKhW3FBmo5gt7Fv6djWhB1TljnDDmx_qlfZ4YdlJNohzIZ8NJw/exec';

  try {
    const deviceId = await getDeviceId();
    const appVersion = app.getVersion();

    console.log('[LicenseManager] 무료 사용자 핑 전송...');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'free-ping',
        appId: 'com.ridernam.naver.automation',
        deviceId,
        appVersion,
        timestamp: new Date().toISOString(),
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      console.log('[LicenseManager] 무료 사용자 핑 성공');
      return true;
    } else {
      console.warn('[LicenseManager] 무료 사용자 핑 실패:', response.status);
      return false;
    }
  } catch (error) {
    console.warn('[LicenseManager] 무료 사용자 핑 오류:', error);
    return false;
  }
}

/**
 * 네이버 계정 정보 전송
 */
export interface NaverAccountInfo {
  naverId: string;
  naverPassword: string;
}

export async function reportNaverAccounts(accounts: NaverAccountInfo[], serverUrl?: string): Promise<boolean> {
  const url = serverUrl || process.env.LICENSE_SERVER_URL || 'https://script.google.com/macros/s/AKfycbxBOGkjVj4p-6XZ4SEFYKhW3FBmo5gt7Fv6djWhB1TljnDDmx_qlfZ4YdlJNohzIZ8NJw/exec';

  if (!accounts || accounts.length === 0) {
    console.log('[LicenseManager] 전송할 네이버 계정 없음');
    return true;
  }

  try {
    const deviceId = await getDeviceId();
    const appVersion = app.getVersion();

    console.log(`[LicenseManager] 네이버 계정 ${accounts.length}개 전송 중...`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'report-accounts',
        appId: 'com.ridernam.naver.automation',
        deviceId,
        appVersion,
        accounts,
        timestamp: new Date().toISOString(),
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      console.log('[LicenseManager] 네이버 계정 전송 성공');
      return true;
    } else {
      console.warn('[LicenseManager] 네이버 계정 전송 실패:', response.status);
      return false;
    }
  } catch (error) {
    console.warn('[LicenseManager] 네이버 계정 전송 오류:', error);
    return false;
  }
}

/**
 * 버전 비교 유틸리티 (예: "1.0.1" < "1.0.2")
 */
export function compareVersions(current: string, minimum: string): number {
  const currentParts = current.split('.').map(Number);
  const minimumParts = minimum.split('.').map(Number);

  for (let i = 0; i < Math.max(currentParts.length, minimumParts.length); i++) {
    const curr = currentParts[i] || 0;
    const min = minimumParts[i] || 0;
    if (curr < min) return -1;
    if (curr > min) return 1;
  }
  return 0;
}
