// src/main/ipc/aiAssistantHandlers.ts
// AI Assistant IPC 핸들러 — masterAgent 기반 챗 + autoFix
// [v2.10.246] main.ts에서 분리 — god-file 압축 5단계.
//
// 분리 4개 핸들러:
//   aiAssistant:chat, aiAssistant:getWelcome, aiAssistant:clearChat, aiAssistant:runAutoFix

import { ipcMain } from 'electron';
import { masterAgent } from '../../agents/masterAgent.js';
import { getWelcomeMessage } from '../../agents/persona.js';
import { loadConfig, applyConfigToEnv, saveConfig } from '../../configManager.js';

/**
 * aiAssistant:* 4개 IPC 일괄 등록.
 */
export function registerAiAssistantHandlers(): void {
    ipcMain.handle('aiAssistant:chat', async (_event, message: string) => {
        console.log('[AI Assistant] 메시지 수신:', message);
        try {
            try {
                const config = await loadConfig();
                applyConfigToEnv(config);
                try {
                    masterAgent.reinitGemini();
                } catch (e) {
                    console.warn('[main] catch ignored:', e);
                }
            } catch (e) {
                console.warn('[main] catch ignored:', e);
            }
            const result = await masterAgent.processMessage(message);
            console.log('[AI Assistant] 응답 생성 완료:', result.success);
            return result;
        } catch (error) {
            console.error('[AI Assistant] 처리 오류:', error);
            return {
                success: false,
                response: '죄송해요, 문제가 발생했어요. 다시 시도해주세요.',
                error: { code: 'PROCESSING_ERROR', message: (error as Error).message, recoverable: true }
            };
        }
    });

    ipcMain.handle('aiAssistant:getWelcome', async () => {
        return { success: true, message: getWelcomeMessage() };
    });

    ipcMain.handle('aiAssistant:clearChat', async () => {
        try {
            masterAgent.clearChat();
            return { success: true };
        } catch (error) {
            return { success: false, message: (error as Error).message || String(error) };
        }
    });

    // ✅ 시스템 자동 수정 IPC 핸들러
    ipcMain.handle('aiAssistant:runAutoFix', async () => {
        console.log('[AI Assistant] 🔧 자동 수정 시작...');
        const fixResults: { action: string; success: boolean; message: string }[] = [];

        try {
            const config = await loadConfig() as any;
            let configChanged = false;

            // 1. Gemini 모델 수정 - ✅ [2026-04-09] Stable 모델만 사용
            const validModels = [
                'gemini-2.5-flash',
                'gemini-2.5-flash-lite',
                'gemini-2.5-pro',
            ];

            // 죽은/차단된 모델은 품질·속도 균형이 가장 무난한 Flash로 마이그레이션
            const modelMigrationMap: Record<string, string> = {
                'gemini-3-pro': 'gemini-2.5-flash',
                'gemini-3-flash': 'gemini-2.5-flash',
                'gemini-3-pro-preview': 'gemini-2.5-flash',
                'gemini-3-flash-preview': 'gemini-2.5-flash',
                'gemini-3.1-pro-preview': 'gemini-2.5-flash',
                'gemini-3.1-flash-preview': 'gemini-2.5-flash',
                'gemini-2.5-pro-preview': 'gemini-2.5-flash',
                'gemini-2.0-flash': 'gemini-2.5-flash',
                'gemini-2.0-flash-exp': 'gemini-2.5-flash',
                'gemini-1.5-flash': 'gemini-2.5-flash',
                'gemini-1.5-flash-latest': 'gemini-2.5-flash',
                'gemini-1.5-pro': 'gemini-2.5-flash',
                'gemini-1.5-pro-latest': 'gemini-2.5-flash',
                'gemini-1.5-flash-8b': 'gemini-2.5-flash',
            };

            // 저장된 모델이 마이그레이션 대상인 경우 자동 변환
            if (config.geminiModel && modelMigrationMap[config.geminiModel]) {
                const oldModel = config.geminiModel;
                config.geminiModel = modelMigrationMap[config.geminiModel];
                configChanged = true;
                fixResults.push({ action: 'Gemini 모델 마이그레이션', success: true, message: `${oldModel} → ${config.geminiModel}로 자동 변환됨` });
            }

            if (config.geminiModel && !validModels.includes(config.geminiModel)) {
                config.geminiModel = 'gemini-2.5-flash';
                configChanged = true;
                fixResults.push({ action: 'Gemini 모델', success: true, message: '권장 모델(gemini-2.5-flash)로 변경됨' });
            }

            if (!config.geminiModel) {
                config.geminiModel = 'gemini-2.5-flash';
                configChanged = true;
                fixResults.push({ action: 'Gemini 모델 설정', success: true, message: '기본 모델 설정됨 (Flash)' });
            }

            // 설정 저장
            if (configChanged) {
                await saveConfig(config);
                console.log('[AI Assistant] ✅ 설정 자동 수정 완료');
            }

            return {
                success: true,
                fixResults,
                message: fixResults.length > 0
                    ? `✅ ${fixResults.length}개 항목 자동 수정 완료!`
                    : '수정할 항목이 없습니다.'
            };

        } catch (error) {
            console.error('[AI Assistant] 자동 수정 오류:', error);
            return {
                success: false,
                fixResults,
                message: `자동 수정 중 오류 발생: ${(error as Error).message}`
            };
        }
    });

    console.log('[IPC] AI Assistant handlers registered (4 handlers)');
}
