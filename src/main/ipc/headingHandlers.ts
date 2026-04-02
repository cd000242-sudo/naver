// src/main/ipc/headingHandlers.ts
// 소제목별 이미지/영상 관리 IPC 핸들러
// [2026-04-03] main.ts에서 추출

import { ipcMain } from 'electron';

type HeadingImageRecord = {
  provider: string;
  filePath: string;
  previewDataUrl: string;
  updatedAt: number;
  alt?: string;
  caption?: string;
};

type HeadingVideoRecord = {
  provider: string;
  filePath: string;
  previewDataUrl: string;
  updatedAt: number;
};

/**
 * 소제목 핸들러 의존성
 */
export interface HeadingHandlerDeps {
  headingImagesStore: Map<string, HeadingImageRecord>;
  headingVideosStore: Map<string, HeadingVideoRecord[]>;
  saveHeadingImagesStore: () => Promise<void>;
  saveHeadingVideosStore: () => Promise<void>;
  validateLicenseOnly: () => Promise<{ valid: true } | { valid: false; response: { success: false; message: string } }>;
}

/**
 * 소제목 이미지/영상 관련 핸들러 등록
 */
export function registerHeadingHandlers(deps: HeadingHandlerDeps): void {
  const {
    headingImagesStore,
    headingVideosStore,
    saveHeadingImagesStore,
    saveHeadingVideosStore,
    validateLicenseOnly,
  } = deps;

  // ═══════════════════════════════════════════════════════════════
  // 소제목 영상 관리
  // ═══════════════════════════════════════════════════════════════

  ipcMain.handle('heading:applyVideo', async (_event, heading: string, video: HeadingVideoRecord): Promise<{ success: boolean; message?: string }> => {
    const check = await validateLicenseOnly();
    if (!check.valid) return check.response;

    try {
      if (!heading || !heading.trim()) {
        return { success: false, message: '소제목이 비어있습니다.' };
      }
      if (!video || !video.filePath) {
        return { success: false, message: '영상 정보가 올바르지 않습니다.' };
      }

      const key = heading.trim();
      const current = headingVideosStore.get(key) || [];
      const nextRecord: HeadingVideoRecord = {
        provider: video.provider,
        filePath: video.filePath,
        previewDataUrl: video.previewDataUrl,
        updatedAt: video.updatedAt || Date.now(),
      };

      const deduped = current.filter((v) => String(v?.filePath || '') !== String(nextRecord.filePath || ''));
      deduped.unshift(nextRecord);
      deduped.sort((a, b) => Number(b?.updatedAt || 0) - Number(a?.updatedAt || 0));
      headingVideosStore.set(key, deduped);

      await saveHeadingVideosStore();
      console.log(`[Main] 소제목 "${heading}"에 영상 적용 완료`);
      return { success: true };
    } catch (error) {
      console.error('[Main] 소제목 영상 적용 실패:', error);
      return { success: false, message: (error as Error).message };
    }
  });

  ipcMain.handle('heading:getAppliedVideo', async (_event, heading: string): Promise<{ success: boolean; video?: HeadingVideoRecord; message?: string }> => {
    try {
      if (!heading || !heading.trim()) {
        return { success: false, message: '소제목이 비어있습니다.' };
      }

      const videos = headingVideosStore.get(heading.trim()) || [];
      return { success: true, video: videos[0] };
    } catch (error) {
      console.error('[Main] 소제목 영상 조회 실패:', error);
      return { success: false, message: (error as Error).message };
    }
  });

  ipcMain.handle('heading:getAppliedVideos', async (_event, heading: string): Promise<{ success: boolean; videos?: HeadingVideoRecord[]; message?: string }> => {
    try {
      if (!heading || !heading.trim()) {
        return { success: false, message: '소제목이 비어있습니다.' };
      }

      const videos = headingVideosStore.get(heading.trim()) || [];
      return { success: true, videos };
    } catch (error) {
      console.error('[Main] 소제목 영상 목록 조회 실패:', error);
      return { success: false, message: (error as Error).message };
    }
  });

  ipcMain.handle('heading:removeVideo', async (_event, heading: string): Promise<{ success: boolean; message?: string }> => {
    try {
      if (!heading || !heading.trim()) {
        return { success: false, message: '소제목이 비어있습니다.' };
      }

      const deleted = headingVideosStore.delete(heading.trim());
      if (deleted) {
        await saveHeadingVideosStore();
        console.log(`[Main] 소제목 "${heading}"의 영상 제거 완료`);
      }

      return { success: true };
    } catch (error) {
      console.error('[Main] 소제목 영상 제거 실패:', error);
      return { success: false, message: (error as Error).message };
    }
  });

  ipcMain.handle('heading:getAllAppliedVideos', async (): Promise<{ success: boolean; videos?: Record<string, HeadingVideoRecord[]>; message?: string }> => {
    try {
      const videos = Object.fromEntries(headingVideosStore);
      return { success: true, videos };
    } catch (error) {
      console.error('[Main] 모든 소제목 영상 조회 실패:', error);
      return { success: false, message: (error as Error).message };
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // 소제목 이미지 관리
  // ═══════════════════════════════════════════════════════════════

  ipcMain.handle('heading:applyImage', async (_event, heading: string, image: HeadingImageRecord): Promise<{ success: boolean; message?: string }> => {
    try {
      if (!heading || !heading.trim()) {
        return { success: false, message: '소제목이 비어있습니다.' };
      }
      if (!image || !image.filePath) {
        return { success: false, message: '이미지 정보가 올바르지 않습니다.' };
      }

      headingImagesStore.set(heading.trim(), {
        provider: image.provider,
        filePath: image.filePath,
        previewDataUrl: image.previewDataUrl,
        updatedAt: image.updatedAt || Date.now(),
        alt: image.alt,
        caption: image.caption,
      });

      await saveHeadingImagesStore();
      console.log(`[Main] 소제목 "${heading}"에 이미지 적용 완료`);
      return { success: true };
    } catch (error) {
      console.error('[Main] 소제목 이미지 적용 실패:', error);
      return { success: false, message: (error as Error).message };
    }
  });

  ipcMain.handle('heading:getAppliedImage', async (_event, heading: string): Promise<{ success: boolean; image?: HeadingImageRecord; message?: string }> => {
    try {
      if (!heading || !heading.trim()) {
        return { success: false, message: '소제목이 비어있습니다.' };
      }

      const image = headingImagesStore.get(heading.trim());
      if (!image) {
        return { success: true, image: undefined };
      }

      return { success: true, image };
    } catch (error) {
      console.error('[Main] 소제목 이미지 조회 실패:', error);
      return { success: false, message: (error as Error).message };
    }
  });

  ipcMain.handle('heading:removeImage', async (_event, heading: string): Promise<{ success: boolean; message?: string }> => {
    try {
      if (!heading || !heading.trim()) {
        return { success: false, message: '소제목이 비어있습니다.' };
      }

      const deleted = headingImagesStore.delete(heading.trim());
      if (deleted) {
        await saveHeadingImagesStore();
        console.log(`[Main] 소제목 "${heading}"의 이미지 제거 완료`);
      }

      return { success: true };
    } catch (error) {
      console.error('[Main] 소제목 이미지 제거 실패:', error);
      return { success: false, message: (error as Error).message };
    }
  });

  ipcMain.handle('heading:getAllAppliedImages', async (): Promise<{ success: boolean; images?: Record<string, HeadingImageRecord>; message?: string }> => {
    try {
      const images = Object.fromEntries(headingImagesStore);
      return { success: true, images };
    } catch (error) {
      console.error('[Main] 모든 소제목 이미지 조회 실패:', error);
      return { success: false, message: (error as Error).message };
    }
  });
}
