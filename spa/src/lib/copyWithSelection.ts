/**
 * The older, synchronous copy: a hidden text box is selected and the browser's own copy command runs on it.
 * Used when `navigator.clipboard` is missing, refuses, or never answers. Answers true when the browser says it copied.
 */
export function copyWithSelection(text: string): boolean {
    if (typeof document === 'undefined') return false;
    const box = document.createElement('textarea');
    box.value = text;
    box.setAttribute('readonly', '');
    box.setAttribute('aria-hidden', 'true');
    Object.assign(box.style, { position: 'fixed', top: '0', left: '-9999px', opacity: '0' });
    document.body.appendChild(box);
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    try {
        box.select();
        box.setSelectionRange(0, text.length);
        return document.execCommand('copy');
    } catch {
        return false;
    } finally {
        box.remove();
        active?.focus();
    }
}
