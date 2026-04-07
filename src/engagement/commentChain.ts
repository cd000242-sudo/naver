// 댓글 대화 체인 분석 및 맥락 기반 답변 생성
// AI API 없이 순수 로직 기반 (오프라인 동작)

import type { BlogComment, CommentType } from './commentCrawler.js';

// ==================== 타입 정의 ====================

export interface ConversationChain {
  readonly root: BlogComment;
  readonly replies: readonly BlogComment[];
  readonly depth: number;
  readonly hasOwnerReply: boolean;
  readonly lastActivity: string;
}

export type SentimentLevel =
  | 'very_positive'
  | 'positive'
  | 'neutral'
  | 'negative'
  | 'very_negative';

export interface SentimentResult {
  readonly level: SentimentLevel;
  readonly score: number;
  readonly intensity: number;
  readonly keywords: readonly string[];
}

export interface ReplyDecision {
  readonly shouldReply: boolean;
  readonly priority: 'high' | 'medium' | 'low' | 'skip';
  readonly reason: string;
  readonly suggestedTone: 'warm' | 'professional' | 'cautious' | 'enthusiastic';
}

// ==================== 감정 키워드 사전 ====================

interface SentimentKeyword {
  readonly word: string;
  readonly score: number;
  readonly level: SentimentLevel;
}

const SENTIMENT_DICTIONARY: readonly SentimentKeyword[] = [
  // very_positive (+0.9 ~ +1.0)
  { word: '최고', score: 0.95, level: 'very_positive' },
  { word: '대박', score: 0.9, level: 'very_positive' },
  { word: '완벽', score: 0.95, level: 'very_positive' },
  { word: '사랑해요', score: 1.0, level: 'very_positive' },
  { word: '감동', score: 0.9, level: 'very_positive' },
  { word: '강추', score: 0.9, level: 'very_positive' },
  { word: '짱', score: 0.9, level: 'very_positive' },
  { word: '훌륭', score: 0.9, level: 'very_positive' },
  { word: '존경', score: 0.95, level: 'very_positive' },

  // positive (+0.3 ~ +0.8)
  { word: '좋아요', score: 0.6, level: 'positive' },
  { word: '감사', score: 0.7, level: 'positive' },
  { word: '도움', score: 0.5, level: 'positive' },
  { word: '유용', score: 0.5, level: 'positive' },
  { word: '재밌', score: 0.6, level: 'positive' },
  { word: '멋져', score: 0.7, level: 'positive' },
  { word: '유익', score: 0.5, level: 'positive' },
  { word: '잘 봤', score: 0.4, level: 'positive' },
  { word: '좋은 글', score: 0.6, level: 'positive' },
  { word: '추천', score: 0.5, level: 'positive' },
  { word: '응원', score: 0.6, level: 'positive' },
  { word: '기대', score: 0.4, level: 'positive' },

  // neutral (0)
  { word: '그렇군요', score: 0, level: 'neutral' },
  { word: '네', score: 0, level: 'neutral' },
  { word: '알겠습니다', score: 0, level: 'neutral' },
  { word: '참고', score: 0, level: 'neutral' },
  { word: '그렇구나', score: 0, level: 'neutral' },

  // negative (-0.3 ~ -0.8)
  { word: '아쉬운', score: -0.4, level: 'negative' },
  { word: '아쉽', score: -0.4, level: 'negative' },
  { word: '별로', score: -0.5, level: 'negative' },
  { word: '불만', score: -0.6, level: 'negative' },
  { word: '실망', score: -0.7, level: 'negative' },
  { word: '부족', score: -0.4, level: 'negative' },
  { word: '아니요', score: -0.3, level: 'negative' },
  { word: '틀렸', score: -0.5, level: 'negative' },
  { word: '잘못', score: -0.5, level: 'negative' },

  // very_negative (-0.9 ~ -1.0)
  { word: '최악', score: -0.95, level: 'very_negative' },
  { word: '쓰레기', score: -1.0, level: 'very_negative' },
  { word: '사기', score: -0.95, level: 'very_negative' },
  { word: '환불', score: -0.9, level: 'very_negative' },
  { word: '고소', score: -1.0, level: 'very_negative' },
  { word: '신고', score: -0.9, level: 'very_negative' },
  { word: '거짓', score: -0.9, level: 'very_negative' },
];

