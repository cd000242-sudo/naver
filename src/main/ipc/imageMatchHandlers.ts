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

            if (!hasGemini && !hasPerplexity) {
                console.warn('[Main] ⚠️ AI API 키 없음 → 순차 배치');
                return { success: true, matches: headings.map((_: string, i: number) => i % images.length) };
            }

            const { matchImagesToHeadings } = await import('../../imageHeadingMatcher.js');

            // ✅ [2026-03-20 FIX] 설정 기반 AI 매칭 실행 — openai/claude는 미지원이므로 Gemini로 안전 폴백
            const resolvedMatcherProvider = (provider === 'perplexity' && hasPerplexity) ? 'perplexity' as const : 'gemini' as const;
            if ((provider === 'openai' || provider === 'claude') && hasGemini) {
                console.log(`[Main] ⚠️ 이미지-소제목 매칭: ${provider}는 미지원 → Gemini로 폴백합니다.`);
            }
            const matcherConfig = {
                provider: resolvedMatcherProvider,
                geminiApiKey,
                perplexityApiKey,
                geminiModel: config.geminiModel || process.env.GEMINI_MODEL,
                perplexityModel: config.perplexityModel,
            };

            console.log(`[Main] 🤖 AI 공급자: ${matcherConfig.provider} (설정: ${provider})`);
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
