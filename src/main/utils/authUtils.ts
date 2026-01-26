// src/main/utils/authUtils.ts
// 인증/라이선스 관련 유틸리티 함수

import { app } from 'electron';
import { loadLicense, getDeviceId, type LicenseInfo } from '../../licenseManager.js';
import { loadConfig } from '../../configManager.js';
import { canConsume as canConsumeQuota, getStatus as getQuotaStatus, type QuotaLimits, type QuotaType } from '../../quotaManager.js';
import { Logger } from './logger.js';

/**
 * 라이선스 유효성 검증
 */
export async function ensureLicenseValid(): Promise<boolean> {
    const forceLicenseCheck = process.env.FORCE_LICENSE_CHECK === 'true';
    const currentIsPackaged = app.isPackaged;

    if (!currentIsPackaged && !forceLicenseCheck) {
        Logger.debug('[AuthUtils] 개발 환경 (인증 건너뜀)');
        return true;
    }

    const license = await loadLicense();
    if (!license) {
        Logger.debug('[AuthUtils] 라이선스 파일을 찾을 수 없습니다.');
        return false;
    }

    const licenseType = String((license as any).licenseType || '').trim();
    if (licenseType === 'free') {
        Logger.debug('[AuthUtils] 무료 라이선스 (항상 유효)');
        return true;
    }

    if (license.isValid === false) {
        Logger.debug('[AuthUtils] 라이선스 isValid 플래그가 false입니다.');
        return false;
    }

    // 만료 확인
    if (license.expiresAt) {
        try {
            const expiresAt = new Date(license.expiresAt);
            if (isNaN(expiresAt.getTime())) {
                Logger.debug(`[AuthUtils] 만료일 형식이 유효하지 않습니다: ${license.expiresAt}`);
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
                Logger.debug('[AuthUtils] 라이선스 만료됨');
                return false;
            }

            Logger.debug('[AuthUtils] 라이선스 유효함');
        } catch (error) {
            Logger.error('[AuthUtils] 만료일 체크 중 오류', error as Error);
        }
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

    // 1. 라이선스 타입 먼저 확인 (가장 확실함)
    const license = await loadLicense();
    if (license?.licenseType === 'free') {
        return true;
    }

    try {
        const config = await loadConfig();
        if ((config as any).geminiPlanType === 'paid') return false;
    } catch {
        // ignore
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