// ==================== 질문 패턴 ====================

const QUESTION_PATTERNS: readonly RegExp[] = [
  /어떻게/,
  /뭐예요/,
  /뭔가요/,
  /궁금/,
  /알려주세요/,
  /방법/,
  /어디서/,
  /언제/,
  /왜/,
  /얼마/,
  /\?/,
  /인가요/,
  /인지/,
  /할까요/,
  /될까요/,
  /있나요/,
  /없나요/,
];

const THANKS_PATTERNS: readonly RegExp[] = [
  /감사합니다/,
  /고마워/,
  /고맙습니다/,
  /잘 봤습니다/,
  /잘 읽었/,
  /ㄱㅅ/,
  /ㅎㅎ/,
];

// ==================== 답변 템플릿 ====================

interface ToneTemplates {
  readonly greeting: readonly string[];
  readonly question: readonly string[];
  readonly compliment: readonly string[];
  readonly feedback: readonly string[];
  readonly general: readonly string[];
  readonly followUp: readonly string[];
}

const TEMPLATES: Record<ReplyDecision['suggestedTone'], ToneTemplates> = {
  warm: {
    greeting: ['{nickname}님, 안녕하세요!', '{nickname}님, 반갑습니다!'],
    question: [
      '좋은 질문이에요! 본문에서 관련 내용을 다루고 있으니 참고해주세요.',
      '궁금하신 부분에 대해 답변드릴게요. 본문 내용을 참고하시면 도움이 될 거예요!',
    ],
    compliment: [
      '따뜻한 말씀 정말 감사합니다! 큰 힘이 됩니다.',
      '이렇게 좋은 댓글 남겨주셔서 감사해요! 더 좋은 글로 보답할게요.',
    ],
    feedback: [
      '소중한 의견 감사합니다! 참고하여 더 좋은 콘텐츠 만들겠습니다.',
      '피드백 감사합니다! 말씀해주신 부분 참고할게요.',
    ],
    general: [
      '댓글 감사합니다! 자주 놀러와주세요.',
      '방문해주셔서 감사해요! 좋은 하루 보내세요.',
    ],
    followUp: [
      '추가로 궁금한 점 있으시면 편하게 말씀해주세요!',
      '더 알고 싶은 내용 있으시면 댓글 남겨주세요!',
    ],
  },
  professional: {
    greeting: ['{nickname}님, 댓글 감사합니다.'],
    question: [
      '문의하신 내용에 대해 답변드립니다. 본문 내용을 참고해주시면 감사하겠습니다.',
      '해당 내용은 본문에서 상세히 다루고 있습니다. 참고 부탁드립니다.',
    ],
    compliment: [
      '좋은 평가 감사합니다. 앞으로도 양질의 콘텐츠를 제공하겠습니다.',
    ],
    feedback: [
      '귀한 피드백 감사합니다. 검토 후 반영하도록 하겠습니다.',
    ],
    general: ['댓글 감사합니다. 앞으로도 좋은 정보 공유하겠습니다.'],
    followUp: ['추가 문의사항은 댓글로 남겨주시면 답변드리겠습니다.'],
  },
  cautious: {
    greeting: ['{nickname}님, 댓글 남겨주셔서 감사합니다.'],
    question: [
      '말씀하신 부분 확인해보겠습니다. 본문에서도 참고해주세요.',
    ],
    compliment: ['감사합니다. 더 노력하겠습니다.'],
    feedback: [
      '소중한 의견 감사합니다. 말씀하신 부분 꼼꼼히 살펴보겠습니다.',
      '피드백 감사합니다. 개선할 수 있도록 노력하겠습니다.',
    ],
    general: ['댓글 감사합니다. 의견 참고하겠습니다.'],
    followUp: ['추가 의견 있으시면 말씀해주세요.'],
  },
  enthusiastic: {
    greeting: [
      '{nickname}님!! 반갑습니다!',
      '{nickname}님, 와 댓글 감사합니다!',
    ],
    question: [
      '오 좋은 질문이에요! 본문에서 자세히 다루고 있으니 꼭 확인해보세요!',
      '궁금해하셨던 부분, 본문에 답이 있을 거예요! 참고해주세요!',
    ],
    compliment: [
      '와 정말 감사합니다!! 이런 댓글이 최고의 보람이에요!',
      '너무 감사해요! 앞으로 더 좋은 글 많이 올릴게요!',
    ],
    feedback: [
      '의견 감사합니다! 적극 반영해볼게요!',
    ],
    general: [
      '댓글 감사합니다! 자주 놀러오세요!',
      '방문 감사해요! 앞으로도 기대해주세요!',
    ],
    followUp: [
      '궁금한 거 있으면 언제든 물어봐주세요!',
      '또 놀러와주세요! 기다릴게요!',
    ],
  },
};

