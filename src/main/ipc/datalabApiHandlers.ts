// src/main/ipc/datalabApiHandlers.ts
// 네이버 데이터랩 API IPC 핸들러
// [v2.10.258] main.ts에서 분리 — god-file 압축 17단계.
//
// 분리 3개 핸들러:
//   datalab:getTrendSummary, getSearchTrend, getRelatedKeywords

import { ipcMain } from 'electron';
import { loadConfig, applyConfigToEnv } from '../../configManager.js';
import { ensureLicenseValid, validateLicenseOnly } from '../utils/authUtils.js';
import { createDatalabClient } from '../../naverDatalab.js';

export function registerDatalabApiHandlers(): void {
    ipcMain.handle('datalab:getTrendSummary', async (_event, keyword: string) => {
        // ✅ 실행 직전 최신 설정 강제 동기화
        try {
            const config = await loadConfig();
            applyConfigToEnv(config);
        } catch (e) {
            console.error('[Main] datalab:getTrendSummary - 설정 동기화 실패:', e);
        }

        // ✅ [리팩토링] 통합 검증
        const check = await validateLicenseOnly();
        if (!check.valid) return check.response;

        try {
            const datalabClient = createDatalabClient();
            if (!datalabClient) {
                return {
                    success: false,
                    message: '네이버 데이터랩 API가 설정되지 않았습니다. 환경 설정에서 Client ID와 Secret을 입력해주세요.',
                };
            }

            const summary = await datalabClient.getTrendSummary(keyword);
            return {
                success: true,
                data: summary,
            };
        } catch (error) {
            return {
                success: false,
                message: `트렌드 분석 실패: ${(error as Error).message}`,
            };
        }
    });

    ipcMain.handle('datalab:getSearchTrend', async (
        _event,
        keywords: string[],
        startDate: string,
        endDate: string,
        timeUnit: 'date' | 'week' | 'month' = 'date',
    ) => {
        try {
            const config = await loadConfig();
            applyConfigToEnv(config);
        } catch (e) {
            console.error('[Main] datalab:getSearchTrend - 설정 동기화 실패:', e);
        }

        const check = await validateLicenseOnly();
        if (!check.valid) return check.response;

        try {
            const datalabClient = createDatalabClient();
            if (!datalabClient) {
                return {
                    success: false,
                    message: '네이버 데이터랩 API가 설정되지 않았습니다.',
                };
            }

            const trend = await datalabClient.getSearchTrend(keywords, startDate, endDate, timeUnit);
            return {
                success: true,
                data: trend,
            };
        } catch (error) {
            return {
                success: false,
                message: `검색 트렌드 조회 실패: ${(error as Error).message}`,
            };
        }
    });

    ipcMain.handle('datalab:getRelatedKeywords', async (_event, keyword: string) => {
        try {
            const config = await loadConfig();
            applyConfigToEnv(config);
        } catch (e) {
            console.error('[Main] datalab:getRelatedKeywords - 설정 동기화 실패:', e);
        }

        // 라이선스 체크
        if (!(await ensureLicenseValid())) {
            return { success: false, message: '라이선스 인증이 필요합니다. 라이선스를 인증해주세요.' };
        }
        try {
            const datalabClient = createDatalabClient();
            if (!datalabClient) {
                return {
                    success: false,
                    message: '네이버 데이터랩 API가 설정되지 않았습니다.',
                };
            }

            const related = await datalabClient.getRelatedKeywords(keyword);
            return {
                success: true,
                data: related,
            };
        } catch (error) {
            return {
                success: false,
                message: `관련 키워드 조회 실패: ${(error as Error).message}`,
            };
        }
    });

    console.log('[IPC] Datalab API handlers registered (3 handlers)');
}
