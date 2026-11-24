import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { CATEGORY_LABEL } from '../../../lib/homefeedModel.mjs';
import { hfAppStories, HOMEFEED_PUBLIC_URL } from '../../../lib/homefeedBridge';
import {
    barGeometry, bucketAxis, bucketCaption, chooseSpeedBoard, kstDateTime, leadBadge, normalizeSpeedCandidate,
    scoreboardLine, speedCollectionState, type SpeedCard, type SpeedSelection, type SpeedSource,
} from '../../../lib/homefeedSpeedModel.mjs';
import Reveal from '../../motion/Reveal';

const SPEED_URL = '/data/homefeed-speed.json';
const REFRESH_MS = 5 * 60_000;
const REQUEST_TIMEOUT_MS = 8_000;
const FIRST_PAGE = 6;
const SOURCE_LABEL: Record<SpeedSource, string> = { service: '서버 수집', legacy: '공개 기록', app: '내 LEWORD 앱' };

async function publicSpeed(path: string, source: SpeedSource, signal: AbortSignal) {
    try {
        const response = await fetch(path, { cache: 'no-store', signal: AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]) });
        return response.ok ? normalizeSpeedCandidate(await response.json(), source) : null;
    } catch {
        return null;
    }
}

async function appSpeed() {
    const result = await hfAppStories(3_500);
    return result.status === 'ok' ? normalizeSpeedCandidate(result.result, 'app') : null;
}

const panelStyle: CSSProperties = { margin: '16px 0', padding: 20, border: '1px solid var(--lw-line)', borderRadius: 18, background: 'var(--lw-surface)' };
const eyebrowStyle: CSSProperties = { fontSize: 13, fontWeight: 500, color: 'var(--lw-text-muted)' };
const titleStyle: CSSProperties = { margin: '4px 0 0', fontSize: 20, fontWeight: 600, color: 'var(--lw-text)' };
const mutedStyle: CSSProperties = { margin: '8px 0 0', fontSize: 13, lineHeight: 1.6, color: 'var(--lw-text-secondary)' };
const scoreStyle: CSSProperties = { margin: '12px 0 0', padding: '8px 12px', borderRadius: 10, border: '1px solid var(--lw-accent-line)', background: 'var(--lw-accent-soft)', color: 'var(--lw-text)', fontSize: 15, fontWeight: 600 };
const gridStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))', gap: 12, marginTop: 16 };
const cardStyle: CSSProperties = { padding: 12, border: '1px solid var(--lw-line)', borderRadius: 14, background: 'var(--lw-surface)', minWidth: 0 };
const keywordStyle: CSSProperties = { margin: '4px 0 0', fontSize: 15, fontWeight: 600, color: 'var(--lw-text)', overflowWrap: 'anywhere' };
const chipStyle: CSSProperties = { display: 'inline-block', marginRight: 8, padding: '0 8px', borderRadius: 999, border: '1px solid var(--lw-line)', background: 'var(--lw-raised)', fontSize: 13, color: 'var(--lw-text-secondary)' };
const captionStyle: CSSProperties = { margin: '4px 0 0', fontSize: 13, color: 'var(--lw-text-secondary)' };
const axisStyle: CSSProperties = { display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--lw-text-muted)', fontVariantNumeric: 'tabular-nums' };
const moreStyle: CSSProperties = { display: 'block', width: '100%', marginTop: 12, minHeight: 44, border: '1px solid var(--lw-line)', borderRadius: 10, background: 'var(--lw-surface)', color: 'var(--lw-text)', fontSize: 15, cursor: 'pointer' };

const TONE: Record<string, { fg: string; bg: string; border: string }> = {
    ahead: { fg: 'var(--lw-positive)', bg: 'var(--lw-positive-soft)', border: 'var(--lw-positive-soft)' },
    behind: { fg: 'var(--lw-negative)', bg: 'var(--lw-negative-soft)', border: 'var(--lw-negative-soft)' },
    unmeasured: { fg: 'var(--lw-text-secondary)', bg: 'var(--lw-raised)', border: 'var(--lw-line)' },
};

function Bars({ card }: { card: SpeedCard }) {
    if (!card.buckets) return <p style={captionStyle}>뉴스 기사 수 미측정</p>;
    const geometry = barGeometry(card.buckets, { width: 240, height: 56, gap: 2 });
    const axis = bucketAxis(card.buckets);
    const caption = bucketCaption(card.buckets);
    return <div style={{ marginTop: 12 }}>
        <svg viewBox={`0 0 ${geometry.width} ${geometry.height}`} width="100%" height={geometry.height} role="img" aria-label={caption} preserveAspectRatio="none">
            <title>{caption}</title>
            <line x1="0" y1={geometry.height - 0.5} x2={geometry.width} y2={geometry.height - 0.5} stroke="var(--lw-line-strong)" strokeWidth="1" />
            {geometry.bars.map((bar) => bar.height > 0 && <rect key={bar.index} x={bar.x} y={bar.y} width={bar.width} height={bar.height} rx="1.5" fill="var(--lw-positive)"><title>{`${bar.count}건`}</title></rect>)}
        </svg>
        <div style={axisStyle}><span>{axis.left}</span><span>{axis.right}</span></div>
        <p style={captionStyle}>{caption}</p>
    </div>;
}