// ==================== 최대 깊이 ====================

const MAX_CHAIN_DEPTH = 3;

// ==================== 핵심 함수 ====================

/**
 * 댓글 목록에서 대화 체인(부모-자식 관계)을 구축한다.
 * parentId 기반으로 트리 구조를 생성하고, 최대 깊이 3단계까지 지원한다.
 */
export function buildConversationChain(
  comments: ReadonlyArray<BlogComment>,
  ownerNickname?: string
): ConversationChain[] {
  // 루트 댓글과 답글 분리
  const rootComments = comments.filter((c) => !c.isReply);
  const replyComments = comments.filter((c) => c.isReply);

  // parentId 기준으로 답글 그룹화
  const replyMap = new Map<string, BlogComment[]>();
  for (const reply of replyComments) {
    const parentId = reply.parentId ?? '';
    if (!parentId) continue;
    const existing = replyMap.get(parentId) ?? [];
    replyMap.set(parentId, [...existing, reply]);
  }

  return rootComments.map((root) => {
    const allReplies = collectReplies(root.commentId, replyMap, 1);
    const depth = calculateDepth(root.commentId, replyMap, 0);
    const hasOwnerReply = ownerNickname
      ? allReplies.some((r) => r.nickname === ownerNickname)
      : false;

    const allDates = [root.date, ...allReplies.map((r) => r.date)].filter(Boolean);
    const lastActivity = allDates.length > 0
      ? allDates.reduce((latest, d) => (d > latest ? d : latest))
      : root.date;

    return {
      root,
      replies: allReplies,
      depth: Math.min(depth, MAX_CHAIN_DEPTH),
      hasOwnerReply,
      lastActivity,
    };
  });
}

/**
 * 재귀적으로 답글을 수집한다 (최대 깊이 제한).
 */
function collectReplies(
  parentId: string,
  replyMap: ReadonlyMap<string, readonly BlogComment[]>,
  currentDepth: number
): BlogComment[] {
  if (currentDepth > MAX_CHAIN_DEPTH) return [];

  const directReplies = replyMap.get(parentId) ?? [];
  const result: BlogComment[] = [...directReplies];

  for (const reply of directReplies) {
    const nested = collectReplies(reply.commentId, replyMap, currentDepth + 1);
    result.push(...nested);
  }

  return result;
}

/**
 * 대화 체인의 최대 깊이를 계산한다.
 */
