// src/renderer/modules/fullAutoStopResume.ts
// Single full-auto side of the stop window: one record per run (the writing stop and the image stop share its id and
// ledger), the whitelisted inputs that let the run start again after the app was closed, and the resume itself.
// The resume goes through the full-auto publish button (same progress window, stop button and account checks).
// Account, publish mode, schedule and engines are read from the screen at resume time: nothing is switched silently.
// Renderer bundle note: one shared scope, so every top-level name carries the fullAutoStopResume prefix.

import { gstopCreateLedger } from '../../generationStop/stageGate.js';
import type { GstopLedgerEntry } from '../../generationStop/stageGate.js';
import type { GstopRecord } from '../../generationStop/resumeRecord.js';
import type { GenerationStopContext } from './generationStopGate.js';

// Bundle-scope names of renderer / fullAutoFlow / publishingHandlers: declared and used directly (never via window).
declare const UnifiedDOMCache: { getGenerator(): string; getToneStyle(): string; getRealCategoryName?(): string };
declare const toastManager: { warning?(message: string): void } | undefined;
declare let automationRunning: boolean;
declare function appendLog(message: string, targetId?: string): void;
declare function getUnifiedUrls(): string[];
declare function saveFullAutoContentRetryCache(formData: unknown, structuredContent: unknown): void;
declare function readManualTitleOverrideForPublish(contentMode?: string): string | undefined;
declare function resolveAffiliateLink(...links: Array<string | undefined>): string | undefined;
declare function isShoppingConnectModeActive(): boolean;

/** What the run writes about (never who publishes it or how). */
export interface FullAutoStopResumeInputs {
  readonly urls: readonly string[];
  readonly keywords: string;
  readonly title: string;
  readonly manualTitleOverride: string;
  readonly keywordAsTitle: boolean;
  readonly keywordTitlePrefix: boolean;
  readonly toneStyle: string;
  readonly contentMode: string;
  readonly categoryName: string;
  readonly affiliateLink: string;
  /** Engines of the stopped run: kept for the owner's log line only, the screen's engines are used on resume. */
  readonly imageSource: string;
  readonly generator: string;
}

export interface FullAutoStopResumePlan {
  readonly recordId: string;
  readonly from: 'images' | 'start';
  readonly inputs: FullAutoStopResumeInputs;
  readonly article?: unknown;
  readonly ledger: readonly GstopLedgerEntry[];
}

export interface FullAutoStopResumeDeps {
  readonly busy: () => boolean;
  readonly accountMode: () => string;
  readonly restoreInputs: (inputs: FullAutoStopResumeInputs) => void;
  readonly seedArticle: (inputs: FullAutoStopResumeInputs, article: unknown) => void;
  /** Presses the full-auto publish button; true when the run really started. */
  readonly clickPublish: () => boolean;
  readonly notify: (message: string) => void;
  readonly log?: (message: string) => void;
}

const FULL_AUTO_STOP_RESUME_PENDING_MAX_MS = 3 * 60 * 60 * 1000;

function fullAutoStopResumeText(value: unknown, max = 300): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
function fullAutoStopResumeUrl(value: unknown): string {
  const text = fullAutoStopResumeText(value, 2000);
  return /^https?:\/\//i.test(text) ? text : '';
}

/** Whitelist: only the named fields are copied, so a secret added to formData later can never reach the record. */
export function fullAutoStopResumePickInputs(formData: unknown): FullAutoStopResumeInputs {
  const source = (formData && typeof formData === 'object' ? formData : {}) as Record<string, unknown>;
  const urls = Array.isArray(source.urls) ? source.urls.map(fullAutoStopResumeUrl).filter(Boolean).slice(0, 10) : [];
  return {
    urls,
    keywords: fullAutoStopResumeText(source.keywords),
    title: fullAutoStopResumeText(source.title, 200),
    manualTitleOverride: fullAutoStopResumeText(source.manualTitleOverride, 120),
    keywordAsTitle: source.keywordAsTitle === true,
    keywordTitlePrefix: source.keywordTitlePrefix === true,
    toneStyle: fullAutoStopResumeText(source.toneStyle, 40),
    contentMode: fullAutoStopResumeText(source.contentMode, 40),
    categoryName: fullAutoStopResumeText(source.categoryName, 100),
    affiliateLink: fullAutoStopResumeUrl(source.affiliateLink),
    imageSource: fullAutoStopResumeText(source.imageSource, 60),
    generator: fullAutoStopResumeText(source.generator, 60),
  };
}

