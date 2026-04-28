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
                // ✅ [v2.7.21 HOTFIX] 400 false-positive 수정
                //   사용자 제보: "키는 정확한데 400 오류뜨면서 키가 정확하지 않다고 뜬다"
                //   원인: 400은 키 무효가 아닌 다양한 사유 (요청 형식/모델 미지원/지역 제한 등)
                //   수정: 400은 응답 본문 검사로 진짜 키 문제인지 판별. 401/403만 확정 인증 에러.
                if (status === 400) {
                    const detailLower = String(errorDetail || '').toLowerCase();
                    const respStatus = String(respData?.error?.status || '').toUpperCase();
                    const isKeyInvalid =
                        respStatus === 'INVALID_ARGUMENT' && /api[\s_-]*key/i.test(detailLower)
                        || /api[\s_-]*key[\s_-]*not[\s_-]*valid|api_key_invalid|invalid api key/i.test(detailLower);
                    if (isKeyInvalid) {
                        return { success: false, message: `❌ API 키가 유효하지 않습니다 (HTTP 400).\n상세: ${errorDetail}\n\n키 길이: ${key.length}자 | 접두사: ${key.substring(0, 6)}...\n\n💡 Google AI Studio에서 키를 다시 확인해주세요.` };
                    }
                    // 키 문제 아닌 400 — 다른 안내
                    return {
                        success: false,
                        message: `⚠️ API 호출 거부 (HTTP 400) — 키 자체는 작동할 수 있습니다.\n상세: ${errorDetail}\n\n가능한 원인:\n• 요청 형식 문제 (앱 자동 수정됨)\n• 일부 모델이 사용자 Tier에서 미지원 (자동 폴백 작동)\n• 지역 제한 (한국에서 일부 preview 모델 차단)\n\n키 길이: ${key.length}자 | 접두사: ${key.substring(0, 6)}...\n💡 키가 맞다고 확신하면 발행을 시도해 보세요. 안정 모델로 자동 폴백됩니다.`,
                    };
                }
                if (status === 401 || status === 403) {
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
                    `${baseUrl}/models/gemini-2.5-flash:generateContent`,
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
            // ✅ [v1.4.49] 기본값을 'free'로 (결제 수단 없는 사용자가 대다수)
            const userPlanType = config.geminiPlanType || 'free';

            // ✅ [2026-03-19] flush 후 메모리+디스크 합산 스냅샷 사용 (배치 중 누적분 포함)
            await flushGeminiUsage();
            const usageTracker = await getGeminiUsageSnapshot();
            const creditBudget = (config as any).geminiCreditBudget || 300; // 기본 $300

            // ✅ [v1.4.49] Google 공식 가격표 + 실측 기반 정확한 한도 (2026-04 기준)
            // 출처: https://ai.google.dev/gemini-api/docs/rate-limits
            const planInfo = userPlanType === 'free' ? {
                label: '🆓 무료 (Free tier)',
                limits: {
                    // Flash 2.5 기준 (실측)
                    rpm: 10,         // 분당 요청 수
                    rpd: 250,        // 일일 요청 수
                    tpm: '250,000',  // 분당 토큰
                    note: 'Flash-Lite는 RPD 20건/일로 더 적음. Pro는 차단(limit:0).',
                },
                pricing: {
                    flash_input: '$0 (무료)',
                    flash_output: '$0 (무료)',
                    flash_lite_input: '$0 (무료, RPD 20/일)',
                    pro_input: '사용 불가 (무료 티어 차단)',
                    pro_output: '사용 불가',
                    note: '무료는 하루 250건 한도. 초과 시 다음날까지 대기. 상업적 사용 가능.',
                },
            } : {
                label: '💎 유료 (Tier 1 / Pay-as-you-go)',
                limits: {
                    // Flash 2.5 Tier 1 기준
                    rpm: 1000,        // 분당 요청 수
                    rpd: 10000,       // 일일 요청 수 (Flash 기준, Flash-Lite는 30000)
                    tpm: '1,000,000', // 분당 토큰
                    note: 'Flash-Lite는 RPD 30,000건/일로 더 많음. Pro는 50건/일.',
                },
                pricing: {
                    flash_input: '$0.10 / 1M tokens',
                    flash_output: '$0.40 / 1M tokens',
                    flash_lite_input: '$0.025 / 1M tokens (Flash의 1/4)',
                    flash_lite_output: '$0.10 / 1M tokens (Flash의 1/4)',
                    pro_input: '$1.25 / 1M tokens',
                    pro_output: '$5.00 / 1M tokens',
                    note: 'Flash-Lite 권장 — 글 1개당 약 ₩1로 가장 저렴. 크레딧 소진 후 카드 자동 청구 시작.',
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

    // ✅ [v1.4.54] 디버그 덤프 폴더 열기
    ipcMain.handle('debug:openDumpFolder', async () => {
        try {
            const { getDumpRoot } = await import('../../debug/domDumpManager.js');
            const { shell } = await import('electron');
            const fs = await import('fs/promises');
            const dumpRoot = getDumpRoot();
            // 폴더가 없으면 생성
            await fs.mkdir(dumpRoot, { recursive: true });
            await shell.openPath(dumpRoot);
            return { success: true, path: dumpRoot };
        } catch (e) {
            console.error('[Debug] 덤프 폴더 열기 실패:', e);
            return { success: false, message: (e as Error).message };
        }
    });

    // ✅ [v1.4.54] 덤프 수동 정리
    ipcMain.handle('debug:cleanupDumps', async () => {
        try {
            const { cleanupOldDumps } = await import('../../debug/domDumpManager.js');
            const result = await cleanupOldDumps();
            return { success: true, data: result };
        } catch (e) {
            return { success: false, message: (e as Error).message };
        }
    });
}
