export interface PostPublishViewport {
  width: number;
  height: number;
}

export interface PostPublishMouseMove {
  x: number;
  y: number;
  steps: number;
}

export interface PostPublishReviewPlanInput {
  naverId: string;
  publishedUrl: string;
  viewport: PostPublishViewport | null | undefined;
  randomInt: (min: number, max: number) => number;
}

export interface PostPublishReviewPlan {
  publishedUrl: string;
  blogHomeUrl: string;
  reviewDurationMs: number;
  reviewScrollCount: number;
  afterReviewDelayMs: number;
  mouseMove: PostPublishMouseMove | null;
  homeStayMs: number;
  afterHomeDelayMs: number;
}

function canMoveMouseSafely(viewport: PostPublishViewport | null | undefined): viewport is PostPublishViewport {
  return Boolean(viewport && viewport.width > 200 && viewport.height > 300);
}

export function createPostPublishReviewPlan(input: PostPublishReviewPlanInput): PostPublishReviewPlan {
  const reviewDurationMs = input.randomInt(5000, 10000);
  const reviewScrollCount = input.randomInt(3, 5);
  const mouseMove = canMoveMouseSafely(input.viewport)
    ? {
        x: input.randomInt(100, input.viewport.width - 100),
        y: input.randomInt(200, input.viewport.height - 100),
        steps: input.randomInt(8, 15),
      }
    : null;
  const homeStayMs = input.randomInt(2000, 5000);

  return {
    publishedUrl: input.publishedUrl,
    blogHomeUrl: `https://blog.naver.com/${input.naverId}`,
    reviewDurationMs,
    reviewScrollCount,
    afterReviewDelayMs: Math.max(0, reviewDurationMs - 4000),
    mouseMove,
    homeStayMs,
    afterHomeDelayMs: Math.max(0, homeStayMs - 1500),
  };
}