/** Saved inputs back to resume arguments; null when there is nothing to write about. */
export function fullAutoStopResumeReadInputs(raw: unknown): FullAutoStopResumeInputs | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const inputs = fullAutoStopResumePickInputs(raw);
  return inputs.keywords || inputs.title || inputs.urls.length > 0 ? inputs : null;
}

function fullAutoStopResumeHasArticle(article: unknown): boolean {
  const content = article as { headings?: unknown; bodyPlain?: unknown; content?: unknown } | null;
  if (!content || typeof content !== 'object') return false;
  return (Array.isArray(content.headings) && content.headings.length > 0)
    || fullAutoStopResumeText(content.bodyPlain || content.content).length > 0;
}

/** Finished article -> start from the images (finished slots kept). No article -> start again from the inputs. */
export function fullAutoStopResumePlan(record: unknown): FullAutoStopResumePlan | null {
  const saved = record as Partial<GstopRecord> | null;
  if (!saved || typeof saved !== 'object' || saved.kind !== 'full-auto' || typeof saved.id !== 'string' || !saved.id) return null;
  const inputs = fullAutoStopResumeReadInputs(saved.resumeData);
  if (!inputs) return null;
  const hasArticle = fullAutoStopResumeHasArticle(saved.article);
  const ledger = hasArticle && Array.isArray(saved.ledger)
    ? saved.ledger.filter((entry) => !!entry && typeof entry.key === 'string' && entry.image !== undefined) : [];
  return { recordId: saved.id, from: hasArticle ? 'images' : 'start', inputs, ...(hasArticle ? { article: saved.article } : {}), ledger };
}

interface FullAutoStopResumeRun {
  readonly recordId: string;
  readonly inputs: FullAutoStopResumeInputs;
  readonly ledger: ReturnType<typeof gstopCreateLedger>;
  readonly published: boolean;
}
interface FullAutoStopResumePending {
  readonly recordId: string;
  readonly inputs: FullAutoStopResumeInputs;
  readonly ledger: readonly GstopLedgerEntry[];
  readonly at: number;
}
let fullAutoStopResumeActive: FullAutoStopResumeRun | null = null;
let fullAutoStopResumePending: FullAutoStopResumePending | null = null;

function fullAutoStopResumeSameWork(a: FullAutoStopResumeInputs, b: FullAutoStopResumeInputs): boolean {
  return a.keywords === b.keywords && a.urls.join(' ') === b.urls.join(' ');
}

/**
 * Start of a single full-auto run. A resume of the same work keeps the record id and finished slots.
 * Returns true only for the caller that started the run (the owner calls fullAutoStopResumeFinishRun). While a run is
 * already going (the publish button's run reaching executeFullAutoFlow), it is kept as it is and false is returned.
 */
export function fullAutoStopResumeBeginRun(formData: unknown, now: number = Date.now()): boolean {
  if (fullAutoStopResumeActive) return false;
  const inputs = fullAutoStopResumePickInputs(formData);
  const pending = fullAutoStopResumePending;
  fullAutoStopResumePending = null;
  const adopt = !!pending && now - pending.at <= FULL_AUTO_STOP_RESUME_PENDING_MAX_MS && fullAutoStopResumeSameWork(pending.inputs, inputs);
  fullAutoStopResumeActive = {
    recordId: adopt && pending ? pending.recordId : `full-auto-${now}-${Math.random().toString(36).slice(2, 7)}`,
    inputs,
    ledger: gstopCreateLedger(adopt && pending ? pending.ledger : []),
    published: false,
  };
  return true;
}

/** The post of the current run was published (any caller may say so); the owner removes the record when the run ends. */
export function fullAutoStopResumeMarkPublished(): void {
  const run = fullAutoStopResumeActive;
  if (run && !run.published) fullAutoStopResumeActive = { ...run, published: true };
}

