/**
 * [2026-11-11] A manuscript that is brought in by hand (semi-auto paste) has no saved-post id or generation time, so the
 * Codex reference list could not tell it from the next one. It gets an identity issued by codexReferenceImageList
 * (issueCodexReferenceKey): kept in a WeakMap OUTSIDE the manuscript object, so nothing is added to the manuscript, to the
 * saved JSON or to the publish payload. The identity is renewed when another manuscript replaces the whole body. Typing or
 * pasting inside the same text keeps it, so the photos stay with that manuscript.
 * Not used: hashing the text (a small edit would then drop the photos).
 * The identity is attached to the existing object on purpose: other code holds the same reference to the current manuscript.
 *
 * "Another manuscript replaces the body" is decided from the body box events (bindManuscriptBodyWatch):
 *  - any insert while the whole body is selected (typing, paste, drop, replacement, IME composition start);
 *  - the body was emptied (blank counts as empty) after it had content, and is then filled again, unless the refill is
 *    an undo/redo (Ctrl+Z after an accidental clear keeps the manuscript).
 * The first fill of an empty body (title first, photos, body later) is not a new manuscript.
 */
import { codexReferenceContentKey, issueCodexReferenceKey, syncCodexReferenceOwner } from './codexReferenceImageList.js';

/** The body box was filled before and the whole text is selected, so an input now replaces the manuscript (not an append or insert). */
export function isWholeManuscriptReplacement(box: { value: string; selectionStart: number | null; selectionEnd: number | null }): boolean {
  const text = typeof box?.value === 'string' ? box.value : '';
  if (text.trim() === '') return false; // an empty box: the first body of the manuscript being typed, not a new one
  return box.selectionStart === 0 && box.selectionEnd === text.length;
}

/** Issues a new identity for the current manuscript and lets the reference list see the change at once (empty list + copy cleanup). */
export function markImportedManuscript(content: unknown): void {
  if (!content || typeof content !== 'object') return;
  issueCodexReferenceKey(content);
  try { syncCodexReferenceOwner(); } catch { /* the list is only a convenience; the identity is already issued */ }
}

const MANUSCRIPT_INSERT_INPUT_TYPES: ReadonlySet<string> = new Set([
  'insertText', 'insertFromPaste', 'insertFromPasteAsQuotation', 'insertFromDrop', 'insertReplacementText',
  'insertFromYank', 'insertLineBreak', 'insertParagraph',
]);

/** An input that puts content into the box. IME composition updates are left out: they are decided once, at composition start. */
export function isManuscriptInsertInput(inputType: unknown, isComposing: boolean = false): boolean {
  if (isComposing || inputType === 'insertCompositionText') return false;
  return typeof inputType === 'string' && MANUSCRIPT_INSERT_INPUT_TYPES.has(inputType);
}

export function isWholeSelectionInsert(
  box: { value: string; selectionStart: number | null; selectionEnd: number | null },
  inputType: unknown,
  isComposing: boolean,
): boolean {
  return isManuscriptInsertInput(inputType, isComposing) && isWholeManuscriptReplacement(box);
}

export interface BodyFillState { key: string; hadContent: boolean; blanked: boolean }

/**
 * Follows the body text after each change. `blanked` = it had content and is now empty (blank counts as empty).
 * A refill while `blanked` is a new manuscript, unless it is an undo/redo. A different manuscript key starts a fresh record.
 */
export function observeBodyFill(
  prev: BodyFillState | null,
  key: string,
  text: string,
  inputType?: unknown,
): { state: BodyFillState; newManuscript: boolean } {
  const filled = text.trim() !== '';
  if (!prev || prev.key !== key) return { state: { key, hadContent: filled, blanked: false }, newManuscript: false };
  if (!filled) return { state: { ...prev, blanked: prev.hadContent }, newManuscript: false };
  const restored = inputType === 'historyUndo' || inputType === 'historyRedo';
  if (prev.blanked && !restored) return { state: { key, hadContent: true, blanked: false }, newManuscript: true };
  return { state: { ...prev, hadContent: true, blanked: false }, newManuscript: false };
}

interface ManuscriptBodyBox {
  value: string;
  selectionStart: number | null;
  selectionEnd: number | null;
  addEventListener(type: string, listener: (event: any) => void): void;
}

/** Watches the semi-auto body box (a textarea) and issues a new manuscript identity when another manuscript takes its place. */
export function bindManuscriptBodyWatch(
  box: ManuscriptBodyBox,
  getContent: () => unknown = () => { try { return (window as any).currentStructuredContent; } catch { return undefined; } },
): void {
  let state: BodyFillState | null = null;
  const observe = (inputType?: unknown): void => {
    const result = observeBodyFill(state, codexReferenceContentKey(getContent()), String(box.value ?? ''), inputType);
    state = result.state;
    if (result.newManuscript) markImportedManuscript(getContent());
  };
  observe();
  // Before the text changes, so the identity (and the list) is already renewed when the new text arrives.
  box.addEventListener('beforeinput', (event) => {
    if (isWholeSelectionInsert(box, event?.inputType, event?.isComposing === true)) markImportedManuscript(getContent());
  });
  box.addEventListener('compositionstart', () => {
    if (isWholeManuscriptReplacement(box)) markImportedManuscript(getContent());
  });
  box.addEventListener('input', (event) => observe(event?.inputType));
}
