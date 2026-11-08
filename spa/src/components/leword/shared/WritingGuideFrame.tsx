/**
 * Shared writing-guide frame for the homefeed and AdSense benchmark cards (2026-11-08).
 * Same headings, same wrappers, same order on every card; only the content differs. See guideFrame.ts.
 */
import { GUIDE_PENDING_TEXT, guideFrame, type GuideSlot, type GuideSource } from './guideFrame';

function Points({ title, kind, slot }: { title: string; kind: 'include' | 'avoid'; slot: GuideSlot }) {
    return (
        <div className={`hfb-points ${kind}`}>
            <h4>{title}</h4>
            {slot.items.length > 0
                ? <ul>{slot.items.map((text, i) => <li key={i}>{text}</li>)}</ul>
                : <p className="hfb-guide-empty">{slot.empty}</p>}
        </div>
    );
}

export default function WritingGuideFrame({ card }: { card: GuideSource }) {
    const frame = guideFrame(card);
    return (
        <>
            <div className="hfb-direction">
                <h4>이렇게 쓰세요</h4>
                {frame.ready ? <p>{frame.direction}</p> : <p className="hfb-guide-empty">{GUIDE_PENDING_TEXT}</p>}
                <p className="hfb-alternatives">
                    <span>노릴 검색어 · 네이버 자동완성</span>{' '}
                    {frame.searchTargets.items.length > 0 ? frame.searchTargets.items.join(' · ') : <span className="hfb-guide-empty">{frame.searchTargets.empty}</span>}
                </p>
            </div>
            <div className="hfb-writing-grid">
                <Points title="반드시 들어갈 내용" kind="include" slot={frame.include} />
                <Points title="넣지 않을 내용" kind="avoid" slot={frame.avoid} />
            </div>
        </>
    );
}
