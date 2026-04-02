// src/main/ipc/contentHandlers.ts
// 내부링크 + 제목 A/B 테스트 관련 IPC 핸들러
// ✅ [2026-04-03] main.ts에서 추출

import { ipcMain } from 'electron';
import { InternalLinkManager } from '../../content/internalLinkManager.js';
import { TitleABTester } from '../../content/titleABTester.js';
import type { AppConfig } from '../../configManager.js';

/**
 * 콘텐츠 핸들러 의존성
 */
export interface ContentHandlerDeps {
    internalLinkManager: InternalLinkManager;
    titleABTester: TitleABTester;
    loadConfig: () => Promise<AppConfig>;
    applyConfigToEnv: (config: AppConfig) => void;
}

/**
 * 내부링크 + 제목 A/B 테스트 핸들러 등록
 */
export function registerContentHandlers(deps: ContentHandlerDeps): void {
    const { internalLinkManager, titleABTester, loadConfig, applyConfigToEnv } = deps;

    // ── 내부링크 핸들러 ──

    ipcMain.handle('internalLink:addPost', async (_event, url: string, title: string, content?: string, category?: string) => {
        try {
            internalLinkManager.addPostFromUrl(url, title, content, category);
            return { success: true, message: '글이 내부링크 목록에 추가되었습니다.' };
        } catch (error) {
            return { success: false, message: `추가 실패: ${(error as Error).message}` };
        }
    });

    ipcMain.handle('internalLink:findRelated', async (_event, title: string, content: string, maxResults?: number, categoryFilter?: string) => {
        try {
            const links = internalLinkManager.findRelatedPosts(title, content, maxResults, categoryFilter);
            return { success: true, links };
        } catch (error) {
            return { success: false, message: `검색 실패: ${(error as Error).message}` };
        }
    });

    ipcMain.handle('internalLink:insertLinks', async (_event, content: string, title: string, options?: any) => {
        try {
            const result = internalLinkManager.insertInternalLinks(content, title, options);
            return { success: true, result };
        } catch (error) {
            return { success: false, message: `삽입 실패: ${(error as Error).message}` };
        }
    });

    ipcMain.handle('internalLink:getAllPosts', async () => {
        try {
            const posts = internalLinkManager.getAllPosts();
            return { success: true, posts };
        } catch (error) {
            return { success: false, message: `조회 실패: ${(error as Error).message}` };
        }
    });

    ipcMain.handle('internalLink:getStats', async () => {
        try {
            const stats = internalLinkManager.getStats();
            return { success: true, stats };
        } catch (error) {
            return { success: false, message: `조회 실패: ${(error as Error).message}` };
        }
    });

    ipcMain.handle('internalLink:getPostsByCategory', async (_event, category: string) => {
        try {
            const posts = internalLinkManager.getPostsByCategory(category);
            return { success: true, posts };
        } catch (error) {
            return { success: false, message: `조회 실패: ${(error as Error).message}` };
        }
    });

    ipcMain.handle('internalLink:getAllCategories', async () => {
        try {
            const categories = internalLinkManager.getAllCategories();
            return { success: true, categories };
        } catch (error) {
            return { success: false, message: `조회 실패: ${(error as Error).message}` };
        }
    });

    ipcMain.handle('internalLink:updatePostCategory', async (_event, postId: string, category: string) => {
        try {
            const success = internalLinkManager.updatePostCategory(postId, category);
            return { success, message: success ? '카테고리가 업데이트되었습니다.' : '글을 찾을 수 없습니다.' };
        } catch (error) {
            return { success: false, message: `업데이트 실패: ${(error as Error).message}` };
        }
    });

    ipcMain.handle('internalLink:autoCategorize', async () => {
        try {
            const result = internalLinkManager.autoCategorizeAllPosts();
            return { success: true, ...result };
        } catch (error) {
            return { success: false, message: `자동 분류 실패: ${(error as Error).message}` };
        }
    });

    ipcMain.handle('internalLink:getUncategorized', async () => {
        try {
            const posts = internalLinkManager.getUncategorizedPosts();
            return { success: true, posts };
        } catch (error) {
            return { success: false, message: `조회 실패: ${(error as Error).message}` };
        }
    });

    ipcMain.handle('internalLink:normalizeCategories', async () => {
        try {
            const result = internalLinkManager.normalizeAllCategories();
            return { success: true, ...result };
        } catch (error) {
            return { success: false, message: `정규화 실패: ${(error as Error).message}` };
        }
    });

    // ── 제목 A/B 테스트 핸들러 ──

    ipcMain.handle('title:generateCandidates', async (_event, keyword: string, category?: string, count?: number) => {
        // ✅ 실행 직전 최신 설정 강제 동기화
        try {
            const config = await loadConfig();
            applyConfigToEnv(config);
        } catch (e) {
            console.error('[Main] title:generateCandidates - 설정 동기화 실패:', e);
        }

        try {
            const result = titleABTester.generateTitleCandidates(keyword, category, count);
            return { success: true, result };
        } catch (error) {
            return { success: false, message: `생성 실패: ${(error as Error).message}` };
        }
    });

    ipcMain.handle('title:evaluate', async (_event, title: string, category?: string) => {
        // ✅ 실행 직전 최신 설정 강제 동기화
        try {
            const config = await loadConfig();
            applyConfigToEnv(config);
        } catch (e) {
            console.error('[Main] title:evaluate - 설정 동기화 실패:', e);
        }

        try {
            const evaluation = titleABTester.evaluateTitle(title, category);
            return { success: true, evaluation };
        } catch (error) {
            return { success: false, message: `평가 실패: ${(error as Error).message}` };
        }
    });

    ipcMain.handle('title:suggestImprovements', async (_event, title: string) => {
        try {
            const suggestions = titleABTester.suggestImprovements(title);
            return { success: true, suggestions };
        } catch (error) {
            return { success: false, message: `제안 실패: ${(error as Error).message}` };
        }
    });

    ipcMain.handle('title:getStyles', async () => {
        try {
            const styles = titleABTester.getAvailableStyles();
            return { success: true, styles };
        } catch (error) {
            return { success: false, message: `조회 실패: ${(error as Error).message}` };
        }
    });
}
