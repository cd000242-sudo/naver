// src/main/services/BlogExecutor.ts
// 블로그 발행 비즈니스 로직 - executePostCycle의 실제 구현체
//
// 이 파일은 main.ts의 automation:run 핸들러에서 추출한 핵심 로직을 담습니다.
// AutomationService.executePostCycle()은 이 모듈의 함수들을 호출합니다.

import path from 'path';
import { app } from 'electron';
import fs from 'fs/promises';
// [SPEC-FREEZE-GUARD-001-P2 R5 / v2.10.264] Base64 디코딩 워커 분리 — 외부 입력 data URL
import { decodeBase64Async } from '../utils/base64Async.js';

// ✅ [Phase 4B] 순환 의존성 방지를 위한 인터페이스 import
import type { IExecutionDependencies, IAutomationInstance } from '../../types/automation.js';
import { AutomationService, type PostCyclePayload, type PostCycleContext, type PostCycleResult } from './AutomationService.js';
import { Logger } from '../utils/logger.js';
import { sendLog, sendStatus, sendProgress } from '../utils/ipcHelpers.js';
import { classifyPublishFailure } from '../../automation/publishFailureClassifier.js';
import { isConcreteNaverBlogPostUrl } from '../../automation/publishOutcomeResolver.js';
import {
    prepareContentPolicyForPublish,
    recordContentPolicyPublication,
    type PreparedContentPolicyPublish,
} from '../../contentPolicy/policyService.js';
import { PublicationStateStore } from '../../contentPolicy/publicationStateStore.js';

// ✅ [Phase 4B] ExecutionDependencies는 types/automation.ts에서 정의 — 재export
export type ExecutionDependencies = IExecutionDependencies;

function requiresImmediatePublishedPostUrl(payload: PostCyclePayload): boolean {
    return String(payload?.publishMode || 'publish') === 'publish';
}

function assertImmediatePublishResultUrl(result: any, payload: PostCyclePayload): void {
    if (!result?.success || !requiresImmediatePublishedPostUrl(payload)) {
        return;
    }

    const publishedUrl = String(result.url || result.postUrl || result.blogUrl || '').trim();
    if (!isConcreteNaverBlogPostUrl(publishedUrl)) {
        throw new Error('PUBLISH_UNCONFIRMED:자동화가 성공을 반환했지만 실제 네이버 게시글 URL을 확인하지 못했습니다. 작성중/임시저장/블로그홈 상태를 발행 완료로 처리하지 않습니다.');
    }
}

/**
 * 블로그 이미지 정보 인터페이스
 * processImages()에서 사용하는 이미지 객체의 타입
 */
interface BlogImage {
    heading?: string;
    title?: string;
    filePath?: string;
    url?: string;
    thumbnailUrl?: string;
    provider?: string;
    alt?: string;
    caption?: string;
    originalIndex?: number;
    isThumbnail?: boolean;
    isIntro?: boolean;
}

/**
 * 처리된 이미지 정보 인터페이스
 */
interface ProcessedImage {
    heading?: string;
    filePath: string;
    provider?: string;
    alt?: string;
    caption?: string;
    originalIndex?: number;
    headingIndex?: number; // ✅ [2026-04-04 FIX] 소제목 인덱스 보존
    isThumbnail: boolean;
    isIntro: boolean;
}

// 전역 의존성 저장소 (main.ts에서 주입)
let dependencies: IExecutionDependencies | null = null;

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
    account: { naverId: string; naverPassword: string; accountId?: string }
): Promise<IAutomationInstance> {
    const deps = getDependencies();
    const normalizedId = account.naverId.trim().toLowerCase();

    // 기존 세션 확인
    let automation = AutomationService.get(normalizedId);

    if (automation) {
        sendLog(`♻️ 기존 "${account.naverId}" 브라우저 세션을 사용합니다.`);
        return automation;
    }

    // ✅ 계정별 프록시 URL 해결 (blogAccountManager에서 직접 조회)
    let accountProxyUrl: string | undefined;
    if (account.accountId && deps.blogAccountManager) {
        const proxyUrl = deps.blogAccountManager.getAccountProxyUrl(account.accountId);
        if (proxyUrl) {
            accountProxyUrl = proxyUrl;
            sendLog(`🌐 계정별 프록시 적용: ${proxyUrl.replace(/:[^:]+@/, ':***@')}`);
        }
    }

    // 새 세션 생성
    sendLog(`🌐 새 브라우저 세션을 생성합니다...`);
    automation = deps.createAutomation(account.naverId, account.naverPassword, accountProxyUrl);
    AutomationService.set(normalizedId, automation);
    AutomationService.setCurrentInstance(automation);

    return automation;
}

