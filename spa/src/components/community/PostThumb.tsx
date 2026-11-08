import { useEffect, useState } from 'react';
import { fetchThumb, peekThumb } from '../../lib/communityThumbFetch';
import { useNearScreen } from '../../lib/useNearScreen';
import './community-thumb.css';

type Props = {
    postId: string;
    /** Our own picture: '_thumb' or the first picture's id. */
    thumbId: string;
    /** Promo rows: an https address the server already knew (used only when there is no `thumbId`). */
    thumbUrl: string;
};

/**
 * The picture of a list row or card, cover-fitted into whatever box the parent gives it. Our own pictures are asked
 * for only when the row comes near the screen (four at a time, kept in memory); a promo address is left to the
 * browser's own lazy loading. A picture that cannot be had hides the box instead of leaving a grey square.
 */
function PostThumb({ postId, thumbId, thumbUrl }: Props) {
    const [holder, near] = useNearScreen<HTMLSpanElement>();
    const [src, setSrc] = useState(() => (thumbId ? peekThumb(postId, thumbId) : ''));
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        if (!thumbId || !near || src) return undefined;
        let alive = true;
        void fetchThumb(postId, thumbId).then((result) => {
            if (!alive) return;
            if (result.ok) setSrc(result.src); else setFailed(true);
        });
        return () => { alive = false; };
    }, [near, postId, thumbId, src]);

    const shown = thumbId ? src : thumbUrl;
    return (
        <span className={`cm-thumb${shown ? '' : ' is-wait'}${failed ? ' is-failed' : ''}`} ref={holder}>
            {shown ? <img src={shown} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : null}
        </span>
    );
}

export default PostThumb;
