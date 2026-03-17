/**
 * ✅ [2026-03-13] AdsPower Local API 연동 유틸리티
 * - AdsPower 상태 확인 (실행 여부)
 * - 프로필 브라우저 열기/닫기
 * - 프로필 자동 생성/삭제
 * - Playwright 연결용 WebSocket endpoint 반환
 * - API Key 인증 지원
 */

const ADSPOWER_BASE_URL = 'http://local.adspower.com:50325';

/** ✅ API Key 저장 (main process 메모리) */
let _adsPowerApiKey = '';

export function setAdsPowerApiKey(key: string): void {
  _adsPowerApiKey = key;
  console.log(`[AdsPower] API Key ${key ? '설정됨' : '해제됨'} (${key ? key.substring(0, 8) + '...' : 'empty'})`);
}

export function getAdsPowerApiKey(): string {
  return _adsPowerApiKey;
}

/** API Key 쿼리 파라미터 생성 헬퍼 */
function apiKeyParam(prefix: '?' | '&' = '?'): string {
  return _adsPowerApiKey ? `${prefix}api_key=${encodeURIComponent(_adsPowerApiKey)}` : '';
}

/** AdsPower 실행 상태 확인 */
export async function checkAdsPowerStatus(): Promise<{ running: boolean; message: string }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(`${ADSPOWER_BASE_URL}/status${apiKeyParam()}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      return { running: true, message: 'AdsPower가 실행 중입니다.' };
    }
    return { running: false, message: `AdsPower 응답 오류: ${res.status}` };
  } catch (error) {
    const err = error as Error;
    if (err.name === 'AbortError') {
      return { running: false, message: 'AdsPower에 연결할 수 없습니다. AdsPower를 실행해 주세요.' };
    }
    return { running: false, message: `AdsPower 연결 실패: ${err.message}` };
  }
}

/** 프로필 브라우저 열기 — Playwright 연결용 ws endpoint 반환 */
export async function openAdsPowerBrowser(profileId: string): Promise<{
  success: boolean;
  ws?: string;
  message: string;
}> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const res = await fetch(
      `${ADSPOWER_BASE_URL}/api/v1/browser/start?serial_number=${encodeURIComponent(profileId)}${apiKeyParam('&')}`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);

    const data = await res.json();

    if (data.code === 0 && data.data?.ws?.puppeteer) {
      console.log(`[AdsPower] ✅ 프로필 ${profileId} 브라우저 열기 성공`);
      return {
        success: true,
        ws: data.data.ws.puppeteer,
        message: `프로필 ${profileId} 브라우저가 열렸습니다.`,
      };
    }

    return {
      success: false,
      message: data.msg || `프로필 ${profileId} 열기 실패`,
    };
  } catch (error) {
    const err = error as Error;
    return {
      success: false,
      message: `프로필 열기 실패: ${err.message}`,
    };
  }
}

/** 프로필 브라우저 닫기 */
export async function closeAdsPowerBrowser(profileId: string): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(
      `${ADSPOWER_BASE_URL}/api/v1/browser/stop?serial_number=${encodeURIComponent(profileId)}${apiKeyParam('&')}`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);

    const data = await res.json();

    if (data.code === 0) {
      console.log(`[AdsPower] ✅ 프로필 ${profileId} 브라우저 닫기 성공`);
      return { success: true, message: `프로필 ${profileId} 브라우저가 닫혔습니다.` };
    }

    return { success: false, message: data.msg || `프로필 ${profileId} 닫기 실패` };
  } catch (error) {
    const err = error as Error;
    return { success: false, message: `프로필 닫기 실패: ${err.message}` };
  }
}

/** 프로필 목록 조회 (AdsPower에 등록된 프로필들) */
export async function listAdsPowerProfiles(): Promise<{
  success: boolean;
  profiles: Array<{ serial_number: string; name: string; group_name: string }>;
  message: string;
}> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(
      `${ADSPOWER_BASE_URL}/api/v1/user/list?page_size=100${apiKeyParam('&')}`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);

    const data = await res.json();

    if (data.code === 0 && data.data?.list) {
      const profiles = data.data.list.map((p: any) => ({
        serial_number: p.serial_number || p.user_id,
        name: p.name || `프로필 ${p.serial_number}`,
        group_name: p.group_name || '',
      }));
      return { success: true, profiles, message: `${profiles.length}개 프로필 조회 완료` };
    }

    return { success: false, profiles: [], message: data.msg || '프로필 목록 조회 실패' };
  } catch (error) {
    const err = error as Error;
    return { success: false, profiles: [], message: `프로필 목록 조회 실패: ${err.message}` };
  }
}

/** ✅ [2026-03-13] 프로필 자동 생성 — AdsPower Local API */
export async function createAdsPowerProfile(profileName: string): Promise<{
  success: boolean;
  profileId?: string;
  serialNumber?: string;
  message: string;
}> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const body = JSON.stringify({
      name: profileName,
      group_id: '0',           // 기본 그룹
      repeat_config: ['0'],    // 지문 중복 허용
      user_proxy_config: { proxy_soft: 'no_proxy' },  // 프록시 없이 생성
    });

    const res = await fetch(`${ADSPOWER_BASE_URL}/api/v1/user/create${apiKeyParam()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const data = await res.json();

    if (data.code === 0 && data.data?.id) {
      console.log(`[AdsPower] ✅ 프로필 생성 성공: ${profileName} (ID: ${data.data.id})`);
      return {
        success: true,
        profileId: data.data.id,
        serialNumber: data.data.serial_number || data.data.id,
        message: `프로필 "${profileName}" 생성 완료!`,
      };
    }

    return {
      success: false,
      message: data.msg || `프로필 생성 실패: ${profileName}`,
    };
  } catch (error) {
    const err = error as Error;
    if (err.name === 'AbortError') {
      return { success: false, message: 'AdsPower에 연결할 수 없습니다. AdsPower를 실행해 주세요.' };
    }
    return { success: false, message: `프로필 생성 실패: ${err.message}` };
  }
}

/** ✅ [2026-03-13] 프로필 삭제 — AdsPower Local API */
export async function deleteAdsPowerProfile(profileIds: string[]): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const body = JSON.stringify({
      user_ids: profileIds,
    });

    const res = await fetch(`${ADSPOWER_BASE_URL}/api/v1/user/delete${apiKeyParam()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const data = await res.json();

    if (data.code === 0) {
      console.log(`[AdsPower] ✅ 프로필 삭제 성공: ${profileIds.join(', ')}`);
      return { success: true, message: `프로필 ${profileIds.length}개 삭제 완료` };
    }

    return { success: false, message: data.msg || '프로필 삭제 실패' };
  } catch (error) {
    const err = error as Error;
    return { success: false, message: `프로필 삭제 실패: ${err.message}` };
  }
}
