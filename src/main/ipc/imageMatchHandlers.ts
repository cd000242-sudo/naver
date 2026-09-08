// src/main/ipc/imageMatchHandlers.ts
// 이미지-소제목 AI 매칭 IPC 핸들러
// [v2.10.249] main.ts에서 분리 — god-file 압축 8단계 (image:* 큰 핸들러 분리 시작).
//
// 분리 1개 핸들러:
//   image:matchToHeadings — AI(Gemini/Perplexity)로 이미지 목록과 소제목 매칭
//
// 의존성: configManager, imageHeadingMatcher. context 불필요 (모두 격리됨).

import { ipcMain } from 'electron';
import { loadConfig } from '../../configManager.js';
import { resolveSelectedEngineTextCaller } from './selectedEngineTextCaller.js';

export function registerImageMatchHandlers(): void {
    ipcMain.handle('image:matchToHeadings', async (_event, images: string[], headings: string[]) => {
        try {
            console.log(`[Main] 🎯 이미지-소제목 매칭 시작: ${images.length}개 이미지, ${headings.length}개 소제목`);

            const config = await loadConfig();

            // ✅ 사용자 설정에 따른 AI 공급자 결정
            const provider = config.defaultAiProvider || 'gemini';
            const geminiApiKey = config.geminiApiKey || process.env.GEMINI_API_KEY;
            const perplexityApiKey = config.perplexityApiKey || process.env.PERPLEXITY_API_KEY;

            // API 키 확인
            const hasGemini = !!geminiApiKey;
            const hasPerplexity = !!perplexityApiKey;

            const { matchImagesToHeadings } = await import('../../imageHeadingMatcher.js');

            /*
             * [2026-09-09] openai/claude 를 "미지원" 이라며 Gemini 로 폴백하던 자리.
             *   그 탓에 GPT 를 골라 둔 사용자도 이 매칭에서 Gemini 를 때려 분당 한도(429)를
             *   맞았다(사용자 실측). 매칭은 프롬프트 하나를 보내고 텍스트를 받는 일이라
             *   벤더를 가릴 이유가 없다 — 선택 엔진의 호출기를 넘긴다.
             *   Gemini 선택이거나 키가 없으면 route 가 null 이라 기존 경로 그대로다.
             */
            const route = await resolveSelectedEngineTextCaller();

            // 부를 곳이 하나도 없을 때만 순차 배치로 떨어진다. 예전에는 이 판정이 route 보다
            // 앞에 있어서, OpenAI 키만 가진 사용자는 매칭을 시도조차 못 하고 순차 배치됐다.
            if (!route && !hasGemini && !hasPerplexity) {
                console.warn('[Main] ⚠️ AI API 키 없음 → 순차 배치');
                return { success: true, matches: headings.map((_: string, i: number) => i % images.length) };
            }

            const resolvedMatcherProvider = (provider === 'perplexity' && hasPerplexity) ? 'perplexity' as const : 'gemini' as const;
            const matcherConfig = {
                provider: resolvedMatcherProvider,
                geminiApiKey,
                perplexityApiKey,
                geminiModel: config.geminiModel || process.env.GEMINI_MODEL,
                perplexityModel: config.perplexityModel,
                callText: route?.callText,
            };

            console.log(`[Main] 🤖 AI 공급자: ${route ? route.engine : matcherConfig.provider} (설정: ${provider})`);
            const matches = await matchImagesToHeadings(images, headings, matcherConfig);

            console.log(`[Main] ✅ 이미지-소제목 매칭 완료: ${JSON.stringify(matches)}`);
            return { success: true, matches };

        } catch (error) {
            console.error('[Main] ❌ 이미지-소제목 매칭 실패:', error);
            // 폴백: 순차 배치
            return { success: true, matches: headings.map((_: string, i: number) => i % images.length) };
        }
    });

    console.log('[IPC] Image match handlers registered (1 handler)');
}
