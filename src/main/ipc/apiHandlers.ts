// src/main/ipc/apiHandlers.ts
// API/Gemini 관련 IPC 핸들러

import { ipcMain } from 'electron';
import { IpcContext } from '../types';
import { loadConfig, saveConfig } from '../../configManager.js';
import { flushGeminiUsage, getGeminiUsageSnapshot } from '../../gemini.js';
import { flushAllApiUsage, getApiUsageSnapshot, resetApiUsage, type ApiProvider } from '../../apiUsageTracker.js';

/**
 * API/Gemini 핸들러 등록
 */
export function registerApiHandlers(_ctx: IpcContext): void {

    // ✅ [2026-03-18] Gemini API 할당량 확인 핸들러 (정확한 공식 데이터 기반)
    ipcMain.handle('gemini:checkQuota', async (_event, apiKey: string) => {
        try {
            if (!apiKey || !apiKey.trim()) {
                return { success: false, message: 'API 키를 먼저 입력해주세요.' };
            }

            const key = apiKey.trim();
            console.log(`[Gemini] 🔍 할당량 확인 시작 - API 키 길이: ${key.length}자, 접두사: ${key.substring(0, 6)}...`);
            const axios = (await import('axios')).default;
            const baseUrl = 'https://generativelanguage.googleapis.com/v1beta';

            // 1. 모델 목록 조회 (API 키 유효성 + 사용 가능 모델 확인) — 실제 API 응답
            let models: any[] = [];
            try {
                const modelsResp = await axios.get(`${baseUrl}/models`, {
                    headers: { 'x-goog-api-key': key },
                    timeout: 15000,
                });
                models = modelsResp.data?.models || [];
                console.log(`[Gemini] ✅ 모델 목록 조회 성공: ${models.length}개 모델`);
            } catch (modelsErr: any) {
                const status = modelsErr?.response?.status;
                const respData = modelsErr?.response?.data;
                const errorDetail = respData?.error?.message || respData?.error?.status || JSON.stringify(respData || {}).substring(0, 200);
                console.error(`[Gemini] ❌ 모델 목록 조회 실패 - HTTP ${status}, 상세: ${errorDetail}`);
                console.error(`[Gemini]   API 키 길이: ${key.length}자, 접두사: ${key.substring(0, 6)}...`);
                if (status === 400 || status === 401 || status === 403) {
                    return { success: false, message: `❌ API 키가 유효하지 않습니다 (HTTP ${status}).\n상세: ${errorDetail}\n\n키 길이: ${key.length}자 | 접두사: ${key.substring(0, 6)}...\n\n💡 Google AI Studio에서 키를 다시 확인해주세요.` };
                }
                if (status === 429) {
                    return { success: false, message: '⚠️ API 요청 한도 초과 (429). 잠시 후 다시 시도해주세요.' };
                }
                return { success: false, message: `API 연결 실패 (HTTP ${status || '?'}): ${modelsErr?.message || '알 수 없는 오류'}\n상세: ${errorDetail}` };
            }

            // 2. 주요 모델 필터링 — 실제 API 응답에서 추출
            const geminiModels = models.filter((m: any) =>
                m.name?.includes('gemini') && m.supportedGenerationMethods?.includes('generateContent')
            );
            const flashModels = geminiModels.filter((m: any) => m.name?.includes('flash'));
            const proModels = geminiModels.filter((m: any) => m.name?.includes('pro') && !m.name?.includes('flash'));

            // 3. 경량 테스트 호출 — 실제 토큰 사용량 확인 (usageMetadata)
            let testCallResult: any = null;
            try {
                const testResp = await axios.post(
                    `${baseUrl}/models/gemini-2.0-flash:generateContent`,
                    { contents: [{ parts: [{ text: 'Hi' }] }] },
                    {
                        headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
                        timeout: 15000,
                    }
                );
                const usage = testResp.data?.usageMetadata;
                if (usage) {
                    testCallResult = {
                        promptTokens: usage.promptTokenCount || 0,
                        outputTokens: usage.candidatesTokenCount || 0,
                        totalTokens: usage.totalTokenCount || 0,
                    };
                }
            } catch (testErr: any) {
                if (testErr?.response?.status === 429) {
                    testCallResult = { error: '현재 분당 요청 한도 초과 (429)' };
                } else {
                    testCallResult = { error: testErr?.message || '테스트 호출 실패' };
                }
            }

            // 4. 사용자의 현재 플랜 설정 읽기
            const config = await loadConfig();
            const userPlanType = config.geminiPlanType || 'paid'; // 사용자 설정값

            // ✅ [2026-03-19] flush 후 메모리+디스크 합산 스냅샷 사용 (배치 중 누적분 포함)
            await flushGeminiUsage();
            const usageTracker = await getGeminiUsageSnapshot();
            const creditBudget = (config as any).geminiCreditBudget || 300; // 기본 $300

            // 5. Google 공식 가격표 기반 플랜별 정보 (2026-03 기준)
            // 출처: https://ai.google.dev/pricing
            const planInfo = userPlanType === 'free' ? {
                label: '🆓 무료 (Free tier)',
                limits: {
                    rpm: 15,         // 분당 요청 수
                    rpd: 1500,       // 일일 요청 수
                    tpm: '1,000,000', // 분당 토큰
                },
                pricing: {
                    flash_input: '$0 (무료)',
                    flash_output: '$0 (무료)',
                    pro_input: '$0 (무료)',
                    pro_output: '$0 (무료)',
                    note: '무료 티어는 속도 제한이 있으며, 상업적 사용이 제한됩니다.',
                },
            } : {
                label: '💎 유료 (Pay-as-you-go)',
                limits: {
                    rpm: 2000,        // 분당 요청 수
                    rpd: '무제한',     // 일일 요청 수
                    tpm: '4,000,000', // 분당 토큰
                },
                pricing: {
                    flash_input: '$0.10 / 1M tokens',
                    flash_output: '$0.40 / 1M tokens',
                    pro_input: '$1.25 / 1M tokens',
                    pro_output: '$5.00 / 1M tokens',
                    note: '유료 플랜은 높은 속도 제한과 상업적 사용이 가능합니다.',
                },
            };

            // 6. 결과 조합 — 모든 데이터가 실제 API 응답 또는 공식 문서 기반
            return {
                success: true,
                data: {
                    keyValid: true,
                    userPlanType, // 사용자가 설정한 플랜
                    planLabel: planInfo.label,
                    totalModels: geminiModels.length,
                    flashModels: flashModels.map((m: any) => m.name?.replace('models/', '')).slice(0, 5),
                    proModels: proModels.map((m: any) => m.name?.replace('models/', '')).slice(0, 5),
                    limits: planInfo.limits,
                    pricing: planInfo.pricing,
                    testCallResult,
                    // ✅ [2026-03-18] 앱 내 누적 사용량 데이터
                    usageTracker: {
                        totalInputTokens: usageTracker.totalInputTokens,
                        totalOutputTokens: usageTracker.totalOutputTokens,
                        totalCalls: usageTracker.totalCalls,
                        estimatedCostUSD: usageTracker.estimatedCostUSD,
                        lastUpdated: usageTracker.lastUpdated,
                        firstTracked: usageTracker.firstTracked,
                    },
                    creditBudget, // 사용자 설정 예산
                },
            };
        } catch (error) {
            console.error('[Gemini] 할당량 확인 실패:', error);
            return { success: false, message: `할당량 확인 실패: ${(error as Error).message}` };
        }
    });

    // ✅ [2026-03-18] Gemini 사용량 추적 관리 IPC 핸들러
    ipcMain.handle('gemini:resetUsageTracker', async () => {
        try {
            const config = await loadConfig();
            await saveConfig({
                geminiUsageTracker: {
                    totalInputTokens: 0,
                    totalOutputTokens: 0,
                    totalCalls: 0,
                    estimatedCostUSD: 0,
                    lastUpdated: new Date().toISOString(),
                    firstTracked: new Date().toISOString(),
                },
            } as any);
            console.log('[Gemini] 🔄 사용량 추적 초기화 완료');
            return { success: true };
        } catch (e) {
            return { success: false, message: (e as Error).message };
        }
    });

    ipcMain.handle('gemini:setCreditBudget', async (_event, budget: number) => {
        try {
            await saveConfig({ geminiCreditBudget: budget } as any);
            console.log(`[Gemini] 💰 예산 설정: $${budget}`);
            return { success: true };
        } catch (e) {
            return { success: false, message: (e as Error).message };
        }
    });

    // ✅ [2026-03-19] 통합 API 사용량 조회 핸들러
    ipcMain.handle('api:getAllUsageSnapshots', async () => {
        try {
            await flushAllApiUsage();
            const snapshots = await getApiUsageSnapshot();
            return { success: true, data: snapshots };
        } catch (e) {
            console.error('[ApiUsage] 스냅샷 조회 실패:', e);
            return { success: false, message: (e as Error).message };
        }
    });

    // ✅ [2026-03-19] 통합 API 사용량 초기화 핸들러 (제공자별 또는 전체)
    ipcMain.handle('api:resetUsage', async (_event, provider?: string) => {
        try {
            await resetApiUsage(provider as ApiProvider | undefined);
            return { success: true };
        } catch (e) {
            console.error('[ApiUsage] 초기화 실패:', e);
            return { success: false, message: (e as Error).message };
        }
    });
}
