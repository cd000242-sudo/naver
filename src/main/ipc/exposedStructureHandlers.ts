// src/main/ipc/exposedStructureHandlers.ts
// structure:analyzeExposedUrl — 노출된 글 URL 을 받아 "구조 수치"만 돌려준다.
//
// 돌려주는 블록에는 원문 문장·제목·소제목·고유명사가 들어 있지 않다
// (exposedPostStructure 가 그 계약을 지킨다). 베끼기를 막기 위한 설계다.

import { ipcMain } from 'electron';
import {
  analyzePostStructure,
  buildStructureGuideBlock,
  type PostStructureProfile,
} from '../../content/exposedPostStructure.js';

export interface ExposedStructureResult {
  success: boolean;
  /** 프롬프트에 그대로 주입할 블록. 실패 시 빈 문자열. */
  block: string;
  profile?: PostStructureProfile;
  message?: string;
}

/** 본문 줄 중에서 소제목처럼 보이는 것만 고른다 — 짧고 종결어미가 없는 줄. */
export function pickHeadingLines(body: string): string[] {
  return body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length >= 6 && line.length <= 40)
    .filter((line) => !/[.?!]$/.test(line))
    .filter((line) => !/(요|다|죠|니다|는데요|거든요)$/.test(line))
    .slice(0, 12);
}

export function isSupportedPostUrl(url: string): boolean {
  return /^https?:\/\/(m\.)?blog\.naver\.com\/[A-Za-z0-9_-]+\/\d{6,}/.test(String(url || '').trim());
}

export function registerExposedStructureHandlers(): void {
  ipcMain.handle('structure:analyzeExposedUrl', async (_event, url: string): Promise<ExposedStructureResult> => {
    const target = String(url || '').trim();
    if (!isSupportedPostUrl(target)) {
      return {
        success: false,
        block: '',
        message: '네이버 블로그 글 주소를 넣어주세요 (예: https://blog.naver.com/아이디/글번호)',
      };
    }

    try {
      const { fetchArticleContent } = await import('../../sourceAssembler.js');
      const article = await fetchArticleContent(target);
      const body = String(article?.content || '').trim();

      if (body.length < 300) {
        return {
          success: false,
          block: '',
          message: `본문을 충분히 읽지 못했습니다 (${body.length}자). 비공개 글이거나 접근이 막혔을 수 있습니다.`,
        };
      }

      const images = Array.isArray((article as { images?: unknown[] })?.images)
        ? (article as { images: unknown[] }).images.length
        : 0;

      const profile = analyzePostStructure({
        title: String(article?.title || ''),
        body,
        headings: pickHeadingLines(body),
        imageCount: images,
      });

      return { success: true, block: buildStructureGuideBlock(profile), profile };
    } catch (error) {
      // 구조 참고는 부가 기능이다 — 실패해도 글쓰기를 막지 않는다.
      return {
        success: false,
        block: '',
        message: `구조 분석 실패: ${(error as Error).message}`,
      };
    }
  });
}
