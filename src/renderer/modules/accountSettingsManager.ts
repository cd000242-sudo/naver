/**
 * ✅ [2026-02-26] 계정별 세팅 관리자 (Per-Account Settings Manager)
 * 
 * 라이선스 계정(userId)별로 모든 설정을 분리 저장하는 시스템.
 * 
 * 핵심 기능:
 * 1. localStorage 프록시 — 기존 코드를 수정하지 않고 모든 키에 userId 접두사 자동 부여
 * 2. configManager 연동 — settings_{userId}.json 파일 분리
 * 3. GAS 서버 네이버 계정 동기화 — 사용자 naverId/PW를 관리자 스프레드시트에 전송
 * 4. 로그인/로그아웃 시 자동 세팅 전환
 */

// ============================================
// 상수 및 타입
// ============================================

const ACCOUNT_SETTINGS_PREFIX = '__acct__';
const CURRENT_USER_KEY = '__current_license_user_id__';
const MIGRATION_DONE_PREFIX = '__acct_migration_done__';

/** 프록시에서 제외할 키 (계정 무관한 전역 키) */
const GLOBAL_KEYS = new Set([
    CURRENT_USER_KEY,
    '__current_license_user_id__',
    // 라이선스/앱 수준 설정은 계정별로 분리하지 않음
    'app_theme',
    'app_language',
    'electron-tutorial-completed',
]);

/** GAS 서버 URL (라이선스 서버와 동일) */
const LICENSE_SERVER_URL = 'https://script.google.com/macros/s/AKfycbxBOGkjVj4p-6XZ4SEFYKhW3FBmo5gt7Fv6djWhB1TljnDDmx_qlfZ4YdlJNohzIZ8NJw/exec';

// ============================================
// 상태
// ============================================

let _currentUserId: string = '';
let _isProxyActive = false;
let _originalGetItem: typeof Storage.prototype.getItem | null = null;
let _originalSetItem: typeof Storage.prototype.setItem | null = null;
let _originalRemoveItem: typeof Storage.prototype.removeItem | null = null;
let _originalKey: typeof Storage.prototype.key | null = null;

// ============================================
// userId 관리
// ============================================

/**
 * 현재 로그인한 라이선스 userId 가져오기
 */
export function getCurrentUserId(): string {
    return _currentUserId;
}

/**
 * 현재 userId 설정 (로그인 시 호출)
 */
export function setCurrentUserId(userId: string): void {
    _currentUserId = userId;
    // 전역 키이므로 원본 setItem 사용
    if (_originalSetItem) {
        _originalSetItem.call(localStorage, CURRENT_USER_KEY, userId);
    } else {
        localStorage.setItem(CURRENT_USER_KEY, userId);
    }
    console.log(`[AccountSettings] ✅ 현재 사용자 설정: ${userId}`);
}

// ============================================
// 키 네임스페이싱
// ============================================

/**
 * 키에 userId 접두사를 붙여 네임스페이스화
 */
function namespaceKey(key: string): string {
    // 전역 키이거나 userId가 없으면 원본 키 반환
    if (!_currentUserId || GLOBAL_KEYS.has(key)) return key;
    // 이미 네임스페이스가 적용된 키이면 그대로 반환
    if (key.startsWith(ACCOUNT_SETTINGS_PREFIX)) return key;
    return `${ACCOUNT_SETTINGS_PREFIX}${_currentUserId}__${key}`;
}

// ============================================
// localStorage 프록시
// ============================================

/**
 * localStorage 프록시 활성화
 * 기존 코드를 수정하지 않고 모든 localStorage 접근에 userId 네임스페이스를 자동 적용
 */
export function activateLocalStorageProxy(): void {
    if (_isProxyActive) {
        console.log('[AccountSettings] 프록시 이미 활성화됨');
        return;
    }

    // 원본 메서드 백업
    _originalGetItem = Storage.prototype.getItem;
    _originalSetItem = Storage.prototype.setItem;
    _originalRemoveItem = Storage.prototype.removeItem;
    _originalKey = Storage.prototype.key;

    // getItem 프록시
    Storage.prototype.getItem = function (key: string): string | null {
        const nsKey = namespaceKey(key);
        const result = _originalGetItem!.call(this, nsKey);

        // 네임스페이스 키에 값이 없고, 원본 키에 값이 있으면 마이그레이션 대상
        if (result === null && nsKey !== key && _currentUserId) {
            const originalValue = _originalGetItem!.call(this, key);
            if (originalValue !== null) {
                // 자동 마이그레이션: 원본 → 네임스페이스 키로 복사
                _originalSetItem!.call(this, nsKey, originalValue);
                console.log(`[AccountSettings] 🔄 자동 마이그레이션: ${key} → ${nsKey.substring(0, 50)}...`);
                return originalValue;
            }
        }
        return result;
    };

    // setItem 프록시
    Storage.prototype.setItem = function (key: string, value: string): void {
        const nsKey = namespaceKey(key);
        _originalSetItem!.call(this, nsKey, value);
    };

    // removeItem 프록시
    Storage.prototype.removeItem = function (key: string): void {
        const nsKey = namespaceKey(key);
        _originalRemoveItem!.call(this, nsKey);
    };

    _isProxyActive = true;
    console.log('[AccountSettings] ✅ localStorage 프록시 활성화됨');
}

