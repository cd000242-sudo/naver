// src/main/services/BlogExecutor.ts
// 블로그 발행 비즈니스 로직 - executePostCycle의 실제 구현체
//
// 이 파일은 main.ts의 automation:run 핸들러에서 추출한 핵심 로직을 담습니다.
// AutomationService.executePostCycle()은 이 모듈의 함수들을 호출합니다.

import path from 'path';
import { app } from 'electron';
import fs from 'fs/promises';

// NaverBlogAutomation은 any 타입으로 처리 (순환 의존성 방지)
import { AutomationService, type PostCyclePayload, type PostCycleContext, type PostCycleResult } from './AutomationService.js';
import { Logger } from '../utils/logger.js';
import { sendLog, sendStatus, sendProgress } from '../utils/ipcHelpers.js';

// ============================================
// 타입 정의
// ============================================

export interface ExecutionDependencies {
    // 설정 로드
    loadConfig: () => Promise<any>;
    applyConfigToEnv: (config: any) => void;

    // 콘텐츠 생성
    generateBlogContent?: (prompt: string) => Promise<string>;

    // 이미지 생성
    generateImages?: (options: any, apiKeys: any) => Promise<any[]>;

    // 자동화 인스턴스 생성
    createAutomation: (naverId: string, naverPassword: string) => any;

    // 계정 관리 (any 타입으로 느슨하게)
    blogAccountManager?: any;

    // 일일 제한 (any 타입으로 느슨하게)
    getDailyLimit?: any;
    getTodayCount?: any;
    incrementTodayCount?: any;

    // Gemini 모델
    setGeminiModel?: (model: string) => void;
}

// 전역 의존성 저장소 (main.ts에서 주입)
let dependencies: ExecutionDependencies | null = null;

/**
 * 의존성 주입 (main.ts에서 호출)
 */
export function injectDependencies(deps: ExecutionDependencies): void {
    dependencies = deps;
    Logger.info('[BlogExecutor] Dependencies injected');
}

/**
 * 의존성 가져오기
 */
export function getDependencies(): ExecutionDependencies {
    if (!dependencies) {
        throw new Error('[BlogExecutor] Dependencies not injected. Call injectDependencies first.');
    }
    return dependencies;
}

// ============================================
// 발행 파이프라인 단계별 함수
// ============================================

/**
 * 1단계: 설정 동기화
 */
export async function syncConfiguration(): Promise<void> {
    const deps = getDependencies();
    try {
        const config = await deps.loadConfig();
        deps.applyConfigToEnv(config);
        Logger.debug('[BlogExecutor] 설정 동기화 완료');
    } catch (error) {
        Logger.error('[BlogExecutor] 설정 동기화 실패', error as Error);
    }
}

/**
 * 2단계: 계정 정보 해결
 */
export async function resolveAccount(
    payload: PostCyclePayload,
    context: PostCycleContext
): Promise<{ naverId: string; naverPassword: string; accountId?: string } | null> {
    const deps = getDependencies();

    // context에서 제공된 경우 (다중계정 발행)
    if (context.naverId && context.naverPassword) {
        return {
            naverId: context.naverId,
            naverPassword: context.naverPassword,
            accountId: context.accountId,
        };
    }

    // payload에서 제공된 경우
    if (payload.naverId && payload.naverPassword) {
        return {
            naverId: payload.naverId,
            naverPassword: payload.naverPassword,
        };
    }

    // 계정 매니저에서 자동 순환
    if (deps.blogAccountManager) {
        const nextAccount = deps.blogAccountManager.getNextAccountForPublish();
        if (nextAccount) {
            const credentials = deps.blogAccountManager.getAccountCredentials(nextAccount.id);
            if (credentials) {
                sendLog(`👥 다계정 자동 순환: "${nextAccount.name}" 계정으로 발행합니다.`);
                return {
                    naverId: credentials.naverId,
                    naverPassword: credentials.naverPassword,
                    accountId: nextAccount.id,
                };
            }
        }

        // 활성 계정 시도
        const activeAccount = deps.blogAccountManager.getActiveAccount();
        if (activeAccount) {
            const credentials = deps.blogAccountManager.getAccountCredentials(activeAccount.id);
            if (credentials) {
                sendLog(`👤 활성 계정 "${activeAccount.name}"으로 발행합니다.`);
                return {
                    naverId: credentials.naverId,
                    naverPassword: credentials.naverPassword,
                    accountId: activeAccount.id,
                };
            }
        }
    }

    return null;
}

/**
 * 3단계: 브라우저 세션 관리
 */
export async function getOrCreateBrowserSession(
    account: { naverId: string; naverPassword: string }
): Promise<any> {
    const deps = getDependencies();
    const normalizedId = account.naverId.trim().toLowerCase();

    // 기존 세션 확인
    let automation = AutomationService.get(normalizedId);

    if (automation) {
        sendLog(`♻️ 기존 "${account.naverId}" 브라우저 세션을 사용합니다.`);
        return automation;
    }

    // 새 세션 생성
    sendLog(`🌐 새 브라우저 세션을 생성합니다...`);
    automation = deps.createAutomation(account.naverId, account.naverPassword);
    AutomationService.set(normalizedId, automation);
    AutomationService.setCurrentInstance(automation);

    return automation;
}

