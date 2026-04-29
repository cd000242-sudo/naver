// 댓글 자동 수집 및 AI 기반 답변 생성 시스템

import { GoogleGenerativeAI } from '@google/generative-ai';
import { loadConfig } from '../configManager.js';
// ✅ [v2.7.52] modelRegistry SSOT
import { GEMINI_TEXT_MODELS } from '../runtime/modelRegistry.js';

// ==================== 타입 정의 ====================

export interface BlogComment {
  readonly commentId: string;
  readonly nickname: string;
  readonly content: string;
  readonly date: string;
  readonly isReply: boolean;
  readonly parentId?: string;
}

export type CommentType = 'question' | 'compliment' | 'feedback' | 'request' | 'general';

export interface CommentReply {
  readonly commentId: string;
  readonly reply: string;
  readonly generatedAt: string;
  readonly type: CommentType;
  readonly confidence: number;
}

// ==================== 상수 ====================

const COMMENT_API_URL = 'https://apis.naver.com/commentBox/cbox5/web_naver_list_jsonp.json';

const COMMENT_API_PARAMS: Record<string, string> = {
  ticket: 'blog',
  templateId: 'view_blog',
  pool: 'cbox5',
  _callback: '_cb',
  lang: 'ko',
  country: 'KR',
  pageSize: '100',
};

const CLASSIFICATION_KEYWORDS: Record<CommentType, readonly string[]> = {
  question: ['어떻게', '뭐예요', '궁금', '알려주세요', '방법', '어디서', '언제', '?'],
  compliment: ['좋아요', '감사', '대박', '최고', '유용', '도움'],
  feedback: ['아쉬운', '별로', '개선', '수정', '오류'],
  request: ['부탁', '해주세요', '올려주세요', '다뤄주세요'],
  general: [],
};

const REPLY_MAX_LENGTH = 200;

const FALLBACK_REPLIES: Record<CommentType, string> = {
  question: '좋은 질문 감사합니다! 본문에서 자세히 다루고 있으니 참고해주세요.',
  compliment: '따뜻한 댓글 감사합니다! 앞으로도 좋은 글로 보답할게요.',
  feedback: '소중한 피드백 감사합니다! 참고하여 더 좋은 글 쓰겠습니다.',
  request: '요청 감사합니다! 다음에 관련 내용 다뤄볼게요.',
  general: '댓글 감사합니다! 자주 놀러와주세요.',
};

// ==================== JSONP 파서 ====================

function parseJsonpResponse(raw: string): unknown {
  const match = raw.match(/^_cb\(([\s\S]*)\);?\s*$/);
  if (!match) {
    throw new Error('Invalid JSONP response format');
  }
  return JSON.parse(match[1]);
}

interface NaverCommentItem {
  commentNo?: number;
  userName?: string;
  contents?: string;
  regTime?: string;
  parentCommentNo?: number;
}

interface NaverCommentResponse {
  success?: boolean;
  result?: {
    commentList?: NaverCommentItem[];
  };
}

function mapNaverComment(item: NaverCommentItem): BlogComment {
  const commentNo = item.commentNo ?? 0;
  const parentNo = item.parentCommentNo ?? 0;
  const isReply = parentNo !== 0 && parentNo !== commentNo;

  return {
    commentId: String(commentNo),
    nickname: item.userName ?? '',
    content: item.contents ?? '',
    date: item.regTime ?? new Date().toISOString(),
    isReply,
    ...(isReply ? { parentId: String(parentNo) } : {}),
  };
}

// ==================== CommentCrawler 클래스 ====================

