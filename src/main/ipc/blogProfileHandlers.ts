// src/main/ipc/blogProfileHandlers.ts
// 블로그별 초기 설정 IPC(2026-10-21) — 계정 관리 화면에서만 읽기 · 저장 · 내보내기 · 삭제.
import { app, ipcMain } from 'electron';
import { IpcContext } from '../types';
import { BlogAccountManager } from '../../account/blogAccountManager.js';
import { blogPerformanceStoreAt, blogProfileStoreAt } from '../../account/blogProfileRuntime.js';
import { profileBlogIdOf } from '../../account/blogProfileStore.js';
import { BlogProfileError } from '../../account/blogProfile.js';
import { parsePerformanceCsv } from '../../analytics/blogPerformance.js';
import { summarizeBlogPerformance } from '../../analytics/blogPerformanceDigest.js';
import { manualObservation, pendingCollection } from '../../analytics/blogPerformanceReconcile.js';
import { loadPublishedPosts } from '../../analytics/publishedPostTracker.js';
import { buildProfileSuggestionPrompt, fetchRecentPublicTitles, parseProfileSuggestion } from '../../account/blogProfileSuggest.js';
import { createDailyEditorialCaller } from '../services/dailyEditorialCaller.js';
import { loadConfig } from '../../configManager.js';

const ACCOUNT_ID = /^[\w-]{1,120}$/;

/** 오류 코드만 화면에 — 파일 경로 · 내부 메시지는 넘기지 않는다. */
function failure(error: unknown) {
    if (error instanceof BlogProfileError) return { success: false, code: error.code, message: error.message.replace(/^[A-Z_]+: /, '') };
    const coded = String((error as Error)?.message || '').match(/^(PERFORMANCE_[A-Z_]+): (.+)$/);
    if (coded) return { success: false, code: coded[1], message: coded[2] };
    return { success: false, code: 'BLOG_PROFILE_FAILED', message: '블로그 설정을 처리하지 못했습니다.' };
}

