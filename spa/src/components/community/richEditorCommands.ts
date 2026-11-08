/**
 * Browser-side helpers of the post editor: the caret, the toolbar commands and picture placement. The box is a
 * contenteditable element that the page owns; what the writer typed is read back by domToBlocks (a tag allowlist),
 * so nothing typed or pasted here can become markup of the post.
 */

export type ToolState = { bold: boolean; italic: boolean; ul: boolean; ol: boolean; heading: boolean; quote: boolean; link: string };

export const NO_TOOLS: ToolState = { bold: false, italic: false, ul: false, ol: false, heading: false, quote: false, link: '' };

export const insideBox = (box: HTMLElement, node: Node | null): boolean => Boolean(node) && box.contains(node);

/** The nearest parent (or the node itself) with one of these tag names, not going past the box. */
export function closestTag(box: HTMLElement, node: Node | null, names: readonly string[]): HTMLElement | null {
    let current: Node | null = node;
    while (current && current !== box) {
        if (current.nodeType === 1 && names.includes(current.nodeName)) return current as HTMLElement;
        current = current.parentNode;
    }
    return null;
}

/** The selection as a Range when it lies inside the box; else null. */
export function savedRange(box: HTMLElement): Range | null {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    return insideBox(box, range.commonAncestorContainer) ? range.cloneRange() : null;
}

/**
 * Gives the caret back to the box. While the focus never left the box (a mouse press on a toolbar button) the live
 * selection is left alone, since a remembered range can be a few keystrokes old; only when the focus went elsewhere
 * (the link box, a keyboard-pressed button) is the remembered range put back.
 */
export function restoreRange(box: HTMLElement, range: Range | null): void {
    const stayed = document.activeElement === box;
    box.focus();
    if (stayed || !range) return;
    const selection = window.getSelection();
    if (!selection) return;
    selection.removeAllRanges();
    selection.addRange(range);
}

export function readToolState(box: HTMLElement): ToolState {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !insideBox(box, selection.anchorNode)) return NO_TOOLS;
    const node = selection.anchorNode;
    const query = (command: string) => { try { return document.queryCommandState(command); } catch { return false; } };
    return {
        bold: query('bold'),
        italic: query('italic'),
        ul: closestTag(box, node, ['UL']) !== null,
        ol: closestTag(box, node, ['OL']) !== null,
        heading: closestTag(box, node, ['H1', 'H2', 'H3']) !== null,
        quote: closestTag(box, node, ['BLOCKQUOTE']) !== null,
        link: closestTag(box, node, ['A'])?.getAttribute('href') ?? '',
    };
}

/** `document.execCommand` is the one editing API every browser still ships for a contenteditable box. */
export const exec = (command: string, value?: string): boolean => document.execCommand(command, false, value);

/** Plain pasted text: every line becomes its own paragraph; nothing but the words comes in. */
export function insertPlainLines(text: string): void {
    text.replace(/\r/g, '').split('\n').forEach((line, index) => {
        if (index > 0) exec('insertParagraph');
        if (line) exec('insertText', line);
    });
}

/** Puts the address as a link: around the selected words, or as its own text when nothing is selected. */
export function applyLink(box: HTMLElement, range: Range | null, href: string): void {
    restoreRange(box, range);
    const inside = closestTag(box, range?.startContainer ?? null, ['A']);
    if (inside && range?.collapsed) { inside.setAttribute('href', href); return; }
    if (range && !range.collapsed) { exec('createLink', href); return; }
    const anchor = document.createElement('a');
    anchor.setAttribute('href', href);
    anchor.textContent = href;
    (range ?? (() => { const r = document.createRange(); r.selectNodeContents(box); r.collapse(false); return r; })()).insertNode(anchor);
}

const BLOCK_TAGS = /^(DIV|P|H[1-6]|UL|OL|BLOCKQUOTE|HR|FIGURE|TABLE|PRE)$/;

/**
 * The last box child of the "line" that holds `node`: the child itself, or, when the writer has not pressed Enter yet
 * and the line is made of bare text / bold / italic pieces side by side, the last piece of that run.
 */
function lineOf(box: HTMLElement, node: Node | null): Node | null {
    let current: Node | null = node;
    while (current && current.parentNode !== box) current = current.parentNode;
    while (current && !(current.nodeType === 1 && BLOCK_TAGS.test(current.nodeName))) {
        const next: ChildNode | null = current.nextSibling;
        if (!next || (next.nodeType === 1 && BLOCK_TAGS.test(next.nodeName))) break;
        current = next;
    }
    return current;
}

/** A picture as its own line after the line the caret is in (or at the end), with an empty line after it to write on. */
export function insertPictureLine(box: HTMLElement, range: Range | null, id: string, src: string): void {
    const wrap = document.createElement('div');
    const image = document.createElement('img');
    image.setAttribute('data-image-id', id);
    image.setAttribute('alt', '사진');
    image.setAttribute('src', src);
    wrap.appendChild(image);
    const live = savedRange(box) ?? range;
    const after = lineOf(box, live?.endContainer ?? null);
    box.insertBefore(wrap, after ? after.nextSibling : null);
    if (!wrap.nextSibling) {
        const next = document.createElement('div');
        next.appendChild(document.createElement('br'));
        box.appendChild(next);
    }
}

/** Takes the nth picture out of the box (and its line, when the picture was all of it). */
export function removePicture(box: HTMLElement, index: number): void {
    const image = box.querySelectorAll('img[data-image-id]')[index];
    if (!image) return;
    const line = image.parentNode;
    image.remove();
    if (line && line !== box && line.nodeName === 'DIV' && !(line as HTMLElement).textContent?.trim() && !(line as HTMLElement).querySelector('img')) line.parentNode?.removeChild(line);
}
