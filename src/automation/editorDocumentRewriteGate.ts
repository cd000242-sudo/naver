// src/automation/editorDocumentRewriteGate.ts
// Switch for the steps that rewrite the editor's own document (setDocumentData): previous-post card centring and
// shopping-post centring.
//
// Live runs 2026-11-25 (owner x2, customer x3, app 2.11.403-405, zero successes): the address line of a link card is
// removed from the SCREEN only (bareUrlCleanupDom), the document still holds it, and writing the document back without
// that line makes the editor remove a node that is no longer there ("Failed to execute 'removeChild' on 'Node'").
// The editor screen goes blank, later steps cannot read the body, and the post is published without its tags.
// Writing the document back WITH the line (2026-11-24) does not crash but publishes the address lines again.
// Neither variant is safe, so the rewrite stays off for customers until one is proven in a real editor.
// Without it the tail is exactly the flow used before 2026-11-24: cards keep the editor's default alignment.

/** Developer-only switch for trying the rewrite in a real editor. Never set in a release build. */
export const EDITOR_DOCUMENT_REWRITE_ENV = 'BLN_EDITOR_DOCUMENT_REWRITE';

export function isEditorDocumentRewriteEnabled(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return env[EDITOR_DOCUMENT_REWRITE_ENV] === '1';
}
