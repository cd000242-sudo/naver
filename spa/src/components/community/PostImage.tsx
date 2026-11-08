import { useEffect, useRef, useState } from 'react';
import { fetchPostImage } from '../../lib/communityPostImage';

type Props = { postId: string; imageId: string; alt: string };

/** One picture of a post. The server is asked only when it scrolls near the screen; until then a quiet box holds its place. */
function PostImage({ postId, imageId, alt }: Props) {
    const holder = useRef<HTMLElement>(null);
    const [near, setNear] = useState(false);
    const [state, setState] = useState<{ src: string } | { error: string } | null>(null);
    const [again, setAgain] = useState(0);

    useEffect(() => {
        const element = holder.current;
        if (near || !element) return undefined;
        if (typeof IntersectionObserver === 'undefined') { setNear(true); return undefined; }
        const watch = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) setNear(true); }, { rootMargin: '300px' });
        watch.observe(element);
        return () => watch.disconnect();
    }, [near]);

    useEffect(() => {
        if (!near) return undefined;
        let alive = true;
        setState(null);
        void fetchPostImage(postId, imageId).then((result) => { if (alive) setState(result.ok ? { src: result.src } : { error: result.message }); });
        return () => { alive = false; };
    }, [near, postId, imageId, again]);

    if (state && 'src' in state) {
        return <figure className="cm-pic"><img src={state.src} alt={alt} loading="lazy" decoding="async" /></figure>;
    }
    return (
        <figure className="cm-pic is-wait" ref={holder as React.RefObject<HTMLElement>}>
            <figcaption>{state && 'error' in state ? state.error : '사진을 불러오는 중이에요'}{alt ? ` · ${alt}` : ''}</figcaption>
            {state && 'error' in state ? <button type="button" className="cm-act" onClick={() => setAgain((value) => value + 1)}>다시 불러오기</button> : null}
        </figure>
    );
}

export default PostImage;
