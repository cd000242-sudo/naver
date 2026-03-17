// src/main/utils/authUtils.ts
// 인증/라이선스 관련 유틸리티 함수

import { app } from 'electron';
import { loadLicense, getDeviceId, type LicenseInfo } from '../../licenseManager.js';
import { loadConfig } from '../../configManager.js';
import { canConsume as canConsumeQuota, getStatus as getQuotaStatus, type QuotaLimits, type QuotaType } from '../../quotaManager.js';
import { Logger } from './logger.js';

/**
 * 라이선스 유효성 검증
 * ✅ [2026-03-01] main.ts 버전과 동기화 — 재시도, 대소문자 무시, LIFE/premium 처리
 */
export async function ensureLicenseValid(): Promise<boolean> {
    const forceLicenseCheck = process.env.FORCE_LICENSE_CHECK === 'true';
    const currentIsPackaged = app.isPackaged;

    if (!currentIsPackaged && !forceLicenseCheck) {
        Logger.debug('[AuthUtils] ensureLicenseValid: 개발 환경 (인증 건너뜀)');
        return true;
    }

    // ✅ 1차 시도
    let license = await loadLicense();

    // ✅ 1차 실패 → 500ms 대기 후 재시도 (일시적 I/O 오류 방어)
    if (!license) {
        Logger.debug('[AuthUtils] ensureLicenseValid: 1차 loadLicense() 실패 — 500ms 후 재시도');
        await new Promise(r => setTimeout(r, 500));
        license = await loadLicense();
    }

    if (!license) {
        Logger.debug('[AuthUtils] ensureLicenseValid: ❌ 라이선스 파일을 찾을 수 없습니다. (loadLicense() returned null)');
        return false;
    }

    Logger.debug(`[AuthUtils] ensureLicenseValid: 라이선스 로드 성공 — isValid: ${license.isValid}, licenseType: ${license.licenseType}, expiresAt: ${license.expiresAt}, authMethod: ${license.authMethod}`);

    // ✅ 대소문자 무시 비교 (서버가 'free', 'FREE', 'Free' 등 반환 가능)
    const licenseType = String((license as any).licenseType || '').trim().toLowerCase();
    if (licenseType === 'free') {
        Logger.debug('[AuthUtils] ensureLicenseValid: 무료 라이선스 (항상 유효)');
        return true;
    }

    // ✅ LIFE(영구) / premium / standard 라이선스 특별 처리
    if (licenseType === 'life' || licenseType === 'premium' || licenseType === 'standard') {
        if (license.isValid === false) {
            Logger.debug(`[AuthUtils] ensureLicenseValid: ❌ ${licenseType} 라이선스이지만 isValid=false`);
            return false;
        }

        // LIFE 라이선스는 만료일이 없어도 유효
        if (licenseType === 'life' && !license.expiresAt) {
            Logger.debug('[AuthUtils] ensureLicenseValid: ✅ LIFE 영구 라이선스 (만료일 없음, 항상 유효)');
            return true;
        }
    }

    if (license.isValid === false) {
        Logger.debug('[AuthUtils] ensureLicenseValid: ❌ 라이선스 isValid 플래그가 false입니다.');
        return false;
    }

    // 만료 확인 (날짜만 비교, 만료일은 해당 날짜의 끝까지 유효)
    if (license.expiresAt) {
        try {
            const expiresAt = new Date(license.expiresAt);
            if (isNaN(expiresAt.getTime())) {
                Logger.debug(`[AuthUtils] ensureLicenseValid: 만료일 '${license.expiresAt}' 형식이 유효하지 않습니다.`);
                return true;
            }

            const now = new Date();
            const expiresAtEndOfDay = new Date(
                expiresAt.getFullYear(),
                expiresAt.getMonth(),
                expiresAt.getDate(),
                23, 59, 59, 999
            );

            if (now.getTime() > expiresAtEndOfDay.getTime()) {
                Logger.debug(`[AuthUtils] ensureLicenseValid: ❌ 라이선스 만료됨 (만료: ${expiresAtEndOfDay.toISOString()}, 현재: ${now.toISOString()})`);
                return false;
            }

            Logger.debug(`[AuthUtils] ensureLicenseValid: 라이선스 유효함 (만료: ${expiresAtEndOfDay.toISOString()}, 남은 기간: 약 ${Math.floor((expiresAtEndOfDay.getTime() - now.getTime()) / (24 * 3600000))}일)`);
        } catch (error) {
            Logger.error('[AuthUtils] ensureLicenseValid: 만료일 체크 중 오류', error as Error);
        }
    } else {
        Logger.debug('[AuthUtils] ensureLicenseValid: expiresAt 없음 (영구 라이선스)');
    }

    return true;
}

