import type { StructuredContent } from '../contentGenerator.js';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export interface BoosterOptions {
  mainAccountId: string;
  subAccounts?: Array<{ id: string; password?: string }>;
  logger?: (message: string) => void;
}

/**
 * Simulates post publish boosting workflow (self-comments, share prompts, replies).
 * The implementation focuses on scheduling/logging so that it can be connected to
 * real Selenium/Puppeteer routines later without blocking the main automation flow.
 */
export class PostPublishBooster {
  private readonly logger: (message: string) => void;
  private readonly mainAccountId: string;
  private readonly subAccounts: Array<{ id: string; password?: string }>;

  constructor(options: BoosterOptions) {
    this.mainAccountId = options.mainAccountId;
    this.subAccounts = options.subAccounts ?? [];
    this.logger = options.logger ?? console.log;
  }

  async boostAfterPublish(postIdentifier: string, postData: StructuredContent): Promise<void> {
    if (!postData.postPublishActions) {
      this.logger('⚠️ 부스팅을 위한 postPublishActions 데이터가 없어 기본 모드로 진행합니다.');
    }

    const authorName = process.env.AUTHOR_NAME?.trim();
    const authorPrefix = authorName ? `[${authorName}] ` : '';

    this.logger(`🚀 발행 후 부스팅 시작: ${postIdentifier}`);
    try {
      await sleep(60_000);
      await this.addSelfComment(
        postIdentifier,
        postData.postPublishActions?.selfComments?.[0] ??
          `${authorPrefix}첫 방문 감사합니다! 읽으면서 떠오르는 생각을 댓글로 남겨주세요 🙌`,
        this.subAccounts[0]?.id ?? this.mainAccountId,
      );

      await sleep(120_000);
      this.logger(
        `📤 공유 트리거: ${postData.postPublishActions?.shareMessage ?? '방금 올린 글, 공유 부탁드려요!'}`,
      );

      await sleep(120_000);
      await this.addSelfComment(
        postIdentifier,
        postData.postPublishActions?.selfComments?.[1] ??
          `${authorPrefix}공감되셨다면 주변에도 공유해주세요! 의견 나눌수록 더 풍성해집니다.`,
        this.subAccounts[1]?.id ?? this.mainAccountId,
      );

      await sleep(300_000);
      await this.addReply(
        postIdentifier,
        postData.postPublishActions?.selfComments?.[2] ??
          `${authorPrefix}추가 질문 있으시면 언제든 남겨주세요. 다음 글도 기대해주세요! 😊`,
      );

      this.logger('🎉 10분 부스팅 시뮬레이션이 완료되었습니다.');
    } catch (error) {
      this.logger(`❌ 부스팅 중 오류 발생: ${(error as Error).message}`);
    }
  }

  private async addSelfComment(postId: string, comment: string, accountId: string): Promise<void> {
    this.logger(`💬 [${accountId}] ${postId}에 자가 댓글 등록: ${comment}`);
    await sleep(this.randomDelay(800, 2400));
  }

  private async addReply(postId: string, reply: string): Promise<void> {
    this.logger(`↩️ [${this.mainAccountId}] ${postId}에 답글 추가: ${reply}`);
    await sleep(this.randomDelay(800, 2400));
  }

  private randomDelay(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}

