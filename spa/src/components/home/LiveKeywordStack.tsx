import { useEffect, useRef, useState, type CSSProperties } from 'react';
import CountUp from '../motion/CountUp';
import { useOnScreen, useReducedMotion } from '../motion/useMotionHooks';
import type { HomeKeywordRow } from '../../lib/homeKeywordBriefing';
import './LiveKeywordStack.css';

const CYCLE_MS = 3600;
const MAX_CARDS = 4;

type LiveKeywordStackProps = {
    /** Real briefing rows, already ranked. Nothing is invented; with no rows nothing renders. */
    rows: HomeKeywordRow[];
    href: string;
    caption: string;
};

function sharePerPost(row: HomeKeywordRow): number {
    return Math.round(row.searchVolume / (row.documentCount + 1));
}

/**
 * Stacked keyword cards from the published golden-keyword briefing. Every few seconds the
 * front card lifts away and the next one comes forward, its figures counting up.
 * Pauses on hover/focus, while off-screen, while the tab is hidden, and under reduced motion.
 */
function LiveKeywordStack({ rows, href, caption }: LiveKeywordStackProps) {
    const cards = rows.slice(0, MAX_CARDS);
    const count = cards.length;
    const [front, setFront] = useState(0);
    const [held, setHeld] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const onScreen = useOnScreen(rootRef);
    const reduced = useReducedMotion();
    const running = count > 1 && !held && onScreen && !reduced;

    useEffect(() => {
        if (!running) return undefined;
        const timer = window.setInterval(() => {
            if (document.visibilityState === 'visible') setFront((current) => (current + 1) % count);
        }, CYCLE_MS);
        return () => window.clearInterval(timer);
    }, [running, count]);

    if (count === 0) return null;
    const hold = () => setHeld(true);
    const release = () => setHeld(false);

    return (
        <div ref={rootRef} className="lks" style={{ '--lks-cycle': `${CYCLE_MS}ms` } as CSSProperties}>
            <div className="lks-head">
                <span className="lks-kicker">무료 선정 황금키워드</span>
                <small>{caption} · {front + 1}/{count}</small>
            </div>
            <a
                className="lks-deck"
                href={href}
                aria-label={`무료 선정 황금키워드 보기, 지금 보이는 키워드 ${cards[front].keyword}`}
                onMouseEnter={hold}
                onMouseLeave={release}
                onFocus={hold}
                onBlur={release}
            >
                {cards.map((row, index) => {
                    const depth = (index - front + count) % count;
                    const isFront = depth === 0;
                    const recycling = count > 1 && depth === count - 1;
                    return (
                        <div
                            key={row.keyword}
                            className={`lks-card${recycling ? ' is-recycling' : ''}`}
                            data-depth={depth}
                            aria-hidden={isFront ? undefined : true}
                        >
                            <span className="lks-rank">기회 순 {index + 1}위</span>
                            <strong className="lks-kw">{row.keyword}</strong>
                            <dl className="lks-figs">
                                <div><dt>한 달 검색</dt><dd>{isFront ? <CountUp key={`s-${front}`} value={row.searchVolume} /> : row.searchVolume.toLocaleString('ko-KR')}</dd></div>
                                <div><dt>경쟁 글</dt><dd>{isFront ? <CountUp key={`d-${front}`} value={row.documentCount} /> : row.documentCount.toLocaleString('ko-KR')}</dd></div>
                                <div><dt>한 글자리당 사람</dt><dd>{isFront ? <CountUp key={`p-${front}`} value={sharePerPost(row)} /> : sharePerPost(row).toLocaleString('ko-KR')}</dd></div>
                            </dl>
                        </div>
                    );
                })}
            </a>
            {count > 1 && (
                <div className={`lks-progress${running ? '' : ' is-paused'}`} aria-hidden="true">
                    <i key={`${front}-${running ? 'run' : 'hold'}`} />
                </div>
            )}
        </div>
    );
}

export default LiveKeywordStack;
