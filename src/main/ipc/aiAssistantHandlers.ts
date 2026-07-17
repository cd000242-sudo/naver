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
import {
    GEMINI_TEXT_MODELS,
} from '../../runtime/modelRegistry.js';
import { normalizeGeminiPrepaidTextModelId } from '../../runtime/geminiTextModelNormalization.js';

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

            // 1. Upgrade saved text models through the registry SSOT.
            if (config.geminiModel) {
                const oldModel = config.geminiModel;
                config.geminiModel = normalizeGeminiPrepaidTextModelId(oldModel);
                if (oldModel !== config.geminiModel) {
                    configChanged = true;
                    fixResults.push({ action: 'Gemini 모델 마이그레이션', success: true, message: `${oldModel} → ${config.geminiModel}로 자동 변환됨` });
                }
            }

            if (!config.geminiModel) {
                config.geminiModel = GEMINI_TEXT_MODELS.FLASH_LITE;
                configChanged = true;
                fixResults.push({ action: 'Gemini 모델 설정', success: true, message: `기본 모델 설정됨 (${GEMINI_TEXT_MODELS.FLASH_LITE})` });
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
