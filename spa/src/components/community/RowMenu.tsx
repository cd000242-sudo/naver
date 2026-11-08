import { useEffect, useRef, useState } from 'react';
import type { PostItem } from '../../lib/communityData';

type Props = { post: PostItem; onReport: (post: PostItem) => void };

/** The small "⋯" menu at the end of a list row; it holds [신고]. Closes on a press elsewhere or Esc. */
function RowMenu({ post, onReport }: Props) {
    const [open, setOpen] = useState(false);
    const holder = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        if (!open) return undefined;
        const away = (event: MouseEvent) => { if (!holder.current?.contains(event.target as Node)) setOpen(false); };
        const key = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', away);
        document.addEventListener('keydown', key);
        return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', key); };
    }, [open]);

    return (
        <span className="cm-more-wrap" ref={holder}>
            <button type="button" className="cm-more" aria-haspopup="menu" aria-expanded={open} aria-label="더보기" onClick={() => setOpen((on) => !on)}>⋯</button>
            {open ? (
                <span className="cm-more-menu" role="menu">
                    <button type="button" role="menuitem" className="cm-more-item" onClick={() => { setOpen(false); onReport(post); }}>신고</button>
                </span>
            ) : null}
        </span>
    );
}

export default RowMenu;
