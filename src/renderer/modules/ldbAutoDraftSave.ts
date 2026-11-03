/**
 * LDB 자동 임시저장(경로 A) — 메인이 ACK 뒤 요청하면 반자동 편집에 채운 그 글을
 * 기존 handleSemiAutoPublish 임시저장 경로로 저장하고 실제 결과를 돌려준다.
 *
 * 무인 실행이라 확인창을 띄우지 않는다. 확인이 필요한 지점은 실행을 멈추고 이유를 실패로 보고한다.
 */
export interface LdbAutoDraftRendererRequest { postId: string; accountId: string; categoryId: string }
export interface LdbAutoDraftRendererOutcome { status: 'saved' | 'failed' | 'busy'; message: string; draftConfirmed?: boolean; failureCode?: string }
export interface LdbAutoDraftRendererDeps {
  doc: Document;
  isBusy: () => boolean;
  currentPostId: () => unknown;
  /** handleSemiAutoPublish({ ldbAutoDraft: true }) */
  publish: () => Promise<any>;
  /** 발행 경로가 오류를 삼켰을 때 남기는 마지막 실패(window._lastPublishFailure) */
  lastFailure?: () => { code?: unknown; message?: unknown } | null | undefined;
}

let ldbAutoDraftActiveRun: { blockedReason?: string } | null = null;

/** 자동 임시저장 중이면 확인창 대신 이유를 기록하고 true(=취소)를 돌려준다. 평소에는 false. */
export function blockLdbAutoDraftDialog(reason: string): boolean {
  if (!ldbAutoDraftActiveRun) return false;
  ldbAutoDraftActiveRun = { blockedReason: ldbAutoDraftActiveRun.blockedReason || reason };
  return true;
}

const ldbAutoDraftFailed = (message: string, failureCode?: string): LdbAutoDraftRendererOutcome => ({ status: 'failed', message, ...(failureCode ? { failureCode } : {}) });

/** 받은 뒤 사용자가 계정·카테고리·글·발행 방식을 바꿨으면 저장하지 않는다. */
function ldbAutoDraftReadinessProblem(request: LdbAutoDraftRendererRequest, deps: LdbAutoDraftRendererDeps): LdbAutoDraftRendererOutcome | null {
  const mode = (deps.doc.getElementById('unified-publish-mode') as HTMLInputElement | null)?.value;
  if (mode !== 'draft') return ldbAutoDraftFailed('발행 방식이 임시저장이 아니어서 자동 저장을 하지 않았습니다. 앱에서 확인해 주세요.', 'PUBLISH_MODE_NOT_DRAFT');
  const account = deps.doc.getElementById('main-account-selector') as HTMLSelectElement | null;
  const category = deps.doc.getElementById('real-blog-category-select') as HTMLSelectElement | null;
  if (account?.value !== request.accountId || category?.dataset.ldbAccountId !== request.accountId
    || category?.selectedOptions[0]?.dataset.realBlogCategoryId !== request.categoryId) {
    return ldbAutoDraftFailed('앱의 계정·카테고리가 바뀌어 자동 임시저장을 하지 않았습니다. 다시 보내주세요.', 'SELECTION_CHANGED');
  }
  if (deps.currentPostId() !== request.postId) return ldbAutoDraftFailed('편집 화면에 다른 원고가 있어 자동 임시저장을 하지 않았습니다. 다시 보내주세요.', 'POST_CHANGED');
  return null;
}

function ldbAutoDraftFailureCode(value: unknown, message: string): string | undefined {
  if (typeof value === 'string' && value && value !== 'UNKNOWN') return value;
  return /\[(ACCOUNT_MISMATCH|LOGIN_REQUIRED|LOGIN_CHALLENGE|ACCOUNT_PROTECTED|NETWORK_WAIT|PUBLISH_OUTCOME_UNKNOWN|ACCOUNT_BUSY)\]/.exec(message)?.[1];
}

/** 실제 자동화 결과만 저장 성공으로 인정한다. */
export function interpretLdbAutoDraftResult(result: any, blockedReason: string | undefined, lastFailure: { code?: unknown; message?: unknown } | null | undefined): LdbAutoDraftRendererOutcome {
  if (blockedReason) return ldbAutoDraftFailed(blockedReason, 'NEEDS_USER_CONFIRMATION');
  if (result?.success === true) {
    if (result.publishMode !== 'draft') return ldbAutoDraftFailed('임시저장이 아닌 결과가 돌아왔습니다. 네이버 블로그에서 직접 확인해 주세요.', 'UNEXPECTED_PUBLISH_MODE');
    return { status: 'saved', message: '네이버에 임시저장했습니다.', ...(typeof result.draftConfirmed === 'boolean' ? { draftConfirmed: result.draftConfirmed } : {}) };
  }
  if (result?.cancelled) return ldbAutoDraftFailed('임시저장이 취소되었습니다.', 'USER_CANCELLED');
  const message = String(result?.message || result?.error || lastFailure?.message || '').trim() || '임시저장을 완료하지 못했습니다. 앱 로그를 확인해 주세요.';
  return ldbAutoDraftFailed(message, ldbAutoDraftFailureCode(result?.failureCode ?? lastFailure?.code, message));
}

export async function runLdbAutoDraftSave(request: LdbAutoDraftRendererRequest, deps: LdbAutoDraftRendererDeps): Promise<LdbAutoDraftRendererOutcome> {
  if (ldbAutoDraftActiveRun || deps.isBusy()) return { status: 'busy', message: '다른 자동화가 실행 중이라 임시저장을 시작하지 않았습니다.' };
  const problem = ldbAutoDraftReadinessProblem(request, deps);
  if (problem) return problem;
  ldbAutoDraftActiveRun = {};
  try {
    const result = await deps.publish();
    return interpretLdbAutoDraftResult(result, ldbAutoDraftActiveRun?.blockedReason, deps.lastFailure?.());
  } catch (error) {
    return ldbAutoDraftFailed(ldbAutoDraftActiveRun?.blockedReason || (error instanceof Error && error.message) || '임시저장을 실행하지 못했습니다.');
  } finally {
    ldbAutoDraftActiveRun = null;
  }
}