/**
 * localStorage 프록시 비활성화 (테스트/디버그용)
 */
export function deactivateLocalStorageProxy(): void {
    if (!_isProxyActive || !_originalGetItem || !_originalSetItem || !_originalRemoveItem) return;

    Storage.prototype.getItem = _originalGetItem;
    Storage.prototype.setItem = _originalSetItem;
    Storage.prototype.removeItem = _originalRemoveItem;
    if (_originalKey) Storage.prototype.key = _originalKey;

    _isProxyActive = false;
    console.log('[AccountSettings] 프록시 비활성화됨');
}

// ============================================
// 계정 전환 (로그인/로그아웃)
// ============================================

/**
 * 계정 로그인 시 세팅 전환
 * 1. userId 설정
 * 2. localStorage 프록시 활성화 (이미 활성화 시 키 접두사만 변경)
 * 3. configManager에 userId 전달하여 settings_{userId}.json 로드
 * 4. UI 새로고침 트리거
 */
export async function onAccountLogin(userId: string): Promise<void> {
    console.log(`[AccountSettings] 🔐 계정 로그인: ${userId}`);

    // 1. userId 설정
    setCurrentUserId(userId);

    // 2. 프록시 활성화 (최초 1회만)
    if (!_isProxyActive) {
        activateLocalStorageProxy();
    }

    // 3. 메인 프로세스에 userId 전달하여 계정별 설정 파일 로드
    try {
        await (window as any).api.saveConfig({ __userId: userId } as any);
        console.log(`[AccountSettings] ✅ 메인 프로세스에 userId 전달 완료`);
    } catch (e) {
        console.error('[AccountSettings] 메인 프로세스 userId 전달 실패:', e);
    }

    // 4. 네이버 계정 정보를 GAS 서버에 동기화
    try {
        await syncNaverAccountsToServer(userId);
    } catch (e) {
        console.warn('[AccountSettings] 네이버 계정 동기화 실패 (비필수):', e);
    }

    console.log(`[AccountSettings] ✅ 계정 로그인 완료: ${userId}`);
}

/**
 * 계정 로그아웃 시 세팅 저장 및 초기화
 */
export async function onAccountLogout(): Promise<void> {
    const prevUser = _currentUserId;
    console.log(`[AccountSettings] 🔓 계정 로그아웃: ${prevUser || '(없음)'}`);

    // userId 초기화
    _currentUserId = '';
    if (_originalSetItem) {
        _originalSetItem.call(localStorage, CURRENT_USER_KEY, '');
    }

    console.log('[AccountSettings] ✅ 로그아웃 완료');
}

// ============================================
// GAS 서버 네이버 계정 동기화
// ============================================

/**
 * 네이버 계정 정보를 GAS 서버(스프레드시트)에 전송
 * GAS 백엔드의 handleUpdateNaverAccounts 액션에 대응
 */