function calculateDepth(
  parentId: string,
  replyMap: ReadonlyMap<string, readonly BlogComment[]>,
  currentDepth: number
): number {
  if (currentDepth >= MAX_CHAIN_DEPTH) return currentDepth;

  const directReplies = replyMap.get(parentId) ?? [];
  if (directReplies.length === 0) return currentDepth;

  const childDepths = directReplies.map((reply) =>
    calculateDepth(reply.commentId, replyMap, currentDepth + 1)
  );

  return Math.max(...childDepths);
}

/**
 * 한국어 감정 분석 (키워드 + 패턴 기반).
 * 5단계 감정, 감정 강도, 주요 감정 키워드를 반환한다.
 */
export function analyzeSentiment(text: string): SentimentResult {
  const matchedKeywords: SentimentKeyword[] = [];

  for (const entry of SENTIMENT_DICTIONARY) {
    if (text.includes(entry.word)) {
      matchedKeywords.push(entry);
    }
  }

  // 매칭된 키워드가 없으면 neutral
  if (matchedKeywords.length === 0) {
    return {
      level: 'neutral',
      score: 0,
      intensity: 0,
      keywords: [],
    };
  }

  // 평균 점수 계산
  const totalScore = matchedKeywords.reduce((sum, kw) => sum + kw.score, 0);
  const avgScore = totalScore / matchedKeywords.length;

  // 점수를 -1 ~ +1 범위로 클램핑
  const clampedScore = Math.max(-1, Math.min(1, avgScore));

  // 감정 강도: 절대값 기준 0 ~ 1
  const intensity = Math.min(1, Math.abs(clampedScore) * (1 + (matchedKeywords.length - 1) * 0.1));

  // 감정 레벨 결정
  const level = scoreToLevel(clampedScore);

  return {
    level,
    score: Math.round(clampedScore * 100) / 100,
    intensity: Math.round(intensity * 100) / 100,
    keywords: matchedKeywords.map((kw) => kw.word),
  };
}

function scoreToLevel(score: number): SentimentLevel {
  if (score >= 0.7) return 'very_positive';
  if (score >= 0.2) return 'positive';
  if (score > -0.2) return 'neutral';
  if (score > -0.7) return 'negative';
  return 'very_negative';
}

/**
 * 대화 체인을 분석하여 답변 여부를 판단한다.
 */
export function shouldReply(
  chain: ConversationChain,
  ownerNickname: string
): ReplyDecision {
  // 이미 블로그 주인이 답변했으면 skip
  if (chain.hasOwnerReply) {
    return {
      shouldReply: false,
      priority: 'skip',
      reason: '이미 답변 완료된 대화입니다.',
      suggestedTone: 'warm',
    };
  }

  // 최신 댓글 기준으로 감정 분석
  const lastComment = chain.replies.length > 0
    ? chain.replies[chain.replies.length - 1]
    : chain.root;
  const sentiment = analyzeSentiment(lastComment.content);
  const rootSentiment = analyzeSentiment(chain.root.content);

  // 블로그 주인 자신의 댓글이면 skip
  if (chain.root.nickname === ownerNickname) {
    return {
      shouldReply: false,
      priority: 'skip',
      reason: '블로그 주인의 댓글입니다.',
      suggestedTone: 'warm',
    };
  }

  // 매우 부정적 감정 → cautious
  if (sentiment.level === 'very_negative' || rootSentiment.level === 'very_negative') {
    return {
      shouldReply: true,
      priority: 'high',
      reason: '부정적 감정이 감지되어 신중한 대응이 필요합니다.',
      suggestedTone: 'cautious',
    };
  }

  // 부정적 감정 → cautious, medium priority
  if (sentiment.level === 'negative' || rootSentiment.level === 'negative') {
    return {
      shouldReply: true,
      priority: 'medium',
      reason: '부정적 피드백에 대한 대응이 필요합니다.',
      suggestedTone: 'cautious',
    };
  }

  // 질문 감지 → high priority
  const isQuestion = isQuestionComment(lastComment.content) || isQuestionComment(chain.root.content);
  if (isQuestion) {
    return {
      shouldReply: true,
      priority: 'high',
      reason: '질문이 감지되어 답변이 필요합니다.',
      suggestedTone: 'professional',
    };
  }

  // 매우 긍정적 감정 → enthusiastic
  if (sentiment.level === 'very_positive' || rootSentiment.level === 'very_positive') {
    return {
      shouldReply: true,
      priority: 'medium',
      reason: '매우 긍정적인 댓글에 감사를 표할 수 있습니다.',
      suggestedTone: 'enthusiastic',
    };
  }

  // 단순 감사/인사 → low priority
  const isThanks = isThankComment(lastComment.content) || isThankComment(chain.root.content);
  if (isThanks) {
    return {
      shouldReply: true,
      priority: 'low',
      reason: '감사 인사에 대한 화답입니다.',
      suggestedTone: 'warm',
    };
  }

  // 긍정적 감정 → warm
  if (sentiment.level === 'positive' || rootSentiment.level === 'positive') {
    return {
      shouldReply: true,
      priority: 'medium',
      reason: '긍정적인 댓글에 대한 화답입니다.',
      suggestedTone: 'warm',
    };
  }

  // 기본: 답변
  return {
    shouldReply: true,
    priority: 'low',
    reason: '일반 댓글에 대한 소통입니다.',
    suggestedTone: 'warm',
  };
}