/** Stop-window context for a stage of the current run (no run = continuous / other caller: ask inline, save nothing). */
export function fullAutoStopResumeContext(label: string, extra: { shopping?: boolean; article?: () => unknown } = {}): GenerationStopContext {
  const run = fullAutoStopResumeActive;
  const shopping = extra.shopping !== undefined ? { shopping: extra.shopping } : {};
  if (!run) return { kind: 'full-auto', label, noRecord: true, ledger: gstopCreateLedger(), ...shopping };
  return {
    kind: 'full-auto', label, recordId: run.recordId, ledger: run.ledger,
    resumeData: () => run.inputs,
    ...(extra.article ? { article: extra.article } : {}),
    ...shopping,
  };
}

/** Owner only: end of the run. Published -> the record is removed. Stopped / failed -> it stays for the card. Never throws. */
export async function fullAutoStopResumeFinishRun(
  remove: (id: string) => Promise<unknown> = async (id) => (window as any).api?.generationStopRemove?.(id),
): Promise<void> {
  const run = fullAutoStopResumeActive;
  fullAutoStopResumeActive = null;
  if (!run || !run.published) return;
  try { await remove(run.recordId); } catch (error) { console.warn('[FullAutoStopResume] 기록 지우기 실패:', (error as Error)?.message); }
}

/** True while a single full-auto (or any button-started publish) is running. */
export function fullAutoStopResumeBusy(): boolean {
  if (fullAutoStopResumeActive) return true;
  try { return automationRunning === true; } catch { return false; }
}

/** Resumes a saved single full-auto run through the publish button. True as soon as the run started. */
export async function fullAutoStopResumeStart(record: unknown, deps: FullAutoStopResumeDeps = fullAutoStopResumeDefaultDeps()): Promise<boolean> {
  fullAutoStopResumePending = null;
  const fail = (message: string): boolean => { deps.notify(message); return false; };
  try {
    if (deps.busy()) return fail('풀오토 발행이 이미 진행 중입니다. 끝난 뒤 [이어서 발행]을 다시 눌러 주세요.');
    const plan = fullAutoStopResumePlan(record);
    if (!plan) return fail('저장된 기록에서 무엇을 쓸지(키워드·주소)를 읽지 못해 이어 갈 수 없습니다.');
    if (deps.accountMode() !== 'single') return fail('지금 다중계정 화면입니다. 1개 계정 탭으로 바꾼 뒤 [이어서 발행]을 눌러 주세요.');
    deps.restoreInputs(plan.inputs);
    if (plan.article) deps.seedArticle(plan.inputs, plan.article);
    fullAutoStopResumePending = { recordId: plan.recordId, inputs: plan.inputs, ledger: plan.ledger, at: Date.now() };
    if (!deps.clickPublish()) {
      fullAutoStopResumePending = null;
      return fail('풀오토 발행 단추를 누를 수 없어(단추가 없거나 다른 작업 중) 이어서 발행을 시작하지 못했습니다.');
    }
    deps.log?.(plan.from === 'images'
      ? `♻️ 멈춘 풀오토 발행을 이어 갑니다: 써 둔 글은 그대로, 이미지부터 (만든 칸 ${plan.ledger.length}개는 다시 안 만듦)`
      : '♻️ 멈춘 풀오토 발행을 저장한 입력값으로 처음부터 다시 시작합니다.');
    return true;
  } catch (error) {
    fullAutoStopResumePending = null;
    return fail(`이어서 발행을 시작하지 못했습니다: ${(error as Error)?.message || String(error)}`);
  }
}

function fullAutoStopResumeSetValue(id: string, value: string, eventName: 'input' | 'change' = 'input'): void {
  const field = document.getElementById(id) as HTMLInputElement | null;
  if (!field) return;
  field.value = value;
  field.dispatchEvent(new Event(eventName, { bubbles: true }));
}
function fullAutoStopResumeSetChecked(id: string, checked: boolean): void {
  const box = document.getElementById(id) as HTMLInputElement | null;
  if (box) box.checked = checked;
}
function fullAutoStopResumeDomValue(id: string): string {
  return (document.getElementById(id) as HTMLInputElement | null)?.value?.trim() || '';
}

