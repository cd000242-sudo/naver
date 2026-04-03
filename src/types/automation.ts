/**
 * 자동화 인스턴스 인터페이스
 * NaverBlogAutomation의 퍼블릭 API를 추상화하여 순환 의존성 방지
 * AutomationService, BlogExecutor에서 any 대신 이 인터페이스 사용
 */

export interface IAutomationInstance {
  /** 자동화 실행 */
  run(options?: Record<string, unknown>): Promise<{ success: boolean; url?: string; message?: string }>;

  /** 실행 취소 */
  cancel(): Promise<void>;

  /** 즉시 중지 */
  stopAutomation(): Promise<void>;

  /** 브라우저 닫기 */
  closeBrowser(): Promise<void>;

  /** 발행된 URL 가져오기 */
  getPublishedUrl(): string | null;
}

/**
 * 자동화 인스턴스 생성 함수 타입
 */
export type CreateAutomationFn = (
  naverId: string,
  naverPassword: string,
  accountProxyUrl?: string
) => IAutomationInstance;

/**
 * BlogExecutor 의존성 인터페이스 (any 제거)
 */
export interface IExecutionDependencies {
  loadConfig: () => Promise<Record<string, unknown>>;
  applyConfigToEnv: (config: Record<string, unknown>) => void;
  generateBlogContent?: (prompt: string) => Promise<string>;
  generateImages?: (options: Record<string, unknown>, apiKeys: Record<string, unknown>) => Promise<unknown[]>;
  createAutomation: CreateAutomationFn;
  blogAccountManager?: {
    getAccount: (id: string) => Promise<{ id: string; name: string; naverId: string }>;
    getAccounts: () => Promise<{ id: string; name: string; naverId: string }[]>;
    getNextAccountForPublish: () => { id: string; name: string } | null;
    getAccountCredentials: (id: string) => { naverId: string; naverPassword: string } | null;
    getActiveAccount: () => { id: string; name: string; naverId: string } | null;
    getAccountProxyUrl: (accountId: string) => string | null;
    incrementPublishCount: (accountId: string) => void;
  };
  getDailyLimit?: () => number;
  getTodayCount?: () => number;
  incrementTodayCount?: () => void;
  setGeminiModel?: (model: string) => void;
}
