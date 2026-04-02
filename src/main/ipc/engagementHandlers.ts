// src/main/ipc/engagementHandlers.ts
// 댓글/경쟁분석 관련 IPC 핸들러

import { ipcMain } from 'electron';
import { CommentResponder } from '../../engagement/commentResponder.js';
import { CompetitorAnalyzer } from '../../analytics/competitorAnalyzer.js';
import { sendLog } from '../utils/ipcHelpers.js';

const commentResponder = new CommentResponder();
const competitorAnalyzer = new CompetitorAnalyzer();

/**
 * 댓글 + 경쟁분석 핸들러 등록
 */
export function registerEngagementHandlers(): void {
  // ── 댓글 핸들러 ──
  ipcMain.handle('comment:add', async (_event, author: string, content: string, postUrl: string, postTitle: string) => {
    try {
      const comment = commentResponder.addComment(author, content, postUrl, postTitle);
      return { success: true, comment };
    } catch (error) {
      return { success: false, message: `추가 실패: ${(error as Error).message}` };
    }
  });

  ipcMain.handle('comment:generateReply', async (_event, commentId: string, customAnswer?: string) => {
    try {
      const comment = commentResponder.getComment(commentId);
      if (!comment) return { success: false, message: '댓글을 찾을 수 없습니다.' };
      const reply = commentResponder.generateReply(comment, customAnswer);
      return { success: true, reply };
    } catch (error) {
      return { success: false, message: `생성 실패: ${(error as Error).message}` };
    }
  });

  ipcMain.handle('comment:markReplied', async (_event, commentId: string, replyContent: string) => {
    try {
      const result = commentResponder.markAsReplied(commentId, replyContent);
      return { success: result };
    } catch (error) {
      return { success: false, message: `처리 실패: ${(error as Error).message}` };
    }
  });

  ipcMain.handle('comment:getPending', async () => {
    try {
      const comments = commentResponder.getPendingComments();
      return { success: true, comments };
    } catch (error) {
      return { success: false, message: `조회 실패: ${(error as Error).message}` };
    }
  });

  ipcMain.handle('comment:getReplied', async () => {
    try {
      const comments = commentResponder.getRepliedComments();
      return { success: true, comments };
    } catch (error) {
      return { success: false, message: `조회 실패: ${(error as Error).message}` };
    }
  });

  ipcMain.handle('comment:getStats', async () => {
    try {
      const stats = commentResponder.getStats();
      return { success: true, stats };
    } catch (error) {
      return { success: false, message: `조회 실패: ${(error as Error).message}` };
    }
  });

  ipcMain.handle('comment:generateBulk', async () => {
    try {
      const replies = commentResponder.generateBulkReplies();
      return { success: true, replies };
    } catch (error) {
      return { success: false, message: `생성 실패: ${(error as Error).message}` };
    }
  });

  // ── 경쟁분석 핸들러 ──
  ipcMain.handle('competitor:analyze', async (_event, keyword: string) => {
    try {
      sendLog(`🔍 경쟁 분석 중: ${keyword}`);
      const result = await competitorAnalyzer.analyzeCompetitors(keyword);
      sendLog(`✅ 경쟁 분석 완료: ${keyword} (난이도: ${result.difficulty})`);
      return { success: true, result };
    } catch (error) {
      return { success: false, message: `분석 실패: ${(error as Error).message}` };
    }
  });

  ipcMain.handle('competitor:analyzeBlog', async (_event, blogId: string) => {
    try {
      const result = await competitorAnalyzer.analyzeBlog(blogId);
      return { success: true, result };
    } catch (error) {
      return { success: false, message: `분석 실패: ${(error as Error).message}` };
    }
  });

  ipcMain.handle('competitor:clearCache', async () => {
    try {
      competitorAnalyzer.clearCache();
      return { success: true, message: '캐시가 초기화되었습니다.' };
    } catch (error) {
      return { success: false, message: `초기화 실패: ${(error as Error).message}` };
    }
  });

  console.log('[IPC] Engagement handlers registered (10 handlers)');
}