export class CommentCrawler {
  private readonly repliedIds: Map<string, number> = new Map();
  private readonly apiKey?: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey;
  }

  /**
   * 블로그 글의 댓글 목록 크롤링
   * 네이버 블로그 댓글 API(JSONP)를 호출하여 댓글 목록을 반환한다.
   */
  async fetchComments(blogId: string, postNo: string): Promise<BlogComment[]> {
    try {
      const objectId = `${blogId}_${postNo}`;
      const params = new URLSearchParams({
        ...COMMENT_API_PARAMS,
        objectId,
      });

      const url = `${COMMENT_API_URL}?${params.toString()}`;

      const response = await fetch(url, {
        headers: {
          Referer: `https://blog.naver.com/${blogId}/${postNo}`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        },
      });

      if (!response.ok) {
        console.error(`[CommentCrawler] API 응답 오류: ${response.status}`);
        return [];
      }

      const raw = await response.text();
      const parsed = parseJsonpResponse(raw) as NaverCommentResponse;

      if (!parsed.success || !parsed.result?.commentList) {
        return [];
      }

      return parsed.result.commentList.map(mapNaverComment);
    } catch (error) {
      console.error('[CommentCrawler] 댓글 수집 실패:', error);
      return [];
    }
  }

  /**
   * 미답변 댓글 필터링
   * 블로그 주인이 아직 답변하지 않은 댓글만 반환한다.
   */
  filterUnanswered(comments: ReadonlyArray<BlogComment>, ownerNickname: string): BlogComment[] {
    const ownerReplyParentIds = new Set(
      comments
        .filter((c) => c.isReply && c.nickname === ownerNickname)
        .map((c) => c.parentId)
        .filter((id): id is string => id !== undefined)
    );

    return comments.filter((c) => {
      if (c.nickname === ownerNickname) return false;
      if (c.isReply) return false;
      if (ownerReplyParentIds.has(c.commentId)) return false;
      if (this.isAlreadyReplied(c.commentId)) return false;
      return true;
    });
  }

  /**
   * 댓글 유형 자동 분류
   * 키워드 기반으로 댓글의 의도를 분류한다.
   */
  classifyComment(comment: BlogComment): CommentType {
    const content = comment.content;

    const typeScores: Array<{ type: CommentType; score: number }> = (
      Object.entries(CLASSIFICATION_KEYWORDS) as Array<[CommentType, readonly string[]]>
    )
      .filter(([type]) => type !== 'general')
      .map(([type, keywords]) => {
        const score = keywords.reduce(
          (acc, kw) => acc + (content.includes(kw) ? 1 : 0),
          0
        );
        return { type, score };
      });

    const best = typeScores.reduce((a, b) => (b.score > a.score ? b : a));

    return best.score > 0 ? best.type : 'general';
  }

  /**
   * AI 기반 맞춤 답변 생성 (Gemini API)
   * 댓글 유형에 따라 톤을 조정하여 자연스러운 답변을 생성한다.
   */
  async generateReply(
    comment: BlogComment,
    postTitle: string,
    postContent: string
  ): Promise<string> {
    const resolvedKey = await this.resolveApiKey();
    if (!resolvedKey) {
      return this.getFallbackReply(comment);
    }

    try {
      const commentType = this.classifyComment(comment);
      const toneGuide = this.getToneGuide(commentType);

      const prompt = [
        '다음 블로그 댓글에 블로그 주인으로서 자연스럽게 답변해주세요.',
        `톤: ${toneGuide}`,
        `답변만 작성하세요. 최대 ${REPLY_MAX_LENGTH}자.`,
        '',
        `[글 제목] ${postTitle}`,
        `[글 내용 요약] ${postContent.slice(0, 500)}`,
        `[댓글 작성자] ${comment.nickname}`,
        `[댓글 내용] ${comment.content}`,
        `[댓글 유형] ${commentType}`,
      ].join('\n');

      const genAI = new GoogleGenerativeAI(resolvedKey);
      const model = genAI.getGenerativeModel({ model: GEMINI_TEXT_MODELS.FLASH });
      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();

      if (!text) {
        return this.getFallbackReply(comment);
      }

      return text.length > REPLY_MAX_LENGTH
        ? text.slice(0, REPLY_MAX_LENGTH)
        : text;
    } catch (error) {
      console.error('[CommentCrawler] AI 답변 생성 실패:', error);
      return this.getFallbackReply(comment);
    }
  }

  /**
   * 답변 이력 확인 (중복 답변 방지)
   */
  isAlreadyReplied(commentId: string): boolean {
    return this.repliedIds.has(commentId);
  }

  /**
   * 답변 완료로 마킹
   */
  markAsReplied(commentId: string): void {
    this.repliedIds.set(commentId, Date.now());
  }

  /**
   * 댓글 수집 → 분류 → 답변 생성 일괄 처리
   */
  async processComments(
    blogId: string,
    postNo: string,
    ownerNickname: string,
    postTitle: string,
    postContent: string
  ): Promise<CommentReply[]> {
    const allComments = await this.fetchComments(blogId, postNo);
    const unanswered = this.filterUnanswered(allComments, ownerNickname);

    const replies: CommentReply[] = [];

    for (const comment of unanswered) {
      const type = this.classifyComment(comment);
      const confidence = this.calculateConfidence(comment, type);
      const reply = await this.generateReply(comment, postTitle, postContent);

      replies.push({
        commentId: comment.commentId,
        reply,
        generatedAt: new Date().toISOString(),
        type,
        confidence,
      });

      this.markAsReplied(comment.commentId);
    }

    return replies;
  }

  // ==================== Private helpers ====================

  private async resolveApiKey(): Promise<string | undefined> {
    if (this.apiKey) return this.apiKey;

    try {
      const config = await loadConfig();
      return config.geminiApiKey || process.env.GEMINI_API_KEY || undefined;
    } catch {
      return process.env.GEMINI_API_KEY || undefined;
    }
  }

  private getToneGuide(type: CommentType): string {
    const guides: Record<CommentType, string> = {
      question: '친절하고 도움이 되는 톤으로, 질문에 정확히 답변',
      compliment: '감사하고 따뜻한 톤으로, 진심을 담아 화답',
      feedback: '겸손하고 수용적인 톤으로, 피드백에 감사 표현',
      request: '적극적이고 긍정적인 톤으로, 요청에 성의있게 응답',
      general: '친근하고 진정성 있게',
    };
    return guides[type];
  }

  private getFallbackReply(comment: BlogComment): string {
    const type = this.classifyComment(comment);
    return FALLBACK_REPLIES[type];
  }

  private calculateConfidence(comment: BlogComment, type: CommentType): number {
    if (type === 'general') return 0.3;

    const keywords = CLASSIFICATION_KEYWORDS[type];
    const matchCount = keywords.reduce(
      (acc, kw) => acc + (comment.content.includes(kw) ? 1 : 0),
      0
    );

    const maxPossible = Math.max(keywords.length, 1);
    const raw = matchCount / maxPossible;

    return Math.min(Math.round(raw * 100) / 100 + 0.4, 1.0);
  }
}
