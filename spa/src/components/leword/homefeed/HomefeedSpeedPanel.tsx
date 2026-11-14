import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { CATEGORY_LABEL } from '../../../lib/homefeedModel.mjs';
import {
    barGeometry, bucketAxis, bucketCaption, kstClock, leadBadge, normalizeSpeedBoard, scoreboardLine,
    type SpeedBoard, type SpeedCard,
} from '../../../lib/homefeedSpeedModel.mjs';
import Reveal from '../../motion/Reveal';

/*
 * 속도 실측(2026-11-02) — 소재마다 (a) 최근 12시간 뉴스 기사 수 막대 (b) 뉴스 첫 기사와 비교한 앞섬/늦음/미측정 (c) 7일 속도 성적표 한 줄.
 * 앱이 /data/homefeed-stories.json 에 "추가"한 필드(newsBuckets · lead · speedScoreboard)만 읽는다. 구버전 공개본이면 칸을 그리지 않는다.
 * 사장님 규칙: 실측 · 산술 · 사실만. 못 잰 것은 '미측정'. 단정 문구 · 확률 · 점수 칸 없음. 색은 styles/tokens.ts 단일 출처.
 */
const PUBLIC_URL = '/data/homefeed-stories.json';
const REFRESH_MS = 5 * 60_000;
const FIRST_PAGE = 6;

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
        ? `처음 본 ${kstClock(lead.firstSeenAt)} · 뉴스 첫 기사 ${kstClock(lead.firstNewsAt)} (한국 시각)` : '';
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
    const [board, setBoard] = useState<SpeedBoard | null>(null);
    const [limit, setLimit] = useState(FIRST_PAGE);
    useEffect(() => {
        let controller = new AbortController();
        const load = () => {
            controller.abort();
            controller = new AbortController();
            fetch(PUBLIC_URL, { cache: 'no-store', signal: controller.signal })
                .then((response) => (response.ok ? response.json() : null))
                .then((raw) => setBoard(normalizeSpeedBoard(raw)))
                .catch(() => { /* 공개본이 없으면 칸을 그리지 않는다 */ });
        };
        load();
        const timer = window.setInterval(() => { if (document.visibilityState === 'visible') load(); }, REFRESH_MS);
        return () => { controller.abort(); window.clearInterval(timer); };
    }, []);
    const line = useMemo(() => scoreboardLine(board?.scoreboard), [board]);
    if (!board) return null;
    const cards = board.cards;
    return <section style={panelStyle} aria-label="속도 실측">
        <span style={eyebrowStyle}>SPEED CHECK</span>
        <h2 style={titleStyle}>뉴스 기사 수 · 첫 기사와 비교</h2>
        <p style={mutedStyle}>
            앱이 10분마다 잰 값입니다. 막대는 최근 12시간 뉴스 기사를 30분씩 센 실측이고, 먼저 · 늦게는 우리가 이슈를 처음 본 시각과 뉴스 표본의 가장 이른 기사 시각의 차이입니다.
            {board.snapshotAt && ` 마지막 수집 ${kstClock(board.snapshotAt)} (한국 시각).`}
        </p>
        {line && <p style={scoreStyle} title={line.detail || undefined}>{line.text}</p>}
        {line?.detail && <p style={captionStyle}>{line.detail}</p>}
        <Reveal stagger style={gridStyle}>{cards.slice(0, limit).map((card) => <Card key={card.id} card={card} />)}</Reveal>
        {cards.length > limit && <button type="button" style={moreStyle} onClick={() => setLimit((n) => n + FIRST_PAGE)}>소재 더 보기 · {limit}/{cards.length}</button>}
    </section>;
}