/**
 * 4단계: 이미지 처리 (폴더 생성 및 복사)
 * ✅ [100점 수정] generatedImages와 images 모두 처리
 */
export async function processImages(
    payload: PostCyclePayload
): Promise<{ folder: string | null; images: any[] }> {
    // ✅ generatedImages와 images 모두 확인 (반자동 모드 호환)
    const sourceImages = (payload.generatedImages && payload.generatedImages.length > 0)
        ? payload.generatedImages
        : (payload.images && payload.images.length > 0)
            ? payload.images
            : [];

    if (sourceImages.length === 0 || payload.skipImages) {
        sendLog(`ℹ️ 이미지 없음 또는 건너뛰기 (generatedImages: ${payload.generatedImages?.length || 0}, images: ${payload.images?.length || 0})`);
        return { folder: null, images: [] };
    }

    sendLog(`📷 이미지 처리 시작: ${sourceImages.length}개`);

    const postTitle = payload.title || payload.structuredContent?.selectedTitle || `post-${Date.now()}`;
    const safeTitle = postTitle.replace(/[<>:"/\\|?*]/g, '_').substring(0, 100).trim() || 'untitled';

    const postsImageDir = path.join(app.getPath('userData'), 'images', 'posts', safeTitle);
    await fs.mkdir(postsImageDir, { recursive: true });

    sendLog(`📁 글별 이미지 폴더 생성: ${postsImageDir}`);

    const processedImages: any[] = [];

    for (const image of sourceImages) {
        if (!image.filePath) {
            sendLog(`⚠️ 이미지 경로가 없습니다: ${image.heading || '알 수 없음'}`);
            continue;
        }

        const isUrl = image.filePath.startsWith('http://') || image.filePath.startsWith('https://');

        // ✅ base64 데이터 URL 처리 (AI 생성 이미지 지원)
        const isDataUrl = image.filePath.startsWith('data:image/');

        if (isDataUrl) {
            // base64 데이터를 파일로 저장
            const matches = image.filePath.match(/^data:image\/(\w+);base64,(.+)$/);
            if (matches) {
                const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
                const base64Data = matches[2];
                const safeHeading = (image.heading || 'image').replace(/[<>:"/\\|?*]/g, '_').substring(0, 50);
                const filename = `${safeHeading}_${Date.now()}.${ext}`;
                const destPath = path.join(postsImageDir, filename);

                try {
                    await fs.writeFile(destPath, Buffer.from(base64Data, 'base64'));

                    processedImages.push({
                        heading: image.heading,
                        filePath: destPath,
                        provider: image.provider,
                        alt: image.alt,
                        caption: image.caption,
                    });

                    sendLog(`✅ base64 이미지 저장: ${filename}`);
                } catch (error) {
                    sendLog(`⚠️ base64 이미지 저장 실패: ${(error as Error).message}`);
                }
                continue;
            } else {
                sendLog(`⚠️ base64 형식 파싱 실패: ${image.heading || '알 수 없음'}`);
                continue;
            }
        }

        if (isUrl) {
            sendLog(`✅ 외부 이미지 URL 사용: ${image.filePath.substring(0, 80)}...`);
            processedImages.push({
                heading: image.heading,
                filePath: image.filePath,
                provider: image.provider,
                alt: image.alt,
                caption: image.caption,
            });
            continue;
        }

        // 로컬 파일 복사 로직
        try {
            await fs.access(image.filePath);
            const stats = await fs.stat(image.filePath);

            if (!stats.isFile()) {
                sendLog(`⚠️ 이미지 파일이 아닙니다: ${image.filePath}`);
                continue;
            }

            const filename = path.basename(image.filePath);
            const destPath = path.join(postsImageDir, filename);
            await fs.copyFile(image.filePath, destPath);

            processedImages.push({
                heading: image.heading,
                filePath: destPath,
                provider: image.provider,
                alt: image.alt,
                caption: image.caption,
            });

            sendLog(`✅ 이미지 복사: ${filename}`);
        } catch (error) {
            sendLog(`⚠️ 이미지 처리 실패: ${image.filePath}`);
        }
    }

    return { folder: postsImageDir, images: processedImages };
}

/**
 * 5단계: 실제 발행 실행
 */
export async function executePublishing(
    automation: any,
    payload: PostCyclePayload,
    processedImages: any[]
): Promise<{ success: boolean; url?: string; message?: string }> {
    // 취소 체크
    if (AutomationService.isCancelRequested()) {
        return { success: false, message: '사용자가 취소했습니다.' };
    }

    sendLog(`📝 발행 모드: ${payload.publishMode || 'publish'}`);

    try {
        // NaverBlogAutomation.run() 호출
        const result = await (automation as any).run({
            title: payload.title,
            content: payload.content,
            lines: payload.lines,
            structuredContent: payload.structuredContent,
            hashtags: payload.hashtags,
            images: processedImages,
            collectedImages: payload.collectedImages, // ✅ [2026-01-19] 수집된 제품 이미지 전달 (썸네일용)
            publishMode: payload.publishMode,
            scheduleDate: payload.scheduleDate,
            scheduleType: payload.scheduleType,
            ctaLink: payload.ctaLink,
            ctaText: payload.ctaText,
            ctas: payload.ctas,
            ctaPosition: payload.ctaPosition,
            skipCta: payload.skipCta,
            thumbnailPath: payload.thumbnailPath,
            affiliateLink: payload.affiliateLink,
            contentMode: payload.contentMode,
            toneStyle: payload.toneStyle,
            categoryName: payload.categoryName,
            previousPostTitle: payload.previousPostTitle,
            previousPostUrl: payload.previousPostUrl,
            isFullAuto: payload.isFullAuto,
        });

        if (result.success) {
            sendLog(`✅ 발행 완료: ${result.url || '(URL 없음)'}`);
            sendStatus({ success: true, url: result.url });
        } else {
            sendLog(`❌ 발행 실패: ${result.message}`);
            sendStatus({ success: false, message: result.message });
        }

        return result;
    } catch (error) {
        const message = (error as Error).message || '발행 중 오류가 발생했습니다.';
        sendLog(`❌ 발행 오류: ${message}`);
        sendStatus({ success: false, message });
        return { success: false, message };
    }
}

/**
 * 6단계: 정리 작업
 */
export async function cleanup(
    payload: PostCyclePayload,
    accountId?: string
): Promise<void> {
    const deps = getDependencies();

    // 발행 카운트 증가
    if (accountId && deps.blogAccountManager) {
        deps.blogAccountManager.incrementPublishCount(accountId);
    }

    // 일일 카운트 증가
    if (deps.incrementTodayCount) {
        await deps.incrementTodayCount();
    }

    // 브라우저 정리 (keepBrowserOpen이 false인 경우)
    if (!payload.keepBrowserOpen) {
        const normalizedId = (payload.naverId || '').trim().toLowerCase();
        if (normalizedId) {
            AutomationService.delete(normalizedId);
        }
        AutomationService.setCurrentInstance(null);
    }

    AutomationService.stopRunning();
}

// ============================================
// 메인 실행 함수 (파이프라인 오케스트레이터)
// ============================================

/**
 * 전체 발행 사이클 실행
 * AutomationService.executePostCycle()에서 호출됨
 */
export async function runFullPostCycle(
    payload: PostCyclePayload,
    context: PostCycleContext = {}
): Promise<PostCycleResult> {
    const startTime = Date.now();
    let accountId: string | undefined;

    try {
        // 1. 설정 동기화
        await syncConfiguration();

        // 2. 상태 초기화
        AutomationService.startRunning();
        AutomationService.updateLastRunTime();
        AutomationService.resetCancelFlag();

        sendLog('🚀 발행 사이클 시작');

        // 3. Gemini 모델 설정
        const deps = getDependencies();
        if (payload.geminiModel && deps.setGeminiModel) {
            deps.setGeminiModel(payload.geminiModel);
            sendLog(`🤖 Gemini 모델: ${payload.geminiModel}`);
        }

        if (payload.generator) {
            sendLog(`🧠 선택된 생성 엔진: ${payload.generator}`);
        }

        // 4. 계정 정보 해결
        const account = await resolveAccount(payload, context);
        if (!account) {
            const message = '네이버 아이디와 비밀번호를 입력해주세요.';
            sendStatus({ success: false, message });
            return { success: false, message };
        }
        accountId = account.accountId;

        // 5. 취소 체크
        if (AutomationService.isCancelRequested()) {
            return {
                success: false,
                cancelled: true,
                message: '사용자가 자동화를 취소했습니다.'
            };
        }

        // 6. 브라우저 세션 관리
        const automation = await getOrCreateBrowserSession(account);

        // 7. 이미지 처리
        const { images: processedImages } = await processImages(payload);

        // 8. 발행 실행
        const result = await executePublishing(automation, payload, processedImages);

        // 9. 성공 시 정리
        const elapsed = Date.now() - startTime;
        sendLog(`⏱️ 총 소요 시간: ${(elapsed / 1000).toFixed(1)}초`);

        return {
            success: result.success,
            url: result.url,
            message: result.message,
        };

    } catch (error) {
        const message = (error as Error).message || '알 수 없는 오류가 발생했습니다.';
        Logger.error('[BlogExecutor] 발행 사이클 오류', error as Error);
        sendStatus({ success: false, message });
        return { success: false, message };

    } finally {
        await cleanup(payload, accountId);
    }
}