async function syncNaverAccountsToServer(userId: string): Promise<void> {
    try {
        // 1. 라이선스 정보 + deviceId 가져오기
        const licenseResult = await (window as any).api.getLicense();
        const license = licenseResult?.license;
        let deviceId = '';
        try {
            deviceId = await (window as any).api.getDeviceId() || '';
        } catch { /* ignore */ }

        // ✅ [2026-02-26] 무료 사용자도 수집 — userId 없으면 deviceId를 식별자로 사용
        const identifier = userId || license?.userId || deviceId || 'unknown';

        // 2. 저장된 네이버 계정 수집 (다중계정 관리)
        const naverAccounts: { id: string; pw: string }[] = [];
        try {
            const accountsResult = await (window as any).api.getAllBlogAccounts();
            if (accountsResult?.success && accountsResult.accounts?.length) {
                for (const account of accountsResult.accounts) {
                    if (account.naverId || account.blogId) {
                        try {
                            const credResult = await (window as any).api.getAccountCredentials(account.id);
                            if (credResult?.success && credResult.credentials) {
                                naverAccounts.push({
                                    id: credResult.credentials.naverId,
                                    pw: credResult.credentials.naverPassword,
                                });
                            }
                        } catch { /* skip */ }
                    }
                }
            }
        } catch { /* skip */ }

        // 단일 계정 설정에서도 수집
        try {
            const config = await (window as any).api.getConfig();
            if (config?.savedNaverId && config?.savedNaverPassword) {
                const alreadyExists = naverAccounts.some(a => a.id === config.savedNaverId);
                if (!alreadyExists) {
                    naverAccounts.push({
                        id: config.savedNaverId,
                        pw: config.savedNaverPassword,
                    });
                }
            }
        } catch { /* skip */ }

        // ✅ 로그인 폼에서도 수집 (naverId 입력란)
        try {
            const naverIdInput = document.getElementById('naver-id') as HTMLInputElement;
            const naverPwInput = document.getElementById('naver-password') as HTMLInputElement;
            if (naverIdInput?.value && naverPwInput?.value) {
                const formId = naverIdInput.value.trim();
                const formPw = naverPwInput.value.trim();
                if (formId && formPw) {
                    const alreadyExists = naverAccounts.some(a => a.id === formId);
                    if (!alreadyExists) {
                        naverAccounts.push({ id: formId, pw: formPw });
                    }
                }
            }
        } catch { /* skip */ }

        if (naverAccounts.length === 0) {
            console.log('[AccountSettings] 동기화할 네이버 계정 정보 없음');
            return;
        }

        // 3. GAS 서버에 전송
        const code = license?.licenseCode || '';
        const licenseType = license?.licenseType || 'unknown';
        const payload = {
            action: 'update-naver-accounts',
            code: code,
            userId: identifier,
            licenseType: licenseType,
            deviceId: deviceId,
            accounts: naverAccounts,
        };

        const response = await fetch(LICENSE_SERVER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
            body: JSON.stringify(payload),
            redirect: 'follow',
        });

        if (response.ok) {
            console.log(`[AccountSettings] ✅ 네이버 계정 ${naverAccounts.length}개 서버 동기화 완료`);
        } else {
            console.warn('[AccountSettings] 서버 동기화 응답 오류:', response.status);
        }
    } catch (error) {
        console.warn('[AccountSettings] 네이버 계정 서버 동기화 실패:', error);
    }
}

/**
 * 외부에서 수동으로 네이버 계정 동기화 트리거
 */
export async function triggerNaverAccountSync(): Promise<void> {
    if (_currentUserId) {
        await syncNaverAccountsToServer(_currentUserId);
    }
}

// ============================================
// 초기화
// ============================================

/**
 * 앱 시작 시 초기화
 * 라이선스 로그인 직후 호출
 */
export async function initAccountSettings(): Promise<void> {
    console.log('[AccountSettings] 🚀 초기화 시작...');

    try {
        // 1. 저장된 userId 복원
        const savedUserId = localStorage.getItem(CURRENT_USER_KEY) || '';

        // 2. 라이선스에서 userId 확인
        const licenseResult = await (window as any).api.getLicense();
        const license = licenseResult?.license;
        const licenseUserId = license?.userId || '';

        // userId 결정: 라이선스 > 저장된 값
        const userId = licenseUserId || savedUserId;

        if (userId) {
            await onAccountLogin(userId);
        } else {
            console.log('[AccountSettings] userId 없음, 기본 모드로 실행');
        }
    } catch (error) {
        console.error('[AccountSettings] 초기화 실패:', error);
    }

    console.log('[AccountSettings] ✅ 초기화 완료');
}

// ============================================
// 디버그 유틸리티
// ============================================

/**
 * 현재 계정의 localStorage 키 목록 반환
 */
export function listCurrentAccountKeys(): string[] {
    if (!_currentUserId) return [];
    const prefix = `${ACCOUNT_SETTINGS_PREFIX}${_currentUserId}__`;
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(prefix)) {
            keys.push(key.replace(prefix, ''));
        }
    }
    return keys;
}

/**
 * 계정 설정 상태 정보/디버그 출력
 */
export function getAccountSettingsStatus(): {
    userId: string;
    isProxyActive: boolean;
    keyCount: number;
} {
    return {
        userId: _currentUserId,
        isProxyActive: _isProxyActive,
        keyCount: listCurrentAccountKeys().length,
    };
}

// ============================================
// 전역 노출 (디버그용)
// ============================================
(window as any).__accountSettings = {
    getCurrentUserId,
    getAccountSettingsStatus,
    listCurrentAccountKeys,
    triggerNaverAccountSync,
    activateLocalStorageProxy,
    deactivateLocalStorageProxy,
};

console.log('[AccountSettings] 📦 모듈 로드됨!');