/** Puts the saved inputs on the screen the publish button reads (mode first: its change handler may redraw fields). */
function fullAutoStopResumeRestoreDom(inputs: FullAutoStopResumeInputs): void {
  if (inputs.contentMode && inputs.contentMode !== 'affiliate') fullAutoStopResumeSetValue('unified-content-mode', inputs.contentMode, 'change');
  if (inputs.toneStyle) fullAutoStopResumeSetValue('unified-tone-style', inputs.toneStyle, 'change');
  fullAutoStopResumeSetValue('unified-keywords', inputs.keywords);
  fullAutoStopResumeSetValue('unified-title', inputs.title);
  const urlFields = Array.from(document.querySelectorAll('#unified-url-fields-container .unified-url-input')) as HTMLInputElement[];
  urlFields.forEach((field, index) => { field.value = inputs.urls[index] || ''; field.dispatchEvent(new Event('input', { bubbles: true })); });
  const affiliateField = document.getElementById('shopping-connect-affiliate-link') as HTMLInputElement | null;
  if (inputs.affiliateLink && affiliateField && !affiliateField.value.trim()) affiliateField.value = inputs.affiliateLink;
  fullAutoStopResumeSetChecked('fullauto-keyword-as-title', inputs.keywordAsTitle);
  fullAutoStopResumeSetChecked('fullauto-keyword-title-prefix', inputs.keywordTitlePrefix);
}

/**
 * Hands the finished article to the publish button's reuse cache, under the key the button will compute from the screen
 * (same fields as handleFullAutoPublish's contentReuseSeed). A key that does not match only means the article is written again.
 */
function fullAutoStopResumeSeedDom(inputs: FullAutoStopResumeInputs, article: unknown): void {
  const urls = getUnifiedUrls();
  const typedAffiliate = fullAutoStopResumeDomValue('shopping-connect-affiliate-link') || fullAutoStopResumeDomValue('batch-link-input') || undefined;
  const firstUrl = (document.querySelector('.unified-url-input') as HTMLInputElement | null)?.value?.trim();
  const affiliateLink = typeof resolveAffiliateLink === 'function' ? resolveAffiliateLink(typedAffiliate, firstUrl) : (inputs.affiliateLink || undefined);
  const shoppingActive = typeof isShoppingConnectModeActive === 'function' && isShoppingConnectModeActive();
  const contentMode = (affiliateLink || shoppingActive) ? 'affiliate' : (fullAutoStopResumeDomValue('unified-content-mode') || 'seo');
  saveFullAutoContentRetryCache({
    urls,
    title: fullAutoStopResumeDomValue('unified-title'),
    keywords: fullAutoStopResumeDomValue('unified-keywords'),
    generator: UnifiedDOMCache.getGenerator(),
    toneStyle: UnifiedDOMCache.getToneStyle(),
    contentMode,
    manualTitleOverride: typeof readManualTitleOverrideForPublish === 'function' ? readManualTitleOverrideForPublish(contentMode) : undefined,
    categoryName: UnifiedDOMCache.getRealCategoryName?.(),
    keywordAsTitle: (document.getElementById('fullauto-keyword-as-title') as HTMLInputElement | null)?.checked || false,
    keywordTitlePrefix: (document.getElementById('fullauto-keyword-title-prefix') as HTMLInputElement | null)?.checked || false,
    affiliateLink,
  }, article);
  // The button asks "discard the article on screen?" when one is shown; for the SAME article that question does not apply.
  const shown = (window as any).currentStructuredContent;
  const titleOf = (content: any): string => String(content?.selectedTitle || content?.title || '').trim();
  if (shown && titleOf(shown) && titleOf(shown) === titleOf(article)) (window as any).currentStructuredContent = null;
}

function fullAutoStopResumeClickButton(): boolean {
  const button = document.getElementById('full-auto-publish-btn') as HTMLButtonElement | null;
  if (!button || button.disabled) return false;
  button.click();
  // The click handler disables the button synchronously before its first await: disabled = the run started.
  return button.hasAttribute('disabled');
}

function fullAutoStopResumeDefaultDeps(): FullAutoStopResumeDeps {
  const log = (message: string): void => { try { appendLog(message); } catch { /* log panel not ready */ } };
  return {
    busy: fullAutoStopResumeBusy,
    // Same account-mode switch the publish button itself reads (multi -> it would start a multi-account publish).
    accountMode: () => String((window as any).getAccountMode?.() || 'single'),
    restoreInputs: fullAutoStopResumeRestoreDom,
    seedArticle: fullAutoStopResumeSeedDom,
    clickPublish: fullAutoStopResumeClickButton,
    notify: (message) => {
      log(`⚠️ ${message}`);
      try { if (typeof toastManager !== 'undefined') toastManager?.warning?.(message); } catch { /* toast not ready */ }
    },
    log,
  };
}