/**
 * 무료 사용자 여부 확인
 */
export async function isFreeTierUser(): Promise<boolean> {
    const forceLicenseCheck = process.env.FORCE_LICENSE_CHECK === 'true';
    if (!app.isPackaged && !forceLicenseCheck) {
        return false;
    }

    // ✅ [2026-03-05] 라이선스 우선 체크 → free이면 무조건 무료 (config 우회 차단)
    const license = await loadLicense();
    if (license?.licenseType === 'free') {
        return true; // 라이선스가 free이면 geminiPlanType 설정과 무관하게 무료
    }

    // ✅ 라이선스가 free가 아닌 경우에만 config 체크 (유료 크레딧 사용자 대응)
    try {
        const config = await loadConfig();
        if ((config as any).geminiPlanType === 'paid') return false;
    } catch (e) {
        console.warn('[authUtils] catch ignored:', e);
    }

    return false;
}

/**
 * 무료 티어 한도 가져오기
 */
export async function getFreeQuotaLimits(): Promise<QuotaLimits> {
    const limit = 2;
    return {
        publish: limit,
        content: limit,
        media: Number.MAX_SAFE_INTEGER,
        imageApi: 500,  // ✅ [2026-03-02] 일일 이미지 API 기본 한도
    };
}

/**
 * 무료 티어 quota 상태 가져오기
 */
export async function getFreeQuotaStatus(): Promise<ReturnType<typeof getQuotaStatus>> {
    const limits = await getFreeQuotaLimits();
    return getQuotaStatus(limits);
}

/**
 * Paywall 응답 생성
 */
export async function getPaywallResponse(message?: string): Promise<{ success: false; code: 'PAYWALL'; message: string; quota: any }> {
    const quota = await getFreeQuotaStatus();
    return {
        success: false,
        code: 'PAYWALL',
        message: message || "⛔ 일일 한도 초과! Pro 버전을 사용하면 제한 없이 글을 쓸 수 있습니다.",
        quota,
    };
}

/**
 * 무료 티어 강제 체크
 */
export async function enforceFreeTier(action: QuotaType, amount: number = 1): Promise<{ allowed: true; quota: any } | { allowed: false; response: any }> {
    const isFree = await isFreeTierUser();
    if (!isFree) {
        return { allowed: true, quota: null };
    }

    const quota = await getFreeQuotaStatus();
    if (quota.isPaywalled) {
        return { allowed: false, response: await getPaywallResponse() };
    }

    const limits = await getFreeQuotaLimits();
    const ok = await canConsumeQuota(action, limits, amount);
    if (!ok) {
        return { allowed: false, response: await getPaywallResponse() };
    }

    return { allowed: true, quota };
}

// ============================================
// 통합 검증 헬퍼 (라이선스 + quota 한번에)
// ============================================

export type ValidationResult<T = any> =
    | { valid: true }
    | { valid: false; response: T };

/**
 * 라이선스 + quota 통합 검증
 * @param quotaType - quota 타입 (publish, content, media)
 * @param amount - 소비량
 * @returns valid: true 또는 { valid: false, response }
 */
export async function validateLicenseAndQuota(
    quotaType: QuotaType,
    amount: number = 1
): Promise<{ valid: true } | { valid: false; response: { success: false; message: string } }> {
    // 라이선스 체크
    if (!(await ensureLicenseValid())) {
        return {
            valid: false,
            response: { success: false, message: '라이선스 인증이 필요합니다.' }
        };
    }

    // quota 체크
    const quotaCheck = await enforceFreeTier(quotaType, amount);
    if (!quotaCheck.allowed) {
        return { valid: false, response: quotaCheck.response };
    }

    return { valid: true };
}

/**
 * 라이선스만 검증 (quota 불필요한 경우)
 */
export async function validateLicenseOnly(): Promise<{ valid: true } | { valid: false; response: { success: false; message: string } }> {
    if (!(await ensureLicenseValid())) {
        return {
            valid: false,
            response: { success: false, message: '라이선스 인증이 필요합니다.' }
        };
    }
    return { valid: true };
}
