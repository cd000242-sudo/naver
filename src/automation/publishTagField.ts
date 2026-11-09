// src/automation/publishTagField.ts
// [2026-11-04] Owner decision: hashtags belong in NAVER's publish-dialog tag field ("태그 편집"), not in the post body.
// The body still gets its trailing "#tag #tag" line exactly as before. Opening the publish dialog makes NAVER register
// those body #tags into the tag field. Same idea as the CTA flow (a pasted link becomes a card, the link text goes):
// confirm the tags are registered -> close the dialog -> delete the body hashtag line(s) -> reopen -> confirm they are
// still there (type the missing ones into the tag input if not) -> close. The final confirm button is never used here.
import { normalizeTagNames } from './publishTagFieldDom.js';

export { findBodyHashtagParagraphs, readPublishDialogTags, selectHashtagParagraphs } from './publishTagFieldDom.js';

export interface BodyHashtagParagraph {
  readonly index: number;
  readonly text: string;
  /** Tag names without '#'. */
  readonly tags: string[];
}

export interface PublishTagFieldDeps {
  readonly findBodyHashtagParagraphs: () => Promise<BodyHashtagParagraph[]>;
  /** Tag names (without '#') shown in the dialog's tag field; [] when the dialog is closed. */
  readonly readDialogTags: () => Promise<string[]>;
  readonly isDialogOpen: () => Promise<boolean>;
  /** Top-bar publish button (toggles the dialog). false = the button was not found / not clickable. */
  readonly clickPublishToggle: () => Promise<boolean>;
  readonly pressEscape: () => Promise<void>;
  /** Delete one hashtag-only body line. false = nothing was deleted. */
  readonly deleteParagraph: (paragraph: BodyHashtagParagraph) => Promise<boolean>;
  /** Type one #-less tag into the tag input and press Enter. */
  readonly typeTag: (tag: string) => Promise<boolean>;
  readonly delay: (ms: number) => Promise<void>;
  readonly log: (message: string) => void;
}

export type PublishTagFieldStatus =
  | 'moved' | 'no-body-hashtags' | 'no-tags-in-dialog' | 'dialog-not-opened' | 'dialog-not-closed'
  | 'delete-failed' | 'reopen-failed' | 'incomplete' | 'partial-registration';

export interface PublishTagFieldResult {
  readonly status: PublishTagFieldStatus;
  readonly tagsBefore: string[];
  readonly tagsAfter: string[];
  readonly deletedParagraphs: number;
  readonly typedFallback: number;
  readonly missingAfter: string[];
  readonly remainingBodyParagraphs: number;
}

/** Polling windows (ms). Counts are derived from them, so a fake delay finishes instantly in tests. */
export interface PublishTagFieldTiming {
  readonly openWaitMs: number; readonly openWaitStepMs: number; readonly tagsPollMs: number;
  readonly reopenTagsPollMs: number; readonly closePollMs: number; readonly pollIntervalMs: number;
}
const DEFAULT_TIMING: PublishTagFieldTiming = {
  openWaitMs: 3000, openWaitStepMs: 1000, tagsPollMs: 5000, reopenTagsPollMs: 3000, closePollMs: 1500, pollIntervalMs: 250,
};
const OPEN_ATTEMPTS = 3;
const CLOSE_ATTEMPTS = 3;

const missingTags = (expected: readonly string[], actual: readonly string[]): string[] => {
  const have = new Set(actual.map((tag) => tag.toLowerCase()));
  return expected.filter((tag) => !have.has(tag.toLowerCase()));
};

async function pollUntil(deps: PublishTagFieldDeps, check: () => Promise<boolean>, windowMs: number, stepMs: number): Promise<boolean> {
  for (let i = 0; i < Math.max(1, Math.ceil(windowMs / stepMs)); i++) {
    if (await check()) return true;
    await deps.delay(stepMs);
  }
  return check();
}

/** Click the toolbar button up to 3 times; never click while it is already open (the button toggles). */
async function openDialog(deps: PublishTagFieldDeps, t: PublishTagFieldTiming): Promise<boolean> {
  for (let attempt = 1; attempt <= OPEN_ATTEMPTS; attempt++) {
    if (await deps.isDialogOpen()) return true;
    if (!(await deps.clickPublishToggle())) {
      deps.log(`[태그칸] 발행 버튼을 찾지 못했습니다 (${attempt}/${OPEN_ATTEMPTS})`);
      await deps.delay(500);
      continue;
    }
    const waitMs = t.openWaitMs + (attempt - 1) * t.openWaitStepMs;
    if (await pollUntil(deps, () => deps.isDialogOpen(), waitMs, t.pollIntervalMs)) return true;
    deps.log(`[태그칸] 발행창이 아직 안 보입니다 (${attempt}/${OPEN_ATTEMPTS})`);
  }
  return deps.isDialogOpen();
}

