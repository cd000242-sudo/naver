import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import type { UploadImage } from '../../lib/communityApi';
import { IMAGE_LIMITS, planImageAdd } from '../../lib/communityImage.mjs';
import { encodeImageFile, type EncodedImage } from '../../lib/communityImageEncode';
import { fetchPostImage } from '../../lib/communityPostImage';
import { RICH_LIMITS, normalizeLinkInput, richImageIds, richTextLength, type RichBlock } from '../../lib/communityRich.mjs';
import { blocksToDom, domToBlocks } from '../../lib/communityRichDom.mjs';
import RichToolbar, { type ToolName } from './RichToolbar';
import {
    NO_TOOLS, applyLink, closestTag, exec, insertPictureLine, insertPlainLines, insideBox, readToolState, removePicture, restoreRange, savedRange,
    type ToolState,
} from './richEditorCommands';

export type RichEditorHandle = { read: () => { blocks: RichBlock[]; images: UploadImage[] } };

type Props = {
    /** Blocks of the post being edited. */
    initialBlocks?: RichBlock[];
    /** The post being edited: its existing pictures are fetched from here. */
    postId?: string;
    disabled?: boolean;
};

const PASTE_HINT = '네이버 사진은 퍼올 수 없어 파일로 올려 주세요';

/**
 * The writing box of a new post (forum contract 1114 §3). A contenteditable element the page owns, a toolbar, and the
 * pictures the writer attached (already shrunk and re-encoded). `read()` gives the blocks and the pictures to send.
 * Pasted text keeps only its words and line breaks; pasted outside pictures are never kept.
 */
