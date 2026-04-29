// v2.7.45 — Automation Ports (헥사고날 ports & adapters)
//
// architect 진단(docs/diagnosis-2026-04-29/automation-summary.md):
//   "helpers가 self: any로 부모 인스턴스 통째로 받음 → 가짜 분리"
//   editorHelpers/imageHelpers/publishHelpers/ctaHelpers 모두 양방향 의존.
//
// 본 모듈은 helpers가 필요한 최소한의 의존성만 명시 인터페이스로 정의한다.
// 점진 마이그레이션: 새 코드는 이 ports를 사용하고, 기존 self:any는 단계적 제거.

import type { Page, Frame } from 'puppeteer';

/**
 * helpers가 부모(NaverBlogAutomation)에서 필요로 하는 최소 인터페이스
 */
export interface AutomationContext {
  /** 로그 출력 */
  log(message: string): void;

  /** 지연 (ms) */
  delay(ms: number): Promise<void>;

  /** 메인 프레임 접근 */
  getFrame(): Promise<Frame>;

  /** Puppeteer 페이지 접근 */
  getPage(): Page;

  /** 사용자 취소 여부 */
  isCancelRequested(): boolean;

  /** 기본 옵션 (categoryName, naverId, blogId 등) */
  options: AutomationOptionsView;
}

/**
 * helpers가 읽을 수 있는 옵션 readonly view
 */
export interface AutomationOptionsView {
  readonly naverId?: string;
  readonly blogId?: string;
  readonly categoryName?: string;
  readonly contentMode?: string;
  readonly affiliateLink?: string;
  readonly skipImages?: boolean;
  readonly publishMode?: 'draft' | 'publish' | 'schedule';
  readonly scheduleDate?: string;
  readonly scheduleTime?: string;
  readonly includeFtcDisclosure?: boolean;
}

/**
 * 발행 단계 식별자 (FSM 토대)
 *   debugger 진단: "발행 큐/취소 4회 재발 — FSM 미설계"
 *   각 phase는 (a) preconditions (b) action (c) postconditions (d) 체크포인트
 */
export type PublishPhase =
  | 'browser-session'
  | 'auth-login'
  | 'editor-bootstrap'
  | 'content-author'
  | 'image-place'
  | 'publish-modal'
  | 'post-publish-reflect';

export interface PhaseCheckpoint {
  phase: PublishPhase;
  startedAt: number;
  completedAt?: number;
  error?: string;
  notes?: Record<string, unknown>;
}
