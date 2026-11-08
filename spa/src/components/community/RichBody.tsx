import { useMemo, type ReactNode } from 'react';
import { parseRichBody, type RichBlock, type RichRun } from '../../lib/communityRich.mjs';
import PostImage from './PostImage';

type Props = { postId: string; body: string };

/** One run: its words, wrapped for bold / italic / link. A link opens a new tab and tells search engines it is user content. */
function Run({ run }: { run: RichRun }) {
    let node: ReactNode = run.x;
    if (run.i) node = <em>{node}</em>;
    if (run.b) node = <strong>{node}</strong>;
    if (run.href) node = <a href={run.href} target="_blank" rel="noopener noreferrer nofollow ugc">{node}</a>;
    return <>{node}</>;
}

const Runs = ({ runs }: { runs: RichRun[] }) => <>{runs.map((run, index) => <Run key={index} run={run} />)}</>;

function Block({ block, postId }: { block: RichBlock; postId: string }) {
    switch (block.t) {
        case 'p': return <p><Runs runs={block.c} /></p>;
        case 'h': return block.l === 3 ? <h3><Runs runs={block.c} /></h3> : <h2><Runs runs={block.c} /></h2>;
        case 'quote': return <blockquote><p><Runs runs={block.c} /></p></blockquote>;
        case 'ul': return <ul>{block.items.map((item, index) => <li key={index}><Runs runs={item} /></li>)}</ul>;
        case 'ol': return <ol>{block.items.map((item, index) => <li key={index}><Runs runs={item} /></li>)}</ol>;
        case 'img': return <PostImage postId={postId} imageId={block.id} alt={block.alt} />;
        default: return <hr />;
    }
}

/**
 * The body of a rich post (forum contract 1114 §3), built as React elements from the stored JSON. Nothing from the
 * server is ever set as HTML. A body that is not a rich body (or is damaged) is shown as plain text, as before.
 */
function RichBody({ postId, body }: Props) {
    const parsed = useMemo(() => parseRichBody(body), [body]);
    if (!parsed.ok) return <div className="cm-body">{body}</div>;
    return <div className="cm-body cm-rich-body">{parsed.blocks.map((block, index) => <Block key={index} block={block} postId={postId} />)}</div>;
}

export default RichBody;
