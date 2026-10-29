/**
 * 제휴 황금키워드 공용 부품(2026-10-29) — 토스 · 브랜드커넥트 · 쿠팡 세 레인이 같이 쓴다.
 *
 * 사장님 "카테고리별로 분류해서 황금키워드를 찾아줘야지 · 그래프와 같이 보면서 지금 어떻게 쓰면 되는지".
 *  - CategoryChips: 카테고리별 개수와 그 카테고리 1위 황금 검색어. 누르면 그 카테고리만.
 *  - GoldenRatioBadge: 검색량 ÷ 문서수(줄 세우는 기준)를 카드 맨 앞에 숫자 그대로.
 *  - AffiliateGoldenAids: 검색 추이 그래프(데이터랩 주별 실측) + 이 검색어로 쓰는 순서.
 * 쓰는 순서는 잰 사실(검색량 · 문서수 · 정면 글 수 · 추이 판정)을 할 일로 옮길 뿐 — 노출 확률 · 수익을 지어내지 않는다.
 */
import type { KeywordEnrich } from '../../lib/keywordEnrich.mjs';
import type { AffiliateGolden as Golden, AffiliateCategorySummary as CategorySummary } from '../../lib/affiliateGolden.mjs';
import KeywordAids from './shared/KeywordAids';

const fmt = (n: number | null) => (n === null ? '—' : n.toLocaleString('ko-KR'));
const ratioText = (r: number) => r.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const GRADE_COLOR: Record<string, string> = { S: '#2ecc71', A: '#4ade80', B: '#f5a623' };

export function CategoryChips({ summary, value, total, onChange }: { summary: CategorySummary[]; value: string; total: number; onChange: (category: string) => void }) {
    if (summary.length < 2) return null;
    const chip = (on: boolean) => ({
        display: 'grid', gap: 2, textAlign: 'left' as const, padding: '7px 11px', borderRadius: 10, cursor: 'pointer',
        border: `1px solid ${on ? '#fbbf24' : 'rgba(148,163,184,.25)'}`, background: on ? 'rgba(251,191,36,.12)' : 'rgba(15,23,42,.45)', color: '#e2e8f0',
    });
    return (
        <div role="group" aria-label="카테고리" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '4px 0 14px' }}>
            <button type="button" aria-pressed={value === '전체'} onClick={() => onChange('전체')} style={chip(value === '전체')}>
                <strong style={{ fontSize: 13 }}>전체 <em style={{ fontStyle: 'normal', color: '#fbbf24' }}>{total}</em></strong>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>문서÷검색 낮은 순</span>
            </button>
            {summary.map((s) => (
                <button
                    key={s.category}
                    type="button"
                    aria-pressed={value === s.category}
                    onClick={() => onChange(s.category)}
                    title={s.top?.docRatio != null ? `${s.category} 1위 「${s.top.query}」 검색 ${fmt(s.top.volume)} / 문서 ${fmt(s.top.docs)}` : undefined}
                    style={chip(value === s.category)}
                >
                    <strong style={{ fontSize: 13 }}>{s.category} <em style={{ fontStyle: 'normal', color: '#fbbf24' }}>{s.count}</em></strong>
                    <span style={{ fontSize: 11, color: '#94a3b8', maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.top?.docRatio != null ? `1위 ${s.top.query} · ${ratioText(s.top.docRatio)}` : '수치 미측정'}
                    </span>
                </button>
            ))}
        </div>
    );
}

export function GoldenRatioBadge({ golden }: { golden: Golden }) {
    if (golden.docRatio === null) return null;
    const color = golden.grade ? GRADE_COLOR[golden.grade] : '#aebccc';
    return (
        <span
            title={`「${golden.query}」 블로그 문서수 ÷ 월 검색량. 낮을수록 찾는 사람에 비해 글이 적습니다. S 0.3 미만(검색 500+) · A 0.7 미만 · B 1.0 미만(검색 100+).`}
            style={{ color, background: `${color}1f`, border: `1px solid ${color}55`, borderRadius: 999, padding: '2px 9px', fontWeight: 900, fontSize: 11 }}
        >
            {golden.grade ? `${golden.grade}등급 · ` : ''}문서÷검색 {ratioText(golden.docRatio)} · 검색 {fmt(golden.volume)} / 문서 {fmt(golden.docs)}
        </span>
    );
}

/**
 * 황금이 아닌 상품 — 문서가 검색보다 많거나 검색량 100 미만 · 안 잰 것. 목록에 섞지 않고 맨 아래 접어서 이름과 숫자만.
 * 지우지 않는 이유: 제휴 링크는 있어서 상품 자체를 찾는 사람에게는 쓸모가 있다.
 */
