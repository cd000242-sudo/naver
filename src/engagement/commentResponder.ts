// ✅ 댓글 자동 답글 기능
// AI가 댓글에 자연스럽게 답변

export type CommentType = 'question' | 'compliment' | 'feedback' | 'request' | 'general';

export type Comment = {
  id: string;
  author: string;
  content: string;
  postUrl: string;
  postTitle: string;
  createdAt: string;
  type: CommentType;
  replied: boolean;
  replyContent?: string;
  repliedAt?: string;
};

export type ReplyTemplate = {
  type: CommentType;
  templates: string[];
};

// ✅ 댓글 유형별 답글 템플릿
const REPLY_TEMPLATES: ReplyTemplate[] = [
  {
    type: 'question',
    templates: [
      '{author}님, 좋은 질문 감사합니다! {answer}',
      '안녕하세요 {author}님! {answer} 도움이 되셨으면 좋겠습니다 😊',
      '{author}님 질문 주셔서 감사해요! {answer}',
      '좋은 질문이에요 {author}님! {answer} 더 궁금한 점 있으시면 말씀해주세요~',
    ],
  },
  {
    type: 'compliment',
    templates: [
      '{author}님, 따뜻한 댓글 감사합니다! 앞으로도 좋은 정보 공유할게요 💕',
      '감사합니다 {author}님! 이런 댓글이 큰 힘이 됩니다 😊',
      '{author}님 덕분에 힘이 나네요! 더 좋은 글로 보답할게요~',
      '와 {author}님 감사해요! 앞으로도 자주 놀러와주세요 🙏',
    ],
  },
  {
    type: 'feedback',
    templates: [
      '{author}님, 소중한 피드백 감사합니다! 참고해서 더 좋은 글 쓸게요 📝',
      '좋은 의견 감사해요 {author}님! 다음 글에 반영해볼게요~',
      '{author}님 피드백 정말 감사합니다! 더 발전하는 블로그가 되겠습니다 💪',
    ],
  },
  {
    type: 'request',
    templates: [
      '{author}님, 요청 감사합니다! 다음에 관련 글 준비해볼게요 📌',
      '좋은 아이디어네요 {author}님! 조만간 해당 주제로 글 써볼게요~',
      '{author}님 요청 잘 받았어요! 기대해주세요 😊',
    ],
  },
  {
    type: 'general',
    templates: [
      '{author}님, 댓글 감사합니다! 자주 놀러와주세요 😊',
      '방문해주셔서 감사해요 {author}님! 좋은 하루 보내세요~',
      '{author}님 감사합니다! 앞으로도 좋은 정보 공유할게요 💕',
      '댓글 남겨주셔서 감사해요 {author}님! 또 뵐게요~',
    ],
  },
];

// ✅ 질문 키워드
const QUESTION_KEYWORDS = ['어떻게', '뭐예요', '뭔가요', '왜', '언제', '어디', '얼마', '추천', '알려주세요', '궁금', '?'];

// ✅ 칭찬 키워드
const COMPLIMENT_KEYWORDS = ['좋아요', '최고', '감사', '도움', '유익', '잘 봤', '좋은 글', '대박', '짱', '멋져', '훌륭'];

// ✅ 피드백 키워드
const FEEDBACK_KEYWORDS = ['아쉬', '더 좋', '추가', '수정', '보완', '의견', '생각'];

// ✅ 요청 키워드
const REQUEST_KEYWORDS = ['해주세요', '부탁', '올려주', '다뤄주', '써주', '알려주'];

export class CommentResponder {
  private pendingComments: Map<string, Comment> = new Map();
  private repliedComments: Map<string, Comment> = new Map();

  constructor() {
    this.loadFromStorage();
  }

  // ✅ 로컬 스토리지에서 데이터 로드
  private loadFromStorage(): void {
    try {
      const fs = require('fs');
      const path = require('path');
      const { app } = require('electron');
      
      const dataPath = path.join(app.getPath('userData'), 'comments-data.json');
      if (fs.existsSync(dataPath)) {
        const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
        this.pendingComments = new Map(Object.entries(data.pending || {}));
        this.repliedComments = new Map(Object.entries(data.replied || {}));
      }
    } catch (error) {
      console.log('[CommentResponder] 저장된 데이터 없음');
    }
  }

  // ✅ 로컬 스토리지에 데이터 저장
  private saveToStorage(): void {
    try {
      const fs = require('fs');
      const path = require('path');
      const { app } = require('electron');
      
      const dataPath = path.join(app.getPath('userData'), 'comments-data.json');
      const data = {
        pending: Object.fromEntries(this.pendingComments),
        replied: Object.fromEntries(this.repliedComments),
        lastSaved: new Date().toISOString(),
      };
      fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('[CommentResponder] 저장 실패:', error);
    }
  }

