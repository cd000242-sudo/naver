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
import type { AffiliateGolden as Golden, AffiliateCategorySummary } from '../../lib/affiliateGolden.mjs';
import { categoryGoldenTop, matchOwnProduct, type CategoryGoldenKeyword } from '../../lib/affiliateCategoryGolden.mjs';
import KeywordAids from './shared/KeywordAids';
import { useRef, type ReactNode, type RefObject } from 'react';
import { useReveal } from '../motion/Reveal';

const fmt = (n: number | null) => (n === null ? '—' : n.toLocaleString('ko-KR'));
const ratioText = (r: number) => r.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const GRADE_COLOR: Record<string, string> = { S: 'var(--lw-positive)', A: 'var(--lw-positive)', B: 'var(--lw-accent-ink)' };
const GRADE_BG: Record<string, string> = { S: 'var(--lw-positive-soft)', A: 'var(--lw-positive-soft)', B: 'var(--lw-accent-soft)' };

type CategorySummary = AffiliateCategorySummary & { keywords?: number };

/** Product list that rises in item by item the first time it is seen (off under reduced motion). */
export function RevealOl({ className, children }: { className: string; children: ReactNode }) {
    const ref = useRef<HTMLOListElement>(null);
    useReveal(ref as RefObject<HTMLElement>, { stagger: true });
    return <ol ref={ref} className={className}>{children}</ol>;
}

export function CategoryChips({ summary, value, total, onChange }: { summary: CategorySummary[]; value: string; total: number; onChange: (category: string) => void }) {
    if (summary.length < 2) return null;
    const chip = (on: boolean) => ({
        display: 'grid', gap: 2, textAlign: 'left' as const, padding: '8px 12px', minHeight: 44, borderRadius: 10, cursor: 'pointer',
        border: `1px solid ${on ? 'var(--lw-accent)' : 'var(--lw-line)'}`, background: on ? 'var(--lw-accent-soft)' : 'var(--lw-surface)', color: 'var(--lw-text)',
    });
    return (
        <div role="group" aria-label="카테고리" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '4px 0 16px' }}>
            <button type="button" aria-pressed={value === '전체'} onClick={() => onChange('전체')} style={chip(value === '전체')}>
                <strong style={{ fontSize: 13, fontWeight: 600 }}>전체 <em style={{ fontStyle: 'normal', color: 'var(--lw-accent-ink)' }}>{total}</em></strong>
                <span style={{ fontSize: 13, color: 'var(--lw-text-secondary)' }}>문서÷검색 낮은 순</span>
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
                    <strong style={{ fontSize: 13, fontWeight: 600 }}>{s.category} <em style={{ fontStyle: 'normal', color: 'var(--lw-accent-ink)' }}>{s.keywords ? `검색어 ${s.keywords} · 상품 ${s.count}` : s.count}</em></strong>
                    <span style={{ fontSize: 13, color: 'var(--lw-text-secondary)', maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.top?.docRatio != null ? `1위 ${s.top.query} · ${ratioText(s.top.docRatio)}` : '수치 미측정'}
                    </span>
                </button>
            ))}
        </div>
    );
}