export function NonGoldenList({ rows }: { rows: Array<{ key: string; name: string; golden: Golden }> }) {
    if (!rows.length) return null;
    return (
        <details style={{ margin: '14px 0 0', padding: '10px 12px', border: '1px solid rgba(148,163,184,.22)', borderRadius: 10, background: 'rgba(15,23,42,.35)' }}>
            <summary style={{ cursor: 'pointer', fontSize: 13, color: '#94a3b8' }}>
                황금 아님 {rows.length}개 — 문서가 검색보다 많거나 검색량 100 미만 · 아직 안 잰 상품
            </summary>
            <ul style={{ margin: '8px 0 0', paddingLeft: 18, display: 'grid', gap: 3, fontSize: 12.5, color: '#aebccc' }}>
                {rows.map(({ key, name, golden }) => (
                    <li key={key}>
                        {name}
                        {golden.docRatio !== null
                            ? <> — 「{golden.query}」 검색 {fmt(golden.volume)} / 문서 {fmt(golden.docs)} · 문서÷검색 {ratioText(golden.docRatio)}</>
                            : <> — 검색량 · 문서수 미측정</>}
                    </li>
                ))}
            </ul>
        </details>
    );
}

/** 추이 판정 → 언제 쓸지. 판정이 없으면 이 줄을 뺀다. */
const TIMING: Record<string, string> = {
    new: '새로 검색되기 시작했습니다 — 글이 쌓이기 전인 이번 주 안에 발행하세요.',
    rising: '검색 관심이 오르는 중입니다 — 이번 주 안에 발행하세요.',
    'season-soon': '작년 이맘때 곧 올랐던 말입니다 — 오르기 전에 미리 발행해 두세요.',
    steady: '꾸준히 찾는 말입니다 — 언제 써도 되지만 다른 후보보다 급하진 않습니다.',
    cooling: '관심이 식는 중입니다 — 오르는 다른 후보를 먼저 쓰세요.',
    'past-peak': '정점이 지났습니다 — 다음 시즌 직전에 쓰는 편이 낫습니다.',
};

export function AffiliateGoldenAids({ golden, enrich, facing, coupang = false }: { golden: Golden; enrich?: KeywordEnrich; facing?: number | null; coupang?: boolean }) {
    if (!golden.query) return null;
    const verdict = enrich?.demand?.verdict;
    const steps: string[] = [`제목 맨 앞에 「${golden.query}」를 그대로 넣으세요 — 월 ${fmt(golden.volume)}회 찾고, 블로그 글은 ${fmt(golden.docs)}개입니다.`];
    if (typeof facing === 'number') {
        steps.push(facing <= 2
            ? `검색 첫 화면 10개 중 이 말을 제목에 그대로 쓴 글이 ${facing}개뿐입니다 — 이 말에 바로 답하는 글이면 됩니다.`
            : `첫 화면에 같은 말 제목이 ${facing}개 있습니다 — 사용 장면 · 비교 · 구매 전 확인처럼 다른 각도로 쓰세요.`);
    }
    if (verdict && TIMING[verdict]) steps.push(TIMING[verdict]);
    steps.push(coupang
        ? '글 첫 부분에 "이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다." 문구를 눈에 띄게 넣고 링크를 다세요.'
        : '글 첫 부분에 대가성(제휴 수수료) 문구를 눈에 띄게 넣고 발급받은 링크를 다세요.');
    return (
        <details open={Boolean(enrich?.demand)} style={{ gridColumn: '1 / -1', margin: '6px 0 0' }}>
            <summary style={{ cursor: 'pointer', fontSize: 12.5, color: '#fcd34d', fontWeight: 700 }}>
                「{golden.query}」 검색 추이 그래프 · 지금 이렇게 쓰세요
            </summary>
            <div style={{ marginTop: 8 }}>
                {enrich
                    ? <KeywordAids query={golden.query} enrich={enrich} />
                    : <p style={{ margin: '2px 0 8px', fontSize: 12, color: '#8d9db4' }}>이 검색어의 추이 그래프는 아직 없습니다 — 매일 도는 덧붙이기 회차가 데이터랩으로 재서 붙입니다.</p>}
                <ol style={{ margin: '6px 0 0', paddingLeft: 20, display: 'grid', gap: 4, fontSize: 13, color: '#e2e8f0', lineHeight: 1.55 }}>
                    {steps.map((step) => <li key={step}>{step}</li>)}
                </ol>
            </div>
        </details>
    );
}
