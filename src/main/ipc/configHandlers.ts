// src/main/ipc/configHandlers.ts
// 설정(config) 관련 IPC 핸들러

import { ipcMain } from 'electron';
import { loadConfig, saveConfig, applyConfigToEnv, validateApiKeyFormat, type AppConfig } from '../../configManager.js';
import { setDailyLimit } from '../../postLimitManager.js';

/**
 * Config 핸들러 전용 컨텍스트
 * - appConfig는 main.ts의 모듈 변수이므로 getter/setter 콜백으로 접근
 */
export interface ConfigHandlerContext {
    getAppConfig: () => AppConfig;
    setAppConfig: (config: AppConfig) => void;
    sendLog: (message: string) => void;
}

/**
 * config:get / config:save / config:set 핸들러 등록
 */
export function registerConfigHandlers(ctx: ConfigHandlerContext): void {

    ipcMain.handle('config:get', async () => {
        try {
            // 항상 최신 설정을 로드 (캐시된 값이 있어도 파일에서 다시 읽기)
            const config = await loadConfig();
            ctx.setAppConfig(config);
            applyConfigToEnv(config);
            console.log('[Main] config:get 호출 - 설정 로드 완료');
            console.log('[Main] 로드된 설정 키:', Object.keys(config).filter(k => k.includes('ApiKey') || k.includes('Key')));
            // ✅ tutorialVideos 확인 로그
            const tutorials = (config as any).tutorialVideos;
            console.log('[Main] tutorialVideos 개수:', tutorials ? tutorials.length : 0);
            return config;
        } catch (error) {
            console.error('[Main] config:get 오류:', error);
            // 오류 발생 시 기존 캐시된 설정 반환
            return ctx.getAppConfig();
        }
    });

    ipcMain.handle('config:save', async (_event, payload: AppConfig) => {
        const config = await saveConfig(payload);
        ctx.setAppConfig(config);
        applyConfigToEnv(config);
        return config;
    });

    ipcMain.handle('config:set', async (_event, payload: AppConfig) => {
        // API 키 형식 검증
        const validationErrors: string[] = [];

        if (payload.geminiApiKey) {
            const validation = validateApiKeyFormat(payload.geminiApiKey, 'gemini');
            if (!validation.valid) {
                validationErrors.push(`Gemini: ${validation.message}`);
            }
        }

        if (payload.openaiApiKey) {
            const validation = validateApiKeyFormat(payload.openaiApiKey, 'openai');
            if (!validation.valid) {
                validationErrors.push(`OpenAI: ${validation.message}`);
            }
        }


        if (payload.claudeApiKey) {
            const validation = validateApiKeyFormat(payload.claudeApiKey, 'claude');
            if (!validation.valid) {
                validationErrors.push(`Claude: ${validation.message}`);
            }
        }

        if (validationErrors.length > 0) {
            const errorMessage = `⚠️ API 키 형식 오류:\n${validationErrors.join('\n')}`;
            ctx.sendLog(errorMessage);
            console.error('[Main] API 키 검증 실패:', validationErrors);
        }

        const nextConfig = await saveConfig(payload ?? {});
        ctx.setAppConfig(nextConfig);
        applyConfigToEnv(nextConfig);

        // API 키 저장 확인 로그
        if (nextConfig.geminiApiKey && nextConfig.geminiApiKey.trim()) {
            const keyLength = nextConfig.geminiApiKey.trim().length;
            const isValid = validateApiKeyFormat(nextConfig.geminiApiKey, 'gemini').valid;
            ctx.sendLog(`✅ Gemini API 키 저장됨 (길이: ${keyLength}자, 형식: ${isValid ? '올바름' : '오류'})`);
            console.log('[Main] Gemini API 키 환경변수 설정 확인:', process.env.GEMINI_API_KEY ? '설정됨' : '설정 안됨');
        } else {
            ctx.sendLog('⚠️ Gemini API 키가 저장되지 않았습니다.');
        }

        if (nextConfig.openaiApiKey && nextConfig.openaiApiKey.trim()) {
            const keyLength = nextConfig.openaiApiKey.trim().length;
            const isValid = validateApiKeyFormat(nextConfig.openaiApiKey, 'openai').valid;
            ctx.sendLog(`✅ OpenAI API 키 저장됨 (길이: ${keyLength}자, 형식: ${isValid ? '올바름' : '오류'})`);
        }


        if (nextConfig.claudeApiKey && nextConfig.claudeApiKey.trim()) {
            const keyLength = nextConfig.claudeApiKey.trim().length;
            const isValid = validateApiKeyFormat(nextConfig.claudeApiKey, 'claude').valid;
            ctx.sendLog(`✅ Claude API 키 저장됨 (길이: ${keyLength}자, 형식: ${isValid ? '올바름' : '오류'})`);
        }

        // ✅ [2026-03-30] Perplexity API 키 저장 확인 로그
        if (nextConfig.perplexityApiKey && nextConfig.perplexityApiKey.trim()) {
            const keyLength = nextConfig.perplexityApiKey.trim().length;
            ctx.sendLog(`✅ Perplexity API 키 저장됨 (길이: ${keyLength}자, 접두사: ${nextConfig.perplexityApiKey.substring(0, 5)}...)`);
            console.log('[Main] Perplexity API 키 환경변수 설정 확인:', process.env.PERPLEXITY_API_KEY ? '설정됨' : '설정 안됨');
        } else {
            console.log('[Main] ⚠️ Perplexity API 키 미저장 (config에 없음)');
        }

        if (nextConfig.dailyPostLimit !== undefined) {
            setDailyLimit(nextConfig.dailyPostLimit);
        }
        if (nextConfig.appIconPath) {
            ctx.sendLog(`🖼️ 사용자 지정 앱 아이콘 경로: ${nextConfig.appIconPath}`);
        }
        ctx.sendLog('⚙️ 설정이 저장되었습니다.');
        return nextConfig;
    });
}