/** Escape first; if the layer is still up, the toolbar button toggles it shut. */
async function closeDialog(deps: PublishTagFieldDeps, t: PublishTagFieldTiming): Promise<boolean> {
  const closed = async () => !(await deps.isDialogOpen());
  for (let attempt = 1; attempt <= CLOSE_ATTEMPTS; attempt++) {
    if (await closed()) return true;
    await deps.pressEscape();
    if (await pollUntil(deps, closed, t.closePollMs, t.pollIntervalMs)) return true;
    await deps.clickPublishToggle();
    if (await pollUntil(deps, closed, t.closePollMs, t.pollIntervalMs)) return true;
  }
  return closed();
}

/** Poll until every expected tag shows (or the window ends); returns the last read. */
async function waitForTags(deps: PublishTagFieldDeps, expected: readonly string[], windowMs: number, stepMs: number): Promise<string[]> {
  for (let i = 0; i < Math.max(1, Math.ceil(windowMs / stepMs)); i++) {
    const tags = normalizeTagNames(await deps.readDialogTags());
    if (tags.length > 0 && missingTags(expected, tags).length === 0) return tags;
    await deps.delay(stepMs);
  }
  return normalizeTagNames(await deps.readDialogTags());
}

/** One round removes at most one visual line, so a long hashtag paragraph needs many rounds; progress ends the loop, not a small cap. */
const MAX_DELETE_ROUNDS = 40;
/** Rounds in a row without the hashtag text getting shorter (the old cap allowed 5 rounds, so a late success must stay reachable). */
const NO_PROGRESS_LIMIT = 5;
/** Rounds in a row where the prose changed and was undone: stop early, as before. */
const PROSE_TOUCHED_LIMIT = 2;
const hashtagTextSize = (lines: readonly BodyHashtagParagraph[]): number => lines.reduce((sum, line) => sum + line.text.length, 0);

/**
 * Last line first, re-reading the body each round. A round counts only when the hashtag text really got shorter
 * (keys that left the prose untouched are not proof of a deletion).
 */
async function deleteHashtagLines(deps: PublishTagFieldDeps): Promise<{ deleted: number; remaining: number; leftover: string }> {
  let lines = await deps.findBodyHashtagParagraphs();
  let smallest = hashtagTextSize(lines);
  let deleted = 0;
  let stalled = 0;
  let proseTouched = 0;
  for (let round = 0; round < MAX_DELETE_ROUNDS && lines.length > 0 && stalled < NO_PROGRESS_LIMIT && proseTouched < PROSE_TOUCHED_LIMIT; round++) {
    const keptProse = await deps.deleteParagraph(lines[lines.length - 1]);
    proseTouched = keptProse ? 0 : proseTouched + 1;
    lines = await deps.findBodyHashtagParagraphs();
    const size = hashtagTextSize(lines);
    if (size < smallest) { deleted += 1; stalled = 0; smallest = size; await deps.delay(200); }
    else { stalled += 1; await deps.delay(300); }
  }
  const left = await deps.findBodyHashtagParagraphs();
  return { deleted, remaining: left.length, leftover: left.map((line) => line.text).join(' ').slice(0, 80) };
}

/** Type the missing tags into the open dialog's tag input, then read the field again. */
async function typeMissingTags(deps: PublishTagFieldDeps, expected: readonly string[], missing: readonly string[], t: PublishTagFieldTiming) {
  let typed = 0;
  for (const tag of missing) {
    if (await deps.typeTag(tag)) typed += 1;
    await deps.delay(300);
  }
  return { typed, after: await waitForTags(deps, expected, t.reopenTagsPollMs, t.pollIntervalMs) };
}

/** Warning for an unfinished move that names the unfinished half (tag field vs body line); null = nothing to warn about. */
export function describeTagFieldWarning(result: PublishTagFieldResult): string | null {
  if (result.status === 'reopen-failed') return '⚠️ [태그칸] 발행창을 다시 열지 못해 본문을 지운 뒤의 태그 칸을 확인하지 못했습니다 (지우기 전에는 등록이 확인됐습니다) — 발행 후 글의 태그를 확인해 주세요.';
  if (result.status !== 'incomplete') return null;
  if (result.missingAfter.length > 0) return `⚠️ [태그칸] 태그 칸에서 확인하지 못한 태그: ${result.missingAfter.map((tag) => `#${tag}`).join(' ')} — 발행 후 글의 태그를 확인해 주세요.`;
  return `⚠️ [태그칸] 태그 칸에는 모두 등록됐지만 본문 끝에 해시태그 ${result.remainingBodyParagraphs}줄이 남았습니다 — 발행 후 글 끝을 확인해 주세요.`;
}

