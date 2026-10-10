// src/image/genspark/gensparkTypes.ts
// [2026-10-10] 젠스파크 엔진 담당들이 공통으로 맞춰 쓰는 인터페이스. dropshot 처럼 playwright Page(chromium.launchPersistentContext)를
//   쓰되, 시험과 puppeteer 호환을 위해 필요한 최소 메서드만 정의한다. 시간(sleep/now)은 항상 바깥에서 주입한다.

/** playwright Page 의 부분집합(구조적 타이핑으로 그대로 대입 가능). */
export interface GensparkPageLike {
  goto(url: string, options?: { waitUntil?: 'load' | 'domcontentloaded' | 'commit'; timeout?: number }): Promise<unknown>;
  url(): string;
  /** 함수는 직렬화된다 — gensparkSelectors 의 자기완결 함수를 그대로 넘긴다. */
  evaluate<R>(pageFunction: (arg: any) => R | Promise<R>, arg?: unknown): Promise<R>;
  /** 실제 마우스 클릭(CDP). 모델·설정 버튼은 이것으로만 열린다. */
  mouse: { click(x: number, y: number): Promise<void> };
  keyboard: {
    insertText(text: string): Promise<void>;
    press(key: string): Promise<void>;
  };
  bringToFront(): Promise<void>;
  /** playwright 는 true 면 닫힌 탭. 없으면 열린 것으로 본다. */
  isClosed?(): boolean;
}

export interface GensparkSubmitRequest {
  /** 배치 안 항목 번호(0부터, 화면·소제목 순서) */
  index: number;
  /** 앱 프롬프트 전문(줄바꿈 포함 최대 4,000자) — keyboard.type 금지, insertText 로 넣는다 */
  prompt: string;
  /** 종횡비 메뉴 글자('1:1','16:9' 등, GENSPARK_RATIO_LABELS 중 하나) */
  ratio: string;
}

export interface GensparkJob {
  index: number;
  /** /agents?id=<작업ID> 의 작업 ID */
  jobId: string;
  jobUrl: string;
  /** 전송 시각(epoch ms, deps.now() 기준) */
  submittedAt: number;
}

export interface GensparkCollectResult {
  /** done=이미지 확보, pending=아직 생성 중, failed=실패 확정 */
  status: 'done' | 'pending' | 'failed';
  imageUrl?: string;
  reason?: string;
}

export interface GensparkDownloadResult {
  filePath: string;
  byteSize: number;
  mimeType?: string;
  sha256?: string;
  width?: number;
  height?: number;
}

/** 배치가 바깥에서 주입받는 함수들(시험에서는 가짜로 대체). */
export interface GensparkBatchDeps {
  /** 입력창에 넣고 전송 → 작업 주소가 생기면 job 반환. 실패는 GensparkError throw. */
  submit(request: GensparkSubmitRequest): Promise<GensparkJob>;
  /** 작업 주소를 열어 결과를 확인. pending 이면 계속 폴링. */
  check(job: GensparkJob): Promise<GensparkCollectResult>;
  download(job: GensparkJob, imageUrl: string): Promise<GensparkDownloadResult>;
  now(): number;
  sleep(ms: number): Promise<void>;
  isStopped(): boolean;
  log(message: string): void;
}

export interface GensparkBatchOptions {
  /** 한 번에 보내 두는 작업 수(기본 4) */
  concurrency: number;
  /** 전송 후 작업 주소가 나타날 때까지 기다리는 한도(기본 20초) */
  jobUrlWaitMs: number;
  /** 전송 후 이미지가 나올 때까지의 마감(기본 180초) */
  jobDeadlineMs: number;
  /** 작업 주소를 돌며 확인하는 간격(기본 3초) */
  pollIntervalMs: number;
  /** 고른 모델이 무제한(No credit cost)인가 — 재시도 횟수를 정한다 */
  modelCreditFree: boolean;
  /** 재시도 횟수: 무료 모델만 1회, 크레딧 모델은 0회(크레딧 중복 소모 방지) */
  retry: { freeModel: number; creditModel: number };
}

export const GENSPARK_DEFAULT_BATCH_OPTIONS: Readonly<Omit<GensparkBatchOptions, 'modelCreditFree'>> = Object.freeze({
  concurrency: 4,
  jobUrlWaitMs: 20_000,
  jobDeadlineMs: 180_000,
  pollIntervalMs: 3_000,
  retry: Object.freeze({ freeModel: 1, creditModel: 0 }),
});

/** 이 배치에서 항목당 허용되는 재시도 횟수. */
export function gensparkRetryCount(options: Pick<GensparkBatchOptions, 'modelCreditFree' | 'retry'>): number {
  return options.modelCreditFree ? options.retry.freeModel : options.retry.creditModel;
}

/** 항목 하나의 결과(성공이면 image, 실패면 errorCode+message). */
export interface GensparkItemOutcome {
  index: number;
  image?: GensparkGeneratedImage;
  errorCode?: string;
  /** '[젠스파크] …' 한글 문구 */
  message?: string;
}

/** 앱의 GeneratedImage(src/image/types.ts) 와 호환되는 모양. provider 값 'genspark' 는 2단계에서 ImageProvider 에 추가한다. */
export interface GensparkGeneratedImage {
  heading: string;
  filePath: string;
  previewDataUrl: string;
  provider: 'genspark';
  requestedProvider?: string;
  actualProvider?: string;
  fallbackUsed?: boolean;
  fallbackReason?: string;
  savedToLocal?: string;
  url?: string;
  sourceUrl?: string;
  originalIndex?: number;
  isThumbnail?: boolean;
  blobId?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  byteSize?: number;
  sha256?: string;
  createdAt?: number;
}