const RichEditor = forwardRef<RichEditorHandle, Props>(function RichEditor({ initialBlocks, postId, disabled = false }, ref) {
    const box = useRef<HTMLDivElement>(null);
    const caret = useRef<Range | null>(null);
    const attached = useRef(new Map<string, EncodedImage>());
    const fileInput = useRef<HTMLInputElement>(null);
    const [tools, setTools] = useState<ToolState>(NO_TOOLS);
    const [empty, setEmpty] = useState(!initialBlocks?.length);
    const [length, setLength] = useState(0);
    const [pictures, setPictures] = useState(0);
    const [notice, setNotice] = useState('');
    const [link, setLink] = useState<string | null>(null);

    const sync = useCallback(() => {
        const el = box.current;
        if (!el) return;
        const blocks = domToBlocks(el);
        setLength(richTextLength(blocks));
        setPictures(richImageIds(blocks).length);
        setEmpty(blocks.length === 0 && !el.textContent?.trim());
    }, []);

    useEffect(() => {
        const el = box.current;
        const store = attached.current;
        if (el && initialBlocks?.length) {
            for (const node of blocksToDom(initialBlocks, document)) el.appendChild(node);
            el.querySelectorAll('img[data-image-id]').forEach((image) => {
                const id = image.getAttribute('data-image-id');
                if (postId && id) void fetchPostImage(postId, id).then((result) => { if (result.ok) image.setAttribute('src', result.src); });
            });
            sync();
        }
        const follow = () => {
            if (!box.current) return;
            const range = savedRange(box.current);
            if (range) { caret.current = range; setTools(readToolState(box.current)); }
        };
        document.addEventListener('selectionchange', follow);
        return () => {
            document.removeEventListener('selectionchange', follow);
            store.forEach((image) => URL.revokeObjectURL(image.previewUrl));
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useImperativeHandle(ref, () => ({
        read: () => {
            const blocks = box.current ? domToBlocks(box.current) : [];
            const used = new Set(richImageIds(blocks));
            const images = [...attached.current.values()].filter((image) => used.has(image.id)).map(({ id, mime, data }) => ({ id, mime, data }));
            return { blocks, images };
        },
    }), []);

    const attach = async (files: File[]) => {
        const el = box.current;
        if (!el) return;
        const plan = planImageAdd(el.querySelectorAll('img[data-image-id]').length, files);
        setNotice(plan.message);
        for (const file of plan.accept) {
            const made = await encodeImageFile(file);
            if (!made.ok) { setNotice(made.message); continue; }
            attached.current.set(made.image.id, made.image);
            insertPictureLine(el, caret.current, made.image.id, made.image.previewUrl);
        }
        sync();
    };

    const onTool = (tool: ToolName) => {
        const el = box.current;
        if (!el || disabled) return;
        if (tool === 'photo') { fileInput.current?.click(); return; }
        if (tool === 'link') { setLink(readToolState(el).link || ''); return; }
        restoreRange(el, caret.current);
        if (tool === 'bold' || tool === 'italic') exec(tool);
        else if (tool === 'heading') exec('formatBlock', tools.heading ? 'div' : 'h2');
        else if (tool === 'quote') exec('formatBlock', tools.quote ? 'div' : 'blockquote');
        else if (tool === 'ul') exec('insertUnorderedList');
        else if (tool === 'ol') exec('insertOrderedList');
        else if (tool === 'hr') exec('insertHorizontalRule');
        setTools(readToolState(el));
        sync();
    };

    const submitLink = () => {
        const el = box.current;
        const href = normalizeLinkInput(link);
        if (!el) return;
        if (!href) { setNotice('주소를 확인해 주세요. https:// 로 시작해야 하고 @ 나 따옴표는 쓸 수 없어요.'); return; }
        applyLink(el, caret.current, href);
        setLink(null);
        setNotice('');
        sync();
    };

    const removeLink = () => {
        if (!box.current) return;
        restoreRange(box.current, caret.current);
        exec('unlink');
        setLink(null);
        sync();
    };

    const onPaste = (event: ClipboardEvent<HTMLDivElement>) => {
        event.preventDefault();
        const data = event.clipboardData;
        const picture = Array.from(data.items).some((item) => item.type.startsWith('image/')) || /<img\b/i.test(data.getData('text/html'));
        if (picture) setNotice(PASTE_HINT);
        const text = data.getData('text/plain');
        if (text) insertPlainLines(text);
        sync();
    };

    const onDrop = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        void attach(Array.from(event.dataTransfer.files));
    };

    const over = length > RICH_LIMITS.text;
    const onBoxFocus = () => { if (box.current && !insideBox(box.current, window.getSelection()?.anchorNode ?? null)) caret.current = null; };

    return (
        <div className="cm-rich">
            <RichToolbar state={tools} photoCount={pictures} photoMax={IMAGE_LIMITS.maxCount} disabled={disabled} onTool={onTool} />
            {link !== null ? (
                <div className="cm-rich-link">
                    <input className="lp-input" type="url" inputMode="url" aria-label="링크 주소" value={link} placeholder="https://" autoFocus
                        onChange={(event) => setLink(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); submitLink(); } }} />
                    <button type="button" className="lp-btn lp-btn-dark" onClick={submitLink}>넣기</button>
                    {closestTag(box.current as HTMLElement, window.getSelection()?.anchorNode ?? null, ['A']) ? <button type="button" className="lp-btn lp-btn-line" onClick={removeLink}>링크 빼기</button> : null}
                    <button type="button" className="lp-btn lp-btn-line" onClick={() => setLink(null)}>닫기</button>
                </div>
            ) : null}
            <div className="cm-rich-wrap">
                {empty ? <span className="cm-rich-hint" aria-hidden="true">여기에 글을 써 주세요</span> : null}
                <div ref={box} className="cm-rich-box" contentEditable={!disabled} suppressContentEditableWarning role="textbox" aria-multiline="true" aria-label="내용"
                    spellCheck={false} onInput={sync} onPaste={onPaste} onDrop={onDrop} onDragOver={(event) => event.preventDefault()} onFocus={onBoxFocus} />
            </div>
            <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(event) => { void attach(Array.from(event.target.files ?? [])); event.target.value = ''; }} />
            {pictures > 0 ? (
                <ul className="cm-rich-pics" aria-label="넣은 사진">
                    {Array.from({ length: pictures }, (_, index) => (
                        <li key={index}>사진 {index + 1} <button type="button" className="cm-act" onClick={() => { if (box.current) { removePicture(box.current, index); sync(); } }}>빼기</button></li>
                    ))}
                </ul>
            ) : null}
            <p className={`cm-rich-count${over ? ' is-over' : ''}`}>{length.toLocaleString('en-US')}/{RICH_LIMITS.text.toLocaleString('en-US')}자</p>
            {notice ? <p className="cm-rich-notice" role="status">{notice}</p> : null}
        </div>
    );
});

export default RichEditor;