export async function moveBodyHashtagsToTagField(
  deps: PublishTagFieldDeps,
  timing: Partial<PublishTagFieldTiming> = {},
): Promise<PublishTagFieldResult> {
  const t = { ...DEFAULT_TIMING, ...timing };
  const state = { tagsBefore: [] as string[], tagsAfter: [] as string[], deletedParagraphs: 0, typedFallback: 0, missingAfter: [] as string[], remainingBodyParagraphs: 0 };
  const done = (status: PublishTagFieldStatus): PublishTagFieldResult => ({ status, ...state });
  try {
    const lines = await deps.findBodyHashtagParagraphs();
    if (lines.length === 0) { deps.log('[태그칸] 본문에 해시태그 줄이 없어 건너뜁니다.'); return done('no-body-hashtags'); }
    const bodyTags = normalizeTagNames(lines.flatMap((line) => line.tags));
    if (!(await openDialog(deps, t))) { deps.log('[태그칸] 발행창을 열지 못해 해시태그를 본문에 그대로 둡니다.'); return done('dialog-not-opened'); }
    state.tagsBefore = await waitForTags(deps, bodyTags, t.tagsPollMs, t.pollIntervalMs);
    if (state.tagsBefore.length === 0) {
      deps.log('[태그칸] 발행창 태그 칸에 태그가 등록되지 않아 해시태그를 본문에 그대로 둡니다.');
      await closeDialog(deps, t);
      return done('no-tags-in-dialog');
    }
    deps.log(`[태그칸] 발행창 태그 등록 확인: ${state.tagsBefore.map((tag) => `#${tag}`).join(' ')}`);
    // Only tags the dialog really shows may leave the body (the whole line goes at once): type the rest in now, or keep the line.
    const unconfirmed = missingTags(bodyTags, state.tagsBefore);
    if (unconfirmed.length > 0) {
      deps.log(`[태그칸] 태그 칸에 아직 없는 태그를 지우기 전에 직접 입력합니다: ${unconfirmed.map((tag) => `#${tag}`).join(' ')}`);
      const typed = await typeMissingTags(deps, bodyTags, unconfirmed, t);
      state.typedFallback += typed.typed;
      state.tagsBefore = typed.after;
      const stillMissing = missingTags(bodyTags, state.tagsBefore);
      if (stillMissing.length > 0) {
        deps.log(`[태그칸] 태그 칸에서 확인되지 않은 태그(${stillMissing.map((tag) => `#${tag}`).join(' ')})가 있어 해시태그를 본문에 그대로 둡니다.`);
        await closeDialog(deps, t);
        return done('partial-registration');
      }
    }
    if (!(await closeDialog(deps, t))) { deps.log('[태그칸] 발행창을 닫지 못해 본문은 그대로 둡니다.'); return done('dialog-not-closed'); }

    const removed = await deleteHashtagLines(deps);
    state.deletedParagraphs = removed.deleted;
    state.remainingBodyParagraphs = removed.remaining;
    if (removed.deleted === 0) { deps.log('[태그칸] 본문 해시태그 줄을 지우지 못해 그대로 둡니다 (태그 칸에는 이미 등록됨).'); return done('delete-failed'); }
    deps.log(`[태그칸] 본문 해시태그 ${removed.deleted}줄을 지웠습니다${removed.remaining > 0 ? ` (${removed.remaining}줄 남음: ${removed.leftover})` : ''}.`);

    if (!(await openDialog(deps, t))) { deps.log('[태그칸] 발행창을 다시 열지 못해 태그 재확인을 못 했습니다 (지우기 전에 등록 확인은 마쳤습니다).'); return done('reopen-failed'); }
    const expected = normalizeTagNames([...state.tagsBefore, ...bodyTags]);
    let after = await waitForTags(deps, expected, t.reopenTagsPollMs, t.pollIntervalMs);
    let missing = missingTags(expected, after);
    if (missing.length > 0) {
      deps.log(`[태그칸] 태그 칸에서 사라진 태그를 직접 입력합니다: ${missing.map((tag) => `#${tag}`).join(' ')}`);
      const typed = await typeMissingTags(deps, expected, missing, t);
      state.typedFallback += typed.typed;
      after = typed.after;
      missing = missingTags(expected, after);
    }
    state.tagsAfter = after;
    state.missingAfter = missing;
    if (!(await closeDialog(deps, t))) { deps.log('[태그칸] 발행창을 닫지 못했습니다.'); return done('dialog-not-closed'); }
    if (missing.length > 0 || removed.remaining > 0) {
      const unexpected = missingTags(after, expected); // tags in the field that no body line announced (e.g. a leftover fragment)
      deps.log(`[태그칸] 일부만 옮겨졌습니다 — 태그 칸 누락: ${missing.map((tag) => `#${tag}`).join(' ') || '없음'} · 본문 남은 줄: ${removed.remaining} · 예상 밖 태그: ${unexpected.map((tag) => `#${tag}`).join(' ') || '없음'}`);
      return done('incomplete');
    }
    deps.log(`[태그칸] 해시태그를 발행창 태그 칸으로 옮겼습니다: ${after.map((tag) => `#${tag}`).join(' ')}`);
    return done('moved');
  } finally {
    try { await closeDialog(deps, t); } catch { /* the original outcome wins */ }
  }
}