  // ✅ 댓글 유형 감지
  detectCommentType(content: string): CommentType {
    const lowerContent = content.toLowerCase();
    
    if (QUESTION_KEYWORDS.some(kw => content.includes(kw))) {
      return 'question';
    }
    if (COMPLIMENT_KEYWORDS.some(kw => content.includes(kw))) {
      return 'compliment';
    }
    if (FEEDBACK_KEYWORDS.some(kw => content.includes(kw))) {
      return 'feedback';
    }
    if (REQUEST_KEYWORDS.some(kw => content.includes(kw))) {
      return 'request';
    }
    
    return 'general';
  }

  // ✅ 댓글 추가
  addComment(
    author: string,
    content: string,
    postUrl: string,
    postTitle: string
  ): Comment {
    const id = `comment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const type = this.detectCommentType(content);
    
    const comment: Comment = {
      id,
      author,
      content,
      postUrl,
      postTitle,
      createdAt: new Date().toISOString(),
      type,
      replied: false,
    };
    
    this.pendingComments.set(id, comment);
    this.saveToStorage();
    
    console.log(`[CommentResponder] 댓글 추가: ${author} - ${type}`);
    return comment;
  }

  // ✅ 자동 답글 생성
  generateReply(comment: Comment, customAnswer?: string): string {
    const templates = REPLY_TEMPLATES.find(t => t.type === comment.type)?.templates 
      || REPLY_TEMPLATES.find(t => t.type === 'general')!.templates;
    
    const template = templates[Math.floor(Math.random() * templates.length)];
    
    let reply = template.replace('{author}', comment.author);
    
    // 질문형 댓글에 대한 답변 처리
    if (comment.type === 'question' && customAnswer) {
      reply = reply.replace('{answer}', customAnswer);
    } else {
      reply = reply.replace('{answer}', '해당 내용은 글에서 자세히 다루고 있으니 참고해주세요!');
    }
    
    return reply;
  }

  // ✅ 답글 저장
  markAsReplied(commentId: string, replyContent: string): boolean {
    const comment = this.pendingComments.get(commentId);
    if (!comment) return false;
    
    comment.replied = true;
    comment.replyContent = replyContent;
    comment.repliedAt = new Date().toISOString();
    
    this.repliedComments.set(commentId, comment);
    this.pendingComments.delete(commentId);
    this.saveToStorage();
    
    console.log(`[CommentResponder] 답글 완료: ${comment.author}`);
    return true;
  }

  // ✅ 대기 중인 댓글 가져오기
  getPendingComments(): Comment[] {
    return Array.from(this.pendingComments.values())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  // ✅ 답글 완료된 댓글 가져오기
  getRepliedComments(): Comment[] {
    return Array.from(this.repliedComments.values())
      .sort((a, b) => new Date(b.repliedAt || b.createdAt).getTime() - new Date(a.repliedAt || a.createdAt).getTime());
  }

  // ✅ 특정 댓글 가져오기
  getComment(commentId: string): Comment | undefined {
    return this.pendingComments.get(commentId) || this.repliedComments.get(commentId);
  }

  // ✅ 댓글 삭제
  removeComment(commentId: string): boolean {
    if (this.pendingComments.has(commentId)) {
      this.pendingComments.delete(commentId);
      this.saveToStorage();
      return true;
    }
    if (this.repliedComments.has(commentId)) {
      this.repliedComments.delete(commentId);
      this.saveToStorage();
      return true;
    }
    return false;
  }

  // ✅ 통계
  getStats(): {
    pendingCount: number;
    repliedCount: number;
    totalCount: number;
    typeBreakdown: Record<CommentType, number>;
  } {
    const allComments = [...this.pendingComments.values(), ...this.repliedComments.values()];
    
    const typeBreakdown: Record<CommentType, number> = {
      question: 0,
      compliment: 0,
      feedback: 0,
      request: 0,
      general: 0,
    };
    
    allComments.forEach(c => {
      typeBreakdown[c.type]++;
    });
    
    return {
      pendingCount: this.pendingComments.size,
      repliedCount: this.repliedComments.size,
      totalCount: allComments.length,
      typeBreakdown,
    };
  }

  // ✅ 일괄 답글 생성
  generateBulkReplies(): Array<{ comment: Comment; suggestedReply: string }> {
    const pending = this.getPendingComments();
    
    return pending.map(comment => ({
      comment,
      suggestedReply: this.generateReply(comment),
    }));
  }

  // ✅ 모든 데이터 초기화
  clearAll(): void {
    this.pendingComments.clear();
    this.repliedComments.clear();
    this.saveToStorage();
  }
}