function LeadBadge({ card }: { card: SpeedCard }) {
    const badge = leadBadge(card.lead);
    const tone = TONE[badge.tone];
    const lead = card.lead;
    const times = lead && lead.status !== 'unmeasured' && lead.firstSeenAt && lead.firstNewsAt
        ? `처음 본 ${kstDateTime(lead.firstSeenAt)} · 뉴스 첫 기사 ${kstDateTime(lead.firstNewsAt)} (한국 시각)` : '';
    return <div style={{ marginTop: 12 }}>
        <span style={{ display: 'inline-block', padding: '2px 12px', borderRadius: 999, border: `1px solid ${tone.border}`, background: tone.bg, color: tone.fg, fontSize: 13, fontWeight: 600 }}>{badge.text}</span>
        {badge.note && <p style={captionStyle}>{badge.note}</p>}
        {badge.detail && <p style={captionStyle}>{badge.detail}</p>}
        {times && <p style={captionStyle}>{times}</p>}
    </div>;
}

function Card({ card }: { card: SpeedCard }) {
    return <article style={cardStyle}>
        <div>{card.category && <span style={chipStyle}>{(CATEGORY_LABEL as Record<string, string>)[card.category] ?? card.category}</span>}</div>
        <h3 style={keywordStyle}>{card.keyword}</h3>
        <Bars card={card} />
        <LeadBadge card={card} />
    </article>;
}

export default function HomefeedSpeedPanel() {
    const [selection, setSelection] = useState<SpeedSelection>({ board: null, latestSnapshotAt: null });
    const [now, setNow] = useState(Date.now);
    const [loading, setLoading] = useState(true);
    const [limit, setLimit] = useState(FIRST_PAGE);
    const request = useRef<AbortController | null>(null);

    const refresh = useCallback(async () => {
        if (request.current) return;
        const controller = new AbortController();
        request.current = controller;
        setLoading(true);
        try {
            const candidates = await Promise.all([
                publicSpeed(SPEED_URL, 'service', controller.signal),
                publicSpeed(HOMEFEED_PUBLIC_URL, 'legacy', controller.signal),
                appSpeed(),
            ]);
            if (controller.signal.aborted) return;
            const checkedAt = Date.now();
            setNow(checkedAt);
            setSelection((previous) => chooseSpeedBoard(candidates, checkedAt, previous));
        } finally {
            if (request.current === controller) {
                request.current = null;
                setLoading(false);
            }
        }
    }, []);

    useEffect(() => {
        void refresh();
        const refreshVisible = () => {
            if (document.visibilityState === 'visible') void refresh();
        };
        const timer = window.setInterval(refreshVisible, REFRESH_MS);
        document.addEventListener('visibilitychange', refreshVisible);
        return () => {
            request.current?.abort();
            request.current = null;
            window.clearInterval(timer);
            document.removeEventListener('visibilitychange', refreshVisible);
        };
    }, [refresh]);

    const { board, latestSnapshotAt } = selection;
    const status = speedCollectionState(board, now);
    const line = status === 'fresh' ? scoreboardLine(board?.scoreboard) : null;
    const cards = board?.cards ?? [];
    const measuredAt = board?.measuredAt;
    const laterCapture = latestSnapshotAt && (!measuredAt || Date.parse(latestSnapshotAt) > Date.parse(measuredAt));
    return <section style={panelStyle} aria-label="속도 실측">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
                <span style={eyebrowStyle}>SPEED CHECK</span>
                <h2 style={titleStyle}>뉴스 기사 수 · 첫 기사와 비교</h2>
            </div>
            <button type="button" style={{ ...moreStyle, width: 'auto', marginTop: 0, padding: '0 12px', flexShrink: 0 }}
                disabled={loading} onClick={() => { void refresh(); }}>{loading ? '확인 중…' : '다시 확인'}</button>
        </div>
        <p style={mutedStyle}>수집 직전 12시간의 기사를 30분씩 세고, 이슈를 처음 본 시각을 뉴스 표본의 첫 기사와 비교합니다.</p>
        <div role="status">
            {board && measuredAt && <p style={mutedStyle}>
                마지막 뉴스 실측 <time dateTime={measuredAt}>{kstDateTime(measuredAt)}</time> (한국 시각) · {SOURCE_LABEL[board.source]} · {board.resolutionMinutes}분 수집 주기
            </p>}
            {status === 'stale' && <p style={scoreStyle}>새 뉴스 측정값이 늦어져 마지막으로 확인한 기록을 보여드립니다.</p>}
            {status === 'unmeasured' && <p style={scoreStyle}>이번 회차에 확인된 뉴스 표본이 없어 측정값을 기다리는 중입니다.</p>}
            {status === 'unavailable' && <p style={mutedStyle}>{loading ? '측정 결과를 확인하고 있습니다.' : '뉴스 실측 자료를 불러오지 못했습니다.'}</p>}
            {laterCapture && <p style={captionStyle}>최근 수집 회차 <time dateTime={latestSnapshotAt}>{kstDateTime(latestSnapshotAt)}</time> (한국 시각) · 새 뉴스 실측은 없음</p>}
        </div>
        {line && <p style={scoreStyle} title={line.detail || undefined}>{line.text}</p>}
        {line?.detail && <p style={captionStyle}>{line.detail}</p>}
        {cards.length > 0 && <div style={gridStyle}>{cards.slice(0, limit).map((card) => <Card key={card.id} card={card} />)}</div>}
        {cards.length > limit && <button type="button" style={moreStyle} onClick={() => setLimit((n) => n + FIRST_PAGE)}>소재 더 보기 · {limit}/{cards.length}</button>}
    </section>;
}
