/**
 * appProgressModal.ts — shared driver for the blocking #generation-modal overlay.
 *
 * The markup already exists in index.html and was driven by a private copy inside
 * contentGeneration.ts. The 이미지 관리 탭 needs the same overlay (user request: long
 * analyses must show a modal progress instead of looking dead), so the DOM handling
 * lives in one place rather than being copied per caller.
 */

/** Show (or update) the blocking progress overlay. Percent is clamped to 0-100. */
export function showAppProgressModal(title: string, message: string, percent: number): void {
  try {
    const modal = document.getElementById('generation-modal');
    if (!modal) return;
    const titleEl = document.getElementById('generation-modal-title');
    const msgEl = document.getElementById('generation-modal-message');
    const progEl = document.getElementById('generation-modal-progress');
    const pctEl = document.getElementById('generation-modal-percent');
    const safePercent = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
    modal.style.display = 'flex';
    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = message;
    if (progEl) (progEl as HTMLElement).style.width = `${safePercent}%`;
    if (pctEl) pctEl.textContent = `${Math.round(safePercent)}%`;
  } catch { /* the overlay is cosmetic — never break the caller */ }
}

/** Hide the blocking progress overlay. Safe to call when it was never shown. */
export function hideAppProgressModal(): void {
  try {
    const modal = document.getElementById('generation-modal');
    if (modal) modal.style.display = 'none';
  } catch { /* ignore */ }
}