export function registerBlogProfileHandlers(ctx: IpcContext, blogAccountManager: BlogAccountManager): void {
    const store = () => blogProfileStoreAt(app.getPath('userData'));
    const trusted = (event: Electron.IpcMainInvokeEvent) => {
        const window = ctx.getMainWindow();
        return Boolean(window && !window.isDestroyed() && event.sender === window.webContents);
    };
    const accountOf = (accountId: unknown) => {
        if (typeof accountId !== 'string' || !ACCOUNT_ID.test(accountId)) throw new BlogProfileError('BLOG_PROFILE_INVALID', '계정 ID가 올바르지 않습니다');
        const account = blogAccountManager.getAccount(accountId);
        if (!account) throw new BlogProfileError('BLOG_PROFILE_ACCOUNT_MISSING', '등록된 블로그 계정이 아닙니다');
        return account;
    };
    const denied = { success: false, code: 'BLOG_PROFILE_DENIED', message: '앱의 계정 관리 화면에서 실행해주세요.' };

    ipcMain.handle('blogProfile:get', async (event, accountId: string) => {
        if (!trusted(event)) return denied;
        try {
            const account = accountOf(accountId);
            const resolved = await store().resolve(account);
            return { success: true, profile: resolved.profile, warning: resolved.warning, blogKnown: Boolean(profileBlogIdOf(account)), account: { id: account.id, name: account.name, blogId: account.blogId } };
        } catch (error) { return failure(error); }
    });

    ipcMain.handle('blogProfile:save', async (event, accountId: string, input: unknown, expectedVersion: number) => {
        if (!trusted(event)) return denied;
        try {
            if (!Number.isInteger(expectedVersion) || expectedVersion < 0) throw new BlogProfileError('BLOG_PROFILE_INVALID', '설정 버전이 올바르지 않습니다');
            const profile = await store().save(accountOf(accountId), input, expectedVersion);
            return { success: true, profile };
        } catch (error) { return failure(error); }
    });

    ipcMain.handle('blogProfile:export', async (event, accountId: string) => {
        if (!trusted(event)) return denied;
        try {
            accountOf(accountId);
            const profile = await store().exportProfile(accountId);
            return profile ? { success: true, json: JSON.stringify(profile, null, 2) } : { success: false, code: 'BLOG_PROFILE_NONE', message: '저장된 블로그 설정이 없습니다.' };
        } catch (error) { return failure(error); }
    });

    // 성과 가져오기(2026-10-21) — 크리에이터 어드바이저 · 운영 대장 CSV. 이 블로그 글만 받고, 거절한 줄은 사유와 함께 돌려준다.
    ipcMain.handle('blogPerformance:import', async (event, accountId: string, fileName: string, csv: string) => {
        if (!trusted(event)) return denied;
        try {
            const account = accountOf(accountId);
            const blogId = profileBlogIdOf(account);
            if (!blogId) throw new BlogProfileError('BLOG_PROFILE_BLOG_UNKNOWN', '계정에 블로그 ID가 없어 성과를 연결할 수 없습니다');
            if (typeof csv !== 'string') throw new BlogProfileError('BLOG_PROFILE_INVALID', 'CSV 내용이 필요합니다');
            const parsed = parsePerformanceCsv(csv, { blogId, fileName: String(fileName || '') });
            const saved = await blogPerformanceStoreAt(app.getPath('userData')).add(account.id, blogId, parsed.observations);
            const reasons = parsed.rejected.reduce((acc: Record<string, number>, r) => ({ ...acc, [r.reason]: (acc[r.reason] || 0) + 1 }), {});
            return { success: true, imported: parsed.observations.length, ...saved, rejected: reasons };
        } catch (error) { return failure(error); }
    });

    ipcMain.handle('blogPerformance:summary', async (event, accountId: string) => {
        if (!trusted(event)) return denied;
        try {
            const account = accountOf(accountId);
            const blogId = profileBlogIdOf(account);
            if (!blogId) return { success: true, digest: summarizeBlogPerformance([]) };
            const observations = await blogPerformanceStoreAt(app.getPath('userData')).list(account.id, blogId);
            return { success: true, total: observations.length, digest: summarizeBlogPerformance(observations) };
        } catch (error) { return failure(error); }
    });

    // 발행 대조(2026-10-21) — 앱 발행 기록 중 24h · 72h · 7d 가 지났는데 측정이 없는 글
    ipcMain.handle('blogPerformance:pending', async (event, accountId: string) => {
        if (!trusted(event)) return denied;
        try {
            const account = accountOf(accountId);
            const blogId = profileBlogIdOf(account);
            if (!blogId) return { success: true, pending: [] };
            const observations = await blogPerformanceStoreAt(app.getPath('userData')).list(account.id, blogId);
            return { success: true, pending: pendingCollection(loadPublishedPosts(app.getPath('userData')), observations, blogId) };
        } catch (error) { return failure(error); }
    });

    ipcMain.handle('blogPerformance:addManual', async (event, accountId: string, input: unknown) => {
        if (!trusted(event)) return denied;
        try {
            const account = accountOf(accountId);
            const blogId = profileBlogIdOf(account);
            if (!blogId) throw new BlogProfileError('BLOG_PROFILE_BLOG_UNKNOWN', '계정의 블로그 주소를 먼저 넣어 주세요');
            const observation = manualObservation(input as never, blogId);
            await blogPerformanceStoreAt(app.getPath('userData')).add(account.id, blogId, [observation]);
            return { success: true };
        } catch (error) { return failure(error); }
    });

    // 설정 추천(2026-10-21) — 최근 공개 글 제목 + 성과 요약 → 앱 설정의 작성 엔진 그대로(다른 엔진으로 넘어가지 않음). 저장은 하지 않는다.
    let suggesting = false;
    ipcMain.handle('blogProfile:suggest', async (event, accountId: string) => {
        if (!trusted(event)) return denied;
        if (suggesting) return { success: false, code: 'BLOG_PROFILE_BUSY', message: '추천을 이미 만드는 중입니다.' };
        suggesting = true;
        try {
            const account = accountOf(accountId);
            const blogId = profileBlogIdOf(account);
            if (!blogId) throw new BlogProfileError('BLOG_PROFILE_BLOG_UNKNOWN', '계정의 블로그 주소를 먼저 넣어 주세요');
            const titles = await fetchRecentPublicTitles(blogId);
            if (titles.length < 3) throw new BlogProfileError('BLOG_PROFILE_SUGGEST_FEW', `공개 글이 ${titles.length}편뿐이라 추천 근거가 부족합니다. 직접 입력해 주세요`);
            const observations = await blogPerformanceStoreAt(app.getPath('userData')).list(account.id, blogId);
            const config = await loadConfig() as unknown as Record<string, unknown>;
            const caller = await createDailyEditorialCaller(String(config.defaultAiProvider || ''), config);
            const raw = await caller.complete(buildProfileSuggestionPrompt({ titles, performance: summarizeBlogPerformance(observations) }), { maxOutputTokens: 3000 });
            const suggestion = parseProfileSuggestion(raw, titles);
            return { success: true, ...suggestion, titleCount: titles.length, engine: caller.engine };
        } catch (error) { return failure(error); }
        finally { suggesting = false; }
    });

    ipcMain.handle('blogProfile:delete', async (event, accountId: string) => {
        if (!trusted(event)) return denied;
        try {
            accountOf(accountId);
            return { success: await store().remove(accountId) };
        } catch (error) { return failure(error); }
    });
}