/**
 * 4단계: 이미지 처리 (폴더 생성 및 복사)
 * ✅ [100점 수정] generatedImages와 images 모두 처리
 * ✅ [2026-01-28] scSubImageSource 설정에 따라 수집 이미지 우선 사용
 */
export async function processImages(
    payload: PostCyclePayload
): Promise<{ folder: string | null; images: ProcessedImage[] }> {
    // ✅ [2026-01-28] scSubImageSource === 'collected'이면 수집 이미지 우선 사용
    const useCollectedDirectly = payload.scSubImageSource === 'collected';

    let sourceImages: BlogImage[] = [];

    if (useCollectedDirectly && payload.collectedImages && payload.collectedImages.length > 0) {
        // ✅ 수집 이미지 직접 사용 모드: 중복 필터링 적용
        sendLog(`🖼️ 수집 이미지 직접 사용 모드: ${payload.collectedImages.length}개 이미지`);

        const seenBaseUrls = new Set<string>();
        const uniqueImages: BlogImage[] = [];

        for (const img of payload.collectedImages) {
            const url = img.url || img.thumbnailUrl || img.filePath || '';
            if (!url) continue;

            // URL에서 기본 이미지 식별자 추출 (중복 감지)
            const baseUrl = url
                .replace(/\?.*$/, '')
                .replace(/(_v\d+|_\d{2,}x\d{2,}|_s\d+|_m\d+|_l\d+)(\.[a-z]+)?$/i, '$2')
                .replace(/[-_](small|medium|large|thumb|full|origin|detail|main|sub)(\.[a-z]+)?$/i, '$2');

            const fileName = baseUrl.split('/').pop()?.replace(/\.[a-z]+$/i, '') || baseUrl;
            const basePattern = fileName.replace(/[_-]?\d+$/, '');

            if (seenBaseUrls.has(basePattern) && basePattern.length > 5) continue;
            if (seenBaseUrls.has(url)) continue;

            seenBaseUrls.add(url);
            seenBaseUrls.add(basePattern);
            uniqueImages.push({
                heading: img.heading || img.title || '',
                filePath: img.url || img.thumbnailUrl || img.filePath,
                provider: 'collected',
                alt: img.alt || '',
                caption: img.caption || '',
            });
        }

        sourceImages = uniqueImages;
        sendLog(`🧹 중복 제거 후: ${sourceImages.length}개 고유 이미지`);
    } else {
        // 기존 로직: generatedImages 또는 images 사용
        sourceImages = (payload.generatedImages && payload.generatedImages.length > 0)
            ? payload.generatedImages
            : (payload.images && payload.images.length > 0)
                ? payload.images
                : [];
    }

    if (sourceImages.length === 0 || payload.skipImages) {
        sendLog(`ℹ️ 이미지 없음 또는 건너뛰기 (scSubImageSource: ${payload.scSubImageSource}, collectedImages: ${payload.collectedImages?.length || 0})`);
        return { folder: null, images: [] };
    }

    sendLog(`📷 이미지 처리 시작: ${sourceImages.length}개`);

    // ✅ [2026-02-01 FIX] selectedTitle (패치된 제목)을 우선 사용
    const postTitle = payload.structuredContent?.selectedTitle || payload.title || `post-${Date.now()}`;
    const safeTitle = postTitle.replace(/[<>:"/\\|?*,;#&=+%!'(){}\[\]~]/g, '_').replace(/_+/g, '_').replace(/\.+$/g, '').substring(0, 100).trim() || 'untitled';

    const postsImageDir = path.join(app.getPath('userData'), 'images', 'posts', safeTitle);
    await fs.mkdir(postsImageDir, { recursive: true });

    sendLog(`📁 글별 이미지 폴더 생성: ${postsImageDir}`);

    const processedImages: ProcessedImage[] = [];

    for (const image of sourceImages) {
        // ✅ [2026-02-12 FIX] file:/// URL → 절대 경로 변환 (GIF 등 로컬 파일 지원)
        if (image.filePath && image.filePath.startsWith('file://')) {
            let cleaned = image.filePath.replace(/^file:\/\/\//, '');
            try { cleaned = decodeURIComponent(cleaned); } catch { /* ignore */ }
            image.filePath = cleaned;
            sendLog(`🔧 file:// URL 변환: ${image.heading || '알 수 없음'}`);
        }

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
                const safeHeading = (image.heading || 'image').replace(/[<>:"/\\|?*,;#&=+%!'(){}\[\]~]/g, '_').replace(/_+/g, '_').replace(/\.+$/g, '').substring(0, 50);
                const filename = `${safeHeading}_${Date.now()}.${ext}`;
                const destPath = path.join(postsImageDir, filename);

                try {
                    // [SPEC-FREEZE-GUARD-001-P2 R5] 워커 디코딩 (외부 입력 data URL)
                    const buf = await decodeBase64Async(base64Data);
                    await fs.writeFile(destPath, buf);

                    processedImages.push({
                        heading: image.heading,
                        filePath: destPath,
                        provider: image.provider,
                        alt: image.alt,
                        caption: image.caption,
                        originalIndex: image.originalIndex, // ✅ [2026-02-05] 원래 인덱스 보존
                        headingIndex: (image as any).headingIndex, // ✅ [2026-04-04 FIX] 소제목 인덱스 보존
                        isThumbnail: image.isThumbnail || false, // ✅ [2026-02-25 FIX] 썸네일 플래그 보존
                        isIntro: image.isIntro || false, // ✅ [2026-02-25 FIX] 서론 이미지 플래그 보존
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
                filePath: image.filePath!,
                provider: image.provider,
                alt: image.alt,
                caption: image.caption,
                originalIndex: image.originalIndex, // ✅ [2026-02-05] 원래 인덱스 보존
                headingIndex: (image as any).headingIndex, // ✅ [2026-04-04 FIX] 소제목 인덱스 보존
                isThumbnail: image.isThumbnail || false, // ✅ [2026-02-25 FIX] 썸네일 플래그 보존
                isIntro: image.isIntro || false, // ✅ [2026-02-25 FIX] 서론 이미지 플래그 보존
            });
            continue;
        }

        // 로컬 파일 복사 로직
        try {
            const isGif = image.filePath.toLowerCase().endsWith('.gif');
            if (isGif) {
                sendLog(`🎬 GIF 이미지 처리 중: ${image.heading || '알 수 없음'}, 경로: ${image.filePath.substring(0, 80)}`);
            }
            await fs.access(image.filePath);
            const stats = await fs.stat(image.filePath);

            if (!stats.isFile()) {
                sendLog(`⚠️ 이미지 파일이 아닙니다: ${image.filePath}`);
                continue;
            }

            // ✅ [파일 전송 오류 fix] 원본 파일명을 그대로 쓰지 않는다.
            //   수집/수동삽입 이미지의 원본 파일명이 CDN 해시(180자+)면 네이버 업로드가
            //   "파일 전송 오류(알 수 없는 오류)"로 거부하고 Windows 260자 경로 한계도 초과한다.
            //   base64 경로와 동일하게 "{소제목}_{timestamp}.{ext}" 짧은 이름으로 강제.
            const srcExt = (path.extname(image.filePath) || '.jpg').toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 5) || '.jpg';
            const shortHeading = (image.heading || 'image')
                .replace(/[<>:"/\\|?*,;#&=+%!'(){}\[\]~]/g, '_').replace(/_+/g, '_')
                .replace(/\.+$/g, '').substring(0, 40).trim() || 'image';
            const filename = `${shortHeading}_${Date.now()}${srcExt.startsWith('.') ? srcExt : '.' + srcExt}`;
            const destPath = path.join(postsImageDir, filename);
            await fs.copyFile(image.filePath, destPath);

            processedImages.push({
                heading: image.heading,
                filePath: destPath,
                provider: image.provider,
                alt: image.alt,
                caption: image.caption,
                originalIndex: image.originalIndex, // ✅ [2026-02-05] 원래 인덱스 보존
                headingIndex: (image as any).headingIndex, // ✅ [2026-04-04 FIX] 소제목 인덱스 보존
                isThumbnail: image.isThumbnail || false, // ✅ [2026-02-25 FIX] 썸네일 플래그 보존
                isIntro: image.isIntro || false, // ✅ [2026-02-25 FIX] 서론 이미지 플래그 보존
            });

            sendLog(`✅ 이미지 복사: ${filename}`);
        } catch (error) {
            // ✅ [2026-04-04 FIX] 복사 실패 시 원본 경로를 그대로 사용 (이미지 누락 방지)
            sendLog(`⚠️ 이미지 복사 실패: ${image.filePath} → 원본 경로로 폴백`);
            processedImages.push({
                heading: image.heading,
                filePath: image.filePath!,
                provider: image.provider,
                alt: image.alt,
                caption: image.caption,
                originalIndex: image.originalIndex,
                headingIndex: (image as any).headingIndex,
                isThumbnail: image.isThumbnail || false,
                isIntro: image.isIntro || false,
            });
        }
    }

    // ✅ [2026-03-19 FIX] Defense-in-depth: payload.thumbnailPath가 없을 때
    // processedImages에서 isThumbnail 플래그로 자동 발견
    if (!payload.thumbnailPath && processedImages.length > 0) {
        const thumbImg = processedImages.find((img) => img.isThumbnail === true);
        if (thumbImg?.filePath) {
            payload.thumbnailPath = thumbImg.filePath;
            sendLog(`🖼️ 썸네일 자동 발견 (isThumbnail): ${path.basename(thumbImg.filePath)}`);
        } else if (processedImages[0]?.filePath) {
            // 마지막 폴백: 첫 번째 이미지를 썸네일로
            payload.thumbnailPath = processedImages[0].filePath;
            sendLog(`🖼️ 썸네일 폴백 (첫 이미지): ${path.basename(processedImages[0].filePath)}`);
        }
    }

    return { folder: postsImageDir, images: processedImages };
}

/**
 * 5단계: 실제 발행 실행
 */
export async function executePublishing(
    automation: IAutomationInstance,
    payload: PostCyclePayload,
    processedImages: ProcessedImage[]
): Promise<{ success: boolean; url?: string; message?: string; failureCode?: import('../../automation/publishFailureClassifier.js').PublishFailureCode }> {
    // 취소 체크
    if (AutomationService.isCancelRequested()) {
        return { success: false, message: '사용자가 취소했습니다.', failureCode: 'USER_CANCELLED' };
    }

    // ✅ [2026-05-26 v2.10.379 SPEC-NAVER-PROTECTION-2026 P2 §2.2 wiring]
    //   계정별 시간당 한도 체크 — 기본 경고만, env STRICT_HOURLY_PER_ACCOUNT=1 시 hard-block.
    //   v2.10.378 perAccount 카운터 활용. 발행 전 진입점에서 체크 (실제 한도 적용).
    const _accountId = (payload as any).accountId || (payload as any).naverId;
    if (_accountId) {
        try {
            const { canPublishHourlyForAccount, getTodayCountForAccount } = await import('../../postLimitManagerPerAccount.js');
            const canPublish = await canPublishHourlyForAccount(_accountId, 2);
            if (!canPublish) {
                const todayCount = await getTodayCountForAccount(_accountId);
                const strictMode = (process.env.STRICT_HOURLY_PER_ACCOUNT || '').trim() === '1';
                const msg = `⚠️ ${_accountId}: 시간당 발행 한도 도달 (today: ${todayCount}건). 1시간 내 추가 발행 비추천.`;
                if (strictMode) {
                    sendLog(`🛡️ ${msg} — STRICT 모드 hard-block`);
                    return { success: false, message: `STRICT_HOURLY_PER_ACCOUNT=1: ${msg}`, failureCode: 'PUBLISH_CONDITION' };
                } else {
                    sendLog(`⚠️ ${msg} (STRICT_HOURLY_PER_ACCOUNT=1로 hard-block 가능)`);
                }
            }
        } catch (hourlyErr) {
            console.warn('[BlogExecutor] perAccount hourly 체크 실패 (무시):', (hourlyErr as Error).message);
        }
    }

    sendLog(`📝 발행 모드: ${payload.publishMode || 'publish'}`);

    try {
        // NaverBlogAutomation.run() 호출 - selectedTitle 우선 사용
        const finalTitle = payload.structuredContent?.selectedTitle || payload.title;

        // ✅ [2026-02-01 FIX] structuredContent.selectedTitle을 finalTitle로 강제 업데이트
        // naverBlogAutomation.resolveRunOptions()에서 structured?.selectedTitle을 다시 읽기 때문에
        // 여기서 명시적으로 설정해야 패치된 제목이 적용됨
        const updatedStructuredContent = payload.structuredContent ? {
            ...payload.structuredContent,
            selectedTitle: finalTitle  // 패치된 제목으로 강제 업데이트
        } : undefined;

        // ✅ [2026-04-06 FIX v3] ftcDisclosure 전달 확인 로깅
        if (updatedStructuredContent?.ftcDisclosure) {
            sendLog(`   ⚖️ 공정위 문구 전달됨: "${updatedStructuredContent.ftcDisclosure.substring(0, 30)}..."`);
        }
        if (!updatedStructuredContent) {
            console.warn('[BlogExecutor] ⚠️ structuredContent가 undefined — applyPlainContent 경로 진입 예상 (공정문구 미삽입)');
        }

        sendLog(`📝 최종 제목: ${finalTitle?.substring(0, 40)}...`);

        const result = await automation.run({
            title: finalTitle,
            content: payload.content,
            lines: payload.lines,
            structuredContent: updatedStructuredContent,
            hashtags: payload.hashtags,
            images: processedImages,
            collectedImages: payload.collectedImages, // ✅ [2026-01-19] 수집된 제품 이미지 전달 (썸네일용)
            publishMode: payload.publishMode,
            // ✅ [2026-05-25 v2.10.355] 반자동 모드 시 봇 감지 백오프 우회 (payload.skipBotBackoff → automation.run runOptions)
            skipBotBackoff: (payload as any).skipBotBackoff === true,
            // ✅ [2026-02-08 FIX] scheduleDate + scheduleTime 합성 (네이버 예약발행 'YYYY-MM-DD HH:mm' 형식 필수)
            scheduleDate: (() => {
                if (payload.publishMode === 'schedule' && payload.scheduleDate) {
                    Logger.info(`[BlogExecutor] 📅 scheduleDate 합성: date="${payload.scheduleDate}", time="${payload.scheduleTime || '(없음)'}"}`);
                    // scheduleTime이 별도 필드로 있으면 합성
                    if (payload.scheduleTime) {
                        // ✅ [2026-03-22 FIX] scheduleDate에 이미 시간이 포함되어 있으면 재합성하지 않음
                        const alreadyHasTime = /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}$/.test(payload.scheduleDate!);
                        if (alreadyHasTime) {
                            Logger.info(`[BlogExecutor] 📅 scheduleDate에 이미 시간 포함됨, 재합성 건너뜀: "${payload.scheduleDate}"`);
                            return payload.scheduleDate;
                        }
                        const synthesized = `${payload.scheduleDate} ${payload.scheduleTime}`;
                        Logger.info(`[BlogExecutor] 📅 scheduleDate+time 합성 결과: "${synthesized}"`);
                        return synthesized;
                    }
                    // 이미 'YYYY-MM-DD HH:mm' 형식이면 그대로
                    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(payload.scheduleDate)) {
                        Logger.info(`[BlogExecutor] 📅 scheduleDate 이미 YYYY-MM-DD HH:mm 형식, 그대로 사용`);
                        return payload.scheduleDate;
                    }
                    // 'T' 구분자 형식이면 공백으로 변환
                    if (payload.scheduleDate.includes('T')) {
                        const converted = payload.scheduleDate.replace('T', ' ');
                        Logger.info(`[BlogExecutor] 📅 scheduleDate T→공백 변환: "${converted}"`);
                        return converted;
                    }
                    Logger.warn(`[BlogExecutor] ⚠️ scheduleDate 형식 불명: "${payload.scheduleDate}" — 그대로 통과`);
                }
                // ✅ [2026-03-24 FIX] 예약 모드인데 scheduleDate 누락 — 1시간 후 자동 생성 (최종 방어선)
                if (payload.publishMode === 'schedule' && !payload.scheduleDate) {
                    const fb = new Date(Date.now() + 60 * 60 * 1000);
                    const cm = Math.ceil(fb.getMinutes() / 10) * 10;
                    fb.setMinutes(cm >= 60 ? 0 : cm, 0, 0);
                    if (cm >= 60) fb.setHours(fb.getHours() + 1);
                    const d = `${fb.getFullYear()}-${String(fb.getMonth()+1).padStart(2,'0')}-${String(fb.getDate()).padStart(2,'0')}`;
                    const t = `${String(fb.getHours()).padStart(2,'0')}:${String(fb.getMinutes()).padStart(2,'0')}`;
                    Logger.warn(`[BlogExecutor] ⚠️ 예약 모드인데 scheduleDate 누락 → 자동 생성: ${d} ${t}`);
                    return `${d} ${t}`;
                }
                return payload.scheduleDate;
            })(),
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

        assertImmediatePublishResultUrl(result, payload);

        if (result.success) {
            sendLog(`✅ 발행 완료: ${result.url || '(URL 없음)'}`);
            sendStatus({ success: true, url: result.url });
        } else {
            sendLog(`❌ 발행 실패: ${result.message}`);
            const failure = classifyPublishFailure(result.message);
            sendStatus({ success: false, message: result.message, failureCode: failure.code });
        }

        if (!result.success) {
            const failure = classifyPublishFailure(result.message);
            return { ...result, failureCode: failure.code };
        }

        return result;
    } catch (error) {
        const message = (error as Error).message || '발행 중 오류가 발생했습니다.';
        sendLog(`❌ 발행 오류: ${message}`);
        const failure = classifyPublishFailure(error);
        sendStatus({ success: false, message, failureCode: failure.code });
        return { success: false, message, failureCode: failure.code };
    }
}

/**
 * 6단계: 정리 작업
 */
export async function cleanup(
    payload: PostCyclePayload,
    accountId?: string,
    publishSucceeded = false
): Promise<void> {
    const deps = getDependencies();

    if (publishSucceeded) {
        // 발행 카운트 증가
        if (accountId && deps.blogAccountManager) {
            deps.blogAccountManager.incrementPublishCount(accountId);
        }

        // 일일 카운트 증가
        if (deps.incrementTodayCount) {
            await deps.incrementTodayCount();
        }

        // ✅ [2026-05-26 v2.10.378 SPEC-NAVER-PROTECTION-2026 P2 Fix 2.1]
        //   계정별 빈도 카운터 증가 (다계정 격리). 기존 글로벌 카운터는 backward compat으로 유지.
        if (accountId) {
            try {
                const { incrementForAccount } = await import('../../postLimitManagerPerAccount.js');
                await incrementForAccount(accountId);
            } catch (perAccountErr) {
                console.warn('[BlogExecutor] perAccount post limit 증가 실패 (무시):', (perAccountErr as Error).message);
            }
        }
    }

    // ✅ [v1.4.55 CRITICAL FIX] 브라우저 실제 종료 (keepBrowserOpen이 false인 경우)
    // 이전 버그: AutomationService.delete()는 맵에서만 제거 → 브라우저 프로세스 orphaned
    //            같은 userDataDir로 두 번째 발행 시 Chrome 실행 실패 → "하나 발행하고 멍때림"
    // 수정: closeSession()으로 browser.close() + automationMap.delete() 순서 보장
    // [v1.6.0] 명시적 false인 경우에만 종료 (undefined=미지정은 keep-alive 우선)
    //   + closeSession 내부에서 locked 세션 보호하지만 이중 가드로 호출 자체 억제
    if (payload.keepBrowserOpen === false) {
        const normalizedId = (payload.naverId || '').trim().toLowerCase();
        if (normalizedId) {
            // [v1.6.0] locked 세션은 닫지 않음 (세션 유지가 사용자 의도)
            let locked = false;
            try {
                const { browserSessionManager } = await import('../../browserSessionManager.js');
                locked = browserSessionManager.isSessionLocked(normalizedId);
            } catch {
                /* 조회 실패 시 안전하게 close 진행 */
            }
            if (locked) {
                console.log(`[BlogExecutor] 🔒 ${normalizedId.substring(0, 3)}*** 잠긴 세션 — keepBrowserOpen=false 무시 (세션 유지)`);
            } else {
                try {
                    await AutomationService.closeSession(normalizedId);
                } catch (e) {
                    // closeBrowser 실패해도 맵 정리는 보장 (내부에서 finally로 처리됨)
                }
                // 현재 인스턴스도 명시적으로 닫기 (다른 경로로 주입됐을 수 있음)
                const curr = AutomationService.getCurrentInstance();
                if (curr) {
                    try {
                        await curr.closeBrowser();
                    } catch {
                        /* 이미 닫혔을 수 있음 */
                    }
                }
                AutomationService.setCurrentInstance(null);
            }
        }
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
    let finalResult: PostCycleResult;
    let effectivePayload = payload;
    let preparedPolicy: PreparedContentPolicyPublish<PostCyclePayload> | null = null;

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
            const failure = classifyPublishFailure(message);
            sendStatus({ success: false, message, failureCode: failure.code });
            return { success: false, message, failureCode: failure.code };
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

        // Fail closed before browser creation. Every renderer flow, including
        // multi-account publishing, converges on this main-process boundary.
        preparedPolicy = await prepareContentPolicyForPublish(effectivePayload, {
            userDataPath: app.getPath('userData'),
            env: process.env,
        });
        effectivePayload = preparedPolicy.payload;
        if (!preparedPolicy.allowed) {
            const reasons = preparedPolicy.reasons.join(',') || 'BLOCK_POLICY_DECISION';
            const unsupportedClaims = preparedPolicy.policyResult.quality_report.unsupported_claims.slice(0, 3);
            const unsupportedDetail = unsupportedClaims.length > 0
                ? `\n문제 문장: ${unsupportedClaims.join(' | ')}`
                : '';
            const message = `CONTENT_POLICY_BLOCKED:${reasons}${unsupportedDetail}`;
            sendLog(`🛡️ 콘텐츠 정책 차단: ${reasons}`);
            const failure = classifyPublishFailure(message);
            sendStatus({ success: false, message, failureCode: failure.code });
            AutomationService.stopRunning();
            return { success: false, message, failureCode: failure.code };
        }
        sendLog(`✅ 콘텐츠 정책 통과 (${preparedPolicy.policyResult.quality_report.total_score}점, 최근 글 ${preparedPolicy.policyResult.similarity_report.compared_post_count}건 비교)`);

        // 6. 브라우저 세션 관리
        const automation = await getOrCreateBrowserSession(account);
        AutomationService.updateLastRunTime(); // ✅ [FIX-1] heartbeat — stale guard 오판 방지

        // 7. 이미지 처리 (실패해도 발행은 계속)
        let processedImages: ProcessedImage[] = [];
        try {
            const imageResult = await processImages(effectivePayload);
            processedImages = imageResult.images || [];
            AutomationService.updateLastRunTime(); // ✅ [FIX-1] heartbeat — 이미지 처리 후 갱신
        } catch (imageError) {
            const imgMsg = (imageError as Error).message || '이미지 처리 중 알 수 없는 오류';
            Logger.error('[BlogExecutor] 이미지 처리 실패 — 발행 중단', imageError as Error);
            sendLog(`⚠️ 이미지 처리 실패: ${imgMsg.substring(0, 100)} — 이미지 없이 발행하지 않고 중단합니다.`);
            throw new Error(`IMAGE_PROCESSING_FAILED:${imgMsg}`);
        }

        // 8. 취소 체크 (이미지 처리 후 재확인)
        if (AutomationService.isCancelRequested()) {
            return {
                success: false,
                cancelled: true,
                message: '사용자가 자동화를 취소했습니다.'
            };
        }

        // 9. 발행 실행
        const result = await executePublishing(automation, effectivePayload, processedImages);
        AutomationService.updateLastRunTime(); // ✅ [FIX-1] heartbeat — 발행 완료 후 갱신

        // 10. 성공 시 정리
        const elapsed = Date.now() - startTime;
        sendLog(`⏱️ 총 소요 시간: ${(elapsed / 1000).toFixed(1)}초`);

        finalResult = {
            success: result.success,
            url: result.url,
            message: result.message,
            failureCode: result.failureCode,
        };

        if (result.success
            && preparedPolicy
            && effectivePayload.publishMode !== 'draft'
            && effectivePayload.publishMode !== 'schedule') {
            try {
                await recordContentPolicyPublication({
                    userDataPath: app.getPath('userData'),
                    articleId: preparedPolicy.articleId,
                    accountId: accountId || account.naverId,
                    payload: effectivePayload,
                    policyResult: preparedPolicy.policyResult,
                    publishedUrl: result.url,
                });
            } catch (policyRecordError) {
                const reason = `POLICY_POST_PUBLISH_RECORD_FAILED:${(policyRecordError as Error).message}`;
                Logger.error('[BlogExecutor] 정책 발행 원장 기록 실패', policyRecordError as Error);
                sendLog(`⚠️ ${reason} — 후속 자동발행을 일시 중지합니다.`);
                try {
                    await new PublicationStateStore(app.getPath('userData')).pauseAll(reason);
                } catch (pauseError) {
                    Logger.error('[BlogExecutor] 정책 자동중지 저장 실패', pauseError as Error);
                }
            }
        }

    } catch (error) {
        const message = (error as Error).message || '알 수 없는 오류가 발생했습니다.';
        Logger.error('[BlogExecutor] 발행 사이클 오류', error as Error);
        const failure = classifyPublishFailure(error);
        sendStatus({ success: false, message, failureCode: failure.code });
        // ✅ [2026-04-05 FIX] stopRunning을 즉시 호출 — 재실행 시 "이미 실행 중" 에러 방지
        AutomationService.stopRunning();
        // ✅ [v1.4.55 FIX] cleanup을 await — 브라우저 종료 전에 리턴하면 다음 발행 hang
        try {
            await cleanup(effectivePayload, accountId, false);
        } catch (e) {
            Logger.error('[BlogExecutor] cleanup 오류 (무시됨)', e as Error);
        }
        return { success: false, message, failureCode: failure.code };
    }

    // ✅ [2026-04-05 FIX] stopRunning을 즉시 호출 후 cleanup 처리
    // ✅ [v1.4.55 FIX] cleanup을 await — 브라우저 종료(closeSession) 완료 전에 리턴하면
    //    다음 발행 IPC가 같은 userDataDir로 Chrome 실행 시도 → hang ("하나 발행하고 멍때림")
    //    stopRunning()은 이미 호출했으므로 isRunning() 중복 오류는 없음
    AutomationService.stopRunning();
    try {
        await cleanup(effectivePayload, accountId, finalResult.success === true);
    } catch (e) {
        Logger.error('[BlogExecutor] cleanup 오류 (무시됨)', e as Error);
    }

    return finalResult;
}
