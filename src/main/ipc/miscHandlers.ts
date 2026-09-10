// src/main/ipc/miscHandlers.ts
// 기타 IPC 핸들러 (튜토리얼, 이미지 저장, 콘텐츠 수집, SEO)

import { ipcMain, app } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import { loadConfig } from '../../configManager.js';
import { planExpandedRetrieval } from '../../content/thinMaterialExpansion.js';
import { MATERIAL_DOCUMENT_SEPARATOR } from '../../content/eventCohesion.js';

/**
 * 기타 핸들러 등록
 */
export function registerMiscHandlers(): void {

    // 튜토리얼 영상 목록 가져오기
    ipcMain.handle('tutorials:getVideos', async () => {
        console.log('[miscHandlers] tutorials:getVideos 핸들러 시작');
        try {
            const config = await loadConfig();
            console.log('[miscHandlers] tutorials:getVideos config 로드 완료');
            const videos = (config as any).tutorialVideos || [];
            console.log('[miscHandlers] tutorials:getVideos 영상 수:', videos.length);
            return videos;
        } catch (error) {
            console.error('[miscHandlers] tutorials:getVideos 오류:', error);
            return [];
        }
    });

    // 저장된 이미지 경로 가져오기
    ipcMain.handle('images:getSavedPath', async () => {
        return path.join(app.getPath('userData'), 'images');
    });

    // 저장된 이미지 목록 가져오기
    ipcMain.handle('images:getSaved', async (_event, dirPath: string) => {
        try {
            const files = await fs.readdir(dirPath);
            const imageFiles = files.filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f));
            const images = imageFiles.map(f => path.join(dirPath, f));
            return { success: true, images };
        } catch (error) {
            return { success: false, message: (error as Error).message };
        }
    });

    // 플랫폼에서 콘텐츠 수집 (실시간 정보)
    ipcMain.handle('content:collectFromPlatforms', async (_event, keyword: string, options?: { maxPerSource?: number; targetDate?: string }) => {
        try {
            const { collectContentFromPlatforms } = await import('../../sourceAssembler.js');
            const config = await loadConfig();
            // [2026-07-30] 검색 API 자격증명을 먼저 쓴다. 기존에는 데이터랩 키만
            // 넘겨서, 사용자가 검색 API Secret을 정상 입력해도 빠른 경로(0.5초)가
            // 스킵되고 모바일 파싱(20초)+Gemini Grounding으로 빠져 렌더러의 30초
            // 타임아웃을 넘겼다. 해석 순서는 configManager와 동일하게 맞춘다.
            const crawlClientId = config.naverClientId || config.naverDatalabClientId;
            const crawlClientSecret = config.naverClientSecret || config.naverDatalabClientSecret;
            if (!crawlClientId || !crawlClientSecret) {
                console.warn(
                    '[miscHandlers] ⚠️ 네이버 검색 API 자격증명 불완전 '
                    + `(clientId=${crawlClientId ? '있음' : '없음'}, clientSecret=${crawlClientSecret ? '있음' : '없음'}) `
                    + '→ 빠른 수집 경로를 쓸 수 없어 느린 폴백으로 진행합니다. 설정에서 네이버 검색 API Client Secret을 입력하세요.',
                );
            }
            // [2026-07-30] 그라운딩은 사용자가 팩트체크 엔진에서 직접 고른 경우에만.
            // UI 문구("자동 폴백에서 제외")와 실제 동작을 일치시킨다.
            const allowGroundingFallback = String((config as any)?.factCheckEngine || '').trim() === 'gemini-grounding';
            const collectOnce = (query: string) => collectContentFromPlatforms(query, {
                maxPerSource: options?.maxPerSource || 5,
                clientId: crawlClientId,
                clientSecret: crawlClientSecret,
                logger: (msg: string) => console.log(msg),
                targetDate: options?.targetDate,
                allowGroundingFallback,
            });
            const result = await collectOnce(keyword);

            /*
             * [SPEC-EVENT-RETRIEVAL-2026 Phase 2] 자료가 마른 키워드면 키워드를 분해해
             * 한 번 더 찾는다.
             *
             * 사장님 지적: "황금키워드는 검색량은 올라오는데 그 키워드를 제목으로 다룬 문서가
             * 아직 적다. 그때 그대로 긁으면 모델이 서로 다른 기사를 억지로 조립한다."
             *
             * 기본은 **끔**이다 — 켜지 않으면 호출이 한 번도 늘지 않는다. 켜져 있어도
             * 자료가 충분하면 확장하지 않고, 추가 질의는 3회를 넘지 않는다.
             * 확장해도 못 찾으면 있는 자료로 그대로 간다 — 글을 막지 않는다.
             */
            const expandedRetrieval = (config as any)?.expandedRetrieval === true;
            const plan = planExpandedRetrieval(String(result?.collectedText ?? ''), keyword, {
                enabled: expandedRetrieval,
            });
            console.log(`[ExpandedRetrieval] ${plan.reason}`);
            if (!plan.shouldExpand) return result;

            const extraTexts: string[] = [];
            for (const query of plan.queries) {
                try {
                    const extra = await collectOnce(query);
                    if (extra?.success && extra.collectedText) {
                        extraTexts.push(extra.collectedText);
                        console.log(`[ExpandedRetrieval] ✅ "${query}" — ${extra.collectedText.length}자 추가`);
                    } else {
                        console.log(`[ExpandedRetrieval] ⚪ "${query}" — 추가 자료 없음`);
                    }
                } catch (expandError) {
                    // 확장은 보너스다. 실패해도 원래 자료로 진행한다.
                    console.warn(`[ExpandedRetrieval] "${query}" 실패:`, (expandError as Error)?.message);
                }
            }
            if (extraTexts.length === 0) return result;

            return {
                ...result,
                collectedText: [String(result?.collectedText ?? ''), ...extraTexts]
                    .filter((text) => text.trim().length > 0)
                    // 문서 구분자는 sourceAssembler 의 join 과 같아야 한다(eventCohesion 이 이 값으로 자른다).
                    .join(MATERIAL_DOCUMENT_SEPARATOR),
                sourceCount: (result?.sourceCount ?? 0) + extraTexts.length,
            };
        } catch (error) {
            console.error('[miscHandlers] 플랫폼 콘텐츠 수집 실패:', error);
            return { success: false, message: (error as Error).message };
        }
    });

    // 쇼핑커넥트 SEO 제목 생성
    ipcMain.handle('seo:generateTitle', async (_event, productName: string): Promise<{ success: boolean; title?: string; message?: string }> => {
        try {
            console.log(`[miscHandlers] SEO 제목 생성 요청: "${productName}"`);

            if (!productName || productName.trim().length < 3) {
                return { success: true, title: productName || '' };
            }

            const { generateShoppingConnectTitle } = await import('../../naverSearchApi.js');
            const seoTitle = await generateShoppingConnectTitle(productName.trim(), 3);

            console.log(`[miscHandlers] SEO 제목 생성 완료: "${seoTitle}"`);
            return { success: true, title: seoTitle };
        } catch (error) {
            console.error('[miscHandlers] SEO 제목 생성 오류:', error);
            return { success: false, title: productName, message: (error as Error).message };
        }
    });
}

// ── Session diagnostics IPC ───────────────────────────────────

/**
 * Register session health IPC handlers.
 * Called from the same registerMiscHandlers() or separately from index.ts.
 */
export function registerSessionDiagnosticsHandlers(): void {
    // Returns in-memory metrics report (fast, no file I/O)
    ipcMain.handle('session:getDiagnosticsReport', async () => {
        try {
            const { buildDiagnosticsReport } = await import('../../session/sessionEventLogger.js');
            return { success: true, report: buildDiagnosticsReport() };
        } catch (error) {
            return { success: false, message: (error as Error).message };
        }
    });

    // Returns last N NDJSON events from today's log file
    ipcMain.handle('session:getRecentEvents', async (_event, count: number = 50) => {
        try {
            const { readRecentEvents } = await import('../../session/sessionEventLogger.js');
            const events = await readRecentEvents(count);
            return { success: true, events };
        } catch (error) {
            return { success: false, message: (error as Error).message, events: [] };
        }
    });
}