export function GoldenRatioBadge({ golden }: { golden: Golden }) {
    if (golden.docRatio === null) return null;
    const color = golden.grade ? GRADE_COLOR[golden.grade] : 'var(--lw-text-secondary)';
    const bg = golden.grade ? GRADE_BG[golden.grade] : 'var(--lw-raised)';
    return (
        <span
            title={`「${golden.query}」 블로그 문서수 ÷ 월 검색량. 낮을수록 찾는 사람에 비해 글이 적습니다. S 0.3 미만(검색 500+) · A 0.7 미만 · B 1.0 미만(검색 100+).`}
            style={{ color, background: bg, borderRadius: 999, padding: '2px 8px', fontWeight: 600, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}
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
        <details style={{ margin: '16px 0 0', padding: '0 12px', border: '1px solid var(--lw-line)', borderRadius: 10, background: 'var(--lw-raised)' }}>
            <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--lw-text-secondary)', padding: '12px 0' }}>
                황금 아님 {rows.length}개 — 문서가 검색보다 많거나 검색량 100 미만 · 아직 안 잰 상품
            </summary>
            <ul style={{ margin: '0 0 12px', paddingLeft: 20, display: 'grid', gap: 4, fontSize: 13, color: 'var(--lw-text-secondary)' }}>
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

/**
 * 카테고리 황금 검색어 표(2026-10-29 "카테고리별로 분류해서 황금키워드를 찾아줘야지").
 * 상품명 검색어는 대개 문서가 검색보다 많다(실측 280개 중 황금 4개). 그래서 카테고리 대표어의 연관어를 매일 재서
 * 문서 < 검색인 말만 싣는다 — 이 말로 글을 쓰고, 같은 카테고리 제휴 상품을 본문에 거는 동선이다.
 */
export function CategoryGoldenKeywords({ category, byCategory, builtAt, onAnalyze, productNames = [] }: {
    category: string; byCategory: Map<string, CategoryGoldenKeyword[]>; builtAt: string; onAnalyze: (keyword: string) => void; productNames?: string[];
}) {
    const rows = categoryGoldenTop(byCategory, category, category === '전체' ? 15 : 30);
    if (!rows.length) return null;
    const when = builtAt ? new Date(builtAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    const cell = { padding: '8px', borderTop: '1px solid var(--lw-line)', textAlign: 'right' as const, whiteSpace: 'nowrap' as const };
    return (
        <section aria-label="카테고리 황금 검색어" style={{ margin: '0 0 16px', padding: '16px', border: '1px solid var(--lw-line)', borderRadius: 14, background: 'var(--lw-surface)' }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--lw-text)' }}>
                {category === '전체' ? '카테고리별 황금 검색어' : `「${category}」 황금 검색어`}
                <small style={{ marginLeft: 8, fontSize: 13, color: 'var(--lw-text-muted)', fontWeight: 500 }}>문서÷검색 낮은 순{when ? ` · ${when} 실측` : ''}</small>
            </h3>
            <p style={{ margin: '4px 0 8px', fontSize: 13, color: 'var(--lw-text-secondary)' }}>
                카테고리 대표어의 연관 검색어 중 블로그 문서가 월 검색량보다 적은 말만 실었습니다. 이 말로 글을 쓰고 같은 카테고리의 제휴 상품을 본문에 거세요.
            </p>
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, color: 'var(--lw-text)', fontVariantNumeric: 'tabular-nums' }}>
                    <thead>
                        <tr style={{ color: 'var(--lw-text-muted)', fontSize: 13 }}>
                            <th style={{ ...cell, textAlign: 'left', borderTop: 'none' }}>등급</th>
                            <th style={{ ...cell, textAlign: 'left', borderTop: 'none' }}>검색어</th>
                            <th style={{ ...cell, borderTop: 'none' }}>월 검색</th>
                            <th style={{ ...cell, borderTop: 'none' }}>문서</th>
                            <th style={{ ...cell, borderTop: 'none' }}>문서÷검색</th>
                            <th style={{ ...cell, borderTop: 'none' }} />
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((k) => (
                            <tr key={`${k.category}:${k.keyword}`}>
                                <td style={{ ...cell, textAlign: 'left', color: k.grade ? GRADE_COLOR[k.grade] : 'var(--lw-text-secondary)', fontWeight: 600 }}>{k.grade}</td>
                                <td style={{ ...cell, textAlign: 'left', whiteSpace: 'normal' }}>
                                    <strong>{k.keyword}</strong>
                                    {category === '전체' && <span style={{ marginLeft: 8, fontSize: 13, color: 'var(--lw-text-muted)' }}>{k.category}</span>}
                                    {(() => {
                                        const own = matchOwnProduct(k.keyword, k.seed, productNames);
                                        return own && <span title={`내 제휴 상품: ${own}`} style={{ marginLeft: 8, fontSize: 13, color: 'var(--lw-positive)', background: 'var(--lw-positive-soft)', borderRadius: 999, padding: '0 8px' }}>내 상품 검색어</span>;
                                    })()}
                                </td>
                                <td style={cell}>{fmt(k.volume)}</td>
                                <td style={cell}>{fmt(k.docs)}</td>
                                <td style={cell}>{k.docRatio !== null ? ratioText(k.docRatio) : '—'}</td>
                                <td style={{ ...cell, display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                    <button type="button" className="lw-mini" style={{ minHeight: 44 }} onClick={() => onAnalyze(k.keyword)}>분석</button>
                                    <a className="lw-mini" style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center' }} href={`https://search.naver.com/search.naver?ssc=tab.blog.all&query=${encodeURIComponent(k.keyword)}`} target="_blank" rel="noreferrer">네이버</a>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
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
        <details open={Boolean(enrich?.demand)} style={{ gridColumn: '1 / -1', margin: '8px 0 0' }}>
            <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--lw-accent-ink)', fontWeight: 600, padding: '12px 0' }}>
                「{golden.query}」 검색 추이 그래프 · 지금 이렇게 쓰세요
            </summary>
            <div style={{ marginTop: 8 }}>
                {enrich
                    ? <KeywordAids query={golden.query} enrich={enrich} />
                    : <p style={{ margin: '4px 0 8px', fontSize: 13, color: 'var(--lw-text-muted)' }}>이 검색어의 추이 그래프는 아직 없습니다 — 매일 도는 덧붙이기 회차가 데이터랩으로 재서 붙입니다.</p>}
                <ol style={{ margin: '8px 0 0', paddingLeft: 20, display: 'grid', gap: 4, fontSize: 13, color: 'var(--lw-text)', lineHeight: 1.55 }}>
                    {steps.map((step) => <li key={step}>{step}</li>)}
                </ol>
            </div>
        </details>
    );
}