function isQuestionComment(text: string): boolean {
  return QUESTION_PATTERNS.some((pattern) => pattern.test(text));
}

function isThankComment(text: string): boolean {
  return THANKS_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * 대화 맥락을 고려한 답변 생성.
 * AI API 없이 템플릿 기반으로 동작한다.
 */
export function generateContextualReply(
  chain: ConversationChain,
  postTitle: string,
  ownerNickname?: string
): string {
  const decision = shouldReply(chain, ownerNickname ?? '');

  // skip이면 빈 문자열
  if (!decision.shouldReply) return '';

  const tone = decision.suggestedTone;
  const templates = TEMPLATES[tone];
  const nickname = chain.root.nickname;

  // 댓글 유형 감지
  const commentType = detectCommentCategory(chain.root.content);

  // 인사 선택
  const greeting = pickRandom(templates.greeting).replace('{nickname}', nickname);

  // 유형별 본문 선택
  const bodyTemplates = templates[commentType] ?? templates.general;
  const body = pickRandom(bodyTemplates);

  // 대화 맥락이 있으면 (체인에 답글이 있으면) 맥락 참조 문구 추가
  const contextPhrase = buildContextPhrase(chain, postTitle);

  // 후속 질문 유도 (질문형이거나 깊이가 낮을 때)
  const shouldAddFollowUp = commentType === 'question' || chain.depth === 0;
  const followUp = shouldAddFollowUp ? pickRandom(templates.followUp) : '';

  const parts = [greeting, contextPhrase, body, followUp].filter(Boolean);
  return parts.join(' ');
}

function detectCommentCategory(
  content: string
): 'question' | 'compliment' | 'feedback' | 'general' {
  if (isQuestionComment(content)) return 'question';

  const sentiment = analyzeSentiment(content);
  if (sentiment.level === 'very_positive' || sentiment.level === 'positive') {
    return 'compliment';
  }
  if (sentiment.level === 'negative' || sentiment.level === 'very_negative') {
    return 'feedback';
  }

  return 'general';
}

function buildContextPhrase(chain: ConversationChain, postTitle: string): string {
  // 답글이 여러 개 있으면 대화 맥락 언급
  if (chain.replies.length >= 2) {
    return `'${truncate(postTitle, 20)}' 글에 대해 활발한 대화가 이어지고 있네요!`;
  }
  if (chain.replies.length === 1) {
    return `'${truncate(postTitle, 20)}' 글에 관심 가져주셔서 감사합니다.`;
  }
  return '';
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
